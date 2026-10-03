import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import jwt from 'jsonwebtoken';

export const SUPPORTED_SCOPES = ['vettr:read', 'vettr:write'];
export const ACCESS_TTL_SEC = 15 * 60;
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CODE_TTL_MS = 10 * 60 * 1000;

export function sha256(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

/** BASE64URL(SHA256(verifier)) — OAuth 2.1 PKCE S256. */
export function pkceS256(verifier) {
  return createHash('sha256').update(String(verifier)).digest('base64url');
}

export function verifyPkce(verifier, challenge) {
  if (!verifier || !challenge) return false;
  const actual = pkceS256(verifier);
  const a = Buffer.from(actual);
  const b = Buffer.from(String(challenge));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function normalizeScopes(raw) {
  const requested = String(raw || '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const source = requested.length ? requested : SUPPORTED_SCOPES;
  return [...new Set(source.filter((s) => SUPPORTED_SCOPES.includes(s)))];
}

export function isAllowedRedirectUri(uri) {
  let url;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password || url.hash) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
    return true;
  }
  return false;
}

export function assertResource(resource, expected) {
  if (!resource) return expected;
  if (String(resource) !== expected) {
    const err = new Error('resource does not match this server');
    err.code = 'invalid_target';
    throw err;
  }
  return expected;
}

export function signMcpAccessToken({ userId, email, scope, clientId, resource }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    const err = new Error('JWT_SECRET is not set');
    err.status = 500;
    throw err;
  }
  return jwt.sign(
    {
      typ: 'mcp_access',
      userId,
      email: email || null,
      scope,
      clientId
    },
    secret,
    {
      expiresIn: ACCESS_TTL_SEC,
      audience: resource,
      issuer: new URL(resource).origin
    }
  );
}

export function verifyMcpAccessToken(token, resource) {
  const secret = process.env.JWT_SECRET;
  const decoded = jwt.verify(token, secret, {
    audience: resource,
    issuer: new URL(resource).origin
  });
  if (decoded.typ !== 'mcp_access' || !decoded.userId) {
    const err = new Error('Invalid token');
    err.name = 'JsonWebTokenError';
    throw err;
  }
  return decoded;
}

/**
 * Authorization-code exchange against an injected store so tests do not need Postgres.
 * The store consumes the code (single use) and issues a refresh token.
 */
export async function exchangeAuthorizationCode(store, input) {
  const code = await store.consumeCode(sha256(input.code || ''));
  if (!code) {
    const err = new Error('Unknown or reused code');
    err.code = 'invalid_grant';
    throw err;
  }
  if (new Date(code.expires_at).getTime() <= Date.now()) {
    const err = new Error('Code expired');
    err.code = 'invalid_grant';
    throw err;
  }
  if (code.client_id !== input.client_id) {
    const err = new Error('client_id mismatch');
    err.code = 'invalid_grant';
    throw err;
  }
  if (code.redirect_uri !== input.redirect_uri) {
    const err = new Error('redirect_uri mismatch');
    err.code = 'invalid_grant';
    throw err;
  }
  if (!verifyPkce(input.code_verifier, code.code_challenge)) {
    const err = new Error('PKCE verification failed');
    err.code = 'invalid_grant';
    throw err;
  }
  const scopes = normalizeScopes(code.scopes);
  if (!scopes.length) {
    const err = new Error('Code has no valid scope');
    err.code = 'invalid_scope';
    throw err;
  }
  const refresh = await store.issueRefresh({
    userId: code.user_id,
    clientId: code.client_id,
    scopes: scopes.join(' '),
    email: code.email
  });
  return {
    userId: code.user_id,
    email: code.email,
    clientId: code.client_id,
    scope: scopes.join(' '),
    resource: code.resource,
    refreshToken: refresh.token
  };
}

export const READ_TOOLS = new Set([
  'get_buy_boxes',
  'search_market_deals',
  'get_market_deal',
  'list_saved_deals',
  'attention_brief',
  'search_crm',
  'list_tasks',
  'get_deal',
  'get_deal_dd',
  'search_dd_answers'
]);

export const WRITE_TOOLS = new Set([
  'add_note',
  'add_task',
  'add_follow_up',
  'add_dd_answer',
  'update_dd_answer'
]);

export function assertToolScope(name, scopes) {
  const granted = new Set(Array.isArray(scopes) ? scopes : normalizeScopes(scopes));
  if (WRITE_TOOLS.has(name)) {
    if (!granted.has('vettr:write')) {
      const err = new Error('vettr:write scope required');
      err.code = 'forbidden';
      throw err;
    }
    return;
  }
  if (READ_TOOLS.has(name)) {
    if (!granted.has('vettr:read')) {
      const err = new Error('vettr:read scope required');
      err.code = 'forbidden';
      throw err;
    }
    return;
  }
  const err = new Error('Tool is not available');
  err.code = 'forbidden';
  throw err;
}
