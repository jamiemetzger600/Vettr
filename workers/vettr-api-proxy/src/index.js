/**
 * Stable public proxy for Vettr local API.
 * Pages / extension call this workers.dev URL (never changes).
 * TUNNEL_ORIGIN env points at the current Cloudflare quick-tunnel URL
 * and can be updated without redeploying Pages.
 */

import { isVettrPagesOrigin } from '../../../shared/corsAllow.js';

/** Reflect Origin for Vettr Pages (prod + staging + previews) when credentials are used. */
function withPagesCors(request, response) {
  const reqOrigin = request.headers.get('Origin');
  if (!isVettrPagesOrigin(reqOrigin)) return response;
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', reqOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS');
  headers.set(
    'Access-Control-Allow-Headers',
    request.headers.get('Access-Control-Request-Headers') || 'content-type, authorization'
  );
  headers.append('Vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

const VPC_ORIGIN = 'http://127.0.0.1:3001';

function proxyTo(request, origin, body, doFetch) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.set('x-forwarded-host', incoming.host);
  headers.set('x-forwarded-proto', incoming.protocol.replace(':', '') || 'https');
  headers.set('host', target.host);
  // Cloudflare / proxy hop-by-hop cleanup
  headers.delete('cf-connecting-ip');
  headers.delete('cf-ray');
  headers.delete('cf-visitor');
  headers.delete('true-client-ip');

  return doFetch(target.toString(), {
    method: request.method,
    headers,
    redirect: 'manual',
    body,
  });
}

function withRoute(response, route) {
  const r = new Response(response.body, response);
  r.headers.set('x-vettr-route', route);
  return r;
}

export default {
  async fetch(request, env) {
    // Answer preflight here so preview/staging work even if Express allowlist is stale.
    if (request.method === 'OPTIONS' && isVettrPagesOrigin(request.headers.get('Origin'))) {
      return withPagesCors(request, new Response(null, { status: 204 }));
    }

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    // Buffer so the body can be replayed against the quick-tunnel fallback.
    const body = hasBody ? await request.arrayBuffer() : undefined;

    // Primary: Workers VPC → named tunnel (stable, no rotating URL).
    if (env.VETTR_API) {
      try {
        const res = await proxyTo(request, VPC_ORIGIN, body, (u, i) => env.VETTR_API.fetch(u, i));
        return withPagesCors(request, withRoute(res, 'vpc'));
      } catch (err) {
        console.log('[vettr-api] VPC route failed, falling back to quick tunnel:', String(err?.message || err));
      }
    }

    const origin = (env.TUNNEL_ORIGIN || '').replace(/\/+$/, '');
    if (!origin) {
      return withPagesCors(
        request,
        new Response(
          JSON.stringify({
            error: 'TUNNEL_ORIGIN not configured',
            hint: 'Local tunnel sync has not set the Mac tunnel URL yet',
          }),
          { status: 502, headers: { 'content-type': 'application/json' } }
        )
      );
    }

    try {
      const upstream = await proxyTo(request, origin, body, (u, i) => fetch(u, i));
      return withPagesCors(request, withRoute(upstream, 'quick-tunnel'));
    } catch (err) {
      return withPagesCors(
        request,
        new Response(
          JSON.stringify({
            error: 'Upstream tunnel unreachable',
            detail: String(err && err.message ? err.message : err),
            origin,
          }),
          { status: 502, headers: { 'content-type': 'application/json' } }
        )
      );
    }
  },
};
