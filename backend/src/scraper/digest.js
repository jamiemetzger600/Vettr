/**
 * Daily "Scrape Health" digest email for admins.
 */
import pool from '../db/pool.js';
import { findStaleSources, notifyAdmins, THRESHOLDS } from './health.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export async function buildHealthDigest() {
  const sources = await pool.query(
    `SELECT s.source_key, s.display_name, s.status, s.published, s.health, s.deal_count, s.last_scrape_at, s.last_scrape_result
     FROM deal_sources s WHERE s.recipe IS NOT NULL ORDER BY s.status, s.priority, s.display_name`
  );
  const runs = await pool.query(
    `SELECT source_key, status, discovered, valid, inserted, updated, failed, blocked, finished_at
     FROM scrape_runs WHERE finished_at > NOW() - INTERVAL '24 hours' AND trigger IN ('cron','manual') ORDER BY finished_at DESC`
  );
  const alerts = await pool.query(
    `SELECT source_key, kind, severity, message, created_at FROM scrape_alerts WHERE acknowledged_at IS NULL ORDER BY created_at DESC LIMIT 30`
  );
  const proposals = await pool.query(`SELECT COUNT(*)::int AS n FROM recipe_proposals WHERE status = 'pending'`);
  const stale = await findStaleSources(THRESHOLDS.staleDays);
  return { sources: sources.rows, runs: runs.rows, alerts: alerts.rows, pendingProposals: proposals.rows[0]?.n || 0, stale };
}

export function healthDigestHtml(d) {
  const base = process.env.ADMIN_APP_URL || process.env.WEB_APP_URL || 'http://localhost:5175';
  const runRows = d.runs.map((r) => `<tr>
    <td style="padding:4px 8px">${esc(r.source_key)}</td><td style="padding:4px 8px">${esc(r.status)}</td>
    <td style="padding:4px 8px;text-align:right">${r.discovered}</td><td style="padding:4px 8px;text-align:right">${r.valid}</td>
    <td style="padding:4px 8px;text-align:right">${r.inserted}/${r.updated}</td><td style="padding:4px 8px;text-align:right">${r.failed}/${r.blocked}</td></tr>`).join('');
  const alertRows = d.alerts.map((a) => `<li><strong>${esc(a.source_key)}</strong> · ${esc(a.kind)}: ${esc(a.message)}</li>`).join('');
  const staleRows = d.stale.map((s) => `<li>${esc(s.display_name || s.source_key)} — no new listings in ${THRESHOLDS.staleDays} days</li>`).join('');
  const paused = d.sources.filter((s) => s.status === 'paused');
  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:720px">
    <h2 style="margin:0 0 4px">Vettr scrape health</h2>
    <p style="margin:0 0 12px;color:#555">${d.sources.filter((s) => s.status === 'active').length} active · ${paused.length} paused · ${d.alerts.length} open alerts · ${d.pendingProposals} pending repair proposals</p>
    ${paused.length ? `<p><strong>Paused:</strong> ${paused.map((p) => esc(p.display_name || p.source_key)).join(', ')}</p>` : ''}
    <h3 style="margin:16px 0 6px">Runs (last 24h)</h3>
    ${runRows ? `<table style="border-collapse:collapse;font-size:13px"><tr style="color:#555"><th align="left" style="padding:4px 8px">Source</th><th align="left" style="padding:4px 8px">Status</th><th style="padding:4px 8px">Found</th><th style="padding:4px 8px">Valid</th><th style="padding:4px 8px">New/Upd</th><th style="padding:4px 8px">Fail/Block</th></tr>${runRows}</table>` : '<p style="color:#777">No runs.</p>'}
    <h3 style="margin:16px 0 6px">Open alerts</h3>${alertRows ? `<ul>${alertRows}</ul>` : '<p style="color:#777">None.</p>'}
    <h3 style="margin:16px 0 6px">Stale sources</h3>${staleRows ? `<ul>${staleRows}</ul>` : '<p style="color:#777">None.</p>'}
    <p style="margin-top:16px"><a href="${esc(base)}/admin/sources/health">Open scrape health</a></p>
  </div>`;
}

export async function runDailyHealthDigest() {
  const d = await buildHealthDigest();
  if (!d.sources.length) { console.log('[digest] no recipe sources; skipping health digest'); return null; }
  for (const s of d.stale) {
    await pool.query(
      `INSERT INTO scrape_alerts (source_key, kind, severity, message, details)
       SELECT $1, 'stale', 'warn', $2, '{}'::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM scrape_alerts WHERE source_key = $1 AND kind = 'stale' AND acknowledged_at IS NULL)`,
      [s.source_key, `No new listings in ${THRESHOLDS.staleDays} days`]
    );
  }
  const subject = `[Vettr scrape] Daily health: ${d.alerts.length} alerts, ${d.runs.length} runs`;
  const text = `${d.alerts.length} open alerts; ${d.runs.length} runs in the last 24h; ${d.stale.length} stale sources.`;
  return notifyAdmins({ subject, html: healthDigestHtml(d), text });
}
