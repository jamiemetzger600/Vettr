/**
 * Normalize raw extracted strings into market_deals column values.
 * Pure functions; unit-testable without a DB or sidecar.
 */

const US_STATES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan',
  MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming', DC: 'District of Columbia',
};
const STATE_BY_NAME = Object.fromEntries(Object.entries(US_STATES).map(([abbr, name]) => [name.toLowerCase(), abbr]));

const NOT_DISCLOSED = /^(n\/?a|not disclosed|undisclosed|confidential|call|contact|tbd|—|-|none|null|upon request|inquire|request)/i;

/**
 * "$1.2M" -> 1200000, "1,200,000" -> 1200000, "$450K" -> 450000, "Not Disclosed" -> null.
 * Ranges ("$1M - $2M") return the low end. Percent strings return null.
 */
export function parseMoney(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw).trim();
  if (!s || NOT_DISCLOSED.test(s)) return null;
  if (/%/.test(s)) return null;
  // Take first monetary token (handles "Asking Price $500,000 Cash Flow $120,000" collisions)
  const m = s.match(/(-?\$?\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|mm|b|thousand|million|billion)?)\b/i);
  if (!m) return null;
  let tok = m[1].replace(/[\s$,]/g, '').toLowerCase();
  let mult = 1;
  const suffix = tok.match(/(k|mm|m|b|thousand|million|billion)$/);
  if (suffix) {
    const sfx = suffix[1];
    mult = sfx === 'k' || sfx === 'thousand' ? 1e3 : sfx === 'b' || sfx === 'billion' ? 1e9 : 1e6;
    tok = tok.slice(0, -sfx.length);
  }
  const num = Number(tok);
  if (!Number.isFinite(num)) return null;
  const val = Math.round(num * mult);
  return val === 0 ? null : val;
}

export function parseInteger(raw) {
  if (raw == null) return null;
  const m = String(raw).match(/-?\d[\d,]*/);
  if (!m) return null;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** "Est. 1998" -> 1998; "25 years" -> currentYear - 25 */
export function parseYearEstablished(raw) {
  if (raw == null) return null;
  const s = String(raw);
  const year = s.match(/\b(19\d{2}|20\d{2})\b/);
  if (year) return Number(year[1]);
  const yrs = s.match(/(\d{1,3})\s*(?:\+\s*)?(?:years?|yrs?)/i);
  if (yrs) return new Date().getFullYear() - Number(yrs[1]);
  return null;
}

/**
 * "Austin, TX" | "Austin, Texas" | "Texas" | "Travis County, TX" | "Dallas / Fort Worth, TX"
 * -> { city, county, state (2-letter), country }
 */
export function parseLocation(raw) {
  const out = { city: null, county: null, state: null, country: null };
  if (!raw) return out;
  let s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s || NOT_DISCLOSED.test(s)) return out;
  s = s.replace(/,?\s*(USA|United States|US)\.?$/i, (m) => { out.country = 'USA'; return ''; }).trim();
  const parts = s.split(/\s*[,|]\s*/).filter(Boolean);
  const stateFrom = (tok) => {
    const t = tok.trim().replace(/\.$/, '');
    if (/^[A-Za-z]{2}$/.test(t) && US_STATES[t.toUpperCase()]) return t.toUpperCase();
    const abbr = STATE_BY_NAME[t.toLowerCase()];
    return abbr || null;
  };
  if (parts.length === 1) {
    const st = stateFrom(parts[0]);
    if (st) out.state = st; else out.city = parts[0];
  } else {
    const last = parts[parts.length - 1];
    const st = stateFrom(last) || stateFrom(last.split(' ')[0]);
    if (st) {
      out.state = st;
      const rest = parts.slice(0, -1);
      const countyIdx = rest.findIndex((p) => /county/i.test(p));
      if (countyIdx >= 0) { out.county = rest[countyIdx].replace(/\s*county\s*/i, '').trim() || null; rest.splice(countyIdx, 1); }
      out.city = rest.join(', ') || null;
    } else {
      out.city = parts.slice(0, -1).join(', ') || null;
      out.county = null;
    }
  }
  if (out.state && !out.country) out.country = 'USA';
  return out;
}

/** Split "Manufacturing, Industrial | Wholesale" into an array. */
export function parseIndustries(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  const arr = String(raw).split(/\s*[,|/;>»]\s*/).map((x) => x.trim()).filter((x) => x && x.length < 60);
  return arr.length ? Array.from(new Set(arr)) : null;
}

export function parseYesNo(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().toLowerCase();
  if (/^(yes|y|true|1)$/.test(s)) return 'Yes';
  if (/^(no|n|false|0)$/.test(s)) return 'No';
  return String(raw).trim().slice(0, 100);
}

export function cleanText(raw, max = 20000) {
  if (raw == null) return null;
  const s = String(raw).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** Field registry: how each recipe field maps onto market_deals columns. */
export const FIELD_REGISTRY = {
  business: [
    { key: 'name', label: 'Business name / title', type: 'text', required: true },
    { key: 'asking_price', label: 'Asking price', type: 'money' },
    { key: 'annual_profit', label: 'Cash flow / SDE / EBITDA', type: 'money' },
    { key: 'annual_revenue', label: 'Gross revenue', type: 'money' },
    { key: 'ebitda', label: 'EBITDA (if separate from cash flow)', type: 'money', virtual: true },
    { key: 'sde', label: 'SDE (if separate from cash flow)', type: 'money', virtual: true },
    { key: 'location', label: 'Location (city, state)', type: 'location', virtual: true },
    { key: 'city', label: 'City', type: 'text' },
    { key: 'state', label: 'State', type: 'state' },
    { key: 'industries', label: 'Industry / category', type: 'industries' },
    { key: 'description', label: 'Description', type: 'longtext' },
    { key: 'years_established', label: 'Year established', type: 'year' },
    { key: 'franchise', label: 'Franchise?', type: 'yesno' },
    { key: 'remote_relocatable', label: 'Relocatable?', type: 'yesno' },
    { key: 'broker_name', label: 'Broker name', type: 'text' },
    { key: 'broker_company', label: 'Broker company', type: 'text' },
    { key: 'broker_contact', label: 'Broker phone', type: 'text' },
    { key: 'broker_email', label: 'Broker email', type: 'text' },
    { key: 'source_id', label: 'Listing ID', type: 'text' },
    { key: 'listing_url', label: 'Listing URL (defaults to page URL)', type: 'text' },
  ],
};

function hashString(s) {
  // FNV-1a 32-bit x2 for a cheap stable hex hash without crypto import overhead
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 ^ c) * 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

/**
 * Turn sidecar field results ({field: {value,...}}) into a market_deals row.
 * @param {object} extracted  { [field]: { value } }
 * @param {string} pageUrl
 * @param {string} sourceKey
 */
export function normalizeListing(extracted, pageUrl, sourceKey) {
  const v = (k) => extracted?.[k]?.value ?? extracted?.[k] ?? null;
  const row = {
    source: sourceKey,
    source_id: null,
    name: cleanText(v('name'), 500),
    description: cleanText(v('description')),
    listing_url: cleanText(v('listing_url'), 2000) || pageUrl,
    industries: parseIndustries(v('industries')),
    asking_price: parseMoney(v('asking_price')),
    annual_revenue: parseMoney(v('annual_revenue')),
    annual_profit: parseMoney(v('annual_profit')) ?? parseMoney(v('sde')) ?? parseMoney(v('ebitda')),
    profit_multiple: null,
    revenue_multiple: null,
    city: cleanText(v('city'), 120),
    county: null,
    state: null,
    country: null,
    years_established: parseYearEstablished(v('years_established')),
    remote_relocatable: parseYesNo(v('remote_relocatable')),
    franchise: parseYesNo(v('franchise')),
    five_plus_years: null,
    broker_name: cleanText(v('broker_name'), 200),
    broker_company: cleanText(v('broker_company'), 200),
    broker_contact: cleanText(v('broker_contact'), 200),
    broker_email: cleanText(v('broker_email'), 200)?.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] || null,
  };

  const loc = parseLocation(v('location'));
  if (!row.city && loc.city) row.city = loc.city;
  row.county = loc.county;
  const stateRaw = v('state');
  if (stateRaw) {
    const l = parseLocation(stateRaw);
    row.state = l.state || cleanText(stateRaw, 40);
  } else row.state = loc.state;
  row.country = loc.country || (row.state ? 'USA' : null);

  if (row.asking_price && row.annual_profit) row.profit_multiple = Math.round((row.asking_price / row.annual_profit) * 100) / 100;
  if (row.asking_price && row.annual_revenue) row.revenue_multiple = Math.round((row.asking_price / row.annual_revenue) * 100) / 100;
  if (row.years_established) row.five_plus_years = new Date().getFullYear() - row.years_established >= 5 ? 'Yes' : 'No';

  const sid = cleanText(v('source_id'), 200);
  row.source_id = sid || sourceIdFromUrl(row.listing_url);

  row.content_hash = hashString([
    row.name, row.asking_price, row.annual_profit, row.annual_revenue, row.city, row.state, row.description?.slice(0, 500),
  ].map((x) => (x == null ? '' : String(x))).join('|'));
  return row;
}

/** Stable id from URL: last meaningful path segment(s) + query id if present. */
export function sourceIdFromUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const idParam = ['id', 'listingid', 'listing_id', 'lid', 'bid'].map((k) => u.searchParams.get(k)).find(Boolean);
    const segs = u.pathname.split('/').filter(Boolean);
    const tail = segs.slice(-2).join('/');
    const base = idParam ? `${tail}?id=${idParam}` : tail;
    return (u.hostname.replace(/^www\./, '') + '/' + base).slice(0, 250);
  } catch {
    return String(url).slice(0, 250);
  }
}
