/**
 * Deep links for in-app alert buttons and desktop/PWA notification clicks.
 * Keep in sync with backend/src/lib/notificationLinks.js
 */

import { displayStageLabel } from './pipelineStages.js';

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
    const q = new URLSearchParams({ tab: 'crm' });
    if (savedDealId) {
      q.set('crmDeal', String(savedDealId));
      q.set('section', 'overview');
    } else {
      q.set('crmSubview', 'cards');
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

export function notificationOpenLabel(alertType, { savedDealId } = {}) {
  const type = String(alertType || '');
  if (type === 'task_completed' || type === 'task_assigned' || type === 'task_due') {
    return 'Open Tasks';
  }
  if (type === 'deal_match') return 'Open matches';
  if (type === 'team_activity' || type === 'crm_followup') {
    return savedDealId ? 'Open deal' : 'Open CRM';
  }
  if (type === 'test' || type === 'settings') return 'Open Settings';
  return 'Open Talk';
}

/** Extra toast line: deal names / stages, never a repeat of the title. */
export function alertBannerPreview(alert) {
  const title = String(alert?.title || '').trim();
  const dealName = String(alert?.deal_name || '').trim();
  const meta = alert?.metadata && typeof alert.metadata === 'object' ? alert.metadata : {};

  const namedMoves = (row) => {
    const names = Array.isArray(row?.names) ? row.names.filter(Boolean) : [];
    const rawStages = Array.isArray(row?.newStages) ? row.newStages : [];
    const customs = Array.isArray(row?.customLabels) ? row.customLabels : [];
    const stages = rawStages.map((stage, i) => displayStageLabel(stage, customs[i]));
    const uniqueStages = [...new Set(stages.filter(Boolean))];
    if (uniqueStages.length <= 1) return names.slice(0, 4);
    return names.slice(0, 4).map((name, i) => {
      const stage = stages[i];
      return stage ? `${name} → ${stage}` : name;
    });
  };

  const fold = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const titleFold = fold(title);
  const seen = new Set();
  const bits = [];
  for (const bit of [
    ...namedMoves(Array.isArray(meta.stages) ? meta.stages[0] : null),
    ...(Array.isArray(meta.added?.[0]?.names) ? meta.added[0].names.filter(Boolean).slice(0, 4) : [])
  ]) {
    const key = fold(bit);
    if (!key || seen.has(key)) continue;
    if (titleFold.includes(key) && key.length >= 6) continue;
    seen.add(key);
    bits.push(bit);
  }

  let preview = bits.join(' · ');
  if (!preview) {
    let body = String(alert?.body || '').trim();
    if (body && fold(body) !== fold(title)) {
      if (fold(body).startsWith(fold(title))) {
        body = body.slice(title.length).replace(/^\s*[·\-|:–—]\s*/, '').trim();
      }
      preview = body;
    }
  }

  if (preview && fold(preview) === fold(title)) preview = '';
  if (preview && fold(preview) === fold(dealName)) {
    const stageRow = Array.isArray(meta.stages) ? meta.stages[0] : null;
    const rawStage = stageRow?.newStages?.[0] || '';
    const custom = Array.isArray(stageRow?.customLabels) ? stageRow.customLabels[0] : '';
    const stage = displayStageLabel(rawStage, custom);
    preview = stage ? `Now: ${stage}` : '';
  }
  return preview.slice(0, 220);
}

/** Resolve the CRM deal a toast should open, including digest metadata fallbacks. */
export function savedDealIdFromAlert(alert) {
  const direct = Number(alert?.saved_deal_id);
  if (Number.isFinite(direct) && direct > 0) return Math.trunc(direct);
  const meta = alert?.metadata && typeof alert.metadata === 'object' ? alert.metadata : {};
  const candidates = [
    meta.savedDealId,
    meta.saved_deal_id,
    Array.isArray(meta.added) ? meta.added[0]?.ids?.[0] : null,
    Array.isArray(meta.stages) ? meta.stages[0]?.ids?.[0] : null
  ];
  for (const item of candidates) {
    const n = Number(item);
    if (Number.isFinite(n) && n > 0) return Math.trunc(n);
  }
  return null;
}
