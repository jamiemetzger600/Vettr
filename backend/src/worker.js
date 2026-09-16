/**
 * Scraper worker: claims queued scrape_runs one at a time and executes them,
 * and enqueues cron runs for active sources. Runs as its own process so no
 * browser/scrape work happens inside the API.
 *
 *   npm run worker            (uses backend/.env)
 *   npm run worker:staging    (preloads backend/.env.staging via -r dotenv/config, then .env for the rest)
 */
import dotenv from 'dotenv';
import cron from 'node-cron';
import pool from './db/pool.js';
import { claimNextRun, enqueueRun, failStaleRuns } from './scraper/queue.js';
import { executeRun } from './scraper/engine.js';
import * as sidecar from './scraper/sidecar.js';
import { runDailyHealthDigest } from './scraper/digest.js';

dotenv.config();

const POLL_MS = Number(process.env.WORKER_POLL_MS) || 3000;
const SCHEDULE_SYNC_MS = 5 * 60 * 1000;
const TZ = process.env.SCRAPE_CRON_TZ || 'America/Los_Angeles';

const tasks = new Map(); // sourceKey -> { expr, task }
let busy = false;
let stopping = false;

async function syncSchedules() {
  const r = await pool.query(`SELECT source_key, scrape_cron FROM deal_sources WHERE status = 'active' AND recipe IS NOT NULL AND scrape_enabled = true AND scrape_cron IS NOT NULL`);
  const wanted = new Map(r.rows.map((x) => [x.source_key, x.scrape_cron]));
  for (const [key, entry] of tasks) {
    if (!wanted.has(key) || wanted.get(key) !== entry.expr) { entry.task.stop(); tasks.delete(key); console.log(`[worker] unscheduled ${key}`); }
  }
  for (const [key, expr] of wanted) {
    if (tasks.has(key)) continue;
    if (!cron.validate(expr)) { console.warn(`[worker] invalid cron for ${key}: ${expr}`); continue; }
    const task = cron.schedule(expr, async () => {
      try { const { run, reused } = await enqueueRun(key, 'cron'); console.log(`[worker] cron enqueued ${key} run ${run.id}${reused ? ' (reused)' : ''}`); }
      catch (err) { console.error(`[worker] cron enqueue failed for ${key}:`, err.message); }
    }, { timezone: TZ });
    tasks.set(key, { expr, task });
    console.log(`[worker] scheduled ${key} (${expr} ${TZ})`);
  }
}

async function tick() {
  if (busy || stopping) return;
  busy = true;
  try {
    const run = await claimNextRun();
    if (run) {
      console.log(`[worker] executing run ${run.id} (${run.source_key}, ${run.trigger})`);
      const t0 = Date.now();
      const res = await executeRun(run);
      console.log(`[worker] run ${run.id} ${res.status} in ${Math.round((Date.now() - t0) / 1000)}s`, res.counters);
    }
  } catch (err) {
    console.error('[worker] tick error:', err);
  } finally {
    busy = false;
  }
}

async function main() {
  console.log('[worker] starting', { poll: POLL_MS, tz: TZ, sidecar: sidecar.SIDECAR_URL, db: (process.env.DATABASE_URL || '').replace(/\/\/.*@/, '//***@') });
  const h = await sidecar.health();
  console.log('[worker] sidecar health:', h);
  await failStaleRuns();
  await syncSchedules();
  setInterval(() => syncSchedules().catch((e) => console.error('[worker] schedule sync failed:', e.message)), SCHEDULE_SYNC_MS);
  // Daily scrape-health digest to admins
  cron.schedule(process.env.SCRAPE_DIGEST_CRON || '30 7 * * *', () => runDailyHealthDigest().catch((e) => console.error('[worker] digest failed:', e.message)), { timezone: TZ });
  setInterval(tick, POLL_MS);
  tick();
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { stopping = true; console.log(`[worker] ${sig} received; finishing current run`); setTimeout(() => process.exit(0), busy ? 30000 : 200); });
}

main().catch((err) => { console.error('[worker] fatal:', err); process.exit(1); });
