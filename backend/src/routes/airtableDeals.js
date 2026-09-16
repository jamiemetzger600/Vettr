import express from 'express';
import pool from '../db/pool.js';
import { scrapeAirtable, getScraperStatus } from '../services/airtableScraper.js';
import { requireScrapeSecret } from '../middleware/requireScrapeSecret.js';

const router = express.Router();

// GET /api/airtable-deals — paginated list with optional filters; or delta (updated_after)
router.get('/', async (req, res) => {
  try {
    const {
      limit = 50,
      offset = 0,
      state,
      min_price,
      max_price,
      industry,
      sort = 'airtable_added_at',
      order = 'desc',
      updated_after: updatedAfter,
    } = req.query;

    const conditions = [];
    const params = [];
    let idx = 1;

    if (state) {
      conditions.push(`state = $${idx++}`);
      params.push(state);
    }
    if (min_price) {
      conditions.push(`asking_price >= $${idx++}`);
      params.push(Number(min_price));
    }
    if (max_price) {
      conditions.push(`asking_price <= $${idx++}`);
      params.push(Number(max_price));
    }
    if (industry) {
      conditions.push(`$${idx++} = ANY(industries)`);
      params.push(industry);
    }

    // Delta mode: only rows added or updated after this timestamp (ISO 8601)
    if (updatedAfter) {
      const ts = new Date(updatedAfter);
      if (!Number.isNaN(ts.getTime())) {
        conditions.push(`(airtable_added_at > $${idx} OR airtable_updated_at > $${idx})`);
        params.push(ts.toISOString());
        idx += 1;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Whitelist sortable columns
    const allowedSorts = [
      'airtable_added_at', 'airtable_updated_at', 'asking_price',
      'annual_revenue', 'annual_profit', 'profit_multiple',
      'revenue_multiple', 'years_established', 'name',
    ];
    const sortCol = allowedSorts.includes(sort) ? sort : 'airtable_added_at';
    const sortDir = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    const isDelta = Boolean(updatedAfter);
    const safeLimit = isDelta
      ? Math.min(Math.max(Number(limit) || 500, 1), 2000)
      : Math.min(Math.max(Number(limit) || 50, 1), 500);
    const safeOffset = isDelta ? 0 : Math.max(Number(offset) || 0, 0);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM airtable_deals ${where}`,
      params
    );

    params.push(safeLimit);
    params.push(safeOffset);

    const result = await pool.query(
      `SELECT * FROM airtable_deals ${where}
       ORDER BY ${sortCol} ${sortDir} NULLS LAST
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    const total = parseInt(countResult.rows[0].count, 10);
    let maxUpdatedAt = null;
    if (result.rows.length > 0) {
      const dates = result.rows
        .map((r) => [r.airtable_added_at, r.airtable_updated_at].filter(Boolean))
        .flat()
        .map((d) => new Date(d).getTime());
      if (dates.length) maxUpdatedAt = new Date(Math.max(...dates)).toISOString();
    }

    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      deals: result.rows,
      total,
      limit: safeLimit,
      offset: safeOffset,
      ...(maxUpdatedAt && { maxUpdatedAt }),
    });
  } catch (err) {
    console.error('Airtable deals list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/airtable-deals/status — scraper health
router.get('/status', (_req, res) => {
  res.json(getScraperStatus());
});

// POST /api/airtable-deals/scrape — kick off a scrape without waiting (Worker/GitHub timeout)
router.post('/scrape', requireScrapeSecret, (_req, res) => {
  const status = getScraperStatus();
  if (status.isRunning) {
    res.json({ status: 'skipped', message: 'Scrape already in progress', ...status });
    return;
  }
  scrapeAirtable().catch(() => {});
  res.json({ status: 'started', ts: new Date().toISOString() });
});

export default router;
