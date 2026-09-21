import { normalizeGeoScalar } from './normalizeMarketDeal';

/** State for card metrics; else city, county, country; then combined location line. */
export function cardMetricLocation(deal) {
  const state = normalizeGeoScalar(deal?.state);
  if (state) return { label: 'State', value: state };
  const city = normalizeGeoScalar(deal?.city);
  if (city) return { label: 'City', value: city };
  const county = normalizeGeoScalar(deal?.county);
  if (county) return { label: 'County', value: county };
  const country = normalizeGeoScalar(deal?.country);
  if (country) return { label: 'Country', value: country };
  const locationLine = normalizeGeoScalar(deal?.location);
  if (locationLine) return { label: 'Location', value: locationLine };
  return null;
}

function normalizeCardDescription(description) {
  if (description == null) return '';
  return String(description).replace(/\s+/g, ' ').trim();
}

/** First `maxSentences` sentences for card preview. */
export function cardViewDescriptionPreview(description, maxSentences = 4) {
  const full = normalizeCardDescription(description);
  if (!full) return { preview: '', full: '', truncated: false };
  const sentences = full.split(/(?<=[.!?])\s+/).filter((s) => s.length > 0);
  if (sentences.length === 0) return { preview: full, full, truncated: false };
  if (sentences.length <= maxSentences) {
    return { preview: sentences.join(' '), full, truncated: false };
  }
  return {
    preview: `${sentences.slice(0, maxSentences).join(' ')} …`,
    full,
    truncated: true
  };
}

export function formatMoneyShort(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `$${m}M` : `$${m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return k % 1 === 0 ? `$${k}K` : `$${k.toFixed(1)}K`;
  }
  return `$${n.toLocaleString()}`;
}

export function formatRatio(value) {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  return Number.isNaN(numeric) ? '—' : numeric.toFixed(2);
}

export function parseDealDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    const d = new Date(s.length <= 10 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDealDate(value) {
  const date = parseDealDate(value);
  if (!date) return '—';
  return date.toLocaleDateString();
}

const MS_PER_DAY = 86_400_000;
const AGE_BUCKETS = [
  { max: 14, cls: 'deal-date-age--fresh', label: 'fresh' },
  { max: 28, cls: 'deal-date-age--recent', label: 'recent' },
  { max: 56, cls: 'deal-date-age--aging', label: 'aging' },
];

function getListingAgeDays(discoveredAt) {
  const d = parseDealDate(discoveredAt);
  if (!d) return null;
  return Math.floor((Date.now() - d.getTime()) / MS_PER_DAY);
}

export function getListingAgeClass(discoveredAt) {
  const days = getListingAgeDays(discoveredAt);
  if (days == null) return '';
  for (const b of AGE_BUCKETS) {
    if (days < b.max) return b.cls;
  }
  return 'deal-date-age--older';
}

export function listingAgeTitle(discoveredAt, { source } = {}) {
  const days = getListingAgeDays(discoveredAt);
  const dateStr = formatDealDate(discoveredAt);
  const src = source ? String(source).replace(/_/g, ' ') : '';
  let age = dateStr;
  if (days === 0) age = `${dateStr} — today`;
  else if (days === 1) age = `${dateStr} — 1 day ago`;
  else if (days != null) age = `${dateStr} — ${days} days ago`;
  return src ? `${src} · ${age}` : age;
}

/** Listing-age header colors — matches `.deal-age-legend` dots. */
export const AGE_HEADER_COLORS = {
  fresh: { hex: '#4ade80', ink: '#111', id: 'age-fresh', label: '0–2w' },
  recent: { hex: '#facc15', ink: '#111', id: 'age-recent', label: '2–4w' },
  aging: { hex: '#ef4444', ink: '#fff', id: 'age-aging', label: '4–8w' },
  older: { hex: '#6b7280', ink: '#fff', id: 'age-older', label: '8w+' },
  unknown: { hex: '#6b7280', ink: '#fff', id: 'age-unknown', label: 'Unknown' },
};

export function dealAgeHeaderColor(dateValue) {
  const days = getListingAgeDays(dateValue);
  if (days == null) return AGE_HEADER_COLORS.unknown;
  if (days < 14) return AGE_HEADER_COLORS.fresh;
  if (days < 28) return AGE_HEADER_COLORS.recent;
  if (days < 56) return AGE_HEADER_COLORS.aging;
  return AGE_HEADER_COLORS.older;
}

export function aggregatorDeedColor(deal) {
  return dealAgeHeaderColor(deal?.discoveredAt);
}

/** Listing date — same clock as aggregator Card headers. */
export function crmDealAgeDate(deal) {
  return deal?.discoveredAt || deal?.savedAt || deal?.updatedAt || null;
}

export function aggregatorCardStatus(deal) {
  const industry = String(deal?.industry || '').trim();
  if (industry) return industry;
  const source = String(deal?.source || deal?.sourceType || '').trim();
  if (source) return source.replace(/_/g, ' ');
  return 'Listing';
}

/** Lower cash-flow multiple is stronger for a buyer. */
export function profitMultipleTier(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'neutral';
  if (n <= 2.5) return 'excellent';
  if (n <= 3.5) return 'good';
  if (n <= 5) return 'fair';
  return 'bad';
}
