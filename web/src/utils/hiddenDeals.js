/**
 * Hidden-listing tokens stored in user_settings.hidden_deal_ids.
 * md:<pk> — market_deals.id
 * fp:<price>|<profit>|<revenue>|<city>|<state> — same key as listingFingerprintSql
 * url:<listing url> — listing_url without hash, lowercased
 */

export function marketDealHiddenToken(dbId) {
  const n = Number(dbId);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `md:${n}`;
}

export function hiddenDealIdToDbId(hiddenId) {
  if (hiddenId == null || hiddenId === '') return null;
  if (typeof hiddenId === 'number' && Number.isFinite(hiddenId) && hiddenId > 0) {
    return Math.trunc(hiddenId);
  }
  const s = String(hiddenId).trim();
  if (s.startsWith('md:')) {
    const n = Number(s.slice(3));
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  return null;
}

export function listingHiddenFingerprint(deal) {
  const price = Math.round(Number(deal?.askingPrice ?? deal?.asking_price));
  const profit = Math.round(Number(deal?.ebitda ?? deal?.annual_profit));
  const revenue = Math.round(Number(deal?.revenue ?? deal?.annual_revenue));
  const city = String(deal?.city || '').trim().toLowerCase();
  const state = String(deal?.state || '').trim().toLowerCase();
  if (!(price > 0 && profit > 0 && revenue > 0 && (city || state))) return null;
  return `fp:${price}|${profit}|${revenue}|${city}|${state}`;
}

export function listingHiddenFinanceStateToken(deal) {
  const price = Math.round(Number(deal?.askingPrice ?? deal?.asking_price));
  const profit = Math.round(Number(deal?.ebitda ?? deal?.annual_profit));
  const revenue = Math.round(Number(deal?.revenue ?? deal?.annual_revenue));
  const state = String(deal?.state || '').trim().toLowerCase();
  if (!(price > 0 && profit > 0 && revenue > 0 && state)) return null;
  return `fs:${price}|${profit}|${revenue}|${state}`;
}

export function listingHiddenUrlToken(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  const cleaned = raw.split('#')[0].trim().toLowerCase();
  if (!cleaned) return null;
  return `url:${cleaned}`;
}

export function hiddenStorageTokenForDeal(deal) {
  return marketDealHiddenToken(deal?.dbId ?? deal?.id) || (deal?.id != null ? String(deal.id) : null);
}

export function hiddenStorageTokensForDeal(deal) {
  const tokens = new Set();
  if (deal?.id != null && deal.id !== '') tokens.add(String(deal.id));
  const md = marketDealHiddenToken(deal?.dbId ?? deal?.id);
  if (md) tokens.add(md);
  const fp = listingHiddenFingerprint(deal);
  if (fp) tokens.add(fp);
  const fs = listingHiddenFinanceStateToken(deal);
  if (fs) tokens.add(fs);
  const url = listingHiddenUrlToken(deal?.url || deal?.listing_url);
  if (url) tokens.add(url);
  return tokens;
}

function tokenSet(hiddenDealIds) {
  const set = new Set();
  for (const id of hiddenDealIds || []) {
    if (id == null || id === '') continue;
    set.add(String(id));
  }
  return set;
}

export function isDealHidden(deal, hiddenDealIds) {
  const hidden = tokenSet(hiddenDealIds);
  if (hidden.size === 0 || !deal) return false;
  if (deal.id != null && hidden.has(String(deal.id))) return true;
  const dbId = deal.dbId ?? deal.id;
  const md = marketDealHiddenToken(dbId);
  if (md && hidden.has(md)) return true;
  if (dbId != null && hidden.has(String(dbId))) return true;
  const fp = listingHiddenFingerprint(deal);
  if (fp && hidden.has(fp)) return true;
  const fs = listingHiddenFinanceStateToken(deal);
  if (fs && hidden.has(fs)) return true;
  const url = listingHiddenUrlToken(deal.url || deal.listing_url);
  if (url && hidden.has(url)) return true;
  return false;
}

export function parseHiddenExclude(hiddenDealIds) {
  const dbIds = [];
  const fingerprints = [];
  const financeStates = [];
  const urls = [];
  const seenDb = new Set();
  const seenFp = new Set();
  const seenFs = new Set();
  const seenUrl = new Set();
  for (const raw of hiddenDealIds || []) {
    const s = String(raw || '').trim();
    if (!s) continue;
    if (s.startsWith('fp:')) {
      const fp = s.slice(3);
      if (fp && !seenFp.has(fp)) {
        seenFp.add(fp);
        fingerprints.push(fp);
      }
      continue;
    }
    if (s.startsWith('fs:')) {
      const fs = s.slice(3);
      if (fs && !seenFs.has(fs)) {
        seenFs.add(fs);
        financeStates.push(fs);
      }
      continue;
    }
    if (s.startsWith('url:')) {
      const url = s.slice(4);
      if (url && !seenUrl.has(url)) {
        seenUrl.add(url);
        urls.push(url);
      }
      continue;
    }
    const dbId = hiddenDealIdToDbId(s);
    if (dbId && !seenDb.has(dbId)) {
      seenDb.add(dbId);
      dbIds.push(dbId);
    }
  }
  return { dbIds, fingerprints, financeStates, urls };
}

export function hiddenListingCount(hiddenDealIds) {
  const pks = new Set();
  const other = new Set();
  for (const raw of hiddenDealIds || []) {
    const dbId = hiddenDealIdToDbId(raw);
    if (dbId) {
      pks.add(dbId);
      continue;
    }
    const s = String(raw || '').trim();
    if (!s || s.startsWith('fp:') || s.startsWith('fs:') || s.startsWith('url:')) continue;
    other.add(s);
  }
  return pks.size + other.size;
}

export function excludeHiddenMarketDeals(deals, hiddenDealIds) {
  if (!Array.isArray(deals) || deals.length === 0) return deals || [];
  if (!hiddenDealIds || hiddenDealIds.length === 0) return deals;
  return deals.filter((deal) => !isDealHidden(deal, hiddenDealIds));
}
