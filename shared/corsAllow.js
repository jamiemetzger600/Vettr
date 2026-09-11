/**
 * Shared CORS origin allow-check for Vettr API (Express) and Worker proxy.
 * Reflect matching Origin when credentials/cookies are used — never `*`.
 */

/** Production Cloudflare Pages origin. */
export const VETTR_PAGES_PROD_ORIGIN = 'https://vettr.pages.dev';

/**
 * Branch / PR / staging hosts: https://<label>.vettr.pages.dev
 * Matches staging, hash previews, and named branch previews.
 * Does not match production https://vettr.pages.dev (no subdomain label).
 */
export const VETTR_PAGES_PREVIEW_ORIGIN =
  /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vettr\.pages\.dev$/i;

/** True for https://staging.vettr.pages.dev, hash, and named-branch previews. */
export function isVettrPagesPreviewOrigin(origin) {
  return Boolean(origin) && VETTR_PAGES_PREVIEW_ORIGIN.test(origin);
}

/** True for production Pages or any *.vettr.pages.dev preview/staging host. */
export function isVettrPagesOrigin(origin) {
  if (!origin) return false;
  if (origin === VETTR_PAGES_PROD_ORIGIN) return true;
  return isVettrPagesPreviewOrigin(origin);
}

/**
 * Decide whether a browser Origin may call the API with credentials.
 *
 * @param {string | null | undefined} origin
 * @param {{
 *   allowedOrigins?: string[],
 *   allowChromeExtension?: boolean,
 * }} [opts]
 * @returns {boolean}
 */
export function isAllowedCorsOrigin(origin, opts = {}) {
  const { allowedOrigins = [], allowChromeExtension = true } = opts;
  // Non-browser / same-origin requests often omit Origin
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (allowChromeExtension && /^chrome-extension:\/\//i.test(origin)) return true;
  if (isVettrPagesOrigin(origin)) return true;
  return false;
}
