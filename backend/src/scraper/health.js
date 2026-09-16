/**
 * Per-source health: compare a finished run against the source's rolling baseline,
 * raise scrape_alerts on breaches, auto-pause blocked sources, and notify admins.
 */
import pool from '../db/pool.js';
import { getAdminEmails } from '../middleware/requireAdmin.js';
import { deliverUserEmail } from '../services/googleGmailService.js';
import { sendEmail, isSmtpConfigured } from '../services/emailService.js';
import { sendPushToUser } from '../services/pushService.js';

export const THRESHOLDS = {
  blockedItemsToPause: 3,
  discoveredDropRatio: 0.5,       // discovered < 50% of baseline median
  coverageDropPoints: 20,         // price/profit coverage down > 20 points
  validationFailRatio: 0.25,
  staleDays: 7,
};

function median(nums) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Baseline = medians over the last 7 days of successful runs (excluding the given run). */
export async function computeBaseline(sourceKey, excludeRunId = null) {
  const r = await pool.query(
    `SELECT discovered, valid, field_coverage FROM scrape_runs
     WHERE source_key = $1 AND status IN ('success','partial') AND trigger IN ('cron','manual')
       AND finished_at > NOW() - INTERVAL '7 days' AND ($2::int IS NULL OR id <> $2)
     ORDER BY finished_at DESC LIMIT 14`,
    [sourceKey, excludeRunId]
  );
  const rows = r.rows;
  const cov = (f) => median(rows.map((x) => Number(x.field_coverage?.[f])).filter((n) => Number.isFinite(n)));
  return {
    runs: rows.length,
    discovered: median(rows.map((x) => Number(x.discovered))),
    valid: median(rows.map((x) => Number(x.valid))),
    coverage: {
      asking_price: cov('asking_price'),
      annual_profit: cov('annual_profit'),
      annual_revenue: cov('annual_revenue'),
      name: cov('name'),
    },
  };
}

/**
 * Evaluate a finished run. Returns { score, breaches:[{kind,severity,message,details}], paused }.
 */
export async function evaluateRun(run, source) {
  const baseline = await computeBaseline(run.source_key, run.id);
  const breaches = [];
  const cov = run.field_coverage || {};

  if (run.status === 'failed') {
    breaches.push({ kind: 'run_failed', severity: 'error', message: `Run #${run.id} failed: ${run.error || 'unknown error'}` });
  }
  if ((run.blocked || 0) >= THRESHOLDS.blockedItemsToPause) {
    breaches.push({ kind: 'blocked', severity: 'error', message: `${run.blocked} blocked responses (403/429/captcha). Source auto-paused.`, details: { blocked: run.blocked } });
  }
  if (baseline.discovered && run.discovered < baseline.discovered * THRESHOLDS.discoveredDropRatio && run.status !== 'failed') {
    breaches.push({ kind: 'discovered_drop', severity: 'warn', message: `Discovered ${run.discovered} listings vs baseline ${baseline.discovered}`, details: { discovered: run.discovered, baseline: baseline.discovered } });
  }
  for (const f of ['asking_price', 'annual_profit']) {
    const base = baseline.coverage?.[f];
    const now = Number(cov[f]);
    if (Number.isFinite(base) && Number.isFinite(now) && base - now > THRESHOLDS.coverageDropPoints) {
      breaches.push({ kind: 'coverage_drop', severity: 'warn', message: `${f} coverage ${now}% vs baseline ${base}%`, details: { field: f, now, baseline: base } });
    }
  }
  const attempted = (run.fetched || 0);
  if (attempted >= 10 && (run.failed || 0) / attempted > THRESHOLDS.validationFailRatio) {
    breaches.push({ kind: 'validation_failures', severity: 'warn', message: `${run.failed}/${attempted} items failed extraction or validation`, details: { failed: run.failed, attempted } });
  }

  // Score: 100 minus penalties
  let score = 100;
  for (const b of breaches) score -= b.severity === 'error' ? 40 : 15;
  if (attempted) score -= Math.round(((run.failed || 0) / attempted) * 30);
  score = Math.max(0, Math.min(100, score));

  const paused = breaches.some((b) => b.kind === 'blocked');
  return { score, breaches, baseline, paused };
}

export async function recordAlerts(run, breaches) {
  const ids = [];
  for (const b of breaches) {
    const r = await pool.query(
      `INSERT INTO scrape_alerts (source_key, run_id, kind, severity, message, details) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [run.source_key, run.id, b.kind, b.severity, b.message, JSON.stringify(b.details || {})]
    );
    ids.push(r.rows[0].id);
  }
  return ids;
}

/** Sources that produced no new listings in N days (checked by the daily digest). */
export async function findStaleSources(days = THRESHOLDS.staleDays) {
  const r = await pool.query(
    `SELECT s.source_key, s.display_name, MAX(r.finished_at) AS last_run,
            COALESCE(SUM(r.inserted) FILTER (WHERE r.finished_at > NOW() - ($1 || ' days')::interval), 0) AS recent_inserts
     FROM deal_sources s LEFT JOIN scrape_runs r ON r.source_key = s.source_key
     WHERE s.status = 'active' AND s.recipe IS NOT NULL
     GROUP BY s.source_key, s.display_name
     HAVING COALESCE(SUM(r.inserted) FILTER (WHERE r.finished_at > NOW() - ($1 || ' days')::interval), 0) = 0`,
    [String(days)]
  );
  return r.rows;
}

async function adminUserIds() {
  const emails = getAdminEmails();
  if (!emails.length) return [];
  const r = await pool.query(`SELECT id, email FROM users WHERE lower(email) = ANY($1)`, [emails]);
  return r.rows;
}

/** Email + push admins about alerts. Never throws. */
export async function notifyAdmins({ subject, html, text, alertIds = [] }) {
  const result = { emailed: 0, pushed: 0, errors: [] };
  try {
    const admins = await adminUserIds();
    const emails = getAdminEmails();
    const targets = emails.length ? emails : [];
    for (const email of targets) {
      const admin = admins.find((a) => a.email.toLowerCase() === email);
      let sent = false;
      try {
        if (admin) {
          const mail = await deliverUserEmail(admin.id, { to: email, subject, html, text });
          sent = Boolean(mail?.sent);
        }
        if (!sent && isSmtpConfigured()) {
          await sendEmail({ to: email, subject, html });
          sent = true;
        }
      } catch (err) {
        result.errors.push(`email ${email}: ${err.message}`);
      }
      if (sent) result.emailed++;
      if (admin) {
        try {
          await sendPushToUser(admin.id, { title: subject, body: text?.slice(0, 160) || 'Scrape alert', url: '/admin/sources/health', tag: 'scrape-alert' });
          result.pushed++;
        } catch (err) {
          result.errors.push(`push ${email}: ${err.message}`);
        }
      }
    }
    if (alertIds.length) {
      await pool.query(`UPDATE scrape_alerts SET notified_at = NOW() WHERE id = ANY($1)`, [alertIds]);
    }
  } catch (err) {
    result.errors.push(err.message);
  }
  if (result.errors.length) console.warn('[health] notify errors:', result.errors);
  console.log('[health] notified admins', { emailed: result.emailed, pushed: result.pushed });
  return result;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function alertEmailHtml(source, run, breaches, score) {
  const rows = breaches.map((b) => `<li><strong>${esc(b.kind)}</strong> (${esc(b.severity)}): ${esc(b.message)}</li>`).join('');
  return `
  <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;max-width:640px">
    <h2 style="margin:0 0 8px">Scrape alert: ${esc(source.display_name || source.source_key)}</h2>
    <p style="margin:0 0 12px;color:#555">Run #${run.id} · status <strong>${esc(run.status)}</strong> · health score <strong>${score}</strong></p>
    <ul>${rows}</ul>
    <table style="border-collapse:collapse;font-size:13px;margin-top:8px">
      <tr><td style="padding:2px 12px 2px 0;color:#555">Discovered</td><td>${run.discovered}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#555">Fetched</td><td>${run.fetched}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#555">Valid</td><td>${run.valid}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#555">Inserted / Updated</td><td>${run.inserted} / ${run.updated}</td></tr>
      <tr><td style="padding:2px 12px 2px 0;color:#555">Failed / Blocked</td><td>${run.failed} / ${run.blocked}</td></tr>
    </table>
    <p style="margin-top:16px"><a href="${esc(process.env.ADMIN_APP_URL || process.env.WEB_APP_URL || 'http://localhost:5175')}/admin/sources/${esc(source.source_key)}">Open source in admin</a></p>
  </div>`;
}

/**
 * Called by the engine after a run finishes. Stores health on the run + source,
 * raises alerts, pauses the source if blocked, notifies admins.
 */
export async function afterRun(runId) {
  const r = await pool.query(`SELECT * FROM scrape_runs WHERE id = $1`, [runId]);
  const run = r.rows[0];
  if (!run) return null;
  if (run.trigger === 'test' || run.trigger === 'trainer') return null;
  const s = await pool.query(`SELECT * FROM deal_sources WHERE source_key = $1`, [run.source_key]);
  const source = s.rows[0];
  if (!source) return null;

  const { score, breaches, baseline, paused } = await evaluateRun(run, source);
  const health = { score, baseline, breaches: breaches.map((b) => b.kind), evaluated_at: new Date().toISOString() };
  await pool.query(`UPDATE scrape_runs SET health = $2 WHERE id = $1`, [runId, JSON.stringify(health)]);
  await pool.query(
    `UPDATE deal_sources SET health = $2, updated_at = NOW()${paused ? `, status = 'paused', paused_reason = $3` : ''} WHERE source_key = $1`,
    paused ? [run.source_key, JSON.stringify(health), `Auto-paused after ${run.blocked} blocked responses in run #${run.id}`]
           : [run.source_key, JSON.stringify(health)]
  );
  if (breaches.length) {
    const ids = await recordAlerts(run, breaches);
    const subject = `[Vettr scrape] ${source.display_name || source.source_key}: ${breaches.map((b) => b.kind).join(', ')}`;
    const text = breaches.map((b) => `${b.kind}: ${b.message}`).join('\n');
    await notifyAdmins({ subject, html: alertEmailHtml(source, run, breaches, score), text, alertIds: ids });
  }
  console.log(`[health] ${run.source_key} run #${runId} score=${score} breaches=${breaches.length}${paused ? ' PAUSED' : ''}`);
  return health;
}
