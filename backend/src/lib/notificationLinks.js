/**
 * Deep links for desktop/PWA notification clicks.
 * Keep in sync with web/src/utils/notificationLinks.js
 */

export function parseMatchDealIds(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(',');
  const ids = [];
  const seen = new Set();
  for (const item of raw) {
    const n = Number(String(item).trim());
    if (!Number.isFinite(n) || n <= 0) continue;
    const key = String(Math.trunc(n));
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(key);
    if (ids.length >= 400) break;
  }
  return ids;
}

export function notificationPath({
  alertType,
  savedDealId,
  dealDbId,
  newToday,
  dealDbIds
} = {}) {
  const type = String(alertType || '');
  if (type === 'deal_match') {
    const q = new URLSearchParams({ tab: 'aggregator' });
    const ids = parseMatchDealIds(dealDbIds);
    if (ids.length) q.set('matchIds', ids.join(','));
    const openId = dealDbId || (ids.length === 1 ? ids[0] : null);
    if (openId) q.set('dealDbId', String(openId));
    if (!ids.length) q.set('newToday', '1');
    return `/dashboard?${q.toString()}`;
  }
  if (type === 'team_activity') {
    const q = new URLSearchParams({ tab: 'crm', crmSubview: 'cards' });
    if (savedDealId) {
      q.set('crmDeal', String(savedDealId));
      q.set('section', 'overview');
    }
    return `/dashboard?${q.toString()}`;
  }
  if (
    type === 'task_completed'
    || type === 'task_assigned'
    || type === 'task_due'
  ) {
    const q = new URLSearchParams({ tab: 'crm', crmSubview: 'tasks' });
    return `/dashboard?${q.toString()}`;
  }
  if (type === 'crm_followup' && savedDealId) {
    const q = new URLSearchParams({
      tab: 'crm',
      crmDeal: String(savedDealId),
      section: 'overview'
    });
    return `/dashboard?${q.toString()}`;
  }
  if (savedDealId) {
    const q = new URLSearchParams({
      tab: 'crm',
      crmDeal: String(savedDealId),
      section: 'crm-talk'
    });
    return `/dashboard?${q.toString()}`;
  }
  return '/dashboard?tab=crm';
}

/** Open a saved deal on CRM home (Today / pipeline + action chips). */
export function crmDealPath(savedDealId) {
  const q = new URLSearchParams({ tab: 'crm', crmSubview: 'home', section: 'overview' });
  if (savedDealId) q.set('crmDeal', String(savedDealId));
  return `/dashboard?${q.toString()}`;
}

/** CRM home, optionally filtered to one Today chip (overdue, dueToday, stale, …). */
export function crmQueuePath(crmFilter) {
  const q = new URLSearchParams({ tab: 'crm', crmSubview: 'home' });
  if (crmFilter) q.set('crmFilter', String(crmFilter));
  return `/dashboard?${q.toString()}`;
}

export function notificationOpenLabel(alertType) {
  const type = String(alertType || '');
  if (type === 'task_completed' || type === 'task_assigned' || type === 'task_due') {
    return 'Open Tasks';
  }
  if (type === 'deal_match') return 'Open matches';
  if (type === 'team_activity' || type === 'crm_followup') return 'Open CRM';
  if (type === 'test' || type === 'settings') return 'Open Settings';
  return 'Open Talk';
}
