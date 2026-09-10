import pool from '../db/pool.js';
import {
  getDealAccess,
  assertCanTalk,
  getMembership
} from '../lib/teamAcl.js';
import { sendEmail } from './emailService.js';
import { createUserAlert, markDealTalkAlertsRead } from './userAlertService.js';
import { sendPushToUser } from './pushService.js';
import { notificationOpenLabel, notificationPath } from '../lib/notificationLinks.js';
import { actorDisplayName, shortDealName } from '../lib/teamActivity.js';

const MENTION_RE = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
const WEB_APP_URL = (
  process.env.WEB_APP_URL_LOCAL ||
  process.env.WEB_APP_URL ||
  'http://localhost:5173'
).replace(/\/$/, '');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function talkDeepLink(savedDealId) {
  return `${WEB_APP_URL}/dashboard?tab=crm&crmDeal=${savedDealId}&section=crm-talk`;
}

function talkAlertEmail({ subject, greeting, dealName, body, savedDealId }) {
  const link = talkDeepLink(savedDealId);
  return {
    subject,
    html: `
      <p>${escapeHtml(greeting)}</p>
      <p><strong>Deal:</strong> ${escapeHtml(dealName || 'Untitled deal')}</p>
      <blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#333;">
        ${escapeHtml(body)}
      </blockquote>
      <p><a href="${link}" style="display:inline-block;background:#1f2937;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;font-weight:600;">
        Open Talk in Vettr
      </a></p>
      <p style="color:#666;font-size:12px;">Or paste this link: ${escapeHtml(link)}</p>
    `
  };
}

async function notifyTalkUser({
  userId,
  email,
  alertType,
  title,
  greeting,
  subject,
  body,
  savedDealId,
  messageId,
  dealName,
  authorEmail,
  extraMeta = {}
}) {
  await createUserAlert({
    userId,
    alertType,
    title,
    body: String(body || '').slice(0, 500),
    savedDealId,
    messageId,
    metadata: { dealName, authorEmail, ...extraMeta }
  }).catch((err) => console.warn(`[dealThread] ${alertType} alert failed:`, err.message));

  const url = notificationPath({ alertType, savedDealId });
  await sendPushToUser(userId, {
    title,
    body: `${dealName}: ${String(body || '').slice(0, 140)}`,
    url,
    tag: `talk-${alertType}`,
    actionTitle: notificationOpenLabel(alertType)
  }).catch((err) => console.warn(`[dealThread] ${alertType} push failed:`, err.message));

  if (!email) return;
  const mail = talkAlertEmail({ subject, greeting, dealName, body, savedDealId });
  await sendEmail({ to: email, ...mail }).catch((err) => {
    console.warn(`[dealThread] ${alertType} email failed:`, err.message);
  });
}

function extractEmailsFromBody(body) {
  const emails = new Set();
  let m;
  const re = new RegExp(MENTION_RE.source, 'g');
  while ((m = re.exec(body)) !== null) {
    emails.add(m[1].toLowerCase());
  }
  return [...emails];
}

function extractTags(body) {
  const tags = [];
  const re = /#([a-zA-Z][a-zA-Z0-9_-]{0,31})/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    tags.push(m[1].toLowerCase());
  }
  return [...new Set(tags)];
}

export async function listDealMessages(userId, savedDealId, { afterId } = {}) {
  const access = await getDealAccess(userId, savedDealId);
  assertCanTalk(access);

  const params = [savedDealId];
  let sql = `
    SELECT m.id, m.saved_deal_id, m.author_user_id, m.body, m.message_kind,
           m.assignee_user_id, m.resolved_at, m.resolved_by, m.tags, m.metadata, m.created_at,
           u.email AS author_email,
           au.email AS assignee_email
    FROM deal_messages m
    JOIN users u ON u.id = m.author_user_id
    LEFT JOIN users au ON au.id = m.assignee_user_id
    WHERE m.saved_deal_id = $1
  `;
  if (afterId) {
    params.push(afterId);
    sql += ` AND m.id > $2`;
  }
  sql += ` ORDER BY m.created_at ASC, m.id ASC LIMIT 200`;

  const messages = await pool.query(sql, params);

  const ids = messages.rows.map((r) => r.id);
  let mentions = [];
  let reactions = [];
  if (ids.length) {
    const m = await pool.query(
      `SELECT message_id, user_id FROM deal_message_mentions WHERE message_id = ANY($1::int[])`,
      [ids]
    );
    mentions = m.rows;
    const r = await pool.query(
      `SELECT message_id, user_id, emoji, u.email
       FROM deal_message_reactions r
       JOIN users u ON u.id = r.user_id
       WHERE message_id = ANY($1::int[])`,
      [ids]
    );
    reactions = r.rows;
  }

  await pool.query(
    `INSERT INTO deal_thread_reads (user_id, saved_deal_id, last_read_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id, saved_deal_id)
     DO UPDATE SET last_read_at = NOW()`,
    [userId, savedDealId]
  );
  await markDealTalkAlertsRead(userId, savedDealId).catch((err) => {
    console.warn('[dealThread] markDealTalkAlertsRead failed:', err.message);
  });

  return {
    messages: messages.rows.map((msg) => ({
      ...msg,
      mentions: mentions.filter((x) => x.message_id === msg.id).map((x) => x.user_id),
      reactions: reactions.filter((x) => x.message_id === msg.id)
    })),
    access: {
      canWrite: access.canWrite,
      canTalk: true,
      role: access.role,
      teamId: access.deal.team_id
    }
  };
}

function parseDueAt(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const err = new Error('Invalid due date');
    err.status = 400;
    throw err;
  }
  return d.toISOString();
}

async function resolveLinkedDdItem(savedDealId, linkedDdItemId) {
  if (!linkedDdItemId) return null;
  const itemId = Number(linkedDdItemId);
  if (!itemId) {
    const err = new Error('Invalid DD item');
    err.status = 400;
    throw err;
  }
  const row = await pool.query(
    `SELECT i.id, i.title, i.status, g.name AS group_name
     FROM dd_items i
     JOIN dd_groups g ON g.id = i.group_id
     JOIN dd_checklists c ON c.id = g.checklist_id
     WHERE i.id = $1 AND c.saved_deal_id = $2`,
    [itemId, savedDealId]
  );
  if (!row.rows[0]) {
    const err = new Error('DD item not found on this deal');
    err.status = 400;
    throw err;
  }
  return {
    ddItemId: row.rows[0].id,
    ddItemTitle: row.rows[0].title,
    ddGroupName: row.rows[0].group_name,
    ddItemStatus: row.rows[0].status
  };
}

export async function postDealMessage(userId, savedDealId, { body, assigneeUserId, dueAt, linkedDdItemId } = {}) {
  const access = await getDealAccess(userId, savedDealId);
  assertCanTalk(access);

  const text = String(body || '').trim();
  if (!text) {
    const err = new Error('Message body required');
    err.status = 400;
    throw err;
  }
  if (text.length > 4000) {
    const err = new Error('Message too long');
    err.status = 400;
    throw err;
  }

  let assignee = assigneeUserId ? Number(assigneeUserId) : null;
  if (assignee && access.deal.team_id) {
    const m = await getMembership(assignee, access.deal.team_id);
    if (!m) {
      const err = new Error('Assignee must be a team member');
      err.status = 400;
      throw err;
    }
  } else if (assignee && !access.deal.team_id) {
    assignee = null;
  }

  const parsedDueAt = parseDueAt(dueAt);
  if (parsedDueAt && !assignee) {
    const err = new Error('Pick an assignee when setting a due date');
    err.status = 400;
    throw err;
  }

  const linkedDd = await resolveLinkedDdItem(savedDealId, linkedDdItemId);
  const metadata = {
    ...(parsedDueAt ? { dueAt: parsedDueAt } : {}),
    ...(linkedDd || {})
  };

  const tags = extractTags(text);
  const result = await pool.query(
    `INSERT INTO deal_messages (
       saved_deal_id, author_user_id, body, message_kind, assignee_user_id, tags, metadata
     ) VALUES ($1, $2, $3, 'chat', $4, $5, $6)
     RETURNING id, saved_deal_id, author_user_id, body, message_kind,
               assignee_user_id, resolved_at, tags, metadata, created_at`,
    [savedDealId, userId, text, assignee, tags, JSON.stringify(metadata)]
  );
  const message = result.rows[0];

  const dealName = access.deal.name || 'Untitled deal';
  const authorRes = await pool.query(`SELECT email FROM users WHERE id = $1`, [userId]);
  const authorEmail = authorRes.rows[0]?.email || 'A teammate';
  const who = actorDisplayName(authorEmail);
  const dealShort = shortDealName(dealName, 36);

  // Mentions, assigns, then every other teammate (plain Talk posts used to be silent).
  if (access.deal.team_id) {
    const members = await pool.query(
      `SELECT u.id, LOWER(u.email) AS email FROM team_members tm
       JOIN users u ON u.id = tm.user_id
       WHERE tm.team_id = $1 AND tm.status = 'active'`,
      [access.deal.team_id]
    );
    const byEmail = new Map(members.rows.map((r) => [r.email, r]));
    const notified = new Set();

    for (const email of extractEmailsFromBody(text)) {
      const member = byEmail.get(email);
      if (!member || member.id === userId) continue;
      await pool.query(
        `INSERT INTO deal_message_mentions (message_id, user_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [message.id, member.id]
      );
      await notifyTalkUser({
        userId: member.id,
        email,
        alertType: 'talk_mention',
        title: `${who} mentioned you on ${dealShort}`,
        greeting: `${who} mentioned you in Talk:`,
        subject: `${who} mentioned you on “${dealName}”`,
        body: text,
        savedDealId,
        messageId: message.id,
        dealName,
        authorEmail
      });
      notified.add(member.id);
    }

    if (assignee && assignee !== userId) {
      const assigneeMember = members.rows.find((r) => r.id === assignee);
      const assigneeEmail = assigneeMember?.email
        || (await pool.query(`SELECT LOWER(email) AS email FROM users WHERE id = $1`, [assignee])).rows[0]?.email;
      if (assigneeEmail) {
        await notifyTalkUser({
          userId: assignee,
          email: assigneeEmail,
          alertType: 'talk_assign',
          title: `${who} assigned you on ${dealShort}`,
          greeting: `${who} assigned you in Talk:`,
          subject: `${who} assigned you on “${dealName}”`,
          body: text,
          savedDealId,
          messageId: message.id,
          dealName,
          authorEmail,
          extraMeta: { dueAt: parsedDueAt || null }
        });
        notified.add(assignee);
      }
    }

    let postAlerts = 0;
    for (const member of members.rows) {
      if (member.id === userId || notified.has(member.id)) continue;
      await notifyTalkUser({
        userId: member.id,
        email: member.email,
        alertType: 'talk_post',
        title: `${who} posted on ${dealShort}`,
        greeting: `${who} posted an update in Talk:`,
        subject: `${who} posted in Talk on “${dealName}”`,
        body: text,
        savedDealId,
        messageId: message.id,
        dealName,
        authorEmail
      });
      postAlerts += 1;
    }
    if (postAlerts) {
      console.log(`[dealThread] talk_post alerts=${postAlerts} message=${message.id} deal=${savedDealId}`);
    }
  }

  // Create linked task when assigning (due date optional; undated still appears in Today for assignee)
  if (assignee && access.canWrite) {
    const taskMeta = {
      fromMessageId: message.id,
      assignedBy: userId,
      ...(linkedDd || {})
    };
    await pool.query(
      `INSERT INTO tasks (user_id, saved_deal_id, title, status, due_at, source, metadata)
       VALUES ($1, $2, $3, 'open', $4, 'talk_assign', $5)`,
      [
        assignee,
        savedDealId,
        text.slice(0, 200),
        parsedDueAt,
        JSON.stringify(taskMeta)
      ]
    ).catch((err) => {
      console.warn('[dealThread] task create with metadata failed, retrying:', err.message);
      return pool.query(
        `INSERT INTO tasks (user_id, saved_deal_id, title, status, due_at, source)
         VALUES ($1, $2, $3, 'open', $4, 'talk_assign')`,
        [assignee, savedDealId, text.slice(0, 200), parsedDueAt]
      ).catch((e2) => console.warn('[dealThread] task create failed:', e2.message));
    });
  }

  console.log(
    `[dealThread] message=${message.id} deal=${savedDealId} by=${userId}`
    + ` assignee=${assignee || '-'} due=${parsedDueAt || '-'} dd=${linkedDd?.ddItemId || '-'}`
  );
  return message;
}

export async function reactToMessage(userId, messageId, emoji) {
  const emojiClean = String(emoji || '').trim().slice(0, 16);
  if (!emojiClean) {
    const err = new Error('Emoji required');
    err.status = 400;
    throw err;
  }

  const msg = await pool.query(
    `SELECT id, saved_deal_id FROM deal_messages WHERE id = $1`,
    [messageId]
  );
  if (!msg.rows[0]) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }

  const access = await getDealAccess(userId, msg.rows[0].saved_deal_id);
  assertCanTalk(access);

  const existing = await pool.query(
    `SELECT 1 FROM deal_message_reactions
     WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
    [messageId, userId, emojiClean]
  );

  if (existing.rows.length) {
    await pool.query(
      `DELETE FROM deal_message_reactions
       WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emojiClean]
    );
    return { toggled: 'off', emoji: emojiClean };
  }

  await pool.query(
    `INSERT INTO deal_message_reactions (message_id, user_id, emoji)
     VALUES ($1, $2, $3)`,
    [messageId, userId, emojiClean]
  );
  return { toggled: 'on', emoji: emojiClean };
}

export async function resolveMessage(userId, messageId, resolved = true) {
  const msg = await pool.query(
    `SELECT id, saved_deal_id, assignee_user_id FROM deal_messages WHERE id = $1`,
    [messageId]
  );
  if (!msg.rows[0]) {
    const err = new Error('Message not found');
    err.status = 404;
    throw err;
  }

  const access = await getDealAccess(userId, msg.rows[0].saved_deal_id);
  assertCanTalk(access);

  if (resolved) {
    await pool.query(
      `UPDATE deal_messages SET resolved_at = NOW(), resolved_by = $1 WHERE id = $2`,
      [userId, messageId]
    );
  } else {
    await pool.query(
      `UPDATE deal_messages SET resolved_at = NULL, resolved_by = NULL WHERE id = $1`,
      [messageId]
    );
  }
  return { resolved };
}

export async function getUnreadCounts(userId, savedDealIds) {
  if (!savedDealIds?.length) return {};
  const result = await pool.query(
    `SELECT m.saved_deal_id, COUNT(*)::int AS unread
     FROM deal_messages m
     LEFT JOIN deal_thread_reads r
       ON r.saved_deal_id = m.saved_deal_id AND r.user_id = $1
     WHERE m.saved_deal_id = ANY($2::int[])
       AND m.author_user_id <> $1
       AND m.message_kind = 'chat'
       AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
     GROUP BY m.saved_deal_id`,
    [userId, savedDealIds]
  );
  const map = {};
  for (const row of result.rows) map[row.saved_deal_id] = row.unread;
  return map;
}

/**
 * Unread @mentions for the user (Talk). Cleared when they open the deal thread
 * (deal_thread_reads.last_read_at advances past the message).
 */
export async function getUnreadMentions(userId) {
  const result = await pool.query(
    `SELECT m.id AS message_id, m.saved_deal_id, m.body, m.created_at,
            m.author_user_id, u.email AS author_email,
            sd.name AS deal_name, sd.progress_stage
     FROM deal_message_mentions dm
     JOIN deal_messages m ON m.id = dm.message_id
     JOIN saved_deals sd ON sd.id = m.saved_deal_id
     JOIN users u ON u.id = m.author_user_id
     LEFT JOIN deal_thread_reads r
       ON r.saved_deal_id = m.saved_deal_id AND r.user_id = $1
     WHERE dm.user_id = $1
       AND m.message_kind = 'chat'
       AND m.author_user_id <> $1
       AND m.resolved_at IS NULL
       AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
     ORDER BY m.created_at DESC
     LIMIT 50`,
    [userId]
  );
  console.log(`[dealThread] unreadMentions user=${userId} count=${result.rows.length}`);
  return result.rows;
}
