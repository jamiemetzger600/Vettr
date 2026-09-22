/**
 * Table/card split: deals first seen since local midnight, then older deals.
 * Inbox and custom sorts leave the list alone.
 */

export function isDefaultDateSort(sortConfig) {
  const effective = Array.isArray(sortConfig) && sortConfig.length > 0
    ? sortConfig
    : [{ field: 'date', direction: 'desc' }];
  if (effective.length !== 1) return false;
  const primary = effective[0];
  if (primary?.field !== 'date') return false;
  return primary.direction !== 'asc';
}

export function isFirstSeenOnOrAfter(deal, dayStartMs) {
  const raw = deal?.firstSeenAt;
  if (raw == null || raw === '') return false;
  const seen = new Date(raw).getTime();
  return Number.isFinite(seen) && seen >= dayStartMs;
}

/**
 * Where to draw the Older deals break on this page.
 * `newTodayTotal` is the filtered count of deals first seen since local midnight.
 */
export function dailyMatchSection({
  deals,
  page = 1,
  perPage = 50,
  newTodayTotal = null,
  enabled = false,
  dayStartMs,
}) {
  const list = Array.isArray(deals) ? deals : [];
  let newOnPage = 0;
  let firstOlder = -1;
  for (let i = 0; i < list.length; i += 1) {
    if (isFirstSeenOnOrAfter(list[i], dayStartMs)) newOnPage += 1;
    else if (firstOlder < 0) firstOlder = i;
  }
  const olderOnPage = list.length - newOnPage;
  const base = {
    newOnPage,
    olderOnPage,
    dividerBefore: null,
    showNoneBanner: false,
    stickyWithoutDivider: false,
  };

  if (!enabled || list.length === 0) return { ...base, kind: 'off' };

  const totalNew = Number(newTodayTotal);
  const knownTotal = Number.isFinite(totalNew);
  const offset = (Math.max(1, Number(page) || 1) - 1) * perPage;

  if (knownTotal && totalNew <= 0) {
    return { ...base, kind: 'none-today', showNoneBanner: page <= 1 };
  }

  if (firstOlder < 0) return { ...base, kind: 'all-today' };

  if (firstOlder > 0) {
    return { ...base, kind: 'boundary', dividerBefore: firstOlder };
  }

  if (!knownTotal) {
    if (page <= 1) return { ...base, kind: 'none-today', showNoneBanner: true };
    return { ...base, kind: 'off' };
  }

  if (offset > totalNew) {
    return { ...base, kind: 'past-boundary', stickyWithoutDivider: true };
  }

  return { ...base, kind: 'boundary', dividerBefore: 0 };
}

/** Rows for table/card: optional notice, divider, then deals. */
export function dailyMatchRows(deals, section) {
  const rows = [];
  if (section?.showNoneBanner) rows.push({ type: 'notice', id: 'none-today' });
  const at = section?.dividerBefore;
  (deals || []).forEach((deal, index) => {
    if (at === index) rows.push({ type: 'divider', id: 'older-deals' });
    rows.push({ type: 'deal', deal });
  });
  return rows;
}
