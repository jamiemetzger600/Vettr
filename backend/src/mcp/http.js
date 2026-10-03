import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRequire } from 'module';
import { normalizeScopes, verifyMcpAccessToken } from '../lib/mcpOauth.js';
import { mcpResourceUrl } from '../lib/mcpPublicUrl.js';
import { lookupPersonalToken } from '../services/mcpTokenService.js';
import { mcpContext } from './context.js';
import { executeTool, TOOL_DEFS } from './tools.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

function unauthorized(req, res) {
  const resource = mcpResourceUrl(req);
  const metadata = `${new URL(resource).origin}/.well-known/oauth-protected-resource`;
  res.set(
    'WWW-Authenticate',
    `Bearer realm="vettr", resource_metadata="${metadata}", scope="vettr:read vettr:write"`
  );
  res.status(401).json({ error: 'Authentication required' });
}

export async function mcpAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return unauthorized(req, res);
    const token = header.slice(7).trim();
    const resource = mcpResourceUrl(req);
    if (token.startsWith('vtr_') && !token.startsWith('vtr_rt_') && !token.startsWith('vtr_client_')) {
      const row = await lookupPersonalToken(token);
      if (!row) return unauthorized(req, res);
      req.mcpAuth = {
        user: { userId: row.user_id, email: row.email },
        scopes: row.scopes,
        clientId: `personal:${row.id}`
      };
      return next();
    }
    const decoded = verifyMcpAccessToken(token, resource);
    req.mcpAuth = {
      user: { userId: decoded.userId, email: decoded.email },
      scopes: decoded.scope,
      clientId: decoded.clientId
    };
    return next();
  } catch (err) {
    console.warn('[mcp] auth failed', err.message);
    return unauthorized(req, res);
  }
}

function buildServer() {
  const server = new McpServer(
    { name: 'vettr', version: pkg.version },
    { instructions: 'Vettr deals, buy boxes, CRM, and due diligence for the signed-in user. Email is not in Vettr; compare these facts with the inbox you already have. Do not delete records, send mail, or change buy boxes.' }
  );
  for (const tool of TOOL_DEFS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          destructiveHint: false,
          openWorldHint: false
        }
      },
      async (args) => executeTool(tool.name, args || {})
    );
  }
  return server;
}

export async function handleMcp(req, res) {
  const auth = req.mcpAuth;
  if (!auth?.user) return unauthorized(req, res);
  const scopes = normalizeScopes(auth.scopes).join(' ');
  await mcpContext.run(
    { user: auth.user, scopes, clientId: auth.clientId },
    async () => {
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });
      res.on('close', () => {
        transport.close().catch((err) => console.warn('[mcp] transport close', err.message));
        server.close().catch((err) => console.warn('[mcp] server close', err.message));
      });
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (err) {
        console.error('[mcp] request failed', err);
        if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
      }
    }
  );
}
