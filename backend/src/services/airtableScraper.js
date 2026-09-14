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

/** Sunday 00:00–03:59 in SCRAPE_CRON_TZ → full re-sync without change filter. */
function isSundayFullSyncWindowPacific() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SCRAPE_CRON_TZ,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const wd = parts.find((p) => p.type === 'weekday')?.value;
  const hourRaw = parts.find((p) => p.type === 'hour')?.value;
  const hour = hourRaw != null ? parseInt(hourRaw, 10) : NaN;
  return wd === 'Sun' && Number.isFinite(hour) && hour >= 0 && hour < 4;
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

  try {
    await client.query('BEGIN');
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
    }

    await dedupeAirtableRowsByListingUrl(client);

    await client.query('COMMIT');

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
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { inserted, updated, financialChanges };
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

    // -----------------------------------------------------------------------
    // Change detection: skip rows we already have and haven't changed.
    // Query the DB for the latest dates we've seen for this source, then
    // filter the fetched rows to only those that are genuinely new or updated.
    // This avoids upserting thousands of unchanged rows on every cron run.
    // We still do a full re-sync (no filter) if the DB has no records yet,
    // or on Sunday 00:00–03:59 Pacific (SCRAPE_CRON_TZ) to catch soft-deletes or corrections.
    // -----------------------------------------------------------------------
    const isSundayFullSync = isSundayFullSyncWindowPacific();
    let skipped = 0;

    if (!isSundayFullSync) {
      try {
        const cutoffResult = await pool.query(
          `SELECT
             MAX(source_added_at)   AS max_added,
             MAX(source_updated_at) AS max_updated
           FROM market_deals WHERE source = $1`,
          [SOURCE_KEY]
        );
        const maxAdded   = cutoffResult.rows[0]?.max_added;
        const maxUpdated = cutoffResult.rows[0]?.max_updated;

        if (maxAdded) {
          const addedCutoff   = new Date(maxAdded);
          const updatedCutoff = maxUpdated ? new Date(maxUpdated) : addedCutoff;
          const before = deals.length;

          deals = deals.filter((d) => {
            const addedAt   = d.airtable_added_at   ? new Date(d.airtable_added_at)   : null;
            const updatedAt = d.airtable_updated_at ? new Date(d.airtable_updated_at) : null;
            return (addedAt && addedAt > addedCutoff) ||
                   (updatedAt && updatedAt > updatedCutoff);
          });

          skipped = before - deals.length;
          console.log(
            `  Change filter: ${before} fetched → ${deals.length} new/updated, ${skipped} unchanged skipped`
          );
        }
      } catch (cutoffErr) {
        console.warn('  Could not query cutoff dates, upserting all rows:', cutoffErr.message);
      }
    } else {
      console.log('  Sunday full-sync: skipping change filter, processing all rows');
    }

    const { inserted, updated } = await upsertDeals(deals);

    let prune = null;
    try {
      prune = await pruneStaleMarketDeals();
    } catch (pruneErr) {
      console.warn('  Prune after scrape failed:', pruneErr.message);
      prune = { error: pruneErr.message };
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    _lastResult = {
      rows: rows.length,
      processed: deals.length,
      skipped,
      inserted,
      updated,
      prune,
      elapsed,
      ts: new Date().toISOString(),
    };
    _lastRun = new Date();

    console.log(
      `  Done: ${rows.length} fetched, ${deals.length} processed (${inserted} new, ${updated} updated, ${skipped} skipped) in ${elapsed}s`
    );
    return _lastResult;
  } catch (err) {
    console.error('  Airtable scrape error:', err.message);
    _lastResult = { error: err.message, ts: new Date().toISOString() };
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
