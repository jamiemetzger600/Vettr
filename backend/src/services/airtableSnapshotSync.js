import { createHash } from 'node:crypto';
import { dedupeMarketDeals, remountHiddenDealIds } from './marketDealsDedupe.js';

/**
 * Airtable holds one row per posting; Vettr holds one row per business.
 * Each scan groups the full snapshot into businesses, writes one market_deals
 * row per business, and links every Airtable URL to that row in
 * market_deal_source_rows, so the two counts can be reconciled exactly.
 *
 * Airtable record ids change between runs, so the listing URL is the identity.
 */

export const SOURCE_KEY = 'airtable_bizbuysell';

/** Refuse to sync when the shared view payload looks truncated. */
const MIN_SNAPSHOT_ROWS = 1000;

const SCRAPE_CRON_TZ = process.env.AIRTABLE_SCRAPE_CRON_TZ || 'America/Los_Angeles';

/** deal field → market_deals column, for every value Airtable supplies. */
const NUMBER_FIELDS = [
  ['asking_price', 'asking_price'],
  ['annual_revenue', 'annual_revenue'],
  ['annual_profit', 'annual_profit'],
  ['profit_multiple', 'profit_multiple'],
  ['revenue_multiple', 'revenue_multiple'],
  ['years_established', 'years_established'],
];
const TEXT_FIELDS = [
  'name', 'description', 'listing_url', 'city', 'county', 'state', 'country',
  'remote_relocatable', 'franchise', 'five_plus_years',
  'broker_name', 'broker_company', 'broker_contact', 'broker_email',
];
/** Fields recorded in market_deal_changes when they change. */
const TRACKED_FINANCIALS = ['asking_price', 'annual_profit', 'annual_revenue'];
const FINANCIAL_KEYS = ['asking_price', 'annual_profit', 'annual_revenue'];

export function normalizeListingUrlKey(url) {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return trimmed.split('#')[0].trim().toLowerCase();
}

function identityKey(deal) {
  return normalizeListingUrlKey(deal.listing_url)
    || (deal.airtable_record_id ? `rec:${deal.airtable_record_id}` : null);
}

function positiveRound(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function normText(value) {
  const s = String(value ?? '').trim().toLowerCase();
  return s || null;
}

function listingTime(value) {
  if (value == null || value === '') return null;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function financeKey(listing) {
  const parts = FINANCIAL_KEYS.map((k) => positiveRound(listing?.[k]));
  const state = normText(listing?.state);
  if (parts.some((p) => p == null) || !state) return null;
  return `${parts.join('|')}|${state}`;
}

function nameKey(listing) {
  const name = normText(listing?.name);
  const state = normText(listing?.state);
  return name && state ? `${name}|${state}` : null;
}

/** Two known, different cities are two businesses; a blank city matches any. */
function citiesCompatible(a, b) {
  return !a || !b || a === b;
}

function financialsConflict(a, b) {
  return FINANCIAL_KEYS.some((k) => {
    const x = positiveRound(a?.[k]);
    const y = positiveRound(b?.[k]);
    return x != null && y != null && x !== y;
  });
}

/** Same business: equal financials and state, or equal title and state with no differing number. */
export function isSameBusiness(a, b) {
  if (!citiesCompatible(normText(a?.city), normText(b?.city))) return false;
  const fin = financeKey(a);
  if (fin && fin === financeKey(b)) return true;
  const name = nameKey(a);
  return Boolean(name) && name === nameKey(b) && !financialsConflict(a, b);
}

function sameNumber(a, b) {
  const x = a == null || a === '' ? null : Number(a);
  const y = b == null || b === '' ? null : Number(b);
  if (x == null || y == null) return x === y;
  // Multiples are stored rounded, so an exact compare would always differ.
  return Math.abs(x - y) < 0.01;
}

/** True when Airtable holds a value the row does not. Dates are excluded because they move daily. */
export function contentChanged(deal, row) {
  for (const [field, column] of NUMBER_FIELDS) {
    if (!sameNumber(deal[field], row[column])) return true;
  }
  for (const field of TEXT_FIELDS) {
    if ((deal[field] || null) !== (row[field] || null)) return true;
  }
  return JSON.stringify(deal.industries || null) !== JSON.stringify(row.industries || null);
}

function hostIsBizBuySell(url) {
  return /bizbuysell\.com/i.test(String(url || ''));
}

/**
 * Pure plan for one scan. The best-ranked posting of each business becomes its
 * canonical copy; existing rows rank first so a business keeps its row and link.
 */
export function planSnapshotSync(deals, rows, savedRowIds = new Set()) {
  const rowByUrl = new Map();
  for (const row of rows) {
    const key = normalizeListingUrlKey(row.listing_url);
    if (key) rowByUrl.set(key, row);
  }

  const seen = new Set();
  const unique = [];
  let duplicateRows = 0;
  let unidentifiedRows = 0;
  for (const deal of deals) {
    const key = identityKey(deal);
    if (!key) {
      unidentifiedRows += 1;
    } else if (seen.has(key)) {
      duplicateRows += 1;
    } else {
      seen.add(key);
      unique.push({ deal, key, row: rowByUrl.get(key) || null });
    }
  }

  const rank = ({ row }) => {
    if (!row) return 3;
    if (savedRowIds.has(row.id)) return 0;
    return row.is_active ? 1 : 2;
  };
  const byPreference = (a, b) =>
    rank(a) - rank(b)
    || Number(hostIsBizBuySell(b.deal.listing_url)) - Number(hostIsBizBuySell(a.deal.listing_url))
    || (listingTime(a.deal.airtable_added_at) ?? Infinity) - (listingTime(b.deal.airtable_added_at) ?? Infinity)
    || a.key.localeCompare(b.key);

  // Group in URL order, never by database state, so the groups do not change
  // from run to run just because the previous run activated different rows.
  unique.sort((a, b) => a.key.localeCompare(b.key));

  const businesses = [];
  const byFinance = new Map();
  const byName = new Map();
  const addTo = (map, key, business) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(business);
  };
  for (const entry of unique) {
    const { deal } = entry;
    const candidates = [
      ...(byFinance.get(financeKey(deal)) || []),
      ...(byName.get(nameKey(deal)) || []),
    ];
    // Compare with the merged city so a blank-city canonical cannot absorb two cities.
    const match = candidates.find((b) =>
      isSameBusiness({ ...b.canonical, city: b.city }, deal));
    if (match) {
      match.members.push(entry);
      match.city = match.city || normText(deal.city);
    } else {
      const business = {
        canonical: deal,
        city: normText(deal.city),
        members: [entry],
        row: entry.row,
        reused: false,
      };
      businesses.push(business);
      addTo(byFinance, financeKey(deal), business);
      addTo(byName, nameKey(deal), business);
    }
  }
  for (const business of businesses) {
    business.members.sort(byPreference);
    business.canonical = business.members[0].deal;
    business.row = business.members[0].row;
  }

  // A relisted business has a new URL but the same numbers: keep its row, saved deals included.
  const inSnapshot = (row) => {
    const key = normalizeListingUrlKey(row.listing_url);
    return Boolean(key) && seen.has(key);
  };
  const reusable = rows
    .filter((row) => !inSnapshot(row))
    .sort((a, b) =>
      Number(savedRowIds.has(b.id)) - Number(savedRowIds.has(a.id))
      || Number(Boolean(b.is_active)) - Number(Boolean(a.is_active))
      || b.id - a.id);
  const reusableByFinance = new Map();
  const reusableByName = new Map();
  for (const row of reusable) {
    addTo(reusableByFinance, financeKey(row), row);
    addTo(reusableByName, nameKey(row), row);
  }
  const claimed = new Set();
  for (const business of businesses) {
    if (business.row) continue;
    const merged = { ...business.canonical, city: business.city };
    const row = [
      ...(reusableByFinance.get(financeKey(merged)) || []),
      ...(reusableByName.get(nameKey(merged)) || []),
    ].find((r) => !claimed.has(r.id) && isSameBusiness(merged, r));
    if (row) {
      claimed.add(row.id);
      business.row = row;
      business.reused = true;
    }
  }

  const surplus = [];
  const kept = new Set(claimed);
  for (const business of businesses) {
    if (business.row) kept.add(business.row.id);
    for (const member of business.members.slice(1)) {
      if (member.row && (member.row.is_active || savedRowIds.has(member.row.id))) {
        surplus.push({ dupId: member.row.id, keepId: business.row.id, wasActive: member.row.is_active });
      }
    }
  }
  const surplusIds = new Set(surplus.map((s) => s.dupId));
  const absentRowIds = rows
    .filter((row) => row.is_active && !kept.has(row.id) && !surplusIds.has(row.id))
    .map((row) => row.id);

  return { businesses, surplus, absentRowIds, duplicateRows, unidentifiedRows };
}

/** Calendar day from an Airtable date string, before timezone conversion. */
export function listingAddedDay(value) {
  if (value == null || value === '') return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/** Date Added is today or yesterday in the scrape timezone. */
export function isRecentAirtableListing(addedAt, now = new Date()) {
  const day = listingAddedDay(addedAt);
  if (!day) return false;
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SCRAPE_CRON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = fmt.format(now);
  const yesterday = fmt.format(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  return day === today || day === yesterday;
}

/** A short Airtable payload must not be treated as the full list. */
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

function writeParams(deal) {
  return [
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
}

function newSourceId(deal, takenIds) {
  const rec = deal.airtable_record_id ? String(deal.airtable_record_id).trim() : '';
  if (rec && !takenIds.has(rec)) return rec;
  return `url:${createHash('sha1').update(identityKey(deal)).digest('hex').slice(0, 24)}`;
}

/** Apply one validated snapshot atomically, then collapse any exact duplicates. */
export async function applySnapshotSync(pool, deals) {
  const client = await pool.connect();
  let inTx = false;
  try {
    await client.query('BEGIN');
    inTx = true;

    const { rows } = await client.query(
      `SELECT id, source_id, name,
              CASE WHEN is_active THEN description END AS description,
              industries, listing_url, asking_price, annual_revenue, annual_profit,
              profit_multiple, revenue_multiple, city, county, state, country,
              years_established, remote_relocatable, franchise, five_plus_years,
              broker_name, broker_company, broker_contact, broker_email, is_active
       FROM market_deals WHERE source = $1`,
      [SOURCE_KEY]
    );
    const saved = await client.query(
      `SELECT DISTINCT market_deal_id AS id FROM saved_deals WHERE market_deal_id IS NOT NULL`
    );
    const plan = planSnapshotSync(deals, rows, new Set(saved.rows.map((r) => r.id)));
    const takenIds = new Set(rows.map((r) => String(r.source_id)));

    let rawInserted = 0;
    let updated = 0;
    let unchanged = 0;
    let financialChanges = 0;
    let newRowIds = [];

    for (const business of plan.businesses) {
      const deal = business.canonical;
      const row = business.row;
      if (!row) {
        const sourceId = newSourceId(deal, takenIds);
        takenIds.add(sourceId);
        const inserted = await client.query(
          `INSERT INTO market_deals (
            source, source_id, name, description, industries, listing_url,
            asking_price, annual_revenue, annual_profit, profit_multiple, revenue_multiple,
            city, county, state, country,
            years_established, remote_relocatable, franchise, five_plus_years,
            broker_name, broker_company, broker_contact, broker_email,
            source_updated_at, source_added_at, last_scraped_at, is_active
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, NOW(), true
          ) RETURNING id`,
          [SOURCE_KEY, sourceId, ...writeParams(deal)]
        );
        business.rowId = inserted.rows[0].id;
        rawInserted += 1;
        if (isRecentAirtableListing(deal.airtable_added_at)) newRowIds.push(business.rowId);
        continue;
      }

      business.rowId = row.id;
      if (row.is_active && !contentChanged(deal, row)) {
        unchanged += 1;
        continue;
      }

      if (row.is_active) {
        for (const field of TRACKED_FINANCIALS) {
          if (sameNumber(deal[field], row[field])) continue;
          financialChanges += 1;
          await client.query(
            `INSERT INTO market_deal_changes (market_deal_id, source, source_id, field, old_value, new_value)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [row.id, SOURCE_KEY, row.source_id, field, row[field], deal[field] ?? null]
          );
        }
      }
      await client.query(
        `UPDATE market_deals SET
          name = $2, description = $3, industries = $4, listing_url = $5,
          asking_price = $6, annual_revenue = $7, annual_profit = $8,
          profit_multiple = $9, revenue_multiple = $10,
          city = $11, county = $12, state = $13, country = $14,
          years_established = $15, remote_relocatable = $16, franchise = $17, five_plus_years = $18,
          broker_name = $19, broker_company = $20, broker_contact = $21, broker_email = $22,
          source_updated_at = $23, source_added_at = $24,
          last_scraped_at = NOW(), is_active = true
         WHERE id = $1`,
        [row.id, ...writeParams(deal)]
      );
      updated += 1;
    }

    // Unchanged listings still get fresh dates, which keep them out of the stale-listing prune.
    await client.query(
      `UPDATE market_deals md SET
         source_updated_at = v.updated_at,
         source_added_at = v.added_at,
         last_scraped_at = NOW()
       FROM jsonb_to_recordset($1::jsonb) AS v(id int, updated_at timestamp, added_at timestamp)
       WHERE md.id = v.id`,
      [JSON.stringify(plan.businesses.map((b) => ({
        id: b.rowId,
        updated_at: b.canonical.airtable_updated_at || null,
        added_at: b.canonical.airtable_added_at || null,
      })))]
    );

    let merged = 0;
    if (plan.surplus.length > 0) {
      const dupIds = plan.surplus.map((s) => s.dupId);
      const keepIds = plan.surplus.map((s) => s.keepId);
      await remountHiddenDealIds(
        client,
        `SELECT * FROM unnest($1::int[], $2::int[]) AS t(dup_id, keep_id)`,
        [dupIds, keepIds]
      );
      await client.query(
        `UPDATE saved_deals sd SET market_deal_id = t.keep_id
         FROM unnest($1::int[], $2::int[]) AS t(dup_id, keep_id)
         WHERE sd.market_deal_id = t.dup_id`,
        [dupIds, keepIds]
      );
      await client.query(`UPDATE market_deals SET is_active = false WHERE id = ANY($1::int[])`, [dupIds]);
      merged = plan.surplus.filter((s) => s.wasActive).length;
    }

    let absent = 0;
    if (plan.absentRowIds.length > 0) {
      const result = await client.query(
        `UPDATE market_deals SET is_active = false WHERE id = ANY($1::int[])`,
        [plan.absentRowIds]
      );
      absent = result.rowCount ?? 0;
    }

    await client.query(
      `INSERT INTO market_deal_source_rows
         (source, url_key, listing_url, market_deal_id, is_canonical, source_record_id)
       SELECT $1, v.url_key, v.listing_url, v.market_deal_id, v.is_canonical, v.source_record_id
       FROM jsonb_to_recordset($2::jsonb) AS v(
         url_key text, listing_url text, market_deal_id int, is_canonical boolean, source_record_id text
       )
       ON CONFLICT (source, url_key) DO UPDATE SET
         listing_url = EXCLUDED.listing_url,
         market_deal_id = EXCLUDED.market_deal_id,
         is_canonical = EXCLUDED.is_canonical,
         source_record_id = EXCLUDED.source_record_id,
         last_seen_at = NOW()`,
      [SOURCE_KEY, JSON.stringify(plan.businesses.flatMap((b) => b.members.map((m, i) => ({
        url_key: m.key,
        listing_url: m.deal.listing_url || null,
        market_deal_id: b.rowId,
        is_canonical: i === 0,
        source_record_id: m.deal.airtable_record_id || null,
      }))))]
    );
    await client.query(
      `DELETE FROM market_deal_source_rows WHERE source = $1 AND last_seen_at < NOW()`,
      [SOURCE_KEY]
    );

    await client.query('COMMIT');
    inTx = false;

    try {
      await client.query('BEGIN');
      inTx = true;
      await dedupeMarketDeals(client, { source: SOURCE_KEY });
      await client.query('COMMIT');
      inTx = false;
    } catch (dedupeErr) {
      if (inTx) {
        await client.query('ROLLBACK');
        inTx = false;
      }
      console.warn('  Dedupe after scrape failed (sync kept):', dedupeErr.message);
    }

    if (newRowIds.length > 0) {
      const still = await client.query(
        `SELECT id FROM market_deals WHERE id = ANY($1::int[]) AND is_active = true`,
        [newRowIds]
      );
      const alive = new Set(still.rows.map((r) => Number(r.id)));
      newRowIds = newRowIds.filter((id) => alive.has(Number(id)));
    }

    return {
      businesses: plan.businesses.length,
      duplicateRows: plan.duplicateRows,
      unidentifiedRows: plan.unidentifiedRows,
      rawInserted,
      inserted: newRowIds.length,
      newRowIds: newRowIds.slice(0, 400),
      updated,
      unchanged,
      financialChanges,
      merged,
      absent,
    };
  } catch (err) {
    if (inTx) await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Every Airtable row must land on one active business, and every active business on an Airtable row. */
export async function reconcileSnapshot(pool, { fetched, businesses, duplicateRows, unidentifiedRows }) {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM market_deal_source_rows WHERE source = $1) AS linked,
       (SELECT COUNT(*)::int FROM market_deals WHERE source = $1 AND is_active) AS active,
       (SELECT COUNT(*)::int FROM market_deal_source_rows l
          JOIN market_deals md ON md.id = l.market_deal_id
         WHERE l.source = $1 AND NOT md.is_active) AS linked_to_inactive,
       (SELECT COUNT(*)::int FROM market_deals md
         WHERE md.source = $1 AND md.is_active
           AND NOT EXISTS (SELECT 1 FROM market_deal_source_rows l WHERE l.market_deal_id = md.id)
       ) AS active_without_source`,
    [SOURCE_KEY]
  );
  const { linked, active, linked_to_inactive: linkedToInactive, active_without_source: activeWithoutSource } = rows[0];
  const unaccounted = fetched - linked - duplicateRows;
  return {
    airtableRows: fetched,
    linkedRows: linked,
    duplicateUrlRows: duplicateRows,
    unidentifiedRows,
    unaccounted,
    expectedBusinesses: businesses,
    activeBusinesses: active,
    linkedToInactive,
    activeWithoutSource,
    ok: unaccounted === 0 && active === businesses && linkedToInactive === 0 && activeWithoutSource === 0,
  };
}
