import pool from '../db/pool.js';
import { register } from './scraperRegistry.js';
import { pruneStaleMarketDeals } from './marketDealsPrune.js';
import { dedupeMarketDeals } from './marketDealsDedupe.js';

// ---------------------------------------------------------------------------
// Config — all tuneable via env vars
// ---------------------------------------------------------------------------
const AIRTABLE_SHARE_URL =
  process.env.AIRTABLE_SHARE_URL ||
  'https://airtable.com/appEGxhjno0HTpEco/shrUhtbnzZTPaR4Lk/tblACIQ9QNiVmoWSK';

// Cron: default 04:00 daily in AIRTABLE_SCRAPE_CRON_TZ (IANA, e.g. America/Los_Angeles)
const SCRAPE_CRON_TZ =
  process.env.AIRTABLE_SCRAPE_CRON_TZ || 'America/Los_Angeles';

const SCRAPE_CRON =
  process.env.AIRTABLE_SCRAPE_CRON || '0 4 * * *';

// Toggle the scraper on/off without removing code
const SCRAPE_ENABLED =
  (process.env.AIRTABLE_SCRAPE_ENABLED || 'true') === 'true';

/** After deploy, run one scrape unless disabled (saves one full Airtable pull on cold starts). */
const SCRAPE_ON_STARTUP =
  (process.env.AIRTABLE_SCRAPE_ON_STARTUP || 'true') === 'true';

// ---------------------------------------------------------------------------
// Airtable column name → DB column + type handler
// ---------------------------------------------------------------------------
const COLUMN_MAP = {
  'ID':                                { db: 'airtable_id',        type: 'number' },
  'Name':                              { db: 'name',               type: 'text' },
  'Description':                       { db: 'description',        type: 'text' },
  'Industry':                          { db: 'industries',         type: 'multiSelect' },
  'Asking Price':                      { db: 'asking_price',       type: 'number' },
  'Annual Revenue':                    { db: 'annual_revenue',     type: 'number' },
  'Annual Profit':                     { db: 'annual_profit',      type: 'number' },
  'Profit Multiple':                   { db: 'profit_multiple',    type: 'number' },
  'Revenue Multiple':                  { db: 'revenue_multiple',   type: 'number' },
  'Years Established':                 { db: 'years_established',  type: 'number' },
  'City':                              { db: 'city',               type: 'text' },
  'County':                            { db: 'county',             type: 'text' },
  'State':                             { db: 'state',              type: 'text' },
  'Country':                           { db: 'country',            type: 'text' },
  'Remote/Relocatable/Absentee-Run':   { db: 'remote_relocatable', type: 'select' },
  'Franchise':                         { db: 'franchise',          type: 'select' },
  '5+ Years In Business':              { db: 'five_plus_years',    type: 'select' },
  'Broker Name':                       { db: 'broker_name',        type: 'text' },
  'Broker Company':                    { db: 'broker_company',     type: 'text' },
  'Broker Contact':                    { db: 'broker_contact',     type: 'text' },
  'Broker Email':                      { db: 'broker_email',       type: 'text' },
  'Listing':                           { db: 'listing_url',        type: 'button' },
  'Last Updated':                      { db: 'airtable_updated_at', type: 'date' },
  'Date Added':                        { db: 'airtable_added_at',   type: 'date' },
};

// ---------------------------------------------------------------------------
// Step 1: Fetch the shared-view HTML page & collect cookies
// ---------------------------------------------------------------------------
async function fetchSharedViewPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
    redirect: 'follow',
  });

  if (!res.ok) throw new Error(`HTML fetch failed: ${res.status}`);

  // Collect Set-Cookie headers
  const cookies = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(';')[0])
    .join('; ');

  const html = await res.text();
  return { html, cookies };
}

// ---------------------------------------------------------------------------
// Step 2: Extract API parameters embedded in the page JS
// ---------------------------------------------------------------------------
function extractApiParams(html) {
  // urlWithParams — try multiple patterns
  const urlPatterns = [
    /urlWithParams\s*:\s*["']([^"']*readSharedViewData[^"']*)["']/,
    /"urlWithParams"\s*:\s*"([^"]*readSharedViewData[^"]*)"/,
    /urlWithParams["'\s]*:["'\s]*["']([^"']+)["']/,
  ];

  let urlWithParams = null;
  for (const pat of urlPatterns) {
    const m = html.match(pat);
    if (m) {
      // Decode unicode escapes like \u002F → /
      urlWithParams = m[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      );
      break;
    }
  }
  if (!urlWithParams) throw new Error('Could not find urlWithParams in HTML');

  // Application ID
  const appMatch = html.match(
    /x-airtable-application-id["']?\s*:\s*["']?(app[a-zA-Z0-9]+)["']?/
  );
  const appId = appMatch ? appMatch[1] : AIRTABLE_SHARE_URL.match(/app[a-zA-Z0-9]+/)?.[0];

  // Page-load ID
  const pglMatch = html.match(
    /x-airtable-page-load-id["']?\s*:\s*["']?(pgl[a-zA-Z0-9]+)["']?/
  );
  const pageLoadId = pglMatch ? pglMatch[1] : null;

  return { urlWithParams, appId, pageLoadId };
}

// ---------------------------------------------------------------------------
// Step 3: Call the readSharedViewData internal API
// ---------------------------------------------------------------------------
async function fetchSharedViewData({ urlWithParams, appId, pageLoadId, cookies }) {
  const fullUrl = `https://airtable.com${urlWithParams}`;

  const headers = {
    Cookie: cookies,
    'X-Requested-With': 'XMLHttpRequest',
    'x-airtable-inter-service-client': 'webClient',
    'x-user-locale': 'en',
    'x-time-zone': 'America/New_York',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json',
    Referer: AIRTABLE_SHARE_URL,
  };
  if (appId) headers['x-airtable-application-id'] = appId;
  if (pageLoadId) headers['x-airtable-page-load-id'] = pageLoadId;

  const res = await fetch(fullUrl, { headers });
  if (!res.ok) throw new Error(`API call failed: ${res.status}`);

  return res.json();
}

// ---------------------------------------------------------------------------
// Step 4: Build column map & resolve cell values
// ---------------------------------------------------------------------------
function buildColumnLookup(columns) {
  const lookup = {}; // colId → { name, type, choices, dbField, handleType }
  for (const col of columns) {
    const name = col.name;
    const mapping = COLUMN_MAP[name];
    if (!mapping) continue;

    const choices = {};
    const opts = col.typeOptions || {};
    if (opts.choices) {
      for (const [key, val] of Object.entries(opts.choices)) {
        choices[key] = val.name || key;
      }
    }

    lookup[col.id] = {
      name,
      airtableType: col.type,
      choices,
      dbField: mapping.db,
      handleType: mapping.type,
    };
  }
  return lookup;
}

function resolveCell(value, handleType, choices) {
  if (value == null) return null;

  switch (handleType) {
    case 'number':
    case 'text':
    case 'date':
      return value;
    case 'select':
      return choices[value] ?? value;
    case 'multiSelect':
      if (Array.isArray(value)) return value.map((v) => choices[v] ?? v);
      return value;
    case 'button':
      if (typeof value === 'object' && value !== null) return value.url || value.label || null;
      return value;
    default:
      return value;
  }
}

function parseRows(rows, colLookup) {
  return rows.map((row) => {
    const record = {};
    const cells = row.cellValuesByColumnId || {};
    for (const [colId, value] of Object.entries(cells)) {
      const col = colLookup[colId];
      if (!col) continue;
      record[col.dbField] = resolveCell(value, col.handleType, col.choices);
    }
    // Stable per-row id from Airtable (e.g. recXXXXXXXX); avoids duplicate source_ids
    // when the visible "ID" column is missing, reused, or not unique.
    const rid = row.id || row.recordId;
    if (rid) record.airtable_record_id = rid;
    return record;
  });
}

const SOURCE_KEY = 'airtable_bizbuysell';
const UPSERT_BATCH = 250;

/** Refuse to drop active rows when the shared view payload looks truncated. */
const MIN_SNAPSHOT_ROWS = 1000;

function listingTime(value) {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function dealIdentityKeys(deal) {
  const keys = [];
  for (const raw of [deal.airtable_record_id, deal.airtable_id]) {
    if (raw == null) continue;
    const key = String(raw).trim();
    if (key) keys.push(key);
  }
  return keys;
}

function indexExistingRows(existingRows) {
  const byId = new Map();
  const byUrl = new Map();
  for (const row of existingRows || []) {
    if (row?.source_id != null) byId.set(String(row.source_id), row);
    const urlKey = normalizeListingUrlKey(row?.listing_url);
    if (urlKey && !byUrl.has(urlKey)) byUrl.set(urlKey, row);
  }
  return { byId, byUrl };
}

function findExistingDeal(deal, index) {
  for (const id of dealIdentityKeys(deal)) {
    if (index.byId.has(id)) return index.byId.get(id);
  }
  const urlKey = normalizeListingUrlKey(deal.listing_url);
  if (urlKey && index.byUrl.has(urlKey)) return index.byUrl.get(urlKey);
  return null;
}

/** Rows still missing from the database go first, then newest Date Added. */
export function sortDealsForSync(deals, existingRows) {
  const index = indexExistingRows(existingRows);
  function rank(deal) {
    const existing = findExistingDeal(deal, index);
    return {
      isNew: !existing || existing.is_active === false,
      added: listingTime(deal.airtable_added_at) ?? 0,
      updated: listingTime(deal.airtable_updated_at) ?? 0,
    };
  }
  return [...deals].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra.isNew !== rb.isNew) return ra.isNew ? -1 : 1;
    if (ra.added !== rb.added) return rb.added - ra.added;
    return rb.updated - ra.updated;
  });
}

/**
 * A short Airtable payload must not be treated as the full list.
 * Half-size versus the last good fetch is treated as a truncated response.
 */
export function assessSnapshot(rowCount, previousRowCount) {
  if (!Number.isFinite(rowCount) || rowCount < MIN_SNAPSHOT_ROWS) {
    return { ok: false, reason: 'snapshot_too_small' };
  }
  if (
    Number.isFinite(previousRowCount) &&
    previousRowCount >= MIN_SNAPSHOT_ROWS &&
    rowCount < previousRowCount * 0.5
  ) {
    return { ok: false, reason: 'snapshot_shrunk' };
  }
  return { ok: true };
}

export function readSnapshotRowCount(raw) {
  if (raw == null) return null;
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const n = Number(parsed?.rows);
  return Number.isFinite(n) ? n : null;
}

/**
 * Keep rows the database does not already have, plus rows whose Airtable
 * dates moved or that were deactivated. Match each listing on its own.
 * A global max(date) cutoff drops listings that are new to us but older
 * than the newest row already stored.
 */
export function selectDealsToUpsert(deals, existingRows) {
  const index = indexExistingRows(existingRows);

  const selected = [];
  let skipped = 0;
  for (const deal of deals) {
    const existing = findExistingDeal(deal, index);

    if (!existing || existing.is_active === false) {
      selected.push(deal);
      continue;
    }

    const added = listingTime(deal.airtable_added_at);
    const updated = listingTime(deal.airtable_updated_at);
    const prevAdded = listingTime(existing.source_added_at);
    const prevUpdated = listingTime(existing.source_updated_at);
    const addedMoved = added != null && (prevAdded == null || added > prevAdded);
    const updatedMoved = updated != null && (prevUpdated == null || updated > prevUpdated);
    if (addedMoved || updatedMoved) selected.push(deal);
    else skipped += 1;
  }

  return { selected, skipped };
}

/** Collapse same-listing rows after switching source_id scheme (e.g. numeric → rec…). */
async function dedupeAirtableRowsByListingUrl(client) {
  await dedupeMarketDeals(client, { source: SOURCE_KEY });
}

function normalizeListingUrlKey(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return trimmed.split('#')[0].trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Database upsert — bulk insert/update into market_deals via (source, source_id)
// ---------------------------------------------------------------------------
async function upsertDeals(deals) {
  if (deals.length === 0) return { inserted: 0, updated: 0 };

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let financialChanges = 0;
  /** DB ids for rows inserted this run (for in-app "new pool" navigation; capped). */
  const newRowIds = [];
  let inTx = false;
  let sinceCommit = 0;

  try {
    await client.query('BEGIN');
    inTx = true;
    const prior = await client.query(
      `SELECT source_id, asking_price, annual_profit FROM market_deals WHERE source = $1`,
      [SOURCE_KEY]
    );
    const priorById = new Map(
      prior.rows.map((r) => [String(r.source_id), { price: r.asking_price, ebitda: r.annual_profit }])
    );

    for (const deal of deals) {
      const rawKey = deal.airtable_record_id ?? deal.airtable_id;
      if (rawKey == null || String(rawKey).trim() === '') continue;
      const sourceId = String(rawKey).trim();
      const prevFin = priorById.get(sourceId);
      if (prevFin) {
        const nextPrice = deal.asking_price ?? null;
        const nextEbitda = deal.annual_profit ?? null;
        const priceChanged = String(prevFin.price ?? '') !== String(nextPrice ?? '');
        const ebitdaChanged = String(prevFin.ebitda ?? '') !== String(nextEbitda ?? '');
        if (priceChanged || ebitdaChanged) {
          financialChanges += 1;
          console.log('[scrape] financial change', { sourceId, priceChanged, ebitdaChanged });
        }
      }
      const urlKey = normalizeListingUrlKey(deal.listing_url);
      const params = [
        SOURCE_KEY,
        sourceId,
        deal.name || null,
        deal.description || null,
        deal.industries || null,
        deal.listing_url || null,
        deal.asking_price ?? null,
        deal.annual_revenue ?? null,
        deal.annual_profit ?? null,
        deal.profit_multiple ?? null,
        deal.revenue_multiple ?? null,
        deal.city || null,
        deal.county || null,
        deal.state || null,
        deal.country || null,
        deal.years_established ?? null,
        deal.remote_relocatable || null,
        deal.franchise || null,
        deal.five_plus_years || null,
        deal.broker_name || null,
        deal.broker_company || null,
        deal.broker_contact || null,
        deal.broker_email || null,
        deal.airtable_updated_at || null,
        deal.airtable_added_at || null,
      ];

      let result;
      if (urlKey) {
        result = await client.query(
          `UPDATE market_deals SET
            source_id = $2,
            name = $3,
            description = $4,
            industries = $5,
            listing_url = $6,
            asking_price = $7,
            annual_revenue = $8,
            annual_profit = $9,
            profit_multiple = $10,
            revenue_multiple = $11,
            city = $12,
            county = $13,
            state = $14,
            country = $15,
            years_established = $16,
            remote_relocatable = $17,
            franchise = $18,
            five_plus_years = $19,
            broker_name = $20,
            broker_company = $21,
            broker_contact = $22,
            broker_email = $23,
            source_updated_at = $24,
            source_added_at = $25,
            last_scraped_at = NOW(),
            is_active = true
           WHERE source = $1
             AND listing_url IS NOT NULL
             AND lower(trim(split_part(listing_url, '#', 1))) = $26
           RETURNING id, false AS is_insert`,
          [...params, urlKey]
        );
      }

      if (!result?.rows?.length) {
        result = await client.query(
        `INSERT INTO market_deals (
          source, source_id, name, description, industries, listing_url,
          asking_price, annual_revenue, annual_profit, profit_multiple, revenue_multiple,
          city, county, state, country,
          years_established, remote_relocatable, franchise, five_plus_years,
          broker_name, broker_company, broker_contact, broker_email,
          source_updated_at, source_added_at,
          last_scraped_at, is_active
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10, $11,
          $12, $13, $14, $15,
          $16, $17, $18, $19,
          $20, $21, $22, $23,
          $24, $25,
          NOW(), true
        )
        ON CONFLICT (source, source_id) DO UPDATE SET
          name              = EXCLUDED.name,
          description       = EXCLUDED.description,
          industries        = EXCLUDED.industries,
          listing_url       = EXCLUDED.listing_url,
          asking_price      = EXCLUDED.asking_price,
          annual_revenue    = EXCLUDED.annual_revenue,
          annual_profit     = EXCLUDED.annual_profit,
          profit_multiple   = EXCLUDED.profit_multiple,
          revenue_multiple  = EXCLUDED.revenue_multiple,
          city              = EXCLUDED.city,
          county            = EXCLUDED.county,
          state             = EXCLUDED.state,
          country           = EXCLUDED.country,
          years_established = EXCLUDED.years_established,
          remote_relocatable = EXCLUDED.remote_relocatable,
          franchise         = EXCLUDED.franchise,
          five_plus_years   = EXCLUDED.five_plus_years,
          broker_name       = EXCLUDED.broker_name,
          broker_company    = EXCLUDED.broker_company,
          broker_contact    = EXCLUDED.broker_contact,
          broker_email      = EXCLUDED.broker_email,
          source_updated_at = EXCLUDED.source_updated_at,
          source_added_at   = EXCLUDED.source_added_at,
          last_scraped_at   = NOW(),
          is_active         = true
        RETURNING id, (xmax = 0) AS is_insert`,
        params
        );
      }

      const ret = result.rows[0];
      if (ret?.is_insert) {
        inserted++;
        if (newRowIds.length < 400 && ret.id != null) newRowIds.push(ret.id);
      } else updated++;

      sinceCommit++;
      if (sinceCommit >= UPSERT_BATCH) {
        await client.query('COMMIT');
        inTx = false;
        console.log(
          `  Upsert progress: ${inserted + updated}/${deals.length} (${inserted} new, ${updated} updated)`
        );
        await client.query('BEGIN');
        inTx = true;
        sinceCommit = 0;
      }
    }

    if (inTx) {
      await client.query('COMMIT');
      inTx = false;
    }

    try {
      await client.query('BEGIN');
      inTx = true;
      await dedupeAirtableRowsByListingUrl(client);
      await client.query('COMMIT');
      inTx = false;
    } catch (dedupeErr) {
      if (inTx) {
        await client.query('ROLLBACK');
        inTx = false;
      }
      console.warn('  Dedupe after scrape failed (upserts kept):', dedupeErr.message);
    }

    // Update deal_sources metadata
    try {
      await pool.query(
        `UPDATE deal_sources SET
          last_scrape_at = NOW(),
          last_scrape_result = $1,
          deal_count = (SELECT COUNT(*) FROM market_deals WHERE source = $2 AND is_active = true)
        WHERE source_key = $2`,
        [
          JSON.stringify({
            inserted,
            updated,
            financialChanges,
            ts: new Date().toISOString(),
            ...(newRowIds.length > 0 ? { new_row_ids: newRowIds } : {}),
          }),
          SOURCE_KEY,
        ]
      );
    } catch (metaErr) {
      console.warn('  Warning: failed to update deal_sources metadata:', metaErr.message);
    }
  } catch (err) {
    if (inTx) await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { inserted, updated, financialChanges };
}

/**
 * Mark active rows inactive when they are not in the current Airtable view.
 * Matches record id, numeric ID, or listing URL so older source_id schemes stay.
 */
export async function deactivateDealsAbsentFromSnapshot(snapshotDeals, previousRowCount = null) {
  const rowCount = Array.isArray(snapshotDeals) ? snapshotDeals.length : 0;
  const check = assessSnapshot(rowCount, previousRowCount);
  if (!check.ok) {
    console.warn(
      `  Skip absence deactivation: ${check.reason} (snapshot ${rowCount}, previous ${previousRowCount ?? 'none'})`
    );
    return { deactivated: 0, skipped: true, reason: check.reason, rows: rowCount, previousRows: previousRowCount };
  }

  const ids = [];
  const urls = [];
  for (const deal of snapshotDeals) {
    ids.push(...dealIdentityKeys(deal));
    const urlKey = normalizeListingUrlKey(deal.listing_url);
    if (urlKey) urls.push(urlKey);
  }

  const result = await pool.query(
    `UPDATE market_deals
     SET is_active = false
     WHERE source = $1
       AND is_active = true
       AND NOT (
         source_id = ANY($2::text[])
         OR (
           listing_url IS NOT NULL
           AND lower(trim(split_part(listing_url, '#', 1))) = ANY($3::text[])
         )
       )`,
    [SOURCE_KEY, ids, urls]
  );

  const deactivated = result.rowCount ?? 0;
  console.log(`  Absence sync: deactivated ${deactivated} listings no longer in the Airtable view`);
  return { deactivated, skipped: false };
}

// ---------------------------------------------------------------------------
// Main scrape orchestration
// ---------------------------------------------------------------------------
let _isRunning = false;
let _lastRun = null;
let _lastResult = null;

export async function scrapeAirtable() {
  if (_isRunning) {
    console.log('  Airtable scrape already running, skipping');
    return _lastResult;
  }

  _isRunning = true;
  const start = Date.now();

  try {
    console.log('  Step 1/4: Fetching shared view HTML...');
    const { html, cookies } = await fetchSharedViewPage(AIRTABLE_SHARE_URL);

    console.log('  Step 2/4: Extracting API parameters...');
    const { urlWithParams, appId, pageLoadId } = extractApiParams(html);

    console.log('  Step 3/4: Calling readSharedViewData API...');
    const json = await fetchSharedViewData({ urlWithParams, appId, pageLoadId, cookies });

    const table = json?.data?.table;
    if (!table) throw new Error('Unexpected response shape — no data.table');

    const columns = table.columns || [];
    const rows = table.rows || [];
    console.log(`  Found ${columns.length} columns, ${rows.length} rows`);

    console.log('  Step 4/4: Parsing & upserting to database...');
    const colLookup = buildColumnLookup(columns);
    let deals = parseRows(rows, colLookup);

    // Skip rows we already store with the same dates. Match per listing
    // (record id, numeric ID, or URL) so an older unseen row is still inserted.
    // The full snapshot is kept so listings that left the view can be deactivated.
    const snapshot = deals;
    let skipped = 0;
    let previousRowCount = null;
    let snapshotOk = assessSnapshot(snapshot.length, null).ok;
    try {
      const meta = await pool.query(
        `SELECT last_scrape_result FROM deal_sources WHERE source_key = $1`,
        [SOURCE_KEY]
      );
      previousRowCount = readSnapshotRowCount(meta.rows[0]?.last_scrape_result);
      snapshotOk = assessSnapshot(snapshot.length, previousRowCount).ok;
    } catch (metaErr) {
      console.warn('  Could not read last scrape size:', metaErr.message);
    }

    try {
      const existing = await pool.query(
        `SELECT source_id, listing_url, source_added_at, source_updated_at, is_active
         FROM market_deals WHERE source = $1`,
        [SOURCE_KEY]
      );
      const picked = selectDealsToUpsert(deals, existing.rows);
      deals = sortDealsForSync(picked.selected, existing.rows);
      skipped = picked.skipped;
      console.log(
        `  Change filter: ${snapshot.length} fetched → ${deals.length} new/updated, ${skipped} unchanged skipped`
      );
      if (deals.length > 0) {
        console.log('  Upsert order: listings missing from the database first, newest date first', {
          firstAdded: deals[0]?.airtable_added_at || null,
          lastAdded: deals[deals.length - 1]?.airtable_added_at || null,
        });
      }
    } catch (cutoffErr) {
      console.warn('  Could not load existing listings, upserting all rows:', cutoffErr.message);
      deals = sortDealsForSync(deals, []);
    }

    const { inserted, updated } = await upsertDeals(deals);

    let absent = null;
    try {
      absent = await deactivateDealsAbsentFromSnapshot(snapshot, previousRowCount);
    } catch (absentErr) {
      console.warn('  Absence deactivation failed:', absentErr.message);
      absent = { error: absentErr.message };
    }

    let prune = null;
    try {
      prune = await pruneStaleMarketDeals();
    } catch (pruneErr) {
      console.warn('  Prune after scrape failed:', pruneErr.message);
      prune = { error: pruneErr.message };
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    _lastResult = {
      rows: snapshotOk ? rows.length : (previousRowCount ?? rows.length),
      fetched: rows.length,
      processed: deals.length,
      skipped,
      inserted,
      updated,
      absent,
      prune,
      elapsed,
      ts: new Date().toISOString(),
    };
    _lastRun = new Date();

    try {
      await pool.query(
        `UPDATE deal_sources SET
          last_scrape_at = NOW(),
          last_scrape_result = $1,
          deal_count = (SELECT COUNT(*) FROM market_deals WHERE source = $2 AND is_active = true)
        WHERE source_key = $2`,
        [JSON.stringify(_lastResult), SOURCE_KEY]
      );
    } catch (metaErr) {
      console.warn('  Warning: failed to record scrape snapshot:', metaErr.message);
    }

    console.log(
      `  Done: ${rows.length} fetched, ${deals.length} processed (${inserted} new, ${updated} updated, ${skipped} skipped) in ${elapsed}s`
    );
    return _lastResult;
  } catch (err) {
    console.error('  Airtable scrape error:', err.message);
    _lastResult = { error: err.message, ts: new Date().toISOString() };
    try {
      await pool.query(
        `UPDATE deal_sources SET last_scrape_result = $1 WHERE source_key = $2`,
        [JSON.stringify(_lastResult), SOURCE_KEY]
      );
    } catch (metaErr) {
      console.warn('  Warning: failed to record scrape error:', metaErr.message);
    }
    throw err;
  } finally {
    _isRunning = false;
  }
}

export function getScraperStatus() {
  return {
    enabled: SCRAPE_ENABLED,
    cron: SCRAPE_CRON,
    cronTimezone: SCRAPE_CRON_TZ,
    scrapeOnStartup: SCRAPE_ON_STARTUP,
    isRunning: _isRunning,
    lastRun: _lastRun,
    lastResult: _lastResult,
  };
}

// ---------------------------------------------------------------------------
// Register with scraper registry (handles cron scheduling)
// Skip when running backend/scripts/run-airtable-scrape-once.mjs (SCRAPE_CLI_ONCE=1).
// ---------------------------------------------------------------------------
if (process.env.SCRAPE_CLI_ONCE !== '1') {
  register({
    sourceKey: SOURCE_KEY,
    scrape: scrapeAirtable,
    getStatus: getScraperStatus,
    cronExpr: SCRAPE_ENABLED ? SCRAPE_CRON : null,
    enabled: SCRAPE_ENABLED,
    cronTimezone: SCRAPE_ENABLED && SCRAPE_CRON ? SCRAPE_CRON_TZ : undefined,
  });

  // Run once on startup after a short delay so the server finishes booting
  if (SCRAPE_ENABLED && SCRAPE_ON_STARTUP) {
    setTimeout(() => {
      console.log('🔄 [Airtable] Initial scrape on startup...');
      scrapeAirtable().catch(() => {});
    }, 5000);
  } else if (SCRAPE_ENABLED && !SCRAPE_ON_STARTUP) {
    console.log('⏸️  [Airtable] SCRAPE_ON_STARTUP=false — skipping initial scrape');
  }
}
