/**
 * Maps a row from /api/market-deals (snake_case) into the camelCase deal shape
 * used by DealAggregator. Works for any source in the market_deals table.
 */

import { buildAuthHeaders } from './api.js';

function computeMultiple(price, base) {
  if (!price || !base) return null;
  return Number((price / base).toFixed(2));
}

/** Trim geo fields; join multi-select-style arrays so UI/search stay consistent. */
export function normalizeGeoScalar(raw) {
  if (raw == null || raw === '') return '';
  if (Array.isArray(raw)) {
    const parts = raw.map((x) => (x != null ? String(x).trim() : '')).filter(Boolean);
    return parts.join(', ');
  }
  const s = String(raw).trim();
  return s || '';
}

export function normalizeMarketDeal(row) {
  const city = normalizeGeoScalar(row.city);
  const state = normalizeGeoScalar(row.state);
  const county = normalizeGeoScalar(row.county);
  const country = normalizeGeoScalar(row.country);
  const location =
    city && state ? `${city}, ${state}` : (city || state || county || country || '');
  const brokerName = row.broker_name || '';
  const brokerCompany = row.broker_company || '';
  const broker = brokerName && brokerCompany
    ? `${brokerName} (${brokerCompany})`
    : (brokerName || brokerCompany);

  const ebitda = row.annual_profit != null ? Number(row.annual_profit) : null;
  const revenue = row.annual_revenue != null ? Number(row.annual_revenue) : null;
  const askingPrice = row.asking_price != null ? Number(row.asking_price) : null;

  const industries = Array.isArray(row.industries)
    ? row.industries.join(', ')
    : (row.industries || '');

  return {
    id: `${row.source}_${row.source_id || row.id}`,
    dbId: row.id,
    name: row.name || 'Unnamed Business',
    url: row.listing_url || '',
    industry: industries,
    description: row.description || '',
    descriptionTruncated: Boolean(row.description_truncated),
    location,
    city,
    state,
    county,
    country,
    yearsEstablished: row.years_established != null ? String(row.years_established) : '',
    ebitda,
    revenue,
    askingPrice,
    profitMultiple: row.profit_multiple != null ? Number(row.profit_multiple) : computeMultiple(askingPrice, ebitda),
    revenueMultiple: row.revenue_multiple != null ? Number(row.revenue_multiple) : computeMultiple(askingPrice, revenue),
    remote: row.remote_relocatable || '',
    franchise: row.franchise || '',
    fiveYearsInBusiness: row.five_plus_years || '',
    broker,
    brokerName,
    brokerCompany,
    brokerPhone: row.broker_contact || '',
    brokerEmail: row.broker_email || '',
    source: row.source || 'unknown',
    sourceType: row.source || 'unknown',
    discoveredAt: row.source_added_at ? new Date(row.source_added_at).getTime() : Date.now(),
  };
}

// In dev, always use the same-origin Vite proxy at `/api` so LAN clients don't try to call their own localhost.
const API_BASE_URL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '/api');

/** Map frontend sort field names to backend column names */
const SORT_FIELD_MAP = {
  date: 'source_added_at',
  price: 'asking_price',
  ebitda: 'annual_profit',
  revenue: 'annual_revenue',
  name: 'name',
  state: 'state',
  industry: 'name',
  profitMultiple: 'profit_multiple',
  revenueMultiple: 'revenue_multiple',
  yearsEstablished: 'years_established',
  source_added_at: 'source_added_at',
  source_updated_at: 'source_updated_at',
};

export function mapSortField(frontendField) {
  return SORT_FIELD_MAP[frontendField] || 'source_added_at';
}

/**
 * Encode full table sort stack for `sort_spec` (comma-separated col:dir).
 * Dedupes DB columns so two UI fields mapping to the same column only sort once.
 */
export function encodeMarketDealsSortSpec(sortConfig) {
  if (!Array.isArray(sortConfig) || sortConfig.length === 0) return '';
  const used = new Set();
  const parts = [];
  for (const s of sortConfig.slice(0, 6)) {
    if (!s?.field) continue;
    const col = mapSortField(s.field);
    if (used.has(col)) continue;
    used.add(col);
    const dir = s.direction === 'asc' ? 'asc' : 'desc';
    parts.push(`${col}:${dir}`);
  }
  return parts.join(',');
}

/**
 * Build query string from buy box, search, sort, pagination, and exclusions.
 * Flexibility % is pre-applied to the numeric ranges before sending.
 */
export function buildMarketDealsParams({
  page = 1,
  perPage = 50,
  search,
  buyBox,
  flexibilityPct = 0,
  sort,
  order,
  /** Full multi-sort for API (`col:dir,col:dir`). Preferred over sort alone when set. */
  sortSpec,
  hiddenDealDbIds,
  excludeKeywords,
  showHidden = false,
  /** Limit to market_deals.source values, e.g. ['airtable_bizbuysell'] */
  sources = null,
  /** When set, API filters to these market_deals.id values (use with buyBox: null for full list). */
  restrictToDbIds = null,
  firstSeenAfter = null,
  firstSeenBefore = null,
  /** Listings added or updated since this ISO timestamp (matches backend updated_after). */
  updatedAfter = null,
} = {}) {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('per_page', String(perPage));

  if (sources && sources.length > 0) {
    params.set('source', sources.join(','));
  }

  if (search && search.trim()) {
    params.set('search', search.trim());
  }

  if (buyBox && !showHidden) {
    const flex = Math.max(0, Math.min(100, flexibilityPct)) / 100;
    const applyMin = (val) => val != null && val !== '' ? Math.round(Number(val) * (1 - flex)) : undefined;
    const applyMax = (val) => val != null && val !== '' ? Math.round(Number(val) * (1 + flex)) : undefined;

    const minPrice = applyMin(buyBox.minPrice);
    const maxPrice = applyMax(buyBox.maxPrice);
    if (minPrice != null) params.set('min_price', String(minPrice));
    if (maxPrice != null) params.set('max_price', String(maxPrice));

    const minProfit = applyMin(buyBox.minEbitda);
    const maxProfit = applyMax(buyBox.maxEbitda);
    if (minProfit != null) params.set('min_profit', String(minProfit));
    if (maxProfit != null) params.set('max_profit', String(maxProfit));

    const minRevenue = applyMin(buyBox.minRevenue);
    const maxRevenue = applyMax(buyBox.maxRevenue);
    if (minRevenue != null) params.set('min_revenue', String(minRevenue));
    if (maxRevenue != null) params.set('max_revenue', String(maxRevenue));

    if (buyBox.targetStates && buyBox.targetStates.length > 0) {
      params.set('state', buyBox.targetStates.join(','));
    }

    if (buyBox.targetIndustries && buyBox.targetIndustries.length > 0) {
      params.set('industry', buyBox.targetIndustries.join(','));
    }
  }

  if (sortSpec) params.set('sort_spec', sortSpec);
  if (sort) params.set('sort', sort);
  if (order) params.set('order', order);

  if (!showHidden && hiddenDealDbIds && hiddenDealDbIds.length > 0) {
    params.set('exclude_ids', hiddenDealDbIds.join(','));
  }
  if (showHidden) {
    params.set('show_hidden', '1');
  }

  if (excludeKeywords && excludeKeywords.length > 0) {
    const cleaned = excludeKeywords
      .map((k) => String(k).trim())
      .filter(Boolean);
    if (cleaned.length > 0) {
      params.set('exclude_keywords', JSON.stringify(cleaned));
    }
  }

  if (restrictToDbIds && restrictToDbIds.length > 0) {
    const flat = restrictToDbIds
      .map((n) => Number(n))
      .filter((n) => Number.isFinite(n) && n > 0)
      .slice(0, 400);
    if (flat.length > 0) {
      params.set('ids', flat.join(','));
    }
  }

  if (firstSeenAfter) {
    const t = new Date(firstSeenAfter);
    if (!Number.isNaN(t.getTime())) params.set('first_seen_after', t.toISOString());
  }
  if (firstSeenBefore) {
    const t = new Date(firstSeenBefore);
    if (!Number.isNaN(t.getTime())) params.set('first_seen_before', t.toISOString());
  }

  if (updatedAfter) {
    const t = new Date(updatedAfter);
    if (!Number.isNaN(t.getTime())) params.set('updated_after', t.toISOString());
  }

  return params;
}

/**
 * Fetch one page of market deals from the backend.
 * @param {URLSearchParams} queryParams
 * @param {AbortSignal} [signal]
 * @param {{ ifNoneMatch?: string }} [options] — send prior ETag to receive 304 when unchanged
 */
export async function fetchMarketDeals(queryParams, signal, options = {}) {
  const url = `${API_BASE_URL}/market-deals?${queryParams.toString()}`;
  const headers = {};
  if (options.ifNoneMatch) {
    headers['If-None-Match'] = options.ifNoneMatch;
  }
  const res = await fetch(url, { signal, credentials: 'include', headers: buildAuthHeaders(headers) });
  if (res.status === 304) {
    return {
      notModified: true,
      etag: res.headers.get('ETag') || options.ifNoneMatch || null,
    };
  }
  if (!res.ok) {
    const err = new Error(`Market deals API error (${res.status})`);
    err.url = url;
    throw err;
  }
  const data = await res.json();
  return {
    deals: (data.deals || []).map(normalizeMarketDeal),
    pagination: data.pagination || { page: 1, per_page: 50, total: 0, total_pages: 0 },
    maxUpdatedAt: data.max_updated_at || null,
    etag: res.headers.get('ETag'),
  };
}

/**
 * Full market_deals row by primary key (for detail panel after list uses truncated description).
 */
export async function fetchMarketDealByDbId(dbId, signal) {
  const id = Number(dbId);
  if (!Number.isFinite(id) || id < 1) {
    throw new Error('Invalid deal id');
  }
  const url = `${API_BASE_URL}/market-deals/${id}`;
  const res = await fetch(url, { signal, credentials: 'include', headers: buildAuthHeaders() });
  if (!res.ok) {
    const err = new Error(`Market deal API error (${res.status})`);
    err.url = url;
    throw err;
  }
  const row = await res.json();
  return normalizeMarketDeal(row);
}

/**
 * Fetch market deal stats for dashboard header.
 */
export async function fetchMarketDealsStats(signal) {
  const url = `${API_BASE_URL}/market-deals/stats`;
  const res = await fetch(url, { signal, credentials: 'include', headers: buildAuthHeaders() });
  if (!res.ok) return null;
  return res.json();
}

/**
 * Deal source rows including last_scrape_at / last_scrape_result (for new-pool notifications).
 */
export async function fetchMarketDealsSources(signal) {
  const url = `${API_BASE_URL}/market-deals/sources`;
  const res = await fetch(url, { signal, credentials: 'include' });
  if (!res.ok) return null;
  return res.json();
}
