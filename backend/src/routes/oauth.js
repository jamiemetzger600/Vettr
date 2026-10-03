import express from 'express';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { readAuthToken } from '../lib/authCookies.js';
import {
  ACCESS_TTL_SEC,
  assertResource,
  isAllowedRedirectUri,
  normalizeScopes,
  signMcpAccessToken
} from '../lib/mcpOauth.js';
import { mcpResourceUrl, resolvePublicOrigin, webAppUrl } from '../lib/mcpPublicUrl.js';
import { consentPage, oauthMessagePage } from '../mcp/oauthPages.js';
import {
  clientSecretMatches,
  exchangeCode,
  getClient,
  registerClient,
  rotateRefresh,
  saveAuthCode
} from '../services/mcpTokenService.js';
import { randomToken } from '../lib/mcpOauth.js';

const router = express.Router();
router.use(express.urlencoded({ extended: false }));

const registerHits = new Map();

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim() || 'unknown';
}

function tooManyRegistrations(ip) {
  const now = Date.now();
  const row = registerHits.get(ip);
  if (!row || row.reset < now) {
    registerHits.set(ip, { count: 1, reset: now + 60 * 60 * 1000 });
    return false;
  }
  row.count += 1;
  return row.count > 30;
}

function sessionUser(req) {
  const { token } = readAuthToken(req);
  if (!token || token.startsWith('vtr_')) return null;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.typ === 'mcp_access' || !decoded.userId) return null;
    return decoded;
  } catch {
    return null;
  }
}

function oauthError(res, error, description, status = 400) {
  console.warn('[mcp] oauth error', error, description);
  res.status(status).json({ error, error_description: description });
}

function redirectWithError(res, redirectUri, state, error, description) {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  if (description) url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  res.redirect(url.toString());
}

function readClientCredentials(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const split = decoded.indexOf(':');
    if (split === -1) return { clientId: '', clientSecret: '' };
    return {
      clientId: decodeURIComponent(decoded.slice(0, split)),
      clientSecret: decodeURIComponent(decoded.slice(split + 1))
    };
  }
  return {
    clientId: String(req.body?.client_id || ''),
    clientSecret: req.body?.client_secret ? String(req.body.client_secret) : ''
  };
}

export function protectedResourceMetadata(req, res) {
  const resource = mcpResourceUrl(req);
  const origin = resolvePublicOrigin(req);
  res.json({
    resource,
    authorization_servers: [origin],
    scopes_supported: ['vettr:read', 'vettr:write'],
    bearer_methods_supported: ['header'],
    resource_documentation: `${webAppUrl()}/settings`
  });
}

export function authorizationServerMetadata(req, res) {
  const origin = resolvePublicOrigin(req);
  res.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
    scopes_supported: ['vettr:read', 'vettr:write']
  });
}

router.post('/register', async (req, res) => {
  try {
    if (tooManyRegistrations(clientIp(req))) {
      return oauthError(res, 'slow_down', 'Too many client registrations', 429);
    }
    const name = String(req.body?.client_name || '').trim().slice(0, 120);
    const redirectUris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris : [];
    if (!name) return oauthError(res, 'invalid_client_metadata', 'client_name is required');
    if (!redirectUris.length || redirectUris.length > 10) {
      return oauthError(res, 'invalid_client_metadata', 'redirect_uris must contain 1 to 10 URLs');
    }
    if (!redirectUris.every((uri) => typeof uri === 'string' && isAllowedRedirectUri(uri))) {
      return oauthError(res, 'invalid_client_metadata', 'redirect_uris must be https, or http on localhost');
    }
    const requested = String(req.body?.token_endpoint_auth_method || 'none');
    const authMethod = ['none', 'client_secret_post', 'client_secret_basic'].includes(requested)
      ? requested
      : null;
    if (!authMethod) return oauthError(res, 'invalid_client_metadata', 'Unsupported token auth method');
    const created = await registerClient({ name, redirectUris, authMethod });
    res.status(201).json(created);
  } catch (err) {
    console.error('[mcp] register failed', err);
    oauthError(res, 'server_error', 'Could not register client', 500);
  }
});

router.get('/authorize', async (req, res) => {
  try {
    const query = req.query || {};
    const client = await getClient(String(query.client_id || ''));
    const redirectUri = String(query.redirect_uri || '');
    const registered = client && Array.isArray(client.redirect_uris) && client.redirect_uris.includes(redirectUri);
    if (!client || !registered || !isAllowedRedirectUri(redirectUri)) {
      return res.status(400).type('html').send(oauthMessagePage(
        'Cannot connect',
        'This bot is not registered, or its redirect URL is not allowed.'
      ));
    }
    const finishError = (error, description) => redirectWithError(res, redirectUri, query.state, error, description);
    if (query.response_type !== 'code') return finishError('unsupported_response_type', 'response_type must be code');
    if (query.code_challenge_method && query.code_challenge_method !== 'S256') {
      return finishError('invalid_request', 'code_challenge_method must be S256');
    }
    if (!query.code_challenge) return finishError('invalid_request', 'code_challenge is required');
    const scopes = normalizeScopes(query.scope);
    if (!scopes.length) return finishError('invalid_scope', 'Request vettr:read, vettr:write, or both');
    let resource;
    try {
      resource = assertResource(query.resource, mcpResourceUrl(req));
    } catch (err) {
      return finishError('invalid_target', err.message);
    }

    const user = sessionUser(req);
    if (!user) {
      const next = new URL(`${resolvePublicOrigin(req)}/oauth/authorize`);
      for (const [key, value] of Object.entries(query)) {
        if (value != null) next.searchParams.set(key, String(value));
      }
      const login = new URL(`${webAppUrl()}/login`);
      login.searchParams.set('next', next.toString());
      console.log('[mcp] authorize needs login', { clientId: client.id });
      return res.redirect(login.toString());
    }

    const csrf = randomBytes(24).toString('base64url');
    res.append('Set-Cookie', `mcp_oauth_csrf=${csrf}; Path=/oauth; HttpOnly; SameSite=Lax; Max-Age=600`);
    const fields = {
      client_id: client.id,
      redirect_uri: redirectUri,
      code_challenge: String(query.code_challenge),
      code_challenge_method: 'S256',
      scope: scopes.join(' '),
      state: query.state ? String(query.state) : '',
      resource
    };
    console.log('[mcp] consent shown', { userId: user.userId, clientId: client.id });
    res.type('html').send(consentPage({
      clientName: client.client_name,
      scopes,
      fields,
      csrf
    }));
  } catch (err) {
    console.error('[mcp] authorize failed', err);
    res.status(500).type('html').send(oauthMessagePage('Something went wrong', 'Try connecting again.'));
  }
});

router.post('/authorize', async (req, res) => {
  try {
    const body = req.body || {};
    const cookie = String(req.headers.cookie || '');
    const csrfCookie = cookie.split(';').map((p) => p.trim()).find((p) => p.startsWith('mcp_oauth_csrf='));
    const csrf = csrfCookie ? decodeURIComponent(csrfCookie.slice('mcp_oauth_csrf='.length)) : '';
    if (!csrf || csrf !== body.csrf) {
      return res.status(400).type('html').send(oauthMessagePage('Consent expired', 'Start the connection again.'));
    }
    const client = await getClient(String(body.client_id || ''));
    const redirectUri = String(body.redirect_uri || '');
    const uris = client?.redirect_uris;
    const registered = Array.isArray(uris) && uris.includes(redirectUri);
    if (!client || !registered) {
      return res.status(400).type('html').send(oauthMessagePage('Cannot connect', 'Unknown client.'));
    }
    const user = sessionUser(req);
    if (!user) {
      return res.status(401).type('html').send(oauthMessagePage('Sign in required', 'Sign in to Vettr, then connect again.'));
    }
    if (body.decision !== 'allow') {
      console.log('[mcp] consent denied', { userId: user.userId, clientId: client.id });
      return redirectWithError(res, redirectUri, body.state, 'access_denied', 'The user denied access');
    }
    const scopes = normalizeScopes(body.scope);
    if (!scopes.length) return redirectWithError(res, redirectUri, body.state, 'invalid_scope', 'No valid scope');
    let resource;
    try {
      resource = assertResource(body.resource, mcpResourceUrl(req));
    } catch (err) {
      return redirectWithError(res, redirectUri, body.state, 'invalid_target', err.message);
    }
    const code = randomToken(32);
    await saveAuthCode({
      code,
      clientId: client.id,
      userId: user.userId,
      redirectUri,
      codeChallenge: String(body.code_challenge || ''),
      scopes: scopes.join(' '),
      resource
    });
    const url = new URL(redirectUri);
    url.searchParams.set('code', code);
    if (body.state) url.searchParams.set('state', String(body.state));
    console.log('[mcp] consent allowed', { userId: user.userId, clientId: client.id });
    res.redirect(url.toString());
  } catch (err) {
    console.error('[mcp] consent post failed', err);
    res.status(500).type('html').send(oauthMessagePage('Something went wrong', 'Try connecting again.'));
  }
});

router.post('/token', async (req, res) => {
  try {
    const { clientId, clientSecret } = readClientCredentials(req);
    const client = await getClient(clientId);
    if (!client || !clientSecretMatches(client, clientSecret)) {
      return oauthError(res, 'invalid_client', 'Unknown client', 401);
    }
    const grant = String(req.body?.grant_type || '');
    const resource = mcpResourceUrl(req);
    if (grant === 'authorization_code') {
      try {
        assertResource(req.body?.resource, resource);
      } catch (err) {
        return oauthError(res, 'invalid_target', err.message);
      }
      const tokens = await exchangeCode({
        code: String(req.body?.code || ''),
        client_id: clientId,
        redirect_uri: String(req.body?.redirect_uri || ''),
        code_verifier: String(req.body?.code_verifier || '')
      });
      return res.json(tokens);
    }
    if (grant === 'refresh_token') {
      try {
        assertResource(req.body?.resource, resource);
      } catch (err) {
        return oauthError(res, 'invalid_target', err.message);
      }
      const rotated = await rotateRefresh(String(req.body?.refresh_token || ''), clientId);
      const accessToken = signMcpAccessToken({
        userId: rotated.userId,
        email: rotated.email,
        scope: rotated.scopes,
        clientId,
        resource
      });
      console.log('[mcp] refresh rotated', { userId: rotated.userId, clientId });
      return res.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL_SEC,
        refresh_token: rotated.refreshToken,
        scope: rotated.scopes
      });
    }
    return oauthError(res, 'unsupported_grant_type', 'Use authorization_code or refresh_token');
  } catch (err) {
    if (err.code === 'invalid_grant' || err.code === 'invalid_scope') {
      return oauthError(res, err.code, err.message);
    }
    console.error('[mcp] token failed', err);
    return oauthError(res, 'server_error', 'Token request failed', 500);
  }
});

export default router;
