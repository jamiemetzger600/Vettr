/**
 * Recipe engine: runs one scrape_run end to end.
 *   discover -> (per listing) fetch+extract via sidecar -> normalize -> validate -> upsert
 * Writes scrape_items for every listing and keeps scrape_runs counters live.
 */
import pool from '../db/pool.js';
import * as sidecar from './sidecar.js';
import { normalizeListing, FIELD_REGISTRY } from './normalize.js';
import { validateListing } from './validate.js';
import { upsertRow, deactivateUnseen, normalizeListingUrlKey } from './upsert.js';
import { isCancelled } from './queue.js';
import { afterRun } from './health.js';
import { postRunLlm, LLM_SAMPLE_RATE, LLM_SAMPLE_CAP, llmConfig } from './llm.js';

const MAX_CONSECUTIVE_BLOCKED = 3;
const MAX_CONSECUTIVE_ERRORS = 8;
const LOG_KEEP_LINES = 300;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class RunLogger {
  constructor(runId, sourceKey) { this.runId = runId; this.sourceKey = sourceKey; this.lines = []; }
  log(msg, extra) {
    const line = `${new Date().toISOString().slice(11, 19)} ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`;
    this.lines.push(line);
    if (this.lines.length > LOG_KEEP_LINES) this.lines.splice(0, this.lines.length - LOG_KEEP_LINES);
    console.log(`[engine:${this.sourceKey}#${this.runId}] ${msg}`, extra ?? '');
  }
  text() { return this.lines.join('\n'); }
}

export async function loadSource(sourceKey) {
  const r = await pool.query(`SELECT * FROM deal_sources WHERE source_key = $1`, [sourceKey]);
  return r.rows[0] || null;
}

/** Effective fetch settings for a recipe/source. */
export function fetchSettings(source, recipe) {
  const f = recipe?.fetch || {};
  const mode = f.mode || source?.fetch_mode || 'http';
  return {
    mode,
    waitSelector: f.waitSelector || null,
    networkIdle: f.networkIdle ?? false,
    solveCloudflare: f.solveCloudflare ?? (mode === 'stealth'),
    proxy: f.proxy || process.env.SCRAPE_PROXY_URL || null,
    timeoutMs: f.timeoutMs || null,
    rateLimitMs: recipe?.politeness?.rateLimitMs ?? source?.rate_limit_ms ?? 3000,
  };
}

/** Process one listing URL: extract -> normalize -> validate. No DB writes. */
export async function processListing({ url, source, recipe, adaptive = true, includeText = false }) {
  const fs = fetchSettings(source, recipe);
  const started = Date.now();
  const res = await sidecar.extract({
    url, mode: fs.mode, fields: recipe.fields, adaptive, sourceKey: source.source_key,
    adaptiveDomain: recipe.adaptiveDomain || null, includeText,
    timeoutMs: fs.timeoutMs, proxy: fs.proxy, waitSelector: fs.waitSelector,
    networkIdle: fs.networkIdle, solveCloudflare: fs.solveCloudflare,
  });
  const item = {
    listing_url: url,
    http_status: res.status,
    status: 'ok',
    extracted: res.fields || {},
    normalized: null,
    errors: [],
    relocated: false,
    elapsed_ms: Date.now() - started,
    text: res.text || null,
  };
  if (res.blocked) { item.status = 'blocked'; item.errors.push({ code: 'blocked', message: res.block_reason }); return item; }
  if (res.status === 0 || res.status >= 400 || res.error) {
    item.status = 'failed_fetch';
    item.errors.push({ code: 'fetch', message: res.error || `HTTP ${res.status}` });
    return item;
  }
  const extractedVals = Object.values(item.extracted);
  item.relocated = extractedVals.some((f) => f?.relocated);
  const anyValue = extractedVals.some((f) => f?.value);
  if (!anyValue) { item.status = 'failed_extract'; item.errors.push({ code: 'extract', message: 'no fields extracted' }); return item; }

  const row = normalizeListing(item.extracted, res.final_url || url, source.source_key);
  item.normalized = row;
  const v = validateListing(row, recipe.validate || {});
  if (!v.ok) { item.status = 'failed_validation'; item.errors.push(...v.errors); }
  if (v.warnings.length) item.warnings = v.warnings;
  return item;
}

function coverageFor(items, fields) {
  const okItems = items.filter((i) => i.status === 'ok' || i.status === 'failed_validation');
  const out = {};
  if (!okItems.length) return out;
  for (const f of fields) {
    const n = okItems.filter((i) => i.extracted?.[f]?.value).length;
    out[f] = Math.round((n / okItems.length) * 100);
  }
  return out;
}

async function saveItem(runId, sourceKey, item, marketDealId = null) {
  await pool.query(
    `INSERT INTO scrape_items (run_id, source_key, listing_url, status, http_status, extracted, normalized, errors, relocated, market_deal_id, content_hash, elapsed_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      runId, sourceKey, item.listing_url, item.status, item.http_status,
      JSON.stringify(item.extracted || {}), item.normalized ? JSON.stringify(item.normalized) : null,
      JSON.stringify([...(item.errors || []), ...((item.warnings || []).map((w) => ({ ...w, warning: true })))]),
      item.relocated, marketDealId, item.normalized?.content_hash || null, item.elapsed_ms,
    ]
  );
}

async function updateRun(runId, counters, extra = {}) {
  const sets = Object.entries({ ...counters, ...extra });
  const assigns = sets.map(([k], i) => `${k} = $${i + 2}`).join(', ');
  await pool.query(`UPDATE scrape_runs SET ${assigns} WHERE id = $1`, [runId, ...sets.map(([, v]) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v))]);
}

/**
 * Execute a claimed run. Never throws; records failure on the run row.
 * @param {object} run scrape_runs row with status='running'
 */
export async function executeRun(run) {
  const logger = new RunLogger(run.id, run.source_key);
  const counters = { discovered: 0, fetched: 0, extracted: 0, valid: 0, inserted: 0, updated: 0, unchanged: 0, failed: 0, blocked: 0, relocated: 0 };
  const histogram = {};
  const items = [];
  const llmSamples = [];
  const llmFailures = [];
  let activeRecipe = null;
  let finalStatus = 'success';
  let error = null;
  const startedAt = new Date();

  try {
    const source = await loadSource(run.source_key);
    if (!source) throw new Error(`source ${run.source_key} not found`);
    const options = run.options || {};
    const recipe = options.recipe || source.recipe;
    if (!recipe?.fields || !Object.keys(recipe.fields).length) throw new Error('source has no recipe fields');
    activeRecipe = recipe;
    const fs = fetchSettings(source, recipe);
    const dryRun = Boolean(options.dryRun) || run.trigger === 'test' || run.trigger === 'trainer';
    const writeToPool = !dryRun && source.published === true;
    logger.log('start', { trigger: run.trigger, mode: fs.mode, dryRun, writeToPool, rateLimitMs: fs.rateLimitMs });

    // 1) Discover
    let urls = Array.isArray(options.urls) && options.urls.length ? options.urls.slice() : null;
    if (!urls) {
      if (!recipe.discover) throw new Error('recipe.discover missing (or pass options.urls)');
      let discover = recipe.discover;
      const hasStart = (discover.startUrls || []).some(Boolean) || discover.startUrl;
      if (!hasStart && (source.listings_url || source.base_url)) {
        discover = { ...discover, startUrls: [source.listings_url || source.base_url] };
      }
      const maxUrls = Number(options.maxUrls) || Number(discover.maxUrls) || 500;
      const d = await sidecar.discover({
        discover, mode: discover.mode || fs.mode, maxUrls,
        rateLimitMs: Math.min(fs.rateLimitMs, 5000), timeoutMs: fs.timeoutMs, proxy: fs.proxy, solveCloudflare: fs.solveCloudflare,
      });
      urls = d.urls || [];
      logger.log('discover', { count: urls.length, pages: d.pages_fetched, blocked: d.block_reason, errors: d.errors?.slice(0, 3) });
      if (d.blocked) {
        counters.blocked += MAX_CONSECUTIVE_BLOCKED; // treat index block as hard block
        throw new Error(`blocked during discovery: ${d.block_reason}`);
      }
      if (d.errors?.length && !urls.length) throw new Error(`discovery failed: ${d.errors[0]}`);
    }
    if (options.limit) urls = urls.slice(0, Number(options.limit));
    counters.discovered = urls.length;
    await updateRun(run.id, { discovered: counters.discovered }, { log: logger.text() });
    if (!urls.length) { finalStatus = 'failed'; throw new Error('no listing URLs discovered'); }

    // Skip re-fetch of listings we already scraped recently (same-day Sample + cron, accidental double Run).
    // Nightly cron still refreshes: default 18h < 24h between 5am runs. Raise skipFetchIfScrapedWithinHours to spend less CPU.
    const skipHoursRaw = recipe.politeness?.skipFetchIfScrapedWithinHours;
    const skipHours = skipHoursRaw === 0 || skipHoursRaw === false ? 0 : Number(skipHoursRaw ?? 18);
    if (skipHours > 0) {
      const recent = await pool.query(
        `SELECT listing_url FROM market_deals_staging
         WHERE source = $1 AND is_active = true
           AND last_scraped_at > NOW() - ($2 * INTERVAL '1 hour')`,
        [source.source_key, skipHours]
      );
      const skipKeys = new Set(recent.rows.map((row) => normalizeListingUrlKey(row.listing_url)).filter(Boolean));
      const toSkip = [];
      const toFetch = [];
      for (const u of urls) {
        const k = normalizeListingUrlKey(u);
        if (k && skipKeys.has(k)) toSkip.push(k);
        else toFetch.push(u);
      }
      if (toSkip.length) {
        await pool.query(
          `UPDATE market_deals_staging SET last_scraped_at = NOW()
           WHERE source = $1 AND listing_url IS NOT NULL
             AND lower(trim(split_part(listing_url, '#', 1))) = ANY($2::text[])`,
          [source.source_key, toSkip]
        );
        if (writeToPool) {
          await pool.query(
            `UPDATE market_deals SET last_scraped_at = NOW()
             WHERE source = $1 AND listing_url IS NOT NULL
               AND lower(trim(split_part(listing_url, '#', 1))) = ANY($2::text[])`,
            [source.source_key, toSkip]
          );
        }
        counters.unchanged += toSkip.length;
        logger.log('skip recently scraped', { skipped: toSkip.length, fetch: toFetch.length, windowHours: skipHours });
      }
      urls = toFetch;
    }

    // 2) Per listing
    let consecutiveBlocked = 0;
    let consecutiveErrors = 0;
    const fieldKeys = Object.keys(recipe.fields);
    const llmOn = llmConfig().enabled && !dryRun;
    for (let i = 0; i < urls.length; i++) {
      if (i > 0 && fs.rateLimitMs) await sleep(fs.rateLimitMs);
      if (i % 10 === 0 && (await isCancelled(run.id))) { finalStatus = 'cancelled'; logger.log('cancelled by admin'); break; }
      const url = urls[i];
      // Ask for page text on a small sample (LLM drift check) and on early items (repair evidence)
      const sampleThis = llmOn && llmSamples.length < LLM_SAMPLE_CAP && Math.random() < LLM_SAMPLE_RATE;
      const wantText = sampleThis || (llmOn && llmFailures.length < 5);
      let item;
      try {
        item = await processListing({ url, source, recipe, includeText: wantText });
      } catch (err) {
        item = { listing_url: url, status: 'failed_fetch', http_status: 0, extracted: {}, errors: [{ code: 'sidecar', message: err.message }], relocated: false, elapsed_ms: 0 };
      }
      counters.fetched++;
      histogram[item.http_status || 0] = (histogram[item.http_status || 0] || 0) + 1;
      if (item.relocated) counters.relocated++;
      if (item.text) {
        if (item.status === 'ok' && sampleThis) llmSamples.push({ url, text: item.text, normalized: item.normalized });
        else if ((item.status === 'failed_extract' || item.status === 'failed_validation') && llmFailures.length < 5) llmFailures.push({ url, text: item.text });
        delete item.text;
      }

      let marketDealId = null;
      if (item.status === 'blocked') {
        counters.blocked++; consecutiveBlocked++;
        logger.log('blocked', { url, reason: item.errors[0]?.message });
        if (consecutiveBlocked >= MAX_CONSECUTIVE_BLOCKED) { finalStatus = 'failed'; error = `aborted after ${consecutiveBlocked} consecutive blocked responses`; items.push(item); await saveItem(run.id, run.source_key, item); break; }
      } else {
        consecutiveBlocked = 0;
        if (item.status === 'failed_fetch') {
          counters.failed++; consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) { finalStatus = 'failed'; error = `aborted after ${consecutiveErrors} consecutive fetch errors`; items.push(item); await saveItem(run.id, run.source_key, item); break; }
        } else {
          consecutiveErrors = 0;
          counters.extracted++;
          if (item.status === 'ok') {
            counters.valid++;
            if (!dryRun) {
              const client = await pool.connect();
              try {
                await client.query('BEGIN');
                const st = await upsertRow(client, 'market_deals_staging', { ...item.normalized, raw: item.extracted }, { runId: run.id });
                marketDealId = st.id;
                if (writeToPool) {
                  const pr = await upsertRow(client, 'market_deals', item.normalized);
                  marketDealId = pr.id;
                }
                await client.query('COMMIT');
                if (st.isInsert) counters.inserted++; else if (st.changed) counters.updated++; else counters.unchanged++;
              } catch (err) {
                await client.query('ROLLBACK').catch(() => {});
                item.status = 'failed_validation';
                item.errors.push({ code: 'upsert', message: err.message });
                counters.valid--; counters.failed++;
                logger.log('upsert error', { url, error: err.message });
              } finally {
                client.release();
              }
            }
          } else {
            counters.failed++;
          }
        }
      }
      items.push(item);
      await saveItem(run.id, run.source_key, item, marketDealId);
      if ((i + 1) % 10 === 0 || i === urls.length - 1) {
        await updateRun(run.id, counters, { field_coverage: coverageFor(items, fieldKeys), http_status_histogram: histogram, log: logger.text() });
      }
    }

    // 3) Deactivate listings that vanished (full cron/manual runs only)
    if (!dryRun && !options.urls && !options.limit && finalStatus === 'success' && counters.valid > 0) {
      const client = await pool.connect();
      try {
        const n = await deactivateUnseen(client, 'market_deals_staging', run.source_key, startedAt);
        let m = 0;
        if (writeToPool) m = await deactivateUnseen(client, 'market_deals', run.source_key, startedAt);
        logger.log('deactivated unseen', { staging: n, pool: m });
      } finally { client.release(); }
    }

    if (finalStatus === 'success' && counters.valid === 0 && !(counters.unchanged > 0 && counters.fetched === 0)) finalStatus = 'failed';
    else if (finalStatus === 'success' && counters.failed + counters.blocked > 0) finalStatus = 'partial';
    if (finalStatus === 'failed' && !error) error = counters.fetched ? 'no valid listings extracted' : 'nothing fetched';
  } catch (err) {
    finalStatus = finalStatus === 'cancelled' ? 'cancelled' : 'failed';
    error = err.message;
    logger.log('error', { message: err.message });
  }

  const fieldKeys = items.length ? Object.keys(items[0].extracted || {}) : [];
  await updateRun(run.id, counters, {
    status: finalStatus, error, finished_at: new Date(),
    field_coverage: coverageFor(items, fieldKeys), http_status_histogram: histogram, log: logger.text(),
  });

  // Source metadata (skip for test/trainer runs)
  if (run.trigger !== 'test' && run.trigger !== 'trainer') {
    await pool.query(
      `UPDATE deal_sources SET last_scrape_at = NOW(), last_scrape_result = $2, updated_at = NOW(),
         deal_count = (SELECT COUNT(*) FROM market_deals_staging WHERE source = $1 AND is_active = true)
       WHERE source_key = $1`,
      [run.source_key, JSON.stringify({ runId: run.id, status: finalStatus, ...counters, error })]
    );
    try { await afterRun(run.id); } catch (err) { console.warn('[engine] health evaluation failed:', err.message); }
    if (llmSamples.length || llmFailures.length) {
      try {
        const s = await postRunLlm({ run, recipe: activeRecipe, samples: llmSamples, failures: llmFailures });
        if (s) logger.log('llm', { checked: s.validated?.checked, disagreeing: s.validated?.disagreeing, proposals: s.proposals?.length });
      } catch (err) { console.warn('[engine] LLM post-run failed:', err.message); }
    }
  }
  logger.log('done', { status: finalStatus, ...counters });
  return { status: finalStatus, counters, error };
}

export { FIELD_REGISTRY };
