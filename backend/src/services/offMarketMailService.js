import pool from '../db/pool.js';
import { httpError } from '../lib/httpError.js';
import { firstNameFrom, mergeTemplate, normalizeEmail } from '../lib/offMarketCsv.js';
import {
  requireCampaign,
  getCampaignSequence,
  isSuppressed,
  addSuppression
} from './offMarketService.js';
import { sendGmailCampaignMessage, getGmailThread } from './googleGmailService.js';
import {
  getGoogleConnection,
  connectionHasGmailSend,
  connectionHasGmailReadonly,
  getValidGoogleAccessToken
} from './googleCalendarService.js';
import { classifyReply } from './offMarketLlmService.js';
import { promoteProspect } from './offMarketPromoteService.js';

const STOP_RE = /\b(stop|unsubscribe|do not contact|don't contact|remove me)\b/i;
const BOUNCE_FROM_RE = /(mailer-daemon|postmaster|mail-daemon)/i;

function senderNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'Buyer';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildMergeVars(campaign, prospect, fromEmail) {
  const geo = String(campaign.geography || '').trim();
  return {
    first_name: firstNameFrom(prospect.owner_name) || 'there',
    company: prospect.company_name || '',
    vertical: campaign.vertical || 'this',
    geography: geo,
    geography_clause: geo ? ` in ${geo}` : '',
    sender_name: senderNameFromEmail(fromEmail)
  };
}

export async function enqueueCampaign(userId, campaignId, { stepIndex = 0 } = {}) {
  const campaign = await requireCampaign(userId, campaignId);
  const sequence = await getCampaignSequence(userId, campaignId);
  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  if (!steps[stepIndex]) throw httpError(400, 'Sequence step not found');

  const prospects = await pool.query(
    `SELECT * FROM off_market_prospects
     WHERE campaign_id = $1 AND user_id = $2
       AND email IS NOT NULL AND email <> ''
       AND status IN ('new', 'researched', 'contacted')
       AND saved_deal_id IS NULL`,
    [campaignId, userId]
  );

  let queued = 0;
  let skipped = 0;
  for (const prospect of prospects.rows) {
    if (await isSuppressed(userId, prospect.email)) {
      skipped += 1;
      continue;
    }
    const existing = await pool.query(
      `SELECT id FROM off_market_messages
       WHERE prospect_id = $1 AND step_index = $2 AND status IN ('queued', 'sent')`,
      [prospect.id, stepIndex]
    );
    if (existing.rows[0]) {
      skipped += 1;
      continue;
    }
    if (stepIndex > 0) {
      const prior = await pool.query(
        `SELECT id FROM off_market_messages
         WHERE prospect_id = $1 AND step_index = $2 AND status = 'sent'`,
        [prospect.id, stepIndex - 1]
      );
      if (!prior.rows[0]) {
        skipped += 1;
        continue;
      }
    }
    await pool.query(
      `INSERT INTO off_market_messages (
         user_id, campaign_id, prospect_id, step_index, to_email, subject, body_text, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'queued')`,
      [userId, campaignId, prospect.id, stepIndex, prospect.email, null, null]
    );
    await pool.query(
      `UPDATE off_market_prospects SET status = 'queued' WHERE id = $1 AND status IN ('new', 'researched')`,
      [prospect.id]
    );
    queued += 1;
  }

  if (campaign.status === 'draft') {
    await pool.query(
      `UPDATE off_market_campaigns SET status = 'active', updated_at = NOW() WHERE id = $1`,
      [campaignId]
    );
  }
  console.log('[off-market] enqueue', { userId, campaignId, stepIndex, queued, skipped });
  return { queued, skipped };
}

async function sentTodayCount(userId, campaignId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM off_market_messages
     WHERE user_id = $1 AND campaign_id = $2 AND status = 'sent'
       AND sent_at >= date_trunc('day', NOW())`,
    [userId, campaignId]
  );
  return result.rows[0]?.count || 0;
}

export async function sendTick(userId, campaignId, { limit = 5 } = {}) {
  const campaign = await requireCampaign(userId, campaignId);
  if (campaign.status === 'paused' || campaign.status === 'archived') {
    return { sent: 0, reason: campaign.status };
  }
  const connection = await getGoogleConnection(userId);
  if (!connectionHasGmailSend(connection)) {
    throw httpError(409, 'Reconnect Google in Settings to send from Gmail.', 'reconnect_google');
  }
  const remaining = Math.max(0, Number(campaign.daily_send_cap || 50) - await sentTodayCount(userId, campaignId));
  const take = Math.min(limit, remaining);
  if (take <= 0) return { sent: 0, reason: 'daily_cap' };

  const sequence = await getCampaignSequence(userId, campaignId);
  const steps = Array.isArray(sequence.steps) ? sequence.steps : [];
  const queued = await pool.query(
    `SELECT m.*, p.company_name, p.owner_name, p.email AS prospect_email
     FROM off_market_messages m
     JOIN off_market_prospects p ON p.id = m.prospect_id
     WHERE m.user_id = $1 AND m.campaign_id = $2 AND m.status = 'queued'
     ORDER BY m.id ASC
     LIMIT $3`,
    [userId, campaignId, take]
  );

  let sent = 0;
  let failed = 0;
  for (const row of queued.rows) {
    const step = steps[row.step_index] || steps[0];
    if (!step) {
      failed += 1;
      continue;
    }
    if (await isSuppressed(userId, row.to_email)) {
      await pool.query(
        `UPDATE off_market_messages SET status = 'failed', error = 'suppressed' WHERE id = $1`,
        [row.id]
      );
      await pool.query(
        `UPDATE off_market_prospects SET status = 'unsubscribed' WHERE id = $1 AND status <> 'promoted'`,
        [row.prospect_id]
      );
      failed += 1;
      continue;
    }
    const vars = buildMergeVars(campaign, row, connection.google_email);
    const subject = mergeTemplate(step.subject, vars);
    const bodyText = mergeTemplate(step.bodyText || step.bodyHtml, vars);
    let threadId = null;
    let inReplyTo = null;
    if (row.step_index > 0) {
      const prior = await pool.query(
        `SELECT gmail_thread_id, rfc_message_id FROM off_market_messages
         WHERE prospect_id = $1 AND step_index = $2 AND status = 'sent'
         ORDER BY id DESC LIMIT 1`,
        [row.prospect_id, row.step_index - 1]
      );
      threadId = prior.rows[0]?.gmail_thread_id || null;
      inReplyTo = prior.rows[0]?.rfc_message_id || null;
    }
    try {
      const result = await sendGmailCampaignMessage(userId, {
        to: row.to_email,
        subject,
        text: bodyText,
        threadId,
        inReplyTo
      });
      await pool.query(
        `UPDATE off_market_messages SET
           status = 'sent', subject = $1, body_text = $2, sent_at = NOW(), last_event_at = NOW(),
           gmail_message_id = $3, gmail_thread_id = $4, rfc_message_id = $5, error = NULL
         WHERE id = $6`,
        [subject, bodyText, result.id || null, result.threadId || null, result.rfcMessageId || null, row.id]
      );
      await pool.query(
        `UPDATE off_market_prospects SET status = 'contacted' WHERE id = $1 AND status IN ('new','researched','queued')`,
        [row.prospect_id]
      );
      sent += 1;
      const delayMs = Math.max(0, Number(campaign.send_delay_sec || 0) * 1000);
      if (delayMs && queued.rows.indexOf(row) < queued.rows.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 15000)));
      }
    } catch (err) {
      console.error('[off-market] send failed', { userId, campaignId, messageId: row.id, message: err.message });
      await pool.query(
        `UPDATE off_market_messages SET status = 'failed', error = $1 WHERE id = $2`,
        [String(err.message || 'send failed').slice(0, 500), row.id]
      );
      failed += 1;
      if (err.code === 'google_not_connected' || err.code === 'reconnect_google') throw err;
    }
  }
  console.log('[off-market] send-tick', { userId, campaignId, sent, failed, remainingCap: remaining - sent });
  return { sent, failed, remainingCap: remaining - sent };
}

export async function runOffMarketSendTick() {
  const campaigns = await pool.query(
    `SELECT DISTINCT m.user_id, m.campaign_id
     FROM off_market_messages m
     JOIN off_market_campaigns c ON c.id = m.campaign_id
     WHERE m.status = 'queued' AND c.status = 'active'
     ORDER BY m.campaign_id
     LIMIT 40`
  );
  let sent = 0;
  for (const row of campaigns.rows) {
    try {
      const result = await sendTick(row.user_id, row.campaign_id, { limit: 3 });
      sent += result.sent || 0;
    } catch (err) {
      console.warn('[off-market] send-tick campaign skipped', {
        userId: row.user_id, campaignId: row.campaign_id, message: err.message
      });
    }
  }
  return { campaigns: campaigns.rows.length, sent };
}

function headerMap(payloadHeaders) {
  const map = {};
  for (const h of payloadHeaders || []) {
    if (h?.name) map[String(h.name).toLowerCase()] = h.value || '';
  }
  return map;
}

function snippetFromPayload(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    try {
      return Buffer.from(payload.body.data, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  const parts = payload.parts || [];
  const textPart = parts.find((p) => p.mimeType === 'text/plain') || parts[0];
  if (textPart?.body?.data) {
    try {
      return Buffer.from(textPart.body.data, 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return '';
}

export async function syncUserInbox(userId) {
  const connection = await getGoogleConnection(userId);
  if (!connectionHasGmailReadonly(connection)) {
    return { synced: 0, reason: 'no_readonly' };
  }
  await getValidGoogleAccessToken(userId);
  const messages = await pool.query(
    `SELECT m.*, p.email AS prospect_email, p.id AS prospect_id, p.status AS prospect_status,
            c.auto_promote_on_interested, c.team_id
     FROM off_market_messages m
     JOIN off_market_prospects p ON p.id = m.prospect_id
     JOIN off_market_campaigns c ON c.id = m.campaign_id
     WHERE m.user_id = $1 AND m.status = 'sent' AND m.gmail_thread_id IS NOT NULL
       AND p.status IN ('contacted', 'queued', 'replied')
       AND m.sent_at > NOW() - INTERVAL '45 days'
     ORDER BY m.id DESC
     LIMIT 80`,
    [userId]
  );
  let synced = 0;
  for (const row of messages.rows) {
    try {
      const thread = await getGmailThread(userId, row.gmail_thread_id);
      const threadMessages = thread.messages || [];
      let bounced = false;
      let reply = null;
      for (const msg of threadMessages) {
        if (msg.id === row.gmail_message_id) continue;
        const headers = headerMap(msg.payload?.headers);
        const from = headers.from || '';
        const failed = headers['x-failed-recipients'] || '';
        if (BOUNCE_FROM_RE.test(from) || failed) {
          bounced = true;
          break;
        }
        const fromEmail = normalizeEmail(from.replace(/^.*<|>.*$/g, from));
        if (fromEmail && fromEmail === normalizeEmail(row.prospect_email)) {
          reply = { fromEmail, snippet: snippetFromPayload(msg.payload) || msg.snippet || '' };
        }
      }
      if (bounced) {
        await pool.query(
          `UPDATE off_market_messages SET status = 'bounced', last_event_at = NOW() WHERE id = $1`,
          [row.id]
        );
        await pool.query(
          `UPDATE off_market_prospects SET status = 'bounced' WHERE id = $1 AND status <> 'promoted'`,
          [row.prospect_id]
        );
        await addSuppression(userId, row.prospect_email, 'bounced');
        synced += 1;
        continue;
      }
      if (reply) {
        await pool.query(
          `UPDATE off_market_messages SET status = 'replied', last_event_at = NOW(),
             metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
           WHERE id = $2`,
          [JSON.stringify({ replySnippet: String(reply.snippet).slice(0, 500) }), row.id]
        );
        let nextStatus = 'replied';
        if (STOP_RE.test(reply.snippet)) {
          nextStatus = 'unsubscribed';
          await addSuppression(userId, row.prospect_email, 'unsubscribed');
        } else {
          const label = await classifyReply(userId, reply.snippet);
          if (label === 'stop') {
            nextStatus = 'unsubscribed';
            await addSuppression(userId, row.prospect_email, 'unsubscribed');
          } else if (label === 'interested') {
            nextStatus = 'interested';
          } else if (label === 'not_interested') {
            nextStatus = 'skipped';
          }
        }
        await pool.query(
          `UPDATE off_market_prospects SET status = $1 WHERE id = $2 AND status <> 'promoted'`,
          [nextStatus, row.prospect_id]
        );
        if (nextStatus === 'interested' && row.auto_promote_on_interested) {
          await promoteProspect(userId, row.prospect_id, { teamId: row.team_id }).catch((err) => {
            console.warn('[off-market] auto-promote skipped', err.message);
          });
        }
        synced += 1;
      }
    } catch (err) {
      console.warn('[off-market] sync thread failed', { userId, threadId: row.gmail_thread_id, message: err.message });
    }
  }
  console.log('[off-market] inbox sync', { userId, checked: messages.rows.length, synced });
  return { checked: messages.rows.length, synced };
}

export async function runOffMarketInboxSync() {
  const users = await pool.query(
    `SELECT DISTINCT user_id FROM off_market_messages
     WHERE status = 'sent' AND gmail_thread_id IS NOT NULL
       AND sent_at > NOW() - INTERVAL '45 days'`
  );
  let synced = 0;
  for (const row of users.rows) {
    try {
      const result = await syncUserInbox(row.user_id);
      synced += result.synced || 0;
    } catch (err) {
      console.warn('[off-market] inbox sync user failed', { userId: row.user_id, message: err.message });
    }
  }
  return { users: users.rows.length, synced };
}
