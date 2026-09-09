/**
 * Buy Box Matching Logic (backend copy for Koyeb deploy)
 * Source of truth: repo root shared/buyBoxMatcher.js
 * Used here by notificationScheduler for deal-matching. Keep in sync with shared/ when that file changes.
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

export function dealMatchesBuyBox(deal, buyBox) {
  if (!buyBox) return true;

  const pct = Math.min(100, Math.max(0, Number(buyBox.includeNearMatchesPercent) || 0));

  if (buyBox.minPrice != null && deal.askingPrice != null && !withinSlack(buyBox.minPrice, deal.askingPrice, 'min', pct)) return false;
  if (buyBox.maxPrice != null && deal.askingPrice != null && !withinSlack(buyBox.maxPrice, deal.askingPrice, 'max', pct)) return false;
  if (buyBox.minEbitda != null && deal.ebitda != null && !withinSlack(buyBox.minEbitda, deal.ebitda, 'min', pct)) return false;
  if (buyBox.maxEbitda != null && deal.ebitda != null && !withinSlack(buyBox.maxEbitda, deal.ebitda, 'max', pct)) return false;
  if (buyBox.minRevenue != null && deal.revenue != null && !withinSlack(buyBox.minRevenue, deal.revenue, 'min', pct)) return false;
  if (buyBox.maxRevenue != null && deal.revenue != null && !withinSlack(buyBox.maxRevenue, deal.revenue, 'max', pct)) return false;

  if (buyBox.targetStates && buyBox.targetStates.length > 0) {
    const dealState = (deal.state || '').toUpperCase().trim();
    const hasTargetState = buyBox.targetStates.some(s =>
      dealState.includes(s.toUpperCase().trim())
    );
    if (!hasTargetState) return false;
  }
  if (buyBox.excludeStates && buyBox.excludeStates.length > 0) {
    const dealState = (deal.state || '').toUpperCase().trim();
    const isExcluded = buyBox.excludeStates.some(s =>
      dealState.includes(s.toUpperCase().trim())
    );
    if (isExcluded) return false;
  }
  if (buyBox.targetIndustries && buyBox.targetIndustries.length > 0) {
    const dealIndustry = (deal.industry || '').toLowerCase();
    const hasTargetIndustry = buyBox.targetIndustries.some(ind =>
      dealIndustry.includes(ind.toLowerCase())
    );
    if (!hasTargetIndustry) return false;
  }
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

/** Map a market_deals row onto the matcher deal shape. */
export function marketRowToMatchDeal(row) {
  const industries = row?.industries;
  let industry = '';
  if (Array.isArray(industries)) industry = industries.filter(Boolean).join(', ');
  else if (typeof industries === 'string') industry = industries;

  const asking = row?.asking_price != null ? Number(row.asking_price) : null;
  const revenue = row?.annual_revenue != null ? Number(row.annual_revenue) : null;
  const ebitda = row?.annual_profit != null ? Number(row.annual_profit) : null;
  const profitMultiple = Number.isFinite(asking) && Number.isFinite(ebitda) && ebitda
    ? asking / ebitda
    : null;

  return {
    id: row?.id,
    name: row?.name || 'Unnamed listing',
    url: row?.listing_url || '',
    askingPrice: Number.isFinite(asking) ? asking : null,
    revenue: Number.isFinite(revenue) ? revenue : null,
    ebitda: Number.isFinite(ebitda) ? ebitda : null,
    profitMultiple: Number.isFinite(profitMultiple) ? profitMultiple : null,
    state: row?.state || '',
    industry,
    remote: row?.remote_relocatable || '',
    location: [row?.city, row?.state].filter(Boolean).join(', '),
    firstSeenAt: row?.first_seen_at || null
  };
}

/** Slot feed search (AND terms) and exclude keywords. */
export function dealPassesSlotFeed(deal, slot) {
  if (!slot || typeof slot !== 'object') return true;
  const text = `${deal.name || ''} ${deal.industry || ''} ${deal.location || ''} ${deal.state || ''}`.toLowerCase();
  const exclude = Array.isArray(slot.excludeKeywords) ? slot.excludeKeywords : [];
  for (const raw of exclude) {
    const k = String(raw || '').trim().toLowerCase();
    if (k && text.includes(k)) return false;
  }
  const search = typeof slot.feedSearch === 'string' ? slot.feedSearch.trim() : '';
  if (!search) return true;
  const terms = search
    .split(/\s*[,&]\s*/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8);
  return terms.every((t) => text.includes(t));
}
