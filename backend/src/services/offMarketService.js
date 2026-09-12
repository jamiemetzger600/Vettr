import pool from '../db/pool.js';
import { httpError } from '../lib/httpError.js';
import { parseProspectCsv, normalizeEmail, DEFAULT_SEQUENCE_STEPS } from '../lib/offMarketCsv.js';

const CAMPAIGN_STATUSES = new Set(['draft', 'active', 'paused', 'archived']);
const PROSPECT_STATUSES = new Set([
  'new', 'researched', 'queued', 'contacted', 'replied', 'bounced',
  'interested', 'unsubscribed', 'skipped', 'promoted'
]);

export async function requireCampaign(userId, campaignId) {
  const result = await pool.query(
    `SELECT * FROM off_market_campaigns WHERE id = $1 AND user_id = $2`,
    [campaignId, userId]
  );
  if (!result.rows[0]) throw httpError(404, 'Campaign not found');
  return result.rows[0];
}

export async function listCampaigns(userId) {
  const result = await pool.query(
    `SELECT c.*,
            (SELECT COUNT(*)::int FROM off_market_prospects p WHERE p.campaign_id = c.id) AS prospect_count,
            (SELECT COUNT(*)::int FROM off_market_messages m WHERE m.campaign_id = c.id AND m.status = 'sent') AS sent_count,
            (SELECT COUNT(*)::int FROM off_market_prospects p WHERE p.campaign_id = c.id AND p.status = 'replied') AS replied_count
     FROM off_market_campaigns c
     WHERE c.user_id = $1
     ORDER BY c.updated_at DESC, c.id DESC`,
    [userId]
  );
  return result.rows;
}

export async function createCampaign(userId, body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw httpError(400, 'Campaign name is required');
  const steps = Array.isArray(body.steps) && body.steps.length ? body.steps : DEFAULT_SEQUENCE_STEPS;
  const seq = await pool.query(
    `INSERT INTO off_market_sequences (user_id, name, steps)
     VALUES ($1, $2, $3::jsonb)
     RETURNING id`,
    [userId, `${name} sequence`, JSON.stringify(steps)]
  );
  const cap = Number(body.dailySendCap);
  const delay = Number(body.sendDelaySec);
  const result = await pool.query(
    `INSERT INTO off_market_campaigns (
       user_id, team_id, name, vertical, geography, brief, status,
       daily_send_cap, send_delay_sec, auto_promote_on_interested, sequence_id
     ) VALUES ($1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10)
     RETURNING *`,
    [
      userId,
      body.teamId ? Number(body.teamId) : null,
      name,
      String(body.vertical || '').trim() || null,
      String(body.geography || '').trim() || null,
      String(body.brief || '').trim() || null,
      Number.isFinite(cap) && cap > 0 ? Math.min(200, Math.trunc(cap)) : 50,
      Number.isFinite(delay) && delay >= 0 ? Math.min(3600, Math.trunc(delay)) : 90,
      Boolean(body.autoPromoteOnInterested),
      seq.rows[0].id
    ]
  );
  console.log('[off-market] campaign created', { userId, campaignId: result.rows[0].id });
  return result.rows[0];
}

export async function updateCampaign(userId, campaignId, patch = {}) {
  const existing = await requireCampaign(userId, campaignId);
  const status = patch.status != null ? String(patch.status) : existing.status;
  if (!CAMPAIGN_STATUSES.has(status)) throw httpError(400, 'Invalid campaign status');
  const cap = patch.dailySendCap != null ? Number(patch.dailySendCap) : existing.daily_send_cap;
  const delay = patch.sendDelaySec != null ? Number(patch.sendDelaySec) : existing.send_delay_sec;
  const result = await pool.query(
    `UPDATE off_market_campaigns SET
       name = COALESCE($1, name),
       vertical = COALESCE($2, vertical),
       geography = COALESCE($3, geography),
       brief = COALESCE($4, brief),
       status = $5,
       daily_send_cap = $6,
       send_delay_sec = $7,
       auto_promote_on_interested = COALESCE($8, auto_promote_on_interested),
       updated_at = NOW()
     WHERE id = $9 AND user_id = $10
     RETURNING *`,
    [
      patch.name != null ? String(patch.name).trim() : null,
      patch.vertical !== undefined ? (String(patch.vertical).trim() || null) : null,
      patch.geography !== undefined ? (String(patch.geography).trim() || null) : null,
      patch.brief !== undefined ? (String(patch.brief).trim() || null) : null,
      status,
      Number.isFinite(cap) && cap > 0 ? Math.min(200, Math.trunc(cap)) : existing.daily_send_cap,
      Number.isFinite(delay) && delay >= 0 ? Math.min(3600, Math.trunc(delay)) : existing.send_delay_sec,
      patch.autoPromoteOnInterested !== undefined ? Boolean(patch.autoPromoteOnInterested) : null,
      campaignId,
      userId
    ]
  );
  console.log('[off-market] campaign updated', { userId, campaignId, status: result.rows[0].status });
  return result.rows[0];
}

export async function getSequence(userId, sequenceId) {
  const result = await pool.query(
    `SELECT * FROM off_market_sequences WHERE id = $1 AND user_id = $2`,
    [sequenceId, userId]
  );
  if (!result.rows[0]) throw httpError(404, 'Sequence not found');
  return result.rows[0];
}

export async function getCampaignSequence(userId, campaignId) {
  const campaign = await requireCampaign(userId, campaignId);
  if (!campaign.sequence_id) {
    return { id: null, name: 'Untitled', steps: DEFAULT_SEQUENCE_STEPS, campaign };
  }
  const sequence = await getSequence(userId, campaign.sequence_id);
  return { ...sequence, campaign };
}

export async function updateCampaignSequence(userId, campaignId, steps) {
  const campaign = await requireCampaign(userId, campaignId);
  if (!Array.isArray(steps) || !steps.length) throw httpError(400, 'At least one sequence step is required');
  const cleaned = steps.slice(0, 3).map((step, idx) => ({
    delayDays: Math.max(0, Number(step.delayDays) || (idx === 0 ? 0 : 3)),
    subject: String(step.subject || '').trim() || DEFAULT_SEQUENCE_STEPS[0].subject,
    bodyText: String(step.bodyText || step.bodyHtml || '').trim()
  }));
  if (!cleaned[0].bodyText) throw httpError(400, 'Step 1 body is required');
  if (campaign.sequence_id) {
    const result = await pool.query(
      `UPDATE off_market_sequences SET steps = $1::jsonb, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [JSON.stringify(cleaned), campaign.sequence_id, userId]
    );
    return result.rows[0];
  }
  const created = await pool.query(
    `INSERT INTO off_market_sequences (user_id, name, steps)
     VALUES ($1, $2, $3::jsonb)
     RETURNING *`,
    [userId, `${campaign.name} sequence`, JSON.stringify(cleaned)]
  );
  await pool.query(
    `UPDATE off_market_campaigns SET sequence_id = $1, updated_at = NOW() WHERE id = $2`,
    [created.rows[0].id, campaignId]
  );
  return created.rows[0];
}

function mapProspectInput(row) {
  const companyName = String(row.company_name || row.companyName || '').trim();
  const email = normalizeEmail(row.email);
  return {
    companyName,
    ownerName: String(row.owner_name || row.ownerName || '').trim() || null,
    email,
    title: String(row.title || '').trim() || null,
    location: String(row.location || '').trim() || null,
    notes: String(row.notes || '').trim() || null,
    sourceUrl: String(row.source_url || row.sourceUrl || '').trim() || null,
    researchJson: row.research_json || row.researchJson || {}
  };
}

export async function addProspects(userId, campaignId, rows, { status = 'new' } = {}) {
  await requireCampaign(userId, campaignId);
  const inputs = (Array.isArray(rows) ? rows : []).map(mapProspectInput).filter((r) => r.companyName);
  if (!inputs.length) throw httpError(400, 'No valid prospects (company name required)');
  const inserted = [];
  const skipped = [];
  for (const row of inputs.slice(0, 500)) {
    try {
      const result = await pool.query(
        `INSERT INTO off_market_prospects (
           user_id, campaign_id, company_name, owner_name, email, title, location, notes, source_url, research_json, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)
         RETURNING *`,
        [
          userId, campaignId, row.companyName, row.ownerName, row.email, row.title,
          row.location, row.notes, row.sourceUrl, JSON.stringify(row.researchJson || {}), status
        ]
      );
      inserted.push(result.rows[0]);
    } catch (err) {
      if (err.code === '23505') {
        skipped.push({ email: row.email, companyName: row.companyName, reason: 'duplicate_email' });
        continue;
      }
      throw err;
    }
  }
  console.log('[off-market] prospects added', {
    userId, campaignId, inserted: inserted.length, skipped: skipped.length
  });
  return { inserted, skipped };
}

export async function importProspectsCsv(userId, campaignId, csvText) {
  const rows = parseProspectCsv(csvText);
  if (!rows.length) throw httpError(400, 'CSV needs a header row and at least one company_name');
  return addProspects(userId, campaignId, rows);
}

export async function listProspects(userId, campaignId, { status } = {}) {
  await requireCampaign(userId, campaignId);
  const params = [userId, campaignId];
  let extra = '';
  if (status && PROSPECT_STATUSES.has(status)) {
    extra = ' AND p.status = $3';
    params.push(status);
  }
  const result = await pool.query(
    `SELECT p.*,
            (SELECT m.status FROM off_market_messages m
             WHERE m.prospect_id = p.id ORDER BY m.id DESC LIMIT 1) AS last_message_status,
            (SELECT m.sent_at FROM off_market_messages m
             WHERE m.prospect_id = p.id AND m.sent_at IS NOT NULL
             ORDER BY m.sent_at DESC LIMIT 1) AS last_sent_at
     FROM off_market_prospects p
     WHERE p.user_id = $1 AND p.campaign_id = $2${extra}
     ORDER BY p.id DESC`,
    params
  );
  return result.rows;
}

export async function patchProspect(userId, prospectId, patch = {}) {
  const existing = await pool.query(
    `SELECT * FROM off_market_prospects WHERE id = $1 AND user_id = $2`,
    [prospectId, userId]
  );
  if (!existing.rows[0]) throw httpError(404, 'Prospect not found');
  if (patch.status && !PROSPECT_STATUSES.has(patch.status)) throw httpError(400, 'Invalid prospect status');
  const email = patch.email !== undefined ? normalizeEmail(patch.email) : existing.rows[0].email;
  const result = await pool.query(
    `UPDATE off_market_prospects SET
       company_name = COALESCE($1, company_name),
       owner_name = COALESCE($2, owner_name),
       email = $3,
       title = COALESCE($4, title),
       location = COALESCE($5, location),
       notes = COALESCE($6, notes),
       status = COALESCE($7, status)
     WHERE id = $8 AND user_id = $9
     RETURNING *`,
    [
      patch.companyName !== undefined ? String(patch.companyName).trim() : null,
      patch.ownerName !== undefined ? (String(patch.ownerName).trim() || null) : null,
      email,
      patch.title !== undefined ? (String(patch.title).trim() || null) : null,
      patch.location !== undefined ? (String(patch.location).trim() || null) : null,
      patch.notes !== undefined ? (String(patch.notes).trim() || null) : null,
      patch.status || null,
      prospectId,
      userId
    ]
  );
  return result.rows[0];
}

export async function isSuppressed(userId, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const result = await pool.query(
    `SELECT 1 FROM off_market_suppressions WHERE user_id = $1 AND email = $2`,
    [userId, normalized]
  );
  return result.rows.length > 0;
}

export async function addSuppression(userId, email, reason) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  await pool.query(
    `INSERT INTO off_market_suppressions (user_id, email, reason)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, email) DO UPDATE SET reason = EXCLUDED.reason`,
    [userId, normalized, reason || 'manual']
  );
  return normalized;
}

export async function campaignStats(userId, campaignId) {
  await requireCampaign(userId, campaignId);
  const prospects = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM off_market_prospects WHERE campaign_id = $1 AND user_id = $2
     GROUP BY status`,
    [campaignId, userId]
  );
  const messages = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM off_market_messages WHERE campaign_id = $1 AND user_id = $2
     GROUP BY status`,
    [campaignId, userId]
  );
  const unanswered = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM off_market_messages m
     JOIN off_market_prospects p ON p.id = m.prospect_id
     WHERE m.campaign_id = $1 AND m.user_id = $2 AND m.status = 'sent'
       AND p.status = 'contacted'
       AND m.sent_at < NOW() - INTERVAL '14 days'`,
    [campaignId, userId]
  );
  const byProspect = Object.fromEntries(prospects.rows.map((r) => [r.status, r.count]));
  const byMessage = Object.fromEntries(messages.rows.map((r) => [r.status, r.count]));
  return {
    prospects: byProspect,
    messages: byMessage,
    sent: byMessage.sent || 0,
    bounced: byMessage.bounced || byProspect.bounced || 0,
    replied: byProspect.replied || 0,
    unanswered: unanswered.rows[0]?.count || 0,
    interested: byProspect.interested || 0,
    promoted: byProspect.promoted || 0,
    queued: byMessage.queued || 0,
    failed: byMessage.failed || 0
  };
}

export async function activeCampaignCount(userId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM off_market_campaigns
     WHERE user_id = $1 AND status IN ('draft', 'active', 'paused')`,
    [userId]
  );
  return result.rows[0]?.count || 0;
}
