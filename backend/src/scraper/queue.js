import pool from '../db/pool.js';

/**
 * Enqueue a scrape run for a source. If a run is already queued/running for the
 * source, returns that run instead (idempotent).
 * @param {string} sourceKey
 * @param {'manual'|'cron'|'test'|'trainer'} trigger
 * @param {object} options { maxUrls?, urls?, limit?, dryRun?, recipe? (override for tests) }
 */
export async function enqueueRun(sourceKey, trigger = 'manual', options = {}) {
  if (trigger !== 'test' && trigger !== 'trainer') {
    const existing = await pool.query(
      `SELECT * FROM scrape_runs WHERE source_key = $1 AND status IN ('queued','running') ORDER BY queued_at LIMIT 1`,
      [sourceKey]
    );
    if (existing.rows[0]) return { run: existing.rows[0], reused: true };
  }
  const r = await pool.query(
    `INSERT INTO scrape_runs (source_key, status, trigger, options) VALUES ($1, 'queued', $2, $3) RETURNING *`,
    [sourceKey, trigger, JSON.stringify(options || {})]
  );
  console.log(`[queue] enqueued run ${r.rows[0].id} for ${sourceKey} (${trigger})`);
  return { run: r.rows[0], reused: false };
}

/** Atomically claim the oldest queued run. Returns null when the queue is empty. */
export async function claimNextRun() {
  const r = await pool.query(
    `UPDATE scrape_runs SET status = 'running', started_at = NOW()
     WHERE id = (SELECT id FROM scrape_runs WHERE status = 'queued' ORDER BY queued_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING *`
  );
  return r.rows[0] || null;
}

/** Runs stuck in 'running' (worker crash) get failed so the source can run again. */
export async function failStaleRuns(maxAgeMinutes = 180) {
  const r = await pool.query(
    `UPDATE scrape_runs SET status = 'failed', finished_at = NOW(), error = COALESCE(error, 'worker restarted while running')
     WHERE status = 'running' AND started_at < NOW() - ($1 || ' minutes')::interval RETURNING id, source_key`,
    [String(maxAgeMinutes)]
  );
  if (r.rowCount) console.warn('[queue] failed stale runs:', r.rows.map((x) => `${x.id}:${x.source_key}`).join(', '));
  return r.rowCount;
}

export async function cancelRun(runId) {
  const r = await pool.query(
    `UPDATE scrape_runs SET status = 'cancelled', finished_at = NOW() WHERE id = $1 AND status IN ('queued','running') RETURNING id`,
    [runId]
  );
  return r.rowCount > 0;
}

export async function isCancelled(runId) {
  const r = await pool.query(`SELECT status FROM scrape_runs WHERE id = $1`, [runId]);
  return r.rows[0]?.status === 'cancelled';
}
