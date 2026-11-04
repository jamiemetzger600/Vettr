import cron from 'node-cron';
import pool from '../db/pool.js';
import { register } from './scraperRegistry.js';
import { pruneStaleMarketDeals } from './marketDealsPrune.js';
import { sendEmail } from './emailService.js';
import { getFeedbackAdminEmails } from '../middleware/requireFeedbackAdmin.js';
import {
  SOURCE_KEY,
  applySnapshotSync,
  assessSnapshot,
  readSnapshotRowCount,
  reconcileSnapshot,
} from './airtableSnapshotSync.js';

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


// ---------------------------------------------------------------------------
// Main scrape orchestration
// ---------------------------------------------------------------------------
let _isRunning = false;
let _lastRun = null;
let _lastResult = null;

const ALERT_REPEAT_MS = 20 * 60 * 60 * 1000;
const STALE_SCAN_HOURS = 26;
const lastAlertAt = new Map();

/** Email the admins about a scan problem, at most once per kind per day. */
async function sendScrapeAlert(kind, subject, detail) {
  const now = Date.now();
  if (now - (lastAlertAt.get(kind) ?? 0) < ALERT_REPEAT_MS) return;
  lastAlertAt.set(kind, now);
  const emails = getFeedbackAdminEmails();
  if (!emails.length) console.warn('[scrape alert] no FEEDBACK_ADMIN_EMAILS configured');
  for (const to of emails) {
    try {
      await sendEmail({ to, subject, html: `<p>${subject}</p><pre>${String(detail).replace(/</g, '&lt;')}</pre>` });
    } catch (err) {
      console.error('[scrape alert] email failed:', err.message);
    }
  }
}

async function readPreviousRowCount() {
  try {
    const meta = await pool.query(
      `SELECT last_scrape_result FROM deal_sources WHERE source_key = $1`,
      [SOURCE_KEY]
    );
    return readSnapshotRowCount(meta.rows[0]?.last_scrape_result);
  } catch (err) {
    console.warn('  Could not read last scrape size:', err.message);
    return null;
  }
}

/** Alert when the daily scan has not succeeded recently. Cannot fire while this machine is off. */
export async function checkScanFreshness() {
  const { rows } = await pool.query(
    `SELECT last_scrape_at, NOW() - last_scrape_at > ($2::int * INTERVAL '1 hour') AS stale
     FROM deal_sources WHERE source_key = $1`,
    [SOURCE_KEY, STALE_SCAN_HOURS]
  );
  if (rows[0]?.stale && !_isRunning) {
    await sendScrapeAlert(
      'stale',
      `Vettr: no successful Airtable scan in ${STALE_SCAN_HOURS} hours`,
      `Last successful scan: ${rows[0].last_scrape_at}`
    );
  }
}

export async function scrapeAirtable() {
  if (_isRunning) {
    console.log('  Airtable scrape already running, skipping');
    return _lastResult;
  }

  _isRunning = true;
  const start = Date.now();
  const previousRowCount = await readPreviousRowCount();

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
    const deals = parseRows(rows, colLookup);
    const check = assessSnapshot(deals.length, previousRowCount);
    if (!check.ok) {
      throw new Error(`Snapshot rejected: ${check.reason} (${deals.length} rows, previous ${previousRowCount ?? 'none'})`);
    }

    const sync = await applySnapshotSync(pool, deals);
    const { inserted, rawInserted, updated, unchanged: skipped, newRowIds } = sync;
    console.log(`  Absence sync: deactivated ${sync.absent} listings no longer in the Airtable view`);

    let prune = null;
    try {
      prune = await pruneStaleMarketDeals();
    } catch (pruneErr) {
      console.warn('  Prune after scrape failed:', pruneErr.message);
      prune = { error: pruneErr.message };
    }

    const reconcile = await reconcileSnapshot(pool, { fetched: rows.length, ...sync });
    console.log('  Reconciliation:', JSON.stringify(reconcile));
    if (!reconcile.ok) {
      await sendScrapeAlert('reconcile', 'Vettr: Airtable counts do not reconcile', JSON.stringify(reconcile));
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    _lastResult = {
      rows: rows.length,
      fetched: rows.length,
      businesses: sync.businesses,
      processed: rawInserted + updated,
      skipped,
      inserted,
      rawInserted,
      updated,
      ...(newRowIds?.length > 0 ? { new_row_ids: newRowIds } : {}),
      financialChanges: sync.financialChanges,
      merged: sync.merged,
      absent: { deactivated: sync.absent, skipped: false },
      prune,
      reconcile,
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
      `  Done: ${rows.length} fetched, ${sync.businesses} businesses, ${rawInserted + updated} written (${inserted} new listings, ${rawInserted ?? 0} rows inserted, ${updated} updated, ${skipped} skipped) in ${elapsed}s`
    );
    return _lastResult;
  } catch (err) {
    console.error('  Airtable scrape error:', err.message);
    // Keep the last good size so a failure cannot lower the bar for a truncated payload.
    _lastResult = { error: err.message, rows: previousRowCount, ts: new Date().toISOString() };
    try {
      await pool.query(
        `UPDATE deal_sources SET last_scrape_result = $1 WHERE source_key = $2`,
        [JSON.stringify(_lastResult), SOURCE_KEY]
      );
    } catch (metaErr) {
      console.warn('  Warning: failed to record scrape error:', metaErr.message);
    }
    await sendScrapeAlert('error', 'Vettr: Airtable scan failed', err.message);
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

  if (SCRAPE_ENABLED) {
    cron.schedule('30 * * * *', () => {
      checkScanFreshness().catch((err) => console.warn('[scrape alert] freshness check failed:', err.message));
    });
  }

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
