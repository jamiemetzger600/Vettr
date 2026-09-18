/**
 * Typed client for the Scrapling sidecar (scraper-py/app.py).
 * SIDECAR_URL defaults to http://127.0.0.1:3012
 */

const SIDECAR_URL = (process.env.SIDECAR_URL || 'http://127.0.0.1:3012').replace(/\/+$/, '');
const DEFAULT_TIMEOUT_MS = Number(process.env.SIDECAR_CLIENT_TIMEOUT_MS) || 120000;

export class SidecarError extends Error {
  constructor(message, { status, body, endpoint } = {}) {
    super(message);
    this.name = 'SidecarError';
    this.status = status;
    this.body = body;
    this.endpoint = endpoint;
  }
}

async function post(endpoint, payload, { timeoutMs = DEFAULT_TIMEOUT_MS, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${SIDECAR_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = { raw: text }; }
      if (!res.ok) {
        throw new SidecarError(`sidecar ${endpoint} -> ${res.status}: ${body?.detail || text.slice(0, 200)}`, {
          status: res.status, body, endpoint,
        });
      }
      return body;
    } catch (err) {
      lastErr = err;
      const retriable = err.name === 'AbortError' || err.code === 'ECONNREFUSED' || err.cause?.code === 'ECONNREFUSED';
      if (!retriable || attempt === retries) break;
      console.warn(`[sidecar] ${endpoint} attempt ${attempt + 1} failed (${err.message}); retrying`);
      await new Promise((r) => setTimeout(r, 1500));
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastErr instanceof SidecarError) throw lastErr;
  throw new SidecarError(`sidecar ${endpoint} unreachable: ${lastErr?.message || lastErr}`, { endpoint });
}

export async function health() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${SIDECAR_URL}/health`, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, status: res.status };
    return await res.json();
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {{url,final_url,status,html,blocked,block_reason,error,elapsed_ms,mode}} */
export function fetchPage({ url, mode = 'http', timeoutMs, proxy, waitSelector, networkIdle, solveCloudflare }) {
  return post('/fetch', {
    url, mode, timeout_ms: timeoutMs, proxy, wait_selector: waitSelector,
    network_idle: !!networkIdle, solve_cloudflare: !!solveCloudflare,
  });
}

/**
 * Fetch (unless html given) and extract recipe fields.
 * @returns {{url,final_url,status,blocked,block_reason,error,fields:{[k]:{value,how,strategy_index,relocated,selector}},html?,text?,elapsed_ms}}
 */
export function extract({ url, html, mode = 'http', fields, adaptive = false, adaptiveDomain, sourceKey, includeHtml = false, includeText = false, timeoutMs, proxy, waitSelector, networkIdle, solveCloudflare }) {
  return post('/extract', {
    url, html, mode, fields, adaptive, adaptive_domain: adaptiveDomain, source_key: sourceKey,
    include_html: includeHtml, include_text: includeText, timeout_ms: timeoutMs, proxy,
    wait_selector: waitSelector, network_idle: !!networkIdle, solve_cloudflare: !!solveCloudflare,
  });
}

/** @returns {{urls:string[],count,pages_fetched,blocked,block_reason,errors:string[],pages:[]}} */
export function discover({ discover, mode = 'http', maxUrls = 500, rateLimitMs = 2000, timeoutMs, proxy, solveCloudflare }) {
  return post('/discover', {
    discover, mode, max_urls: maxUrls, rate_limit_ms: rateLimitMs, timeout_ms: timeoutMs, proxy,
    solve_cloudflare: !!solveCloudflare,
  }, { timeoutMs: Math.max(DEFAULT_TIMEOUT_MS, (maxUrls / 20) * (rateLimitMs + 5000)) });
}

/** @returns {{url,final_url,status,blocked,block_reason,title,html,raw_html,text,elapsed_ms}} */
export function snapshot({ url, mode = 'browser', timeoutMs, proxy, solveCloudflare, html }) {
  return post('/snapshot', { url, mode, timeout_ms: timeoutMs, proxy, solve_cloudflare: !!solveCloudflare, html });
}

/** @returns {{tag,text,candidates:[{type,sel,matches}],labels:string[],attrs}} */
export function selectorFor({ url, html, path }) {
  return post('/selector', { url, html, path }, { retries: 0 });
}

export { SIDECAR_URL };
