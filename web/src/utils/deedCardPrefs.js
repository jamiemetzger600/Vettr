const STORAGE_KEY = 'vettr.crm.deedCards.v1';

export const DEED_COLORS = [
  { id: 'brown', hex: '#955436', ink: '#fff', label: 'Brown' },
  { id: 'light-blue', hex: '#aae0fa', ink: '#111', label: 'Light blue' },
  { id: 'orange', hex: '#f7941d', ink: '#111', label: 'Orange' },
  { id: 'red', hex: '#ef4444', ink: '#fff', label: 'Red' },
  { id: 'yellow', hex: '#fef200', ink: '#111', label: 'Yellow' },
  { id: 'green', hex: '#1fb25a', ink: '#fff', label: 'Green' },
  { id: 'dark-blue', hex: '#0072bb', ink: '#fff', label: 'Dark blue' }
];

export const WAITING_DEFAULTS = [
  { id: 'seller', label: 'Seller' },
  { id: 'broker', label: 'Broker' },
  { id: 'lender', label: 'Lender' },
  { id: 'attorney', label: 'Attorney' },
  { id: 'cpa', label: 'Accountant' },
  { id: 'cim', label: 'CIM' },
  { id: 'financials', label: 'Financials' },
  { id: 'nda', label: 'NDA' }
];

function dealKey(id) {
  return String(id);
}

export function deedBoardStorageKey(teamId = null) {
  if (teamId == null || teamId === '') return STORAGE_KEY;
  return `vettr.crm.deedCards.team.${teamId}.v1`;
}

export function emptyDeedCardPrefs() {
  return { order: [], pins: {}, colors: {}, waitingOn: {} };
}

export function normalizeDeedCardPrefs(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return emptyDeedCardPrefs();
  }
  const allowed = new Set(DEED_COLORS.map((c) => c.id));
  const colors = {};
  if (parsed.colors && typeof parsed.colors === 'object') {
    for (const [id, colorId] of Object.entries(parsed.colors)) {
      if (allowed.has(colorId)) colors[id] = colorId;
    }
  }
  return {
    order: Array.isArray(parsed.order) ? parsed.order.map(String) : [],
    pins: parsed.pins && typeof parsed.pins === 'object' ? parsed.pins : {},
    colors,
    waitingOn: parsed.waitingOn && typeof parsed.waitingOn === 'object' ? parsed.waitingOn : {}
  };
}

export function isEmptyDeedCardPrefs(prefs) {
  const p = normalizeDeedCardPrefs(prefs);
  return (
    p.order.length === 0
    && Object.keys(p.pins).length === 0
    && Object.keys(p.colors).length === 0
    && Object.keys(p.waitingOn).length === 0
  );
}

export function deedCardPrefsFingerprint(prefs) {
  return JSON.stringify(normalizeDeedCardPrefs(prefs));
}

export function defaultDeedColorId(dealId) {
  const n = Math.abs(Number(dealId) || 0);
  return DEED_COLORS[n % DEED_COLORS.length].id;
}

export function deedColorById(colorId, dealId) {
  const found = DEED_COLORS.find((c) => c.id === colorId);
  if (found) return found;
  const fallbackId = defaultDeedColorId(dealId);
  return DEED_COLORS.find((c) => c.id === fallbackId) || DEED_COLORS[DEED_COLORS.length - 1];
}

export function loadDeedCardPrefs(teamId = null) {
  try {
    const raw = localStorage.getItem(deedBoardStorageKey(teamId));
    if (!raw) return emptyDeedCardPrefs();
    return normalizeDeedCardPrefs(JSON.parse(raw));
  } catch (err) {
    console.warn('[deedCardPrefs] load failed', err.message);
    return emptyDeedCardPrefs();
  }
}

export function saveDeedCardPrefs(prefs, teamId = null) {
  try {
    localStorage.setItem(deedBoardStorageKey(teamId), JSON.stringify(normalizeDeedCardPrefs(prefs)));
    console.log('[deedCardPrefs] saved', {
      teamId: teamId || 'personal',
      order: prefs.order?.length || 0,
      pins: Object.keys(prefs.pins || {}).length,
      colors: Object.keys(prefs.colors || {}).length
    });
  } catch (err) {
    console.warn('[deedCardPrefs] save failed', err.message);
  }
}

export function emptyWaitingOn() {
  return { active: [], custom: [] };
}

export function getWaitingOn(prefs, dealId) {
  const row = prefs.waitingOn?.[dealKey(dealId)];
  if (!row) return emptyWaitingOn();
  return {
    active: Array.isArray(row.active) ? row.active.map(String) : [],
    custom: Array.isArray(row.custom)
      ? row.custom.filter((c) => c && c.label).map((c) => ({ id: String(c.id), label: String(c.label) }))
      : []
  };
}

export function waitingOnLabels(waiting) {
  const defaults = WAITING_DEFAULTS.filter((d) => waiting.active.includes(d.id)).map((d) => d.label);
  const custom = (waiting.custom || []).map((c) => c.label);
  return [...defaults, ...custom];
}

export function savedAtMs(deal) {
  const t = new Date(deal?.savedAt || deal?.saved_at || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function compareDealsBySavedAtDesc(a, b) {
  const diff = savedAtMs(b) - savedAtMs(a);
  if (diff) return diff;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

export function sortDealsForDeedBoard(deals, prefs) {
  const orderIndex = new Map((prefs.order || []).map((id, i) => [String(id), i]));
  const pinned = [];
  const rest = [];
  for (const deal of deals) {
    if (prefs.pins?.[dealKey(deal.id)]) pinned.push(deal);
    else rest.push(deal);
  }
  const byPinOrder = (a, b) => {
    const ia = orderIndex.has(dealKey(a.id)) ? orderIndex.get(dealKey(a.id)) : Number.MAX_SAFE_INTEGER;
    const ib = orderIndex.has(dealKey(b.id)) ? orderIndex.get(dealKey(b.id)) : Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return compareDealsBySavedAtDesc(a, b);
  };
  pinned.sort(byPinOrder);
  rest.sort(compareDealsBySavedAtDesc);
  return [...pinned, ...rest];
}

export function partitionDeedDeals(deals, prefs) {
  const ordered = sortDealsForDeedBoard(deals, prefs);
  const pinned = [];
  const rest = [];
  for (const deal of ordered) {
    if (prefs.pins?.[dealKey(deal.id)]) pinned.push(deal);
    else rest.push(deal);
  }
  return { pinned, rest };
}

export function reorderDealIds(orderedIds, fromId, toId) {
  const list = orderedIds.map(String);
  const from = String(fromId);
  const to = String(toId);
  const fromIdx = list.indexOf(from);
  const toIdx = list.indexOf(to);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return list;
  const next = [...list];
  next.splice(fromIdx, 1);
  const insertAt = next.indexOf(to);
  next.splice(insertAt, 0, from);
  return next;
}

/** Move `fromId` before, after, or to the end of the order list. */
export function placeDealInOrder(orderedIds, fromId, { beforeId = null, afterId = null } = {}) {
  const from = String(fromId);
  const next = orderedIds.map(String).filter((id) => id !== from);
  if (beforeId) {
    const idx = next.indexOf(String(beforeId));
    next.splice(idx >= 0 ? idx : next.length, 0, from);
    return next;
  }
  if (afterId) {
    const idx = next.indexOf(String(afterId));
    next.splice(idx >= 0 ? idx + 1 : next.length, 0, from);
    return next;
  }
  next.push(from);
  return next;
}
