const STORAGE_KEY = 'vettr.dashboard.location.v1';

const VALID_TABS = new Set(['aggregator', 'crm', 'off-market']);
const VALID_CRM_VIEWS = new Set([
  'home',
  'cards',
  'list',
  'tasks',
  'contacts',
  'calendar',
  'analytics'
]);
const VALID_OM_VIEWS = new Set([
  'campaigns',
  'research',
  'prospects',
  'sequences',
  'stats'
]);
const VALID_CRM_FILTERS = new Set([
  'nudges',
  'mentions',
  'approvals',
  'overdue',
  'dueToday',
  'ddOverdue',
  'stale',
  'dormant'
]);

export function isValidCrmSubview(view) {
  return VALID_CRM_VIEWS.has(view);
}

export function isValidOmSubview(view) {
  return VALID_OM_VIEWS.has(view);
}

export function isValidCrmFilter(filter) {
  return VALID_CRM_FILTERS.has(filter);
}

/** Canonical dashboard tab id, including Off Market aliases. */
export function normalizeDashboardTab(tab) {
  const t = String(tab || '').trim().toLowerCase();
  if (t === 'off-market' || t === 'offmarket' || t === 'off_market') return 'off-market';
  if (t === 'saved-deals' || t === 'crm') return 'crm';
  if (t === 'aggregator') return 'aggregator';
  return null;
}

export function readStoredDashboardLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const tab = VALID_TABS.has(parsed?.tab) ? parsed.tab : null;
    const crmSubview = isValidCrmSubview(parsed?.crmSubview) ? parsed.crmSubview : null;
    const omSubview = isValidOmSubview(parsed?.omSubview) ? parsed.omSubview : null;
    return tab ? { tab, crmSubview, omSubview } : null;
  } catch (err) {
    console.warn('[dashboardLocation] read failed', err.message);
    return null;
  }
}

export function persistDashboardLocation({ tab, crmSubview = null, omSubview = null }) {
  if (!VALID_TABS.has(tab)) return;
  const next = {
    tab,
    crmSubview: tab === 'crm' && isValidCrmSubview(crmSubview) ? crmSubview : null,
    omSubview: tab === 'off-market' && isValidOmSubview(omSubview) ? omSubview : null
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[dashboardLocation] save failed', err.message);
  }
}

/** Merge tab + CRM/Off Market subview into the current query, keeping deep-link params. */
export function patchDashboardSearchParams(searchParams, { tab, crmSubview = null, omSubview = null }) {
  const next = new URLSearchParams(searchParams);
  if (VALID_TABS.has(tab)) next.set('tab', tab);
  if (tab === 'crm' && isValidCrmSubview(crmSubview)) {
    next.set('crmSubview', crmSubview);
  } else {
    next.delete('crmSubview');
  }
  if (tab === 'off-market' && isValidOmSubview(omSubview)) {
    next.set('omSubview', omSubview);
  } else {
    next.delete('omSubview');
  }
  if (tab === 'crm') {
    next.delete('matchIds');
    next.delete('newToday');
    next.delete('dealDbId');
    next.delete('omSubview');
    if (crmSubview === 'tasks') {
      next.delete('crmDeal');
      next.delete('section');
    }
  }
  if (tab === 'off-market') {
    next.delete('matchIds');
    next.delete('newToday');
    next.delete('dealDbId');
    next.delete('crmDeal');
    next.delete('section');
    next.delete('crmSubview');
  }
  if (tab === 'aggregator') {
    next.delete('crmDeal');
    next.delete('section');
    next.delete('omSubview');
  }
  return next;
}
