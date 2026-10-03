/**
 * Public origin bots use to reach this API.
 * Prefer API_BASE_URL so OAuth metadata stays on the stable Worker URL
 * even when the request arrives through a rotating tunnel host.
 */

const STABLE_ORIGIN = 'https://vettr-api.metzgerbuildsthings.workers.dev';

function stripApiSuffix(raw) {
  return String(raw || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

function firstHeader(req, name) {
  const value = req?.headers?.[name];
  if (!value) return '';
  return String(value).split(',')[0].trim();
}

export function resolvePublicOrigin(req) {
  const configured = stripApiSuffix(process.env.API_BASE_URL || '');
  if (configured && !/localhost|127\.0\.0\.1/i.test(configured)) return configured;

  const forwarded = firstHeader(req, 'x-forwarded-host');
  const proto = firstHeader(req, 'x-forwarded-proto') || req?.protocol || 'http';
  if (forwarded && !/trycloudflare\.com/i.test(forwarded)) {
    return `${proto}://${forwarded}`;
  }

  const host = firstHeader(req, 'host');
  if (host && !/trycloudflare\.com/i.test(host)) {
    return `${proto}://${host}`;
  }

  if (configured) return configured;
  return STABLE_ORIGIN;
}

export function mcpResourceUrl(req) {
  return `${resolvePublicOrigin(req)}/mcp`;
}

export function webAppUrl() {
  const raw = (process.env.WEB_APP_URL || 'http://localhost:5173').split(',')[0].trim();
  return raw.replace(/\/+$/, '') || 'http://localhost:5173';
}
