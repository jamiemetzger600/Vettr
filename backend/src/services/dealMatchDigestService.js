import pool from '../db/pool.js';
import {
  classifyBuyBoxMatch,
  marketRowToMatchDeal,
  dealPassesSlotFeed
} from '../lib/buyBoxMatcher.js';
import { normalizeUserBuyBoxes, slotHasMatchCriteria, criteriaFromSlot } from '../lib/userBuyBoxes.js';

const NEW_DEALS_CAP = 2000;
const PER_BOX_CAP = 12;
const PER_BOX_NEAR_CAP = 8;

export function formatMoney(n) {
  if (n == null || !Number.isFinite(Number(n))) return '';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

/**
 * Load newly seen market listings since `sinceDate`. Caller should reuse one batch per job.
 */
export async function loadNewMarketDeals(sinceDate) {
  const since = sinceDate instanceof Date ? sinceDate : new Date(sinceDate);
  const result = await pool.query(
    `SELECT id, name, listing_url, asking_price, annual_revenue, annual_profit,
            city, state, industries, first_seen_at, remote_relocatable
     FROM market_deals
     WHERE is_active = true
       AND first_seen_at IS NOT NULL
       AND first_seen_at >= $1
     ORDER BY first_seen_at DESC
     LIMIT $2`,
    [since.toISOString(), NEW_DEALS_CAP]
  );
  console.log('[dealMatch] loaded new market deals', {
    since: since.toISOString(),
    count: result.rows.length
  });
  return result.rows.map(marketRowToMatchDeal);
}

function annotateDeal(deal, classification, alsoMatches) {
  return {
    ...deal,
    matchKind: classification.kind,
    matchReasons: classification.reasons || [],
    alsoMatches: alsoMatches || []
  };
}

function otherMatchingBoxNames(deal, boxes, skipIndex, activeGroups) {
  const names = [];
  for (const group of activeGroups) {
    if (group.index === skipIndex) continue;
    const slot = boxes[group.index];
    const criteria = criteriaFromSlot(slot);
    const classified = classifyBuyBoxMatch(deal, criteria);
    if (classified.kind !== 'exact') continue;
    if (!dealPassesSlotFeed(deal, slot)) continue;
    names.push(group.name);
    if (names.length >= 2) break;
  }
  return names;
}

function placeDeal(group, deal, kind) {
  if (deal?.id != null) group.dealIds.push(deal.id);
  if (kind === 'exact') {
    if (group.deals.length < PER_BOX_CAP) group.deals.push(deal);
    else group.overflow = (group.overflow || 0) + 1;
    return;
  }
  if (group.nearDeals.length < PER_BOX_NEAR_CAP) group.nearDeals.push(deal);
  else group.nearOverflow = (group.nearOverflow || 0) + 1;
}

/**
 * Match deals to buy-box slots in slot order. Exact matches first, then near
 * matches. Each deal appears once, under the first box it matches at that kind.
 */
export function groupDealsByBuyBox(deals, buyBoxes) {
  const boxes = Array.isArray(buyBoxes) ? buyBoxes : [];
  const groups = boxes.map((slot, index) => ({
    index,
    name: (slot?.name && String(slot.name).trim()) || `Buy box ${index + 1}`,
    hasCriteria: slotHasMatchCriteria(slot),
    deals: [],
    nearDeals: [],
    dealIds: []
  }));

  const activeGroups = groups.filter((g) => g.hasCriteria);
  if (!activeGroups.length || !deals?.length) {
    return { groups: groups.filter((g) => g.hasCriteria), total: 0 };
  }

  const used = new Set();

  const tryPlace = (deal, wantedKind) => {
    for (const group of activeGroups) {
      const slot = boxes[group.index];
      const criteria = criteriaFromSlot(slot);
      const classified = classifyBuyBoxMatch(deal, criteria);
      if (classified.kind !== wantedKind) continue;
      if (!dealPassesSlotFeed(deal, slot)) continue;
      const alsoMatches = wantedKind === 'exact'
        ? otherMatchingBoxNames(deal, boxes, group.index, activeGroups)
        : [];
      placeDeal(group, annotateDeal(deal, classified, alsoMatches), wantedKind);
      used.add(deal.id != null ? deal.id : deal);
      return true;
    }
    return false;
  };

  for (const deal of deals) tryPlace(deal, 'exact');
  for (const deal of deals) {
    if (used.has(deal.id != null ? deal.id : deal)) continue;
    tryPlace(deal, 'near');
  }

  const filled = groups.filter((g) => g.hasCriteria && (
    g.deals.length > 0 || g.overflow || g.nearDeals.length > 0 || g.nearOverflow
  ));
  const total = filled.reduce(
    (n, g) => n + g.deals.length + (g.overflow || 0) + g.nearDeals.length + (g.nearOverflow || 0),
    0
  );
  console.log('[dealMatch] grouped', {
    boxes: filled.map((g) => ({
      name: g.name,
      exact: g.deals.length + (g.overflow || 0),
      near: g.nearDeals.length + (g.nearOverflow || 0)
    })),
    total
  });
  return { groups: filled, total };
}

export function matchUserBuyBoxes(deals, settingsRow) {
  const normalized = normalizeUserBuyBoxes(
    settingsRow?.buy_box,
    settingsRow?.preferences || {},
    {}
  );
  return groupDealsByBuyBox(deals, normalized.buyBoxes);
}

export function summarizeMatchGroups(grouped) {
  if (!grouped?.total) return '';
  return grouped.groups
    .map((g) => {
      const exact = g.deals.length + (g.overflow || 0);
      const near = g.nearDeals.length + (g.nearOverflow || 0);
      if (near) return `${exact} in ${g.name} (${near} near)`;
      return `${exact} in ${g.name}`;
    })
    .join(' · ');
}
