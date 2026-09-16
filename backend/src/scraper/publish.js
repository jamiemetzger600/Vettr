/**
 * Promote a source's staged listings into the live market_deals pool.
 */
import pool from '../db/pool.js';
import { upsertRow } from './upsert.js';

export async function publishSource(sourceKey) {
  const client = await pool.connect();
  let copied = 0, inserted = 0;
  try {
    const rows = await client.query(`SELECT * FROM market_deals_staging WHERE source = $1 AND is_active = true`, [sourceKey]);
    await client.query('BEGIN');
    for (const row of rows.rows) {
      const r = await upsertRow(client, 'market_deals', row);
      copied++;
      if (r.isInsert) inserted++;
    }
    await client.query(`UPDATE market_deals_staging SET published_at = NOW() WHERE source = $1 AND is_active = true`, [sourceKey]);
    await client.query(
      `UPDATE deal_sources SET published = true, published_at = COALESCE(published_at, NOW()), status = CASE WHEN status = 'draft' THEN 'active' ELSE status END, updated_at = NOW()
       WHERE source_key = $1`,
      [sourceKey]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  console.log(`[publish] ${sourceKey}: copied ${copied} (${inserted} new) into market_deals`);
  return { copied, inserted };
}

/** Stop writing to the pool; optionally deactivate what was already published. */
export async function unpublishSource(sourceKey, { removeFromPool = false } = {}) {
  let deactivated = 0;
  if (removeFromPool) {
    const r = await pool.query(`UPDATE market_deals SET is_active = false WHERE source = $1 AND is_active = true`, [sourceKey]);
    deactivated = r.rowCount;
  }
  await pool.query(`UPDATE deal_sources SET published = false, updated_at = NOW() WHERE source_key = $1`, [sourceKey]);
  console.log(`[publish] ${sourceKey}: unpublished (deactivated ${deactivated})`);
  return { deactivated };
}

/** Compare staged vs live pool for the coverage screen. */
export async function coverageReport() {
  const r = await pool.query(`
    WITH staged AS (
      SELECT source, COUNT(*) FILTER (WHERE is_active) AS active, COUNT(*) AS total,
             COUNT(*) FILTER (WHERE is_active AND asking_price IS NOT NULL) AS with_price,
             COUNT(*) FILTER (WHERE is_active AND annual_profit IS NOT NULL) AS with_profit
      FROM market_deals_staging GROUP BY source
    ), live AS (
      SELECT source, COUNT(*) FILTER (WHERE is_active) AS active, COUNT(*) AS total FROM market_deals GROUP BY source
    ), overlap AS (
      SELECT s.source, COUNT(*) AS n FROM market_deals_staging s
      JOIN market_deals m ON m.listing_url IS NOT NULL AND s.listing_url IS NOT NULL
        AND lower(trim(split_part(m.listing_url,'#',1))) = lower(trim(split_part(s.listing_url,'#',1))) AND m.source <> s.source
      WHERE s.is_active GROUP BY s.source
    )
    SELECT d.source_key, d.display_name, d.status, d.published,
           COALESCE(st.active,0)::int AS staged_active, COALESCE(st.with_price,0)::int AS staged_with_price, COALESCE(st.with_profit,0)::int AS staged_with_profit,
           COALESCE(l.active,0)::int AS live_active, COALESCE(o.n,0)::int AS overlap_other_sources
    FROM deal_sources d
    LEFT JOIN staged st ON st.source = d.source_key
    LEFT JOIN live l ON l.source = d.source_key
    LEFT JOIN overlap o ON o.source = d.source_key
    WHERE d.recipe IS NOT NULL OR l.total > 0
    ORDER BY d.published DESC, staged_active DESC, d.display_name`);
  return r.rows;
}
