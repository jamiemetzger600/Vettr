#!/usr/bin/env node
/**
 * Seed deal_sources from business_sale_sources_us.csv (repo root) as draft sources.
 * Idempotent: existing rows keep their recipe/status; only descriptive columns refresh.
 *
 *   npm run seed:sources:staging   (DOTENV_CONFIG_PATH=.env.staging node -r dotenv/config ...)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pool from '../src/db/pool.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const csvPath = process.argv[2] || path.resolve(here, '../../business_sale_sources_us.csv');

function parseCsv(text) {
  const rows = [];
  let cur = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { cur.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; cur.push(field); rows.push(cur); cur = []; field = ''; }
    else field += c;
  }
  if (field || cur.length) { cur.push(field); rows.push(cur); }
  const [header, ...body] = rows.filter((r) => r.length > 1);
  const focusIdx = header.findIndex((h) => h.trim() === 'focus');
  return body.map((r) => {
    // Some rows have an unquoted comma inside "focus" (e.g. "SMBs (<$1M, some to $5M)"); fold the overflow back in.
    const extra = r.length - header.length;
    if (extra > 0 && focusIdx >= 0) r.splice(focusIdx, extra + 1, r.slice(focusIdx, focusIdx + extra + 1).join(', '));
    return Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()]));
  });
}

/**
 * Keys match the rows already present in deal_sources from the July 2026 multi-source
 * experiment (e.g. "VR Business Brokers" -> vr_business_brokers, "BizQuest" -> bizquest_direct),
 * so re-seeding updates those rows instead of creating duplicates.
 */
export function slugKey(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (base === 'bizbuysell' || base === 'bizquest') return `${base}_direct`;
  return base.slice(0, 60);
}

const PRIORITY = { Low: 10, 'Low-Medium': 20, Medium: 30, 'Medium-High': 40, High: 50 };

const text = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(text);
let inserted = 0, updated = 0;
for (const r of rows) {
  if (!r.name) continue;
  const key = slugKey(r.name);
  const priority = PRIORITY[r.anti_bot_estimate] ?? 60;
  const res = await pool.query(
    `INSERT INTO deal_sources (source_key, display_name, source_type, base_url, listings_url, coverage, focus, anti_bot_estimate, priority, notes, status, scrape_enabled, scrape_cron, entity_type, fetch_mode)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'draft', false, '0 5 * * *', 'business', $11)
     ON CONFLICT (source_key) DO UPDATE SET
       display_name = EXCLUDED.display_name, source_type = EXCLUDED.source_type, base_url = EXCLUDED.base_url,
       listings_url = CASE WHEN deal_sources.recipe IS NULL THEN EXCLUDED.listings_url ELSE deal_sources.listings_url END, coverage = EXCLUDED.coverage, focus = EXCLUDED.focus,
       anti_bot_estimate = EXCLUDED.anti_bot_estimate, priority = EXCLUDED.priority,
       fetch_mode = CASE WHEN deal_sources.recipe IS NULL THEN EXCLUDED.fetch_mode ELSE deal_sources.fetch_mode END,
       notes = EXCLUDED.notes, updated_at = NOW()
     RETURNING (xmax = 0) AS is_insert`,
    [key, r.name, r.category, r.homepage_url, r.listings_url, r.coverage, r.focus, r.anti_bot_estimate, priority,
     `${r.notes}${r.est_listings ? ` · est. ${r.est_listings} listings` : ''}${r.already_in_vettr === 'yes' ? ' · (extension scraper exists)' : ''}`,
     /High/.test(r.anti_bot_estimate) ? 'stealth' : /Medium/.test(r.anti_bot_estimate) ? 'browser' : 'http']
  );
  if (res.rows[0].is_insert) inserted++; else updated++;
}
console.log(`[seed] deal_sources: ${inserted} inserted, ${updated} updated from ${rows.length} CSV rows`);
await pool.end();
