import pool from '../db/pool.js';
import {
  ACCESS_TTL_SEC,
  REFRESH_TTL_MS,
  CODE_TTL_MS,
  exchangeAuthorizationCode,
  randomToken,
  sha256,
  signMcpAccessToken
} from '../lib/mcpOauth.js';

function tokenResponse({ accessToken, refreshToken, scope }) {
  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SEC,
    refresh_token: refreshToken,
    scope
  };
}

async function userEmail(userId) {
  const result = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  return result.rows[0]?.email || null;
}

export async function registerClient({ name, redirectUris, authMethod }) {
  const clientId = `vtr_client_${randomToken(18)}`;
  const method = authMethod || 'none';
  let secret = null;
  let secretHash = null;
  if (method !== 'none') {
    secret = `vtr_secret_${randomToken(32)}`;
    secretHash = sha256(secret);
  }
  await pool.query(
    `INSERT INTO mcp_oauth_clients (id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method)
     VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [clientId, secretHash, name, JSON.stringify(redirectUris), method]
  );
  console.log('[mcp] client registered', { clientId, name, authMethod: method });
  const body = {
    client_id: clientId,
    client_name: name,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: method,
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code']
  };
  if (secret) body.client_secret = secret;
  return body;
}

function asStringArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function getClient(clientId) {
  const result = await pool.query('SELECT * FROM mcp_oauth_clients WHERE id = $1', [clientId]);
  const row = result.rows[0];
  if (!row) return null;
  row.redirect_uris = asStringArray(row.redirect_uris);
  return row;
}

export function clientSecretMatches(client, secret) {
  if (!client?.client_secret_hash) return !secret;
  if (!secret) return false;
  return sha256(secret) === client.client_secret_hash;
}

export async function saveAuthCode({
  code,
  clientId,
  userId,
  redirectUri,
  codeChallenge,
  scopes,
  resource
}) {
  const expires = new Date(Date.now() + CODE_TTL_MS);
  await pool.query(
    `INSERT INTO mcp_oauth_codes
      (code_hash, client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [sha256(code), clientId, userId, redirectUri, codeChallenge, scopes, resource, expires.toISOString()]
  );
  return code;
}

async function issueRefreshRow({ userId, clientId, scopes }) {
  const token = `vtr_rt_${randomToken(32)}`;
  const expires = new Date(Date.now() + REFRESH_TTL_MS);
  await pool.query(
    `INSERT INTO mcp_refresh_tokens (token_hash, client_id, user_id, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [sha256(token), clientId, userId, scopes, expires.toISOString()]
  );
  return token;
}

export async function exchangeCode(input) {
  const granted = await exchangeAuthorizationCode(
    {
      consumeCode: async (codeHash) => {
        const result = await pool.query(
          `UPDATE mcp_oauth_codes
             SET used_at = NOW()
           WHERE code_hash = $1 AND used_at IS NULL
           RETURNING client_id, user_id, redirect_uri, code_challenge, scopes, resource, expires_at`,
          [codeHash]
        );
        const row = result.rows[0];
        if (!row) return null;
        const email = await userEmail(row.user_id);
        return { ...row, email };
      },
      issueRefresh: async ({ userId, clientId, scopes }) => {
        const token = await issueRefreshRow({ userId, clientId, scopes });
        return { token };
      }
    },
    input
  );
  const accessToken = signMcpAccessToken({
    userId: granted.userId,
    email: granted.email,
    scope: granted.scope,
    clientId: granted.clientId,
    resource: granted.resource
  });
  console.log('[mcp] access token issued', { userId: granted.userId, clientId: granted.clientId });
  return tokenResponse({
    accessToken,
    refreshToken: granted.refreshToken,
    scope: granted.scope
  });
}

export async function rotateRefresh(refreshToken, clientId) {
  const hash = sha256(refreshToken || '');
  const result = await pool.query(
    `UPDATE mcp_refresh_tokens
       SET revoked_at = NOW(), last_used_at = NOW()
     WHERE token_hash = $1
       AND client_id = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
     RETURNING user_id, scopes`,
    [hash, clientId]
  );
  const row = result.rows[0];
  if (!row) {
    const err = new Error('Unknown refresh token');
    err.code = 'invalid_grant';
    throw err;
  }
  const email = await userEmail(row.user_id);
  const next = await issueRefreshRow({
    userId: row.user_id,
    clientId,
    scopes: row.scopes
  });
  const resource = null;
  return { userId: row.user_id, email, scopes: row.scopes, refreshToken: next, resource };
}

export async function createPersonalToken(userId, name, scopes) {
  const active = await pool.query(
    `SELECT COUNT(*)::int AS n FROM mcp_personal_tokens
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
  if ((active.rows[0]?.n || 0) >= 10) {
    const err = new Error('Revoke an existing token before creating another (limit 10)');
    err.status = 400;
    throw err;
  }
  const token = `vtr_${randomToken(32)}`;
  const prefix = token.slice(0, 12);
  const result = await pool.query(
    `INSERT INTO mcp_personal_tokens (token_hash, token_prefix, user_id, name, scopes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, token_prefix, name, scopes, created_at`,
    [sha256(token), prefix, userId, name, scopes]
  );
  console.log('[mcp] personal token created', { userId, id: result.rows[0].id });
  return { token, ...result.rows[0] };
}

export async function lookupPersonalToken(token) {
  const result = await pool.query(
    `SELECT t.id, t.user_id, t.scopes, u.email
     FROM mcp_personal_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL`,
    [sha256(token)]
  );
  const row = result.rows[0];
  if (!row) return null;
  await pool.query('UPDATE mcp_personal_tokens SET last_used_at = NOW() WHERE id = $1', [row.id]);
  return row;
}

export async function listConnections(userId) {
  const clients = await pool.query(
    `SELECT DISTINCT ON (c.id)
        c.id AS client_id, c.client_name, r.scopes, r.created_at, r.last_used_at
     FROM mcp_refresh_tokens r
     JOIN mcp_oauth_clients c ON c.id = r.client_id
     WHERE r.user_id = $1 AND r.revoked_at IS NULL
     ORDER BY c.id, r.created_at DESC`,
    [userId]
  );
  const tokens = await pool.query(
    `SELECT id, token_prefix, name, scopes, created_at, last_used_at
     FROM mcp_personal_tokens
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [userId]
  );
  return { clients: clients.rows, tokens: tokens.rows };
}

export async function revokeClient(userId, clientId) {
  const result = await pool.query(
    `UPDATE mcp_refresh_tokens
       SET revoked_at = NOW()
     WHERE user_id = $1 AND client_id = $2 AND revoked_at IS NULL`,
    [userId, clientId]
  );
  console.log('[mcp] client revoked', { userId, clientId, count: result.rowCount });
  return result.rowCount;
}

export async function revokePersonalToken(userId, tokenId) {
  const result = await pool.query(
    `UPDATE mcp_personal_tokens
       SET revoked_at = NOW()
     WHERE user_id = $1 AND id = $2 AND revoked_at IS NULL`,
    [userId, tokenId]
  );
  console.log('[mcp] personal token revoked', { userId, tokenId, count: result.rowCount });
  return result.rowCount;
}

export async function recordToolCall({ userId, clientId, toolName, savedDealId, status }) {
  try {
    await pool.query(
      `INSERT INTO mcp_tool_calls (user_id, client_id, tool_name, saved_deal_id, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, clientId || null, toolName, savedDealId || null, status]
    );
  } catch (err) {
    console.warn('[mcp] audit insert failed', err.message);
  }
}
