/**
 * Scrape admin API — mounted at /api/admin/scrape only when SCRAPE_PLATFORM_ENABLED=true.
 * All routes require a logged-in platform admin (ADMIN_EMAILS).
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import pool from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import * as sidecar from '../scraper/sidecar.js';
import { enqueueRun, cancelRun } from '../scraper/queue.js';
import { processListing, loadSource, fetchSettings } from '../scraper/engine.js';
import { normalizeListing, FIELD_REGISTRY } from '../scraper/normalize.js';
import { validateListing } from '../scraper/validate.js';
import { publishSource, unpublishSource, coverageReport } from '../scraper/publish.js';
import { computeBaseline } from '../scraper/health.js';
import { runDailyHealthDigest, buildHealthDigest } from '../scraper/digest.js';
import { llmStatus, suggestFields, suggestionsToStrategies } from '../scraper/llm.js';

const router = Router();
router.use(authMiddleware, requireAdmin);

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  console.error(`[admin-scrape] ${req.method} ${req.originalUrl}:`, err);
  res.status(err.status || 500).json({ error: err.message || 'Internal error' });
});

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const notFound = (msg) => Object.assign(new Error(msg), { status: 404 });

const ALLOWED_STATUS = ['draft', 'active', 'paused', 'broken'];
const ALLOWED_MODES = ['http', 'browser', 'stealth'];
const isAirtableFeed = (key) => key === 'airtable_bizbuysell';

function asUrlList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(/\s+/);
  return raw.map((u) => String(u || '').trim()).filter((u) => /^https?:\/\//i.test(u));
}

/** If the trainer omitted Discover, fill startUrls from the source listings page. */
export function fillDiscoverStartUrls(recipe, source = {}) {
  if (!recipe || typeof recipe !== 'object') return recipe;
  const d = { ...(recipe.discover || {}) };
  const urls = asUrlList(d.startUrls).concat(asUrlList(d.startUrl));
  if (!urls.length) {
    const fb = source.listings_url || source.base_url;
    if (fb) urls.push(String(fb).trim());
  }
  if (!urls.length) return recipe;
  return { ...recipe, discover: { ...d, startUrls: [...new Set(urls)] } };
}

export function validateRecipe(recipe) {
  const errors = [];
  if (!recipe || typeof recipe !== 'object') return ['recipe must be an object'];
  if (recipe.fields && typeof recipe.fields !== 'object') errors.push('fields must be an object');
  for (const [k, rules] of Object.entries(recipe.fields || {})) {
    if (!Array.isArray(rules)) { errors.push(`fields.${k} must be an array of strategies`); continue; }
    rules.forEach((r, i) => {
      if (!r || typeof r !== 'object' || !r.type) errors.push(`fields.${k}[${i}] missing type`);
      else if (['css', 'xpath'].includes(r.type) && !(r.sel || r.selector)) errors.push(`fields.${k}[${i}] ${r.type} needs sel`);
      else if (r.type === 'label' && !(r.labels?.length || r.label)) errors.push(`fields.${k}[${i}] label needs labels[]`);
      else if (r.type === 'jsonld' && !r.path) errors.push(`fields.${k}[${i}] jsonld needs path`);
      else if (['regex', 'url'].includes(r.type) && !(r.pattern || r.regex)) errors.push(`fields.${k}[${i}] ${r.type} needs pattern`);
    });
  }
  if (recipe.discover) {
    const d = recipe.discover;
    if (!asUrlList(d.startUrls).length && !asUrlList(d.startUrl).length) errors.push('discover.startUrls required');
    if (d.pagination?.urlTemplate && !/\{page\}/.test(d.pagination.urlTemplate)) errors.push('pagination.urlTemplate must contain {page}');
  }
  if (recipe.fetch?.mode && !ALLOWED_MODES.includes(recipe.fetch.mode)) errors.push(`fetch.mode must be one of ${ALLOWED_MODES.join(', ')}`);
  return errors;
}

// ---------------------------------------------------------------------------
// Status / meta
// ---------------------------------------------------------------------------
router.get('/status', wrap(async (req, res) => {
  const [sc, llm, counts, running] = await Promise.all([
    sidecar.health(),
    llmStatus(),
    pool.query(`SELECT status, COUNT(*)::int AS n FROM deal_sources GROUP BY status`),
    pool.query(`SELECT id, source_key, status, trigger, started_at, queued_at, fetched, discovered FROM scrape_runs WHERE status IN ('queued','running') ORDER BY queued_at`),
  ]);
  const lastFinished = await pool.query(`SELECT MAX(finished_at) AS t FROM scrape_runs`);
  res.json({
    sidecar: sc, llm, sources: Object.fromEntries(counts.rows.map((r) => [r.status || 'null', r.n])),
    queue: running.rows, lastRunFinishedAt: lastFinished.rows[0]?.t || null,
    fieldRegistry: FIELD_REGISTRY, workerHint: 'npm run worker:staging',
  });
}));

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------
router.get('/sources', wrap(async (req, res) => {
  const r = await pool.query(`
    SELECT s.*, 
      (SELECT COUNT(*)::int FROM market_deals_staging m WHERE m.source = s.source_key AND m.is_active) AS staged_count,
      (SELECT COUNT(*)::int FROM market_deals m WHERE m.source = s.source_key AND m.is_active) AS live_count,
      (SELECT COUNT(*)::int FROM scrape_alerts a WHERE a.source_key = s.source_key AND a.acknowledged_at IS NULL) AS open_alerts,
      (SELECT COUNT(*)::int FROM recipe_proposals p WHERE p.source_key = s.source_key AND p.status = 'pending') AS pending_proposals,
      (SELECT row_to_json(r) FROM (SELECT id, status, trigger, started_at, finished_at, discovered, fetched, valid, inserted, updated, failed, blocked, field_coverage, health
                                    FROM scrape_runs r WHERE r.source_key = s.source_key AND r.trigger IN ('cron','manual') ORDER BY queued_at DESC LIMIT 1) r) AS last_run,
      (SELECT COUNT(*)::int FROM scrape_runs r WHERE r.source_key = s.source_key AND r.status IN ('queued','running')) AS active_runs
    FROM deal_sources s
    ORDER BY CASE s.status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 WHEN 'broken' THEN 2 ELSE 3 END, s.priority, s.display_name`);
  res.json({ sources: r.rows });
}));

const SOURCE_KEY_ALIASES = { bizbuysell: 'bizbuysell_direct', bizquest: 'bizquest_direct' };

router.post('/sources', wrap(async (req, res) => {
  const { display_name, base_url, listings_url, fetch_mode = 'http', source_key } = req.body || {};
  if (!display_name || !(base_url || listings_url)) throw bad('display_name and base_url/listings_url required');
  let key = source_key;
  if (!key) {
    try { key = new URL(base_url || listings_url).hostname.replace(/^www\./, '').split('.')[0]; } catch { key = display_name; }
    key = key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  }
  if (SOURCE_KEY_ALIASES[key]) key = SOURCE_KEY_ALIASES[key];
  if (!ALLOWED_MODES.includes(fetch_mode)) throw bad('invalid fetch_mode');
  const existing = await loadSource(key);
  if (existing) {
    console.log('[admin-scrape] reuse source', key);
    return res.status(200).json({ source: existing, reused: true });
  }
  const r = await pool.query(
    `INSERT INTO deal_sources (source_key, display_name, source_type, base_url, listings_url, fetch_mode, status, scrape_enabled, scrape_cron, entity_type)
     VALUES ($1,$2,'recipe',$3,$4,$5,'draft',false,'0 5 * * *','business') RETURNING *`,
    [key, display_name, base_url || null, listings_url || null, fetch_mode]
  );
  console.log('[admin-scrape] created source', key);
  res.status(201).json({ source: r.rows[0] });
}));

router.get('/sources/:key', wrap(async (req, res) => {
  const source = await loadSource(req.params.key);
  if (!source) throw notFound('source not found');
  const [runs, alerts, proposals, staged, baseline] = await Promise.all([
    pool.query(`SELECT id, status, trigger, queued_at, started_at, finished_at, discovered, fetched, extracted, valid, inserted, updated, unchanged, failed, blocked, relocated, field_coverage, health, error
                FROM scrape_runs WHERE source_key = $1 ORDER BY queued_at DESC LIMIT 30`, [source.source_key]),
    pool.query(`SELECT * FROM scrape_alerts WHERE source_key = $1 ORDER BY created_at DESC LIMIT 20`, [source.source_key]),
    pool.query(`SELECT * FROM recipe_proposals WHERE source_key = $1 AND status = 'pending' ORDER BY created_at DESC`, [source.source_key]),
    pool.query(`SELECT COUNT(*) FILTER (WHERE is_active)::int AS active, COUNT(*)::int AS total,
                       COUNT(*) FILTER (WHERE is_active AND asking_price IS NOT NULL)::int AS with_price,
                       COUNT(*) FILTER (WHERE is_active AND annual_profit IS NOT NULL)::int AS with_profit,
                       COUNT(*) FILTER (WHERE is_active AND annual_revenue IS NOT NULL)::int AS with_revenue
                FROM market_deals_staging WHERE source = $1`, [source.source_key]),
    computeBaseline(source.source_key),
  ]);
  res.json({ source, runs: runs.rows, alerts: alerts.rows, proposals: proposals.rows, staged: staged.rows[0], baseline });
}));

router.patch('/sources/:key', wrap(async (req, res) => {
  const source = await loadSource(req.params.key);
  if (!source) throw notFound('source not found');
  const b = req.body || {};
  const sets = [];
  const vals = [source.source_key];
  const set = (col, val) => {
    const i = sets.findIndex((s) => s.startsWith(`${col} = `));
    if (i >= 0) {
      vals[i + 1] = val;
      return;
    }
    vals.push(val);
    sets.push(`${col} = $${vals.length}`);
  };
  if (b.display_name !== undefined) set('display_name', String(b.display_name).slice(0, 255));
  if (b.base_url !== undefined) set('base_url', b.base_url || null);
  if (b.listings_url !== undefined) set('listings_url', b.listings_url || null);
  if (b.notes !== undefined) set('notes', b.notes || null);
  if (b.fetch_mode !== undefined) { if (!ALLOWED_MODES.includes(b.fetch_mode)) throw bad('invalid fetch_mode'); set('fetch_mode', b.fetch_mode); }
  if (b.rate_limit_ms !== undefined) set('rate_limit_ms', Math.max(500, Number(b.rate_limit_ms) || 3000));
  if (b.scrape_cron !== undefined) set('scrape_cron', b.scrape_cron || null);
  if (b.scrape_enabled !== undefined) set('scrape_enabled', Boolean(b.scrape_enabled));
  if (b.status !== undefined) {
    if (!ALLOWED_STATUS.includes(b.status)) throw bad('invalid status');
    set('status', b.status);
    if (b.status !== 'paused') set('paused_reason', null);
    else set('paused_reason', b.paused_reason || 'Paused by admin');
  }
  if (b.recipe !== undefined) {
    if (isAirtableFeed(source.source_key)) throw bad('Airtable feed is managed by its own scraper — train bizbuysell_direct instead');
    if (b.recipe === null) set('recipe', null);
    else {
      b.recipe = fillDiscoverStartUrls(b.recipe, source);
      const errs = validateRecipe(b.recipe);
      if (errs.length) {
        console.warn('[admin-scrape] invalid recipe', source.source_key, errs, {
          listings_url: source.listings_url, base_url: source.base_url,
          discover: b.recipe?.discover,
        });
        return res.status(400).json({ error: 'invalid recipe', details: errs });
      }
      set('recipe', JSON.stringify(b.recipe));
      if (b.recipe.fetch?.mode) set('fetch_mode', b.recipe.fetch.mode);
    }
  }
  if (!sets.length) throw bad('nothing to update');
  sets.push('updated_at = NOW()');
  const r = await pool.query(`UPDATE deal_sources SET ${sets.join(', ')} WHERE source_key = $1 RETURNING *`, vals);
  console.log('[admin-scrape] updated source', source.source_key, Object.keys(b));
  res.json({ source: r.rows[0] });
}));

router.delete('/sources/:key', wrap(async (req, res) => {
  const source = await loadSource(req.params.key);
  if (!source) throw notFound('source not found');
  if (source.published || source.source_key === 'airtable_bizbuysell') throw bad('cannot delete a published source; unpublish first');
  await pool.query(`DELETE FROM market_deals_staging WHERE source = $1`, [source.source_key]);
  await pool.query(`DELETE FROM scrape_runs WHERE source_key = $1`, [source.source_key]);
  await pool.query(`DELETE FROM scrape_alerts WHERE source_key = $1`, [source.source_key]);
  await pool.query(`DELETE FROM recipe_proposals WHERE source_key = $1`, [source.source_key]);
  await pool.query(`DELETE FROM deal_sources WHERE source_key = $1`, [source.source_key]);
  res.json({ ok: true });
}));

router.post('/sources/:key/run', wrap(async (req, res) => {
  const source = await loadSource(req.params.key);
  if (!source) throw notFound('source not found');
  if (isAirtableFeed(source.source_key) || source.source_type === 'airtable') throw bad('Airtable feed is managed by its own scraper');
  if (!source.recipe?.fields) throw bad('source has no recipe yet');
  const { maxUrls, limit } = req.body || {};
  const { run, reused } = await enqueueRun(source.source_key, 'manual', { maxUrls: maxUrls ? Number(maxUrls) : undefined, limit: limit ? Number(limit) : undefined });
  res.status(reused ? 200 : 202).json({ run, reused });
}));

router.post('/sources/:key/pause', wrap(async (req, res) => {
  const r = await pool.query(`UPDATE deal_sources SET status = 'paused', paused_reason = $2, updated_at = NOW() WHERE source_key = $1 RETURNING *`, [req.params.key, req.body?.reason || 'Paused by admin']);
  if (!r.rows[0]) throw notFound('source not found');
  res.json({ source: r.rows[0] });
}));

router.post('/sources/:key/resume', wrap(async (req, res) => {
  const r = await pool.query(`UPDATE deal_sources SET status = 'active', paused_reason = NULL, scrape_enabled = true, updated_at = NOW() WHERE source_key = $1 AND recipe IS NOT NULL RETURNING *`, [req.params.key]);
  if (!r.rows[0]) throw bad('source not found or has no recipe');
  res.json({ source: r.rows[0] });
}));

router.post('/sources/:key/publish', wrap(async (req, res) => {
  const source = await loadSource(req.params.key);
  if (!source) throw notFound('source not found');
  const result = await publishSource(source.source_key);
  res.json({ ok: true, ...result, source: await loadSource(source.source_key) });
}));

router.post('/sources/:key/unpublish', wrap(async (req, res) => {
  const source = await loadSource(req.params.key);
  if (!source) throw notFound('source not found');
  if (source.source_key === 'airtable_bizbuysell') throw bad('Airtable feed is managed by its own scraper');
  const result = await unpublishSource(source.source_key, { removeFromPool: Boolean(req.body?.removeFromPool) });
  res.json({ ok: true, ...result, source: await loadSource(source.source_key) });
}));

/** Synchronous discovery preview (small). */
router.post('/sources/:key/discover-test', wrap(async (req, res) => {
  const source = await loadSource(req.params.key);
  if (!source) throw notFound('source not found');
  const recipe = fillDiscoverStartUrls(req.body?.recipe || source.recipe, source);
  if (!recipe?.discover) throw bad('recipe.discover required');
  const errs = validateRecipe({ discover: recipe.discover });
  if (errs.length) return res.status(400).json({ error: 'invalid discover config', details: errs });
  const fs = fetchSettings(source, recipe);
  const maxUrls = Math.min(Number(req.body?.maxUrls) || 40, 200);
  const d = await sidecar.discover({
    discover: { ...recipe.discover, pagination: { ...(recipe.discover.pagination || {}), maxPages: Math.min(Number(recipe.discover.pagination?.maxPages) || 1, 3) } },
    mode: recipe.discover.mode || fs.mode, maxUrls, rateLimitMs: 1000, proxy: fs.proxy, solveCloudflare: fs.solveCloudflare,
  });
  res.json(d);
}));

/** Synchronous extraction test on up to 10 URLs with the given (or saved) recipe. No DB writes. */
router.post('/sources/:key/test', wrap(async (req, res) => {
  const source = await loadSource(req.params.key);
  if (!source) throw notFound('source not found');
  const recipe = fillDiscoverStartUrls(req.body?.recipe || source.recipe, source);
  if (!recipe?.fields) throw bad('recipe.fields required');
  const errs = validateRecipe(recipe);
  if (errs.length) return res.status(400).json({ error: 'invalid recipe', details: errs });
  let urls = req.body?.urls || (req.body?.url ? [req.body.url] : []);
  urls = urls.filter(Boolean).slice(0, 10);
  if (!urls.length) throw bad('urls[] required');
  const items = [];
  for (const url of urls) {
    try {
      const item = await processListing({ url, source, recipe, adaptive: false });
      delete item.text;
      items.push(item);
    } catch (err) {
      items.push({ listing_url: url, status: 'failed_fetch', errors: [{ code: 'sidecar', message: err.message }], extracted: {} });
    }
  }
  const fieldKeys = Object.keys(recipe.fields);
  const coverage = {};
  for (const f of fieldKeys) coverage[f] = Math.round((items.filter((i) => i.extracted?.[f]?.value).length / items.length) * 100);
  res.json({ items, coverage, ok: items.filter((i) => i.status === 'ok').length, total: items.length });
}));

router.get('/sources/:key/deals', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const table = req.query.table === 'live' ? 'market_deals' : 'market_deals_staging';
  const r = await pool.query(
    `SELECT id, source_id, name, listing_url, asking_price, annual_revenue, annual_profit, city, state, industries, is_active, last_scraped_at, first_seen_at${table === 'market_deals_staging' ? ', run_id, content_hash, published_at' : ''}
     FROM ${table} WHERE source = $1 ORDER BY last_scraped_at DESC LIMIT $2 OFFSET $3`,
    [req.params.key, limit, offset]
  );
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table} WHERE source = $1`, [req.params.key]);
  res.json({ deals: r.rows, total: c.rows[0].n, limit, offset, table });
}));

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------
router.get('/runs', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const params = [limit];
  let where = '';
  if (req.query.source_key) { params.push(req.query.source_key); where = `WHERE source_key = $${params.length}`; }
  const r = await pool.query(
    `SELECT id, source_key, status, trigger, queued_at, started_at, finished_at, discovered, fetched, valid, inserted, updated, failed, blocked, relocated, field_coverage, health, error
     FROM scrape_runs ${where} ORDER BY queued_at DESC LIMIT $1`, params);
  res.json({ runs: r.rows });
}));

router.get('/runs/:id', wrap(async (req, res) => {
  const r = await pool.query(`SELECT * FROM scrape_runs WHERE id = $1`, [req.params.id]);
  if (!r.rows[0]) throw notFound('run not found');
  const statusCounts = await pool.query(`SELECT status, COUNT(*)::int AS n FROM scrape_items WHERE run_id = $1 GROUP BY status`, [req.params.id]);
  res.json({ run: r.rows[0], itemStatus: Object.fromEntries(statusCounts.rows.map((x) => [x.status, x.n])) });
}));

router.get('/runs/:id/items', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 500);
  const offset = Number(req.query.offset) || 0;
  const params = [req.params.id, limit, offset];
  let where = 'WHERE run_id = $1';
  if (req.query.status) { params.push(req.query.status); where += ` AND status = $${params.length}`; }
  const r = await pool.query(`SELECT * FROM scrape_items ${where} ORDER BY id LIMIT $2 OFFSET $3`, params);
  const c = await pool.query(`SELECT COUNT(*)::int AS n FROM scrape_items ${where}`, params.slice(0, 1).concat(params.slice(3)));
  res.json({ items: r.rows, total: c.rows[0].n, limit, offset });
}));

router.post('/runs/:id/cancel', wrap(async (req, res) => {
  const ok = await cancelRun(Number(req.params.id));
  res.json({ ok });
}));

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
router.get('/alerts', wrap(async (req, res) => {
  const open = req.query.open !== '0';
  const r = await pool.query(
    `SELECT a.*, s.display_name FROM scrape_alerts a LEFT JOIN deal_sources s ON s.source_key = a.source_key
     ${open ? 'WHERE a.acknowledged_at IS NULL' : ''} ORDER BY a.created_at DESC LIMIT 200`);
  res.json({ alerts: r.rows });
}));

router.post('/alerts/:id/ack', wrap(async (req, res) => {
  await pool.query(`UPDATE scrape_alerts SET acknowledged_at = NOW() WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

router.post('/alerts/ack-all', wrap(async (req, res) => {
  const r = await pool.query(`UPDATE scrape_alerts SET acknowledged_at = NOW() WHERE acknowledged_at IS NULL ${req.body?.source_key ? 'AND source_key = $1' : ''}`, req.body?.source_key ? [req.body.source_key] : []);
  res.json({ ok: true, acknowledged: r.rowCount });
}));

router.get('/digest/preview', wrap(async (req, res) => {
  res.json(await buildHealthDigest());
}));

router.post('/digest/send', wrap(async (req, res) => {
  res.json({ ok: true, result: await runDailyHealthDigest() });
}));

// ---------------------------------------------------------------------------
// Proposals (LLM / adaptive repairs)
// ---------------------------------------------------------------------------
router.get('/proposals', wrap(async (req, res) => {
  const status = req.query.status || 'pending';
  const r = await pool.query(`SELECT p.*, s.display_name FROM recipe_proposals p LEFT JOIN deal_sources s ON s.source_key = p.source_key WHERE p.status = $1 ORDER BY p.created_at DESC LIMIT 100`, [status]);
  res.json({ proposals: r.rows });
}));

router.post('/proposals/:id/approve', wrap(async (req, res) => {
  const p = (await pool.query(`SELECT * FROM recipe_proposals WHERE id = $1 AND status = 'pending'`, [req.params.id])).rows[0];
  if (!p) throw notFound('pending proposal not found');
  const source = await loadSource(p.source_key);
  if (!source) throw notFound('source not found');
  const recipe = { ...(source.recipe || {}), fields: { ...(source.recipe?.fields || {}) } };
  if (p.field) recipe.fields[p.field] = p.proposed_rules;
  else if (p.proposed_rules?.fields) recipe.fields = p.proposed_rules.fields;
  await pool.query(`UPDATE deal_sources SET recipe = $2, updated_at = NOW() WHERE source_key = $1`, [p.source_key, JSON.stringify(recipe)]);
  await pool.query(`UPDATE recipe_proposals SET status = 'approved', decided_at = NOW() WHERE id = $1`, [p.id]);
  console.log('[admin-scrape] approved proposal', p.id, p.source_key, p.field);
  res.json({ ok: true, recipe });
}));

router.post('/proposals/:id/reject', wrap(async (req, res) => {
  await pool.query(`UPDATE recipe_proposals SET status = 'rejected', decided_at = NOW() WHERE id = $1`, [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------------------
// Trainer: snapshot -> pick element -> preview extraction -> generalize
// ---------------------------------------------------------------------------
const snapshots = new Map(); // id -> { url, final_url, html, raw_html, text, title, createdAt }
const SNAPSHOT_TTL_MS = 60 * 60 * 1000;
function gcSnapshots() {
  const now = Date.now();
  for (const [id, s] of snapshots) if (now - s.createdAt > SNAPSHOT_TTL_MS) snapshots.delete(id);
}

router.post('/snapshot', wrap(async (req, res) => {
  const { url, mode = 'http', source_key, html } = req.body || {};
  if (!url) throw bad('url required');
  gcSnapshots();
  const source = source_key ? await loadSource(source_key) : null;
  const fs = fetchSettings(source, source?.recipe);
  const usedMode = mode || fs.mode;
  const snap = await sidecar.snapshot({
    url,
    mode: usedMode,
    proxy: fs.proxy,
    solveCloudflare: usedMode === 'stealth' || fs.solveCloudflare,
    timeoutMs: usedMode === 'http' ? 45000 : 120000,
    html: typeof html === 'string' && html.length > 200 ? html : undefined,
  });
  const id = crypto.randomUUID();
  snapshots.set(id, { ...snap, createdAt: Date.now() });
  console.log('[admin-scrape] snapshot', id, url, snap.status, `${snap.html?.length || 0}b`);
  res.json({ id, url: snap.url, final_url: snap.final_url, status: snap.status, blocked: snap.blocked, block_reason: snap.block_reason, title: snap.title, html: snap.html, text_preview: (snap.text || '').slice(0, 2000) });
}));

router.post('/snapshot/:id/selector', wrap(async (req, res) => {
  const snap = snapshots.get(req.params.id);
  if (!snap) throw notFound('snapshot expired; take a new one');
  const { path } = req.body || {};
  if (!path) throw bad('path required');
  // Use the sanitized HTML: it is the DOM the trainer iframe rendered, so the picker's path resolves here.
  const out = await sidecar.selectorFor({ url: snap.final_url || snap.url, html: snap.html, path });
  // Verify each candidate against the raw page (what production runs see) and report match counts there too.
  for (const c of out.candidates || []) {
    if (!c.sel) continue;
    try {
      const r = await sidecar.extract({ url: snap.final_url || snap.url, html: snap.raw_html || snap.html, fields: { probe: [{ type: c.type, sel: c.sel }] }, adaptive: false });
      c.raw_value = r.fields?.probe?.value || '';
    } catch { c.raw_value = null; }
  }
  res.json(out);
}));

/** Extract the given fields from a snapshot with the sidecar and show normalized values. */
router.post('/snapshot/:id/extract', wrap(async (req, res) => {
  const snap = snapshots.get(req.params.id);
  if (!snap) throw notFound('snapshot expired; take a new one');
  const { fields, source_key = 'trainer', validate } = req.body || {};
  if (!fields || typeof fields !== 'object') throw bad('fields required');
  const errs = validateRecipe({ fields });
  if (errs.length) return res.status(400).json({ error: 'invalid fields', details: errs });
  const out = await sidecar.extract({ url: snap.final_url || snap.url, html: snap.raw_html || snap.html, fields, adaptive: false, sourceKey: source_key });
  const normalized = normalizeListing(out.fields, snap.final_url || snap.url, source_key);
  const validation = validateListing(normalized, validate || {});
  res.json({ fields: out.fields, normalized, validation });
}));

/** LLM: suggest label rules for a snapshot. */
router.post('/snapshot/:id/suggest', wrap(async (req, res) => {
  const snap = snapshots.get(req.params.id);
  if (!snap) throw notFound('snapshot expired; take a new one');
  const st = await llmStatus();
  if (!st.ok) return res.status(503).json({ error: 'LLM unavailable', llm: st });
  const fields = req.body?.fields || ['name', 'asking_price', 'annual_profit', 'annual_revenue', 'location', 'industries', 'years_established', 'broker_name', 'source_id'];
  const suggestions = await suggestFields(snap.text || '', fields);
  res.json({ suggestions, rules: suggestionsToStrategies(suggestions), llm: st });
}));

/** Generalize a draft recipe across several URLs (no DB writes). */
router.post('/generalize', wrap(async (req, res) => {
  const { source_key, recipe, urls } = req.body || {};
  const source = source_key ? await loadSource(source_key) : { source_key: 'trainer', fetch_mode: recipe?.fetch?.mode || 'http', rate_limit_ms: 1000 };
  if (!source) throw notFound('source not found');
  if (!recipe?.fields) throw bad('recipe.fields required');
  const list = (urls || []).filter(Boolean).slice(0, 10);
  if (!list.length) throw bad('urls[] required');
  const rows = [];
  for (const url of list) {
    try {
      const item = await processListing({ url, source, recipe, adaptive: false });
      delete item.text;
      rows.push(item);
    } catch (err) {
      rows.push({ listing_url: url, status: 'failed_fetch', errors: [{ code: 'sidecar', message: err.message }], extracted: {} });
    }
  }
  const fieldKeys = Object.keys(recipe.fields);
  const coverage = {};
  for (const f of fieldKeys) coverage[f] = Math.round((rows.filter((i) => i.extracted?.[f]?.value).length / rows.length) * 100);
  res.json({ items: rows, coverage, ok: rows.filter((i) => i.status === 'ok').length, total: rows.length });
}));

// ---------------------------------------------------------------------------
// Coverage vs Airtable
// ---------------------------------------------------------------------------
router.get('/coverage', wrap(async (req, res) => {
  res.json({ rows: await coverageReport() });
}));

export default router;
