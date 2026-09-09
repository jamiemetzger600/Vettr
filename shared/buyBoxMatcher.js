/**
 * Buy Box Matching Logic
 * Extracted from extension background.js and deals-dashboard.js
 * Used by: Extension, Web App, Backend (for notifications)
 */

/**
 * Apply "near match" slack to numeric limits (e.g. 10% = show deals slightly over max or under min).
 * @param {number} limit - The user's limit (min or max)
 * @param {number} dealValue - The deal's value
 * @param {'min'|'max'} type - For 'max': allow dealValue up to limit * (1 + pct/100). For 'min': allow dealValue down to limit * (1 - pct/100).
 * @param {number} pct - Percent slack (0 = strict)
 * @returns {boolean} - True if deal value is within the relaxed limit
 */
function withinSlack(limit, dealValue, type, pct) {
  if (pct <= 0) return type === 'max' ? dealValue <= limit : dealValue >= limit;
  if (type === 'max') {
    const cap = limit * (1 + pct / 100);
    return dealValue <= cap;
  }
  const floor = limit * (1 - pct / 100);
  return dealValue >= floor;
}

/**
 * Check if a deal matches the user's buy box criteria.
 * Optional includeNearMatchesPercent (0–100) relaxes numeric limits so slightly over-max or under-min deals still show (e.g. negotiable listings).
 * @param {Object} deal - Deal object
 * @param {Object} buyBox - Buy box configuration (may include includeNearMatchesPercent)
 * @returns {boolean} - True if deal matches
 */
export function dealMatchesBuyBox(deal, buyBox) {
  if (!buyBox) return true;

  const pct = Math.min(100, Math.max(0, Number(buyBox.includeNearMatchesPercent) || 0));

  // Price filters (with optional slack)
  if (buyBox.minPrice != null && deal.askingPrice != null && !withinSlack(buyBox.minPrice, deal.askingPrice, 'min', pct)) return false;
  if (buyBox.maxPrice != null && deal.askingPrice != null && !withinSlack(buyBox.maxPrice, deal.askingPrice, 'max', pct)) return false;

  // EBITDA filters
  if (buyBox.minEbitda != null && deal.ebitda != null && !withinSlack(buyBox.minEbitda, deal.ebitda, 'min', pct)) return false;
  if (buyBox.maxEbitda != null && deal.ebitda != null && !withinSlack(buyBox.maxEbitda, deal.ebitda, 'max', pct)) return false;

  // Revenue filters
  if (buyBox.minRevenue != null && deal.revenue != null && !withinSlack(buyBox.minRevenue, deal.revenue, 'min', pct)) return false;
  if (buyBox.maxRevenue != null && deal.revenue != null && !withinSlack(buyBox.maxRevenue, deal.revenue, 'max', pct)) return false;

  // State filters (target states)
  if (buyBox.targetStates && buyBox.targetStates.length > 0) {
    const dealState = (deal.state || '').toUpperCase().trim();
    const hasTargetState = buyBox.targetStates.some(s =>
      dealState.includes(s.toUpperCase().trim())
    );
    if (!hasTargetState) return false;
  }

  // State filters (exclude states)
  if (buyBox.excludeStates && buyBox.excludeStates.length > 0) {
    const dealState = (deal.state || '').toUpperCase().trim();
    const isExcluded = buyBox.excludeStates.some(s =>
      dealState.includes(s.toUpperCase().trim())
    );
    if (isExcluded) return false;
  }

  // Industry filters
  if (buyBox.targetIndustries && buyBox.targetIndustries.length > 0) {
    const dealIndustry = (deal.industry || '').toLowerCase();
    const hasTargetIndustry = buyBox.targetIndustries.some(ind =>
      dealIndustry.includes(ind.toLowerCase())
    );
    if (!hasTargetIndustry) return false;
  }

  // Revenue multiple filter (treated as max multiple; slack allows slightly higher)
  if (buyBox.revenueMultiple != null && deal.revenue && deal.askingPrice) {
    const actualMultiple = deal.askingPrice / deal.revenue;
    if (!withinSlack(buyBox.revenueMultiple, actualMultiple, 'max', pct)) return false;
  }

  return true;
}

/** Absentee/remote near-matches still must be within this slack of numeric limits. */
export const ABSENTEE_REMOTE_NEAR_PERCENT = 20;

export function clampNearMatchPercent(pct) {
  const n = Number(pct);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, n);
}

/** True when listing is tagged absentee, remote, or relocatable (not an explicit No). */
export function isAbsenteeRemoteDeal(deal) {
  const raw = String(deal?.remote || deal?.remoteRelocatable || '').trim().toLowerCase();
  if (!raw) return false;
  if (/^(no|n|false|0)$/.test(raw)) return false;
  if (/\bno\b/.test(raw) && !/\b(yes|true|absentee|remote|relocatable)\b/.test(raw)) return false;
  return /yes|true|absentee|remote|relocatable|owner.?absen/.test(raw);
}

function overshootMax(dealVal, limit) {
  if (limit == null || dealVal == null) return 0;
  const value = Number(dealVal);
  const cap = Number(limit);
  if (!Number.isFinite(value) || !Number.isFinite(cap) || cap === 0 || value <= cap) return 0;
  return ((value / cap) - 1) * 100;
}

function undershootMin(dealVal, limit) {
  if (limit == null || dealVal == null) return 0;
  const value = Number(dealVal);
  const floor = Number(limit);
  if (!Number.isFinite(value) || !Number.isFinite(floor) || floor === 0 || value >= floor) return 0;
  return (1 - (value / floor)) * 100;
}

function thresholdOvershootReasons(deal, buyBox) {
  const reasons = [];
  const push = (field, pct, direction) => {
    if (pct <= 0) return;
    reasons.push({ type: 'threshold', field, direction, pct });
  };
  push('price', undershootMin(deal.askingPrice, buyBox.minPrice), 'under');
  push('price', overshootMax(deal.askingPrice, buyBox.maxPrice), 'over');
  push('profit', undershootMin(deal.ebitda, buyBox.minEbitda), 'under');
  push('profit', overshootMax(deal.ebitda, buyBox.maxEbitda), 'over');
  push('revenue', undershootMin(deal.revenue, buyBox.minRevenue), 'under');
  push('revenue', overshootMax(deal.revenue, buyBox.maxRevenue), 'over');
  if (buyBox.revenueMultiple != null && deal.revenue && deal.askingPrice) {
    push('multiple', overshootMax(deal.askingPrice / deal.revenue, buyBox.revenueMultiple), 'over');
  }
  return reasons;
}

export function formatNearMatchReasons(reasons) {
  const parts = [];
  for (const reason of reasons || []) {
    if (reason.type === 'absentee_remote') {
      parts.push('Absentee/remote');
      continue;
    }
    if (reason.type !== 'threshold') continue;
    const rounded = Math.max(1, Math.round(reason.pct));
    const dir = reason.direction === 'under' ? 'under min' : 'over max';
    parts.push(`${rounded}% ${dir} ${reason.field}`);
  }
  return parts.join(' · ');
}

/**
 * Exact = inside the box with no slack.
 * Near = fails exact, but (flexibility 5–20%+) OR (absentee/remote within 20%).
 */
export function classifyBuyBoxMatch(deal, buyBox) {
  if (!buyBox) return { kind: 'exact', reasons: [] };

  const pct = clampNearMatchPercent(buyBox.includeNearMatchesPercent);
  const includeRemote = buyBox.includeAbsenteeRemoteNearMatches === true;
  const strictBox = { ...buyBox, includeNearMatchesPercent: 0 };

  if (dealMatchesBuyBox(deal, strictBox)) {
    const reasons = isAbsenteeRemoteDeal(deal) ? [{ type: 'absentee_remote' }] : [];
    return { kind: 'exact', reasons };
  }

  const numericOk = pct > 0 && dealMatchesBuyBox(deal, { ...buyBox, includeNearMatchesPercent: pct });
  const remotePct = Math.max(pct, ABSENTEE_REMOTE_NEAR_PERCENT);
  const remoteOk = includeRemote
    && isAbsenteeRemoteDeal(deal)
    && dealMatchesBuyBox(deal, { ...buyBox, includeNearMatchesPercent: remotePct });

  if (!numericOk && !remoteOk) return { kind: 'none', reasons: [] };

  const reasons = thresholdOvershootReasons(deal, buyBox);
  if (isAbsenteeRemoteDeal(deal)) reasons.push({ type: 'absentee_remote' });
  return { kind: 'near', reasons };
}

/**
 * Filter deals by exclude keywords
 * @param {Object} deal - Deal object
 * @param {Array<string>} excludeKeywords - Array of keywords to exclude
 * @returns {boolean} - True if deal should be included (not excluded)
 */
export function dealPassesExcludeFilter(deal, excludeKeywords = []) {
  if (!excludeKeywords || excludeKeywords.length === 0) return true;

  const searchableText = [
    deal.name || '',
    deal.description || '',
    deal.industry || '',
    deal.location || ''
  ].join(' ').toLowerCase();

  // Exclude if ANY keyword is found
  const isExcluded = excludeKeywords.some(keyword =>
    searchableText.includes(keyword.toLowerCase())
  );

  return !isExcluded;
}

/**
 * Filter deals by hidden IDs
 * @param {Object} deal - Deal object
 * @param {Array<string>|Set<string>} hiddenIds - Array or Set of hidden deal IDs
 * @returns {boolean} - True if deal should be included (not hidden)
 */
export function dealIsNotHidden(deal, hiddenIds = []) {
  if (!hiddenIds || hiddenIds.length === 0 && !(hiddenIds instanceof Set)) return true;

  const hiddenSet = hiddenIds instanceof Set ? hiddenIds : new Set(hiddenIds);
  return !hiddenSet.has(deal.id);
}

/**
 * Apply all filters to a deal
 * @param {Object} deal - Deal object
 * @param {Object} filters - Combined filters object
 * @param {Object} filters.buyBox - Buy box configuration
 * @param {Array<string>} filters.excludeKeywords - Exclude keywords
 * @param {Array<string>|Set<string>} filters.hiddenIds - Hidden deal IDs
 * @param {boolean} filters.showHidden - Whether to show hidden deals
 * @returns {boolean} - True if deal passes all filters
 */
export function dealPassesAllFilters(deal, filters = {}) {
  const {
    buyBox,
    excludeKeywords = [],
    hiddenIds = [],
    showHidden = false
  } = filters;

  // Buy box filter
  if (!dealMatchesBuyBox(deal, buyBox)) return false;

  // Exclude keywords filter
  if (!dealPassesExcludeFilter(deal, excludeKeywords)) return false;

  // Hidden deals filter (unless showing hidden)
  if (!showHidden && !dealIsNotHidden(deal, hiddenIds)) return false;

  return true;
}

/**
 * Filter an array of deals
 * @param {Array<Object>} deals - Array of deals
 * @param {Object} filters - Filters to apply
 * @returns {Array<Object>} - Filtered deals
 */
export function filterDeals(deals, filters = {}) {
  return deals.filter(deal => dealPassesAllFilters(deal, filters));
}

/**
 * Count deals matching filters
 * @param {Array<Object>} deals - Array of deals
 * @param {Object} filters - Filters to apply
 * @returns {number} - Count of matching deals
 */
export function countMatchingDeals(deals, filters = {}) {
  return deals.filter(deal => dealPassesAllFilters(deal, filters)).length;
}
