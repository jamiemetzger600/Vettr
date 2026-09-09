/**
 * Push the logged-in session to the Vettr Chrome extension (no manual token paste).
 * Requires manifest externally_connectable + VITE_EXTENSION_ID at build time.
 */

const SET_SESSION = 'VETTR_SET_SESSION';
const CLEAR_SESSION = 'VETTR_CLEAR_SESSION';
const REQUEST_SYNC = 'VETTR_REQUEST_SYNC';

function getExtensionId() {
  const id = import.meta.env.VITE_EXTENSION_ID;
  return id && String(id).trim() ? String(id).trim() : '';
}

function resolveApiBaseUrl() {
  let base = import.meta.env.VITE_API_URL;
  if (base && String(base).trim()) {
    return String(base).trim().replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin.replace(/\/+$/, '')}/api`;
  }
  return '';
}

/**
 * Called when the user is logged in on the web app (same Chrome profile as the extension).
 */
export function pushSessionToChromeExtension(accessToken) {
  if (!accessToken || typeof window === 'undefined') return;
  const extId = getExtensionId();
  if (!extId) return;
  const chromeApi = window.chrome;
  if (!chromeApi?.runtime?.sendMessage) return;

  const apiBaseUrl = resolveApiBaseUrl();
  if (!apiBaseUrl) return;

  try {
    chromeApi.runtime.sendMessage(
      extId,
      {
        type: SET_SESSION,
        token: accessToken,
        apiBaseUrl,
        webAppUrl: typeof window !== 'undefined' ? window.location.origin : '',
        email: typeof window !== 'undefined' ? (window.__vettrUserEmail || '') : '',
        teamId:
          typeof window !== 'undefined' && window.__vettrSaveTeamId
            ? Number(window.__vettrSaveTeamId)
            : undefined
      },
      () => {
        void chromeApi.runtime.lastError;
      }
    );
  } catch {
    /* not installed or blocked */
  }
}

export function clearChromeExtensionSession() {
  if (typeof window === 'undefined') return;
  const extId = getExtensionId();
  if (!extId) return;
  const chromeApi = window.chrome;
  if (!chromeApi?.runtime?.sendMessage) return;
  try {
    chromeApi.runtime.sendMessage(extId, { type: CLEAR_SESSION }, () => {
      void chromeApi.runtime.lastError;
    });
  } catch {
    /* ignore */
  }
}

/** Ask the extension to pull latest My Deals from the API (after web save/update/delete). */
export function requestExtensionDealsSync() {
  if (typeof window === 'undefined') return;
  const extId = getExtensionId();
  if (!extId) return;
  const chromeApi = window.chrome;
  if (!chromeApi?.runtime?.sendMessage) return;
  try {
    chromeApi.runtime.sendMessage(extId, { type: REQUEST_SYNC }, () => {
      void chromeApi.runtime.lastError;
    });
  } catch {
    /* extension not installed */
  }
}
