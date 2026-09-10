import express from 'express';
import crypto from 'crypto';
import pool from '../db/pool.js';
import { optionalAuth } from '../middleware/auth.js';
import { sanitizeMarketDealRow } from '../lib/guestEntitlements.js';
import { listingDedupeKeySql, listingFingerprintSql } from '../lib/listingFingerprint.js';
import { parseHiddenExclude } from '../lib/hiddenDeals.js';

const router = express.Router();

/** Columns for list rows — full `description` omitted; use detail GET for full text. */
const MARKET_DEALS_LIST_SELECT = `
  id, source, source_id, name,
  LEFT(COALESCE(description, ''), 400) AS description,
  listing_url, industries, asking_price, annual_revenue, annual_profit,
  profit_multiple, revenue_multiple, city, county, state, country,
  years_established, remote_relocatable, franchise, five_plus_years,
  broker_name, broker_company, broker_contact, broker_email,
  source_added_at, source_updated_at, first_seen_at, last_scraped_at, is_active
`.replace(/\s+/g, ' ').trim();

function normalizeEtagPart(raw) {
  let s = String(raw).trim();
  if (s.toLowerCase().startsWith('w/')) s = s.slice(2).trim();
  if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
  return s;
}

function ifNoneMatchSatisfied(header, serverEtag) {
  if (header == null || header === '' || !serverEtag) return false;
  const serverVal = normalizeEtagPart(serverEtag);
  for (const part of String(header).split(',')) {
    const v = normalizeEtagPart(part);
    if (v === '*' || v === serverVal) return true;
  }
  return false;
}

function buildMarketDealsListEtag(total, maxActivity, page, perPage, orderBySql) {
  const maxIso =
    maxActivity instanceof Date && !Number.isNaN(maxActivity.getTime())
      ? maxActivity.toISOString()
      : '';
  const payload = `${total}|${maxIso}|${page}|${perPage}|${orderBySql}`;
  const hash = crypto.createHash('sha256').update(payload).digest('base64url').slice(0, 24);
  return `W/"${hash}"`;
}

const ALLOWED_SORTS = [
  'source_added_at', 'source_updated_at', 'asking_price',
  'annual_revenue', 'annual_profit', 'profit_multiple',
  'revenue_multiple', 'years_established', 'name',
];

/** Build ORDER BY from `sort_spec=col:dir,col:dir` (whitelist only; skips unknown / duplicate columns). */
function buildOrderByFromSortSpec(sortSpec) {
  if (sortSpec == null || typeof sortSpec !== 'string') return null;
  const raw = sortSpec.trim();
  if (!raw) return null;
  const segments = raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
  const parts = [];
  const used = new Set();
  for (const seg of segments) {
    const colon = seg.indexOf(':');
    if (colon <= 0) continue;
    const rawCol = seg.slice(0, colon).trim();
    const rawDir = seg.slice(colon + 1).trim();
    if (!ALLOWED_SORTS.includes(rawCol)) continue;
    if (used.has(rawCol)) continue;
    used.add(rawCol);
    const dir = rawDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
    parts.push(`${rawCol} ${dir} NULLS LAST`);
  }
  return parts.length > 0 ? parts.join(', ') : null;
}

/** Build ORDER BY with optional secondary key (legacy `sort2` / `order2`). */
function buildMarketDealsOrderBy(sort, order, sort2, order2) {
  const col1 = ALLOWED_SORTS.includes(sort) ? sort : 'source_added_at';
  const dir1 = String(order || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const parts = [`${col1} ${dir1} NULLS LAST`];

  if (sort2 && ALLOWED_SORTS.includes(String(sort2))) {
    const col2 = String(sort2);
    if (col2 !== col1) {
      const dir2 = String(order2 || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      parts.push(`${col2} ${dir2} NULLS LAST`);
    }
  }

  return parts.join(', ');
}

const MAX_PER_PAGE = 100;
const DEFAULT_PER_PAGE = 50;

// GET /api/market-deals — server-side paginated, filtered, sorted, searchable
router.get('/', optionalAuth, async (req, res) => {
  try {
    const {
      page = 1,
      per_page = DEFAULT_PER_PAGE,
      search,
      source,
      state,
      min_price,
      max_price,
      min_revenue,
      max_revenue,
      min_profit,
      max_profit,
      industry,
      min_years,
      max_years,
      franchise,
      remote,
      sort = 'source_added_at',
      order = 'desc',
      sort_spec,
      sort2,
      order2,
      exclude_ids,
      exclude_keywords,
      updated_after,
      ids,
      first_seen_after,
      first_seen_before,
    } = req.query;

    const showHidden = req.query.show_hidden === '1' || req.query.show_hidden === 'true';

    const conditions = ['is_active = true'];
    const params = [];
    let idx = 1;

    const restrictIds = ids
      ? String(ids)
          .split(',')
          .map((n) => Number(String(n).trim()))
          .filter((n) => Number.isFinite(n) && n > 0)
          .slice(0, 400)
      : [];
    if (restrictIds.length > 0) {
      conditions.push(`id = ANY($${idx++})`);
      params.push(restrictIds);
    }

    // Text search: comma or & separates AND terms (each must match name, location, or industry).
    if (search && search.trim()) {
      const terms = search
        .trim()
        .split(/\s*[,&]\s*/)
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 8);
      console.log('[market-deals] search terms', { count: terms.length, terms });
      for (const term of terms) {
        conditions.push(`(
          name ILIKE $${idx}
          OR description ILIKE $${idx}
          OR COALESCE(city, '') ILIKE $${idx}
          OR COALESCE(state, '') ILIKE $${idx}
          OR COALESCE(county, '') ILIKE $${idx}
          OR COALESCE(country, '') ILIKE $${idx}
          OR COALESCE(array_to_string(industries, ' '), '') ILIKE $${idx}
          OR COALESCE(remote_relocatable, '') ILIKE $${idx}
        )`);
        params.push(`%${term}%`);
        idx++;
      }
    }

    // Source filter
    if (source) {
      const sources = source.split(',').map(s => s.trim()).filter(Boolean);
      if (sources.length === 1) {
        conditions.push(`source = $${idx++}`);
        params.push(sources[0]);
      } else if (sources.length > 1) {
        conditions.push(`source = ANY($${idx++})`);
        params.push(sources);
      }
    }

    // State filter (comma-separated)
    if (state) {
      const states = state.split(',').map(s => s.trim()).filter(Boolean);
      if (states.length === 1) {
        conditions.push(`state = $${idx++}`);
        params.push(states[0]);
      } else if (states.length > 1) {
        conditions.push(`state = ANY($${idx++})`);
        params.push(states);
      }
    }

    // Price range
    if (min_price) {
      conditions.push(`asking_price >= $${idx++}`);
      params.push(Number(min_price));
    }
    if (max_price) {
      conditions.push(`asking_price <= $${idx++}`);
      params.push(Number(max_price));
    }

    // Revenue range
    if (min_revenue) {
      conditions.push(`annual_revenue >= $${idx++}`);
      params.push(Number(min_revenue));
    }
    if (max_revenue) {
      conditions.push(`annual_revenue <= $${idx++}`);
      params.push(Number(max_revenue));
    }

    // Profit range
    if (min_profit) {
      conditions.push(`annual_profit >= $${idx++}`);
      params.push(Number(min_profit));
    }
    if (max_profit) {
      conditions.push(`annual_profit <= $${idx++}`);
      params.push(Number(max_profit));
    }

    // Industry (match against TEXT[] column)
    if (industry) {
      const industries = industry.split(',').map(s => s.trim()).filter(Boolean);
      if (industries.length === 1) {
        conditions.push(`$${idx++} = ANY(industries)`);
        params.push(industries[0]);
      } else if (industries.length > 1) {
        conditions.push(`industries && $${idx++}`);
        params.push(industries);
      }
    }

    // Years established range
    if (min_years) {
      conditions.push(`years_established >= $${idx++}`);
      params.push(Number(min_years));
    }
    if (max_years) {
      conditions.push(`years_established <= $${idx++}`);
      params.push(Number(max_years));
    }

    // Franchise filter
    if (franchise) {
      conditions.push(`franchise ILIKE $${idx++}`);
      params.push(franchise === 'yes' ? '%Yes%' : '%No%');
    }

    // Remote filter
    if (remote) {
      conditions.push(`remote_relocatable ILIKE $${idx++}`);
      params.push(remote === 'yes' ? '%Yes%' : '%No%');
    }

    // Exclude hidden listings (client exclude_ids + signed-in account list).
    // Fingerprint + URL tokens still match after dedupe deletes the original PK.
    const excludeIdSet = new Set(
      String(exclude_ids || '')
        .split(',')
        .map(Number)
        .filter((n) => !Number.isNaN(n) && n > 0)
    );
    const fingerprintSet = new Set();
    const financeStateSet = new Set();
    const urlSet = new Set();
    if (!showHidden && req.user?.userId) {
      try {
        const hiddenRow = await pool.query(
          'SELECT hidden_deal_ids FROM user_settings WHERE user_id = $1',
          [req.user.userId]
        );
        const parsed = parseHiddenExclude(hiddenRow.rows[0]?.hidden_deal_ids || []);
        parsed.dbIds.forEach((id) => excludeIdSet.add(id));
        (parsed.fingerprints || []).forEach((fp) => fingerprintSet.add(fp));
        (parsed.financeStates || []).forEach((fs) => financeStateSet.add(fs));
        (parsed.urls || []).forEach((url) => urlSet.add(url));
      } catch (err) {
        console.warn('[market-deals] hidden list load failed', err.message);
      }
    }
    const excludeDbIds = [...excludeIdSet];
    if (excludeDbIds.length > 0) {
      conditions.push(`${listingDedupeKeySql()} NOT IN (
        SELECT ${listingDedupeKeySql('h')}
        FROM market_deals h
        WHERE h.id = ANY($${idx++})
      )`);
      params.push(excludeDbIds);
    }
    if (fingerprintSet.size > 0) {
      conditions.push(`(
        ${listingFingerprintSql()} IS NULL
        OR ${listingFingerprintSql()} <> ALL($${idx++}::text[])
      )`);
      params.push([...fingerprintSet]);
    }
    if (financeStateSet.size > 0) {
      conditions.push(`NOT EXISTS (
        SELECT 1
        FROM unnest($${idx++}::text[]) AS fs(token)
        WHERE concat_ws('|',
          ROUND(market_deals.asking_price)::bigint,
          ROUND(market_deals.annual_profit)::bigint,
          ROUND(market_deals.annual_revenue)::bigint,
          lower(btrim(COALESCE(market_deals.state, '')))
        ) = fs.token
      )`);
      params.push([...financeStateSet]);
    }
    if (urlSet.size > 0) {
      conditions.push(`(
        listing_url IS NULL
        OR btrim(listing_url) = ''
        OR lower(trim(split_part(listing_url, '#', 1))) <> ALL($${idx++}::text[])
      )`);
      params.push([...urlSet]);
    }

    // Exclude listings whose name, description, industries, or location fields contain any keyword
    // (case-insensitive substring; aligns with shared/buyBoxMatcher dealPassesExcludeFilter)
    let excludeKeywordList = [];
    if (exclude_keywords && typeof exclude_keywords === 'string') {
      try {
        const parsed = JSON.parse(exclude_keywords);
        if (Array.isArray(parsed)) {
          excludeKeywordList = parsed
            .map((k) => String(k).trim())
            .filter(Boolean)
            .slice(0, 40)
            .map((k) => k.slice(0, 120));
        }
      } catch {
        /* ignore malformed JSON */
      }
    }
    if (excludeKeywordList.length > 0) {
      conditions.push(`NOT EXISTS (
        SELECT 1
        FROM unnest($${idx}::text[]) AS kw
        WHERE length(trim(kw)) > 0
          AND position(lower(trim(kw)) IN lower(concat_ws(' ',
            coalesce(market_deals.name, ''),
            coalesce(market_deals.description, ''),
            coalesce(array_to_string(market_deals.industries, ' '), ''),
            coalesce(market_deals.city, ''),
            coalesce(market_deals.state, ''),
            coalesce(market_deals.county, ''),
            coalesce(market_deals.country, '')
          ))) > 0
      )`);
      params.push(excludeKeywordList);
      idx++;
    }

    // Delta mode
    if (updated_after) {
      const ts = new Date(updated_after);
      if (!Number.isNaN(ts.getTime())) {
        conditions.push(`(source_added_at > $${idx} OR source_updated_at > $${idx})`);
        params.push(ts.toISOString());
        idx++;
      }
    }

    if (first_seen_after) {
      const ts = new Date(first_seen_after);
      if (!Number.isNaN(ts.getTime())) {
        conditions.push(`first_seen_at >= $${idx++}`);
        params.push(ts.toISOString());
      }
    }
    if (first_seen_before) {
      const ts = new Date(first_seen_before);
      if (!Number.isNaN(ts.getTime())) {
        conditions.push(`first_seen_at < $${idx++}`);
        params.push(ts.toISOString());
      }
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const dedupeKeySql = listingDedupeKeySql();
    const preferBizBuySellSql = `CASE WHEN listing_url ILIKE '%bizbuysell.com%' THEN 0 ELSE 1 END`;

    const specSql = buildOrderByFromSortSpec(sort_spec);
    const orderBySql =
      specSql || buildMarketDealsOrderBy(sort, order, sort2, order2);

    const safePage = Math.max(Number(page) || 1, 1);
    const safePerPage = Math.min(Math.max(Number(per_page) || DEFAULT_PER_PAGE, 1), MAX_PER_PAGE);
    const offset = (safePage - 1) * safePerPage;

    const aggResult = await pool.query(
      `SELECT COUNT(DISTINCT ${dedupeKeySql})::int AS total,
              MAX(GREATEST(source_added_at, source_updated_at)) AS max_activity
       FROM market_deals ${where}`,
      params
    );
    const total = Number(aggResult.rows[0]?.total) || 0;
    const maxActivity = aggResult.rows[0]?.max_activity;

    const etag = buildMarketDealsListEtag(total, maxActivity, safePage, safePerPage, orderBySql);
    if (ifNoneMatchSatisfied(req.get('if-none-match'), etag)) {
      res.set('ETag', etag);
      res.set('Cache-Control', 'public, max-age=30');
      return res.status(304).end();
    }

    const limitIdx = params.length + 1;
    const offsetIdx = params.length + 2;
    const pageParams = [...params, safePerPage, offset];
    const result = await pool.query(
      `SELECT ${MARKET_DEALS_LIST_SELECT} FROM (
         SELECT DISTINCT ON (${dedupeKeySql}) ${MARKET_DEALS_LIST_SELECT}
         FROM market_deals ${where}
         ORDER BY ${dedupeKeySql}, ${preferBizBuySellSql}, source_added_at DESC NULLS LAST, id DESC
       ) collapsed
       ORDER BY ${orderBySql}
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      pageParams
    );

    const maxUpdatedAt =
      maxActivity instanceof Date && !Number.isNaN(maxActivity.getTime())
        ? maxActivity.toISOString()
        : null;

    res.set('ETag', etag);
    res.set('Cache-Control', 'public, max-age=30');
    const isAuth = Boolean(req.user);
    res.json({
      deals: result.rows.map((row) => sanitizeMarketDealRow(row, isAuth)),
      pagination: {
        page: safePage,
        per_page: safePerPage,
        total,
        total_pages: Math.ceil(total / safePerPage),
      },
      ...(maxUpdatedAt && { max_updated_at: maxUpdatedAt }),
    });
  } catch (err) {
    console.error('Market deals list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/market-deals/sources — list active sources with deal counts
router.get('/sources', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT source_key, display_name, source_type, scrape_enabled,
              scrape_cron, last_scrape_at, last_scrape_result, deal_count, created_at
       FROM deal_sources ORDER BY created_at`
    );
    res.json({ sources: result.rows });
  } catch (err) {
    console.error('Deal sources error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/market-deals/stats — quick summary for dashboard header
router.get('/stats', async (_req, res) => {
  try {
    const dedupeKeySql = listingDedupeKeySql();
    const result = await pool.query(`
      SELECT
        COUNT(DISTINCT ${dedupeKeySql}) AS total_deals,
        COUNT(DISTINCT ${dedupeKeySql}) FILTER (WHERE source_added_at > NOW() - INTERVAL '24 hours') AS new_today,
        MAX(GREATEST(source_added_at, source_updated_at)) AS newest_deal_at
      FROM market_deals
      WHERE is_active = true
    `);

    const bySource = await pool.query(`
      SELECT source, COUNT(DISTINCT ${dedupeKeySql}) AS count
      FROM market_deals
      WHERE is_active = true
      GROUP BY source
      ORDER BY count DESC
    `);

    const row = result.rows[0];
    res.json({
      total_deals: parseInt(row.total_deals, 10),
      new_today: parseInt(row.new_today, 10),
      newest_deal_at: row.newest_deal_at,
      by_source: bySource.rows,
    });
  } catch (err) {
    console.error('Market deals stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/market-deals/:id — full row (registered after /sources and /stats)
router.get('/:id', optionalAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(404).json({ error: 'Deal not found' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM market_deals WHERE id = $1 AND is_active = true',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    res.set('Cache-Control', 'private, max-age=60');
    res.json(sanitizeMarketDealRow(result.rows[0], Boolean(req.user)));
  } catch (err) {
    console.error('Market deal detail error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
