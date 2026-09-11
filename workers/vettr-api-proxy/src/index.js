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

export default {
  async fetch(request, env) {
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

    // Answer preflight here so preview/staging work even if Express allowlist is stale.
    if (request.method === 'OPTIONS' && isVettrPagesOrigin(request.headers.get('Origin'))) {
      return withPagesCors(request, new Response(null, { status: 204 }));
    }

    const incoming = new URL(request.url);
    const target = new URL(incoming.pathname + incoming.search, origin);

    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.set('host', target.host);
    // Cloudflare / proxy hop-by-hop cleanup
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');
    headers.delete('true-client-ip');

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
      // @ts-ignore – required for streaming bodies in Workers
      init.duplex = 'half';
    }

    try {
      const upstream = await fetch(target.toString(), init);
      return withPagesCors(request, upstream);
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
