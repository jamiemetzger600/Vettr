/**
 * Upsert normalized listings into market_deals_staging (always) and, for published
 * sources, market_deals. Mirrors the (source, source_id) + listing_url matching used by
 * airtableScraper.js without modifying that file.
 */

const COLS = [
  'source', 'source_id', 'name', 'description', 'listing_url', 'industries',
  'asking_price', 'annual_revenue', 'annual_profit', 'profit_multiple', 'revenue_multiple',
  'city', 'county', 'state', 'country', 'years_established',
  'remote_relocatable', 'franchise', 'five_plus_years',
  'broker_name', 'broker_company', 'broker_contact', 'broker_email',
];
const STAGING_EXTRA = ['run_id', 'content_hash', 'raw'];

export function normalizeListingUrlKey(url) {
  if (!url || typeof url !== 'string') return null;
  const t = url.trim();
  return t ? t.split('#')[0].trim().toLowerCase() : null;
}

function buildParams(row, extra) {
  const values = COLS.map((c) => (row[c] === undefined ? null : row[c]));
  for (const c of extra) values.push(c === 'raw' ? (row.raw ? JSON.stringify(row.raw) : null) : row[c] ?? null);
  return values;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {'market_deals'|'market_deals_staging'} table
 * @param {object} row normalized row (see normalize.js)
 * @returns {Promise<{id:number,isInsert:boolean,changed:boolean,prevHash:string|null}>}
 */
export async function upsertRow(client, table, row, { runId = null } = {}) {
  if (!row.source || !row.source_id) throw new Error('upsertRow: source and source_id required');
  const isStaging = table === 'market_deals_staging';
  const extra = isStaging ? STAGING_EXTRA : [];
  const cols = [...COLS, ...extra];
  const params = buildParams({ ...row, run_id: runId }, extra);
  const urlKey = normalizeListingUrlKey(row.listing_url);

  // Prior state for change detection
  let prev = null;
  if (isStaging) {
    const r = await client.query(
      `SELECT id, content_hash FROM ${table} WHERE source = $1 AND (source_id = $2 OR ($3::text IS NOT NULL AND listing_url IS NOT NULL AND lower(trim(split_part(listing_url,'#',1))) = $3)) LIMIT 1`,
      [row.source, row.source_id, urlKey]
    );
    prev = r.rows[0] || null;
  }

  const setList = cols.filter((c) => c !== 'source').map((c, i) => `${c} = $${cols.indexOf(c) + 1}`).join(', ');
  let result = null;
  if (urlKey) {
    result = await client.query(
      `UPDATE ${table} SET ${setList}, last_scraped_at = NOW(), is_active = true
       WHERE source = $1 AND listing_url IS NOT NULL AND lower(trim(split_part(listing_url,'#',1))) = $${cols.length + 1}
       RETURNING id, false AS is_insert`,
      [...params, urlKey]
    );
  }
  if (!result?.rows?.length) {
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const updates = cols.filter((c) => c !== 'source' && c !== 'source_id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    result = await client.query(
      `INSERT INTO ${table} (${cols.join(', ')}, last_scraped_at, is_active)
       VALUES (${placeholders}, NOW(), true)
       ON CONFLICT (source, source_id) DO UPDATE SET ${updates}, last_scraped_at = NOW(), is_active = true
       RETURNING id, (xmax = 0) AS is_insert`,
      params
    );
  }
  const ret = result.rows[0];
  const changed = !prev || prev.content_hash !== row.content_hash;
  return { id: ret.id, isInsert: !!ret.is_insert, changed, prevHash: prev?.content_hash || null };
}

/**
 * Deactivate listings for a source that were not seen in this run (dropped from the site).
 * Only rows last scraped before the run started are affected.
 */
export async function deactivateUnseen(client, table, sourceKey, runStartedAt) {
  const r = await client.query(
    `UPDATE ${table} SET is_active = false
     WHERE source = $1 AND is_active = true AND last_scraped_at < $2
     RETURNING id`,
    [sourceKey, runStartedAt]
  );
  return r.rowCount;
}
