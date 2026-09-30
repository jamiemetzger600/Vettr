import pool from '../db/pool.js';
import { VISIBLE_DEALS_SQL } from '../lib/teamAcl.js';
import { notificationOpenLabel, notificationPath } from '../lib/notificationLinks.js';
import {
  isoDay,
  milestoneEdges,
  noticeCopy,
  noticesDue
} from '../lib/ddMilestoneNotices.js';
import { createUserAlert } from './userAlertService.js';
import { sendPushToUser } from './pushService.js';
import { deliverUserEmail } from './googleGmailService.js';

const TZ = process.env.DIGEST_TZ || 'America/Los_Angeles';
const WEB_APP_URL = (process.env.WEB_APP_URL || 'http://localhost:5173').replace(/\/$/, '');

export function todayIso(now = new Date(), timeZone = TZ) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function dayInZone(value, timeZone = TZ) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return todayIso(value, timeZone);
  }
  return isoDay(value);
}

function rowsToChecklists(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (!byId.has(row.checklist_id)) {
      byId.set(row.checklist_id, {
        checklistId: row.checklist_id,
        savedDealId: row.saved_deal_id,
        dealName: row.deal_name || row.name || '',
        userId: row.user_id,
        teamId: row.team_id,
        startedOn: dayInZone(row.started_at),
        milestones: []
      });
    }
    const checklist = byId.get(row.checklist_id);
    if (row.stage_id && row.due_on) {
      checklist.milestones.push({ stageId: row.stage_id, dueOn: dayInZone(row.due_on) });
    }
    checklist.targetOn = dayInZone(row.target_date);
  }
  for (const checklist of byId.values()) {
    const hasClose = checklist.milestones.some((item) => item.stageId === 'close');
    if (!hasClose && checklist.targetOn) {
      checklist.milestones.push({ stageId: 'close', dueOn: checklist.targetOn });
    }
  }
  return [...byId.values()];
}

function dueForChecklist(checklist, today) {
  const edges = milestoneEdges(checklist.milestones, checklist.startedOn);
  return noticesDue(edges, today).map((notice) => ({
    ...notice,
    ...checklist,
    ...noticeCopy({
      stageId: notice.stageId,
      edge: notice.edge,
      daysUntil: notice.daysUntil,
      dealName: checklist.dealName,
      on: notice.on
    })
  }));
}

async function loadOpenChecklists(userId = null) {
  const params = [];
  let visibility = '';
  if (userId) {
    params.push(userId);
    visibility = `AND ${VISIBLE_DEALS_SQL}`;
  }
  const result = await pool.query(
    `SELECT c.id AS checklist_id, c.started_at, c.target_date, c.saved_deal_id,
            sd.name AS deal_name, sd.user_id, sd.team_id,
            m.stage_id, m.due_on
     FROM dd_checklists c
     JOIN saved_deals sd ON sd.id = c.saved_deal_id
     LEFT JOIN dd_stage_milestones m ON m.checklist_id = c.id
     WHERE c.completed_at IS NULL
       ${visibility}`,
    params
  );
  return rowsToChecklists(result.rows);
}

export async function milestoneDigestItems(userId, today = todayIso()) {
  const checklists = await loadOpenChecklists(userId);
  const items = checklists.flatMap((checklist) => dueForChecklist(checklist, today));
  console.log('[ddMilestone] digest', { userId, today, count: items.length });
  return items.map((item) => ({
    kind: 'dd_milestone',
    title: item.title,
    dealName: item.dealName,
    savedDealId: item.savedDealId,
    extra: item.body
  }));
}

async function claimNotice(notice) {
  const result = await pool.query(
    `INSERT INTO dd_milestone_notices
       (checklist_id, stage_id, edge, lead_days, milestone_on)
     VALUES ($1, $2, $3, $4, $5::date)
     ON CONFLICT (checklist_id, stage_id, edge, lead_days, milestone_on) DO NOTHING
     RETURNING checklist_id`,
    [notice.checklistId, notice.stageId, notice.edge, notice.leadDays, notice.on]
  );
  return result.rowCount > 0;
}

async function recipientUsers(notice) {
  const ids = new Set();
  if (Number(notice.userId) > 0) ids.add(Number(notice.userId));
  if (notice.teamId) {
    const members = await pool.query(
      `SELECT user_id FROM team_members
       WHERE team_id = $1 AND status = 'active'`,
      [notice.teamId]
    );
    members.rows.forEach((member) => ids.add(Number(member.user_id)));
  }
  if (!ids.size) return [];
  const users = await pool.query(
    'SELECT id, email FROM users WHERE id = ANY($1::int[])',
    [[...ids]]
  );
  return users.rows;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailHtml({ title, body, savedDealId }) {
  const path = notificationPath({ alertType: 'dd_milestone', savedDealId });
  const link = `${WEB_APP_URL}${path}`;
  return `<p><strong>${escapeHtml(title)}</strong></p>
    <p>${escapeHtml(body)}</p>
    <p><a href="${link}">Open due diligence in Vettr</a></p>`;
}

async function deliverNotice(notice, user) {
  const url = notificationPath({ alertType: 'dd_milestone', savedDealId: notice.savedDealId });
  await createUserAlert({
    userId: user.id,
    alertType: 'dd_milestone',
    title: notice.title,
    body: notice.body,
    savedDealId: notice.savedDealId,
    metadata: {
      stageId: notice.stageId,
      edge: notice.edge,
      leadDays: notice.leadDays,
      on: notice.on,
      dealName: notice.dealName
    }
  }).catch((err) => console.warn('[ddMilestone] alert failed', err.message));

  await sendPushToUser(user.id, {
    title: notice.title,
    body: notice.body,
    url,
    tag: `dd-milestone-${notice.checklistId}-${notice.stageId}-${notice.edge}-${notice.leadDays}`,
    actionTitle: notificationOpenLabel('dd_milestone', { savedDealId: notice.savedDealId })
  }).catch((err) => console.warn('[ddMilestone] push failed', err.message));

  if (!user.email) return { emailed: false };
  const mailed = await deliverUserEmail(user.id, {
    to: user.email,
    subject: `Vettr: ${notice.title}`,
    html: emailHtml(notice)
  }).catch((err) => {
    console.warn('[ddMilestone] email failed', err.message);
    return { sent: false, reason: err.message };
  });
  if (!mailed?.sent) {
    console.warn('[ddMilestone] email not sent', {
      userId: user.id,
      reason: mailed?.reason || mailed?.message || 'unknown'
    });
  }
  return { emailed: Boolean(mailed?.sent) };
}

export async function processDdMilestoneNotices({ today = todayIso() } = {}) {
  const checklists = await loadOpenChecklists();
  const due = checklists.flatMap((checklist) => dueForChecklist(checklist, today));
  let sent = 0;
  let emailed = 0;
  for (const notice of due) {
    const claimed = await claimNotice(notice);
    if (!claimed) continue;
    const users = await recipientUsers(notice);
    console.log('[ddMilestone] notice', {
      deal: notice.dealName,
      stage: notice.stageId,
      edge: notice.edge,
      leadDays: notice.leadDays,
      on: notice.on,
      recipients: users.length
    });
    for (const user of users) {
      const result = await deliverNotice(notice, user);
      if (result.emailed) emailed += 1;
    }
    sent += 1;
  }
  if (due.length) {
    console.log('[ddMilestone] run', { today, due: due.length, sent, emailed });
  }
  return { today, due: due.length, sent, emailed };
}
