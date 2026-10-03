const LOCAL_API_ORIGINS = new Set([
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://vettr-api.metzgerbuildsthings.workers.dev'
]);

/** Only the Vettr API authorize URL may be used as a post-login redirect. */
export function allowedMcpAuthorizeUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.pathname !== '/oauth/authorize' || url.username || url.password) return null;
  const allowed = new Set(LOCAL_API_ORIGINS);
  const configured = import.meta.env.VITE_API_URL;
  if (typeof configured === 'string' && /^https?:\/\//.test(configured)) {
    try {
      allowed.add(new URL(configured).origin);
    } catch {
      /* ignore bad env */
    }
  }
  if (!allowed.has(url.origin)) return null;
  return url.toString();
}
