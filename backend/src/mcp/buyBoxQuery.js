import { slotHasMatchCriteria } from '../lib/userBuyBoxes.js';

function numOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Map one buy-box slot onto GET /api/market-deals query params.
 * Flexibility widens min/max the same way the market feed does.
 */
export function marketQueryFromBuyBox(slot, flexibilityPct = null) {
  const criteria = slot && typeof slot === 'object' ? slot : {};
  const flexRaw = flexibilityPct != null ? flexibilityPct : criteria.includeNearMatchesPercent;
  const flex = Math.max(0, Math.min(100, Number(flexRaw) || 0)) / 100;
  const applyMin = (val) => {
    const n = numOrNull(val);
    return n == null ? null : Math.round(n * (1 - flex));
  };
  const applyMax = (val) => {
    const n = numOrNull(val);
    return n == null ? null : Math.round(n * (1 + flex));
  };

  const query = {};
  const minPrice = applyMin(criteria.minPrice);
  const maxPrice = applyMax(criteria.maxPrice);
  const minProfit = applyMin(criteria.minEbitda);
  const maxProfit = applyMax(criteria.maxEbitda);
  const minRevenue = applyMin(criteria.minRevenue);
  const maxRevenue = applyMax(criteria.maxRevenue);
  if (minPrice != null) query.min_price = String(minPrice);
  if (maxPrice != null) query.max_price = String(maxPrice);
  if (minProfit != null) query.min_profit = String(minProfit);
  if (maxProfit != null) query.max_profit = String(maxProfit);
  if (minRevenue != null) query.min_revenue = String(minRevenue);
  if (maxRevenue != null) query.max_revenue = String(maxRevenue);

  if (Array.isArray(criteria.targetStates) && criteria.targetStates.length) {
    query.state = criteria.targetStates.join(',');
  }
  if (Array.isArray(criteria.targetIndustries) && criteria.targetIndustries.length) {
    query.industry = criteria.targetIndustries.join(',');
  }
  const search = typeof criteria.feedSearch === 'string' ? criteria.feedSearch.trim() : '';
  if (search) query.search = search;
  const keywords = Array.isArray(criteria.excludeKeywords)
    ? criteria.excludeKeywords.map((k) => String(k).trim()).filter(Boolean)
    : [];
  if (keywords.length) query.exclude_keywords = JSON.stringify(keywords.slice(0, 40));
  return query;
}

export function buyBoxCanSearch(slot) {
  return slotHasMatchCriteria(slot);
}
