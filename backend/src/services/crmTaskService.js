import pool from '../db/pool.js';
import {
  getDealAccess,
  assertCanRead,
  assertCanWrite,
  VISIBLE_DEALS_SQL
} from '../lib/teamAcl.js';
import { createUserAlert } from './userAlertService.js';
import { sendEmail } from './emailService.js';

const WEB_APP_URL = (
  process.env.WEB_APP_URL_LOCAL ||
  process.env.WEB_APP_URL ||
  'http://localhost:5173'
).replace(/\/$/, '');

const FOLLOW_UP_PRESETS = {
  tomorrow: 1,
  '3days': 3,
  '1week': 7
};

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

/** Team-ACL aware deal gate (name kept for existing imports). */
export async function assertDealOwned(userId, savedDealId, { write = true } = {}) {
  const access = await getDealAccess(userId, savedDealId);
  if (write) assertCanWrite(access);
  else assertCanRead(access);
  return {
    id: access.deal.id,
    name: access.deal.name,
    team_id: access.deal.team_id,
    user_id: access.deal.user_id
  };
}

function displayNameFromEmail(email) {
  const local = String(email || '').split('@')[0] || 'Member';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim() || 'Member';
}

async function resolveNotifyRecipients(userId, savedDealId, rawRecipients) {
  if (!Array.isArray(rawRecipients) || rawRecipients.length === 0) {
    return [{ type: 'self', channels: ['in_app', 'email'] }];
  }

  const resolved = [];
  const seenEmails = new Set();

  const pushUnique = (entry) => {
    const key = (entry.email || (entry.type === 'self' ? `self:${userId}` : '')).toLowerCase();
    if (key && seenEmails.has(key)) return;
    if (key) seenEmails.add(key);
    resolved.push(entry);
  };

  for (const r of rawRecipients) {
    if (r.type === 'self') {
      pushUnique({ type: 'self', channels: ['in_app', 'email'] });
      continue;
    }
    if (r.type === 'team_member' && r.userId) {
      const memberId = Number(r.userId);
      if (!memberId || memberId === Number(userId)) continue;
      const row = await pool.query(
        `SELECT u.id, u.email, tm.role
         FROM saved_deals sd
         JOIN team_members tm
           ON tm.team_id = sd.team_id AND tm.status = 'active' AND tm.user_id = $2
         JOIN users u ON u.id = tm.user_id
         WHERE sd.id = $1 AND sd.team_id IS NOT NULL`,
        [savedDealId, memberId]
      );
      const member = row.rows[0];
      if (member?.email) {
        pushUnique({
          type: 'team_member',
          userId: member.id,
          email: member.email.trim().toLowerCase(),
          name: displayNameFromEmail(member.email),
          role: member.role || null,
          channels: ['email']
        });
      }
      continue;
    }
    if (r.type === 'contact' && r.contactId) {
      const row = await pool.query(
        `SELECT c.id, c.name, c.email
         FROM contacts c
         JOIN deal_contacts dc ON dc.contact_id = c.id
         WHERE dc.saved_deal_id = $1 AND c.id = $2`,
        [savedDealId, r.contactId]
      );
      const contact = row.rows[0];
      if (contact?.email) {
        pushUnique({
          type: 'contact',
          contactId: contact.id,
          email: contact.email.trim().toLowerCase(),
          name: contact.name || null,
          channels: ['email']
        });
      }
      continue;
    }
    if (r.type === 'email' && r.email) {
      const email = String(r.email).trim().toLowerCase();
      if (email) {
        pushUnique({
          type: 'email',
          email,
          name: r.name ? String(r.name).trim() : null,
          channels: ['email']
        });
      }
    }
  }

  if (!resolved.length) {
    return [{ type: 'self', channels: ['in_app', 'email'] }];
  }
  return resolved;
}

async function createRemindersForTask(userId, savedDealId, taskId, dueAt, recipients) {
  if (!dueAt) return;

  for (const recipient of recipients) {
    const channels = recipient.channels || (recipient.type === 'self' ? ['in_app', 'email'] : ['email']);
    const recipientEmail = recipient.type === 'self' ? null : recipient.email || null;
    const recipientName = recipient.type === 'self' ? null : recipient.name || null;
    const recipientContactId = recipient.contactId || null;

    for (const channel of channels) {
      if (channel === 'in_app' && recipient.type !== 'self') continue;

      await pool.query(
        `INSERT INTO reminders (
           user_id, saved_deal_id, task_id, remind_at, channel,
           recipient_email, recipient_name, recipient_contact_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          userId,
          savedDealId,
          taskId,
          dueAt,
          channel,
          recipientEmail,
          recipientName,
          recipientContactId
        ]
      );
    }
  }
}

function clampPriority(p) {
  const n = Number(p);
  if (!Number.isFinite(n)) return 3;
  return Math.min(4, Math.max(1, Math.round(n)));
}

function normalizeRecurrence(v) {
  if (!v) return null;
  const r = String(v).toLowerCase().trim();
  if (['daily', 'weekly', 'monthly'].includes(r)) return r;
  return null;
}

export async function listAllTasks(userId, { status = 'open', assignee = null, parentOnly = true } = {}) {
  let statusClause = "AND t.status = 'open'";
  if (status === 'done') statusClause = "AND t.status = 'done'";
  else if (status === 'all') statusClause = '';

  let assigneeClause = '';
  const params = [userId];
  if (assignee === 'me') {
    params.push(userId);
    assigneeClause = `AND (t.assignee_user_id = $${params.length} OR (t.assignee_user_id IS NULL AND t.user_id = $${params.length}))`;
  } else if (assignee === 'team') {
    assigneeClause = `AND t.assignee_user_id IS NOT NULL AND t.assignee_user_id <> $1`;
  } else if (assignee && Number(assignee)) {
    params.push(Number(assignee));
    assigneeClause = `AND t.assignee_user_id = $${params.length}`;
  }

  const parentClause = parentOnly ? 'AND t.parent_task_id IS NULL' : '';

  const result = await pool.query(
    `SELECT t.id, t.saved_deal_id, t.title, t.status, t.due_at, t.completed_at, t.source, t.metadata,
            t.created_at, t.user_id, t.assignee_user_id, t.parent_task_id, t.priority, t.recurrence,
            sd.name AS deal_name, sd.progress_stage,
            ua.email AS assignee_email,
            (SELECT COUNT(*)::int FROM tasks sub WHERE sub.parent_task_id = t.id) AS subtask_count,
            (SELECT COUNT(*)::int FROM tasks sub WHERE sub.parent_task_id = t.id AND sub.status = 'done') AS subtask_done_count
     FROM tasks t
     JOIN saved_deals sd ON sd.id = t.saved_deal_id
     LEFT JOIN users ua ON ua.id = t.assignee_user_id
     WHERE ${VISIBLE_DEALS_SQL} ${statusClause} ${assigneeClause} ${parentClause}
     ORDER BY
       CASE WHEN t.status = 'open' THEN 0 ELSE 1 END,
       t.priority ASC,
       t.due_at ASC NULLS LAST,
       t.created_at DESC`,
    params
  );
  return result.rows;
}

export async function listDealTasks(userId, savedDealId) {
  await assertDealOwned(userId, savedDealId, { write: false });
  const result = await pool.query(
    `SELECT t.id, t.saved_deal_id, t.title, t.status, t.due_at, t.completed_at, t.source, t.metadata,
            t.created_at, t.user_id, t.assignee_user_id, t.parent_task_id, t.priority, t.recurrence,
            ua.email AS assignee_email
     FROM tasks t
     LEFT JOIN users ua ON ua.id = t.assignee_user_id
     WHERE t.saved_deal_id = $1
     ORDER BY t.parent_task_id NULLS FIRST, t.priority ASC, t.due_at ASC NULLS LAST, t.created_at DESC`,
    [savedDealId]
  );
  return result.rows;
}

export async function createTask(
  userId,
  savedDealId,
  {
    title,
    dueAt,
    source = 'manual',
    metadata = {},
    notifyRecipients,
    assigneeUserId = null,
    parentTaskId = null,
    priority = 3,
    recurrence = null
  }
) {
  const deal = await assertDealOwned(userId, savedDealId, { write: true });
  const trimmed = (title || '').trim();
  if (!trimmed) {
    const err = new Error('Task title is required');
    err.status = 400;
    throw err;
  }

  if (parentTaskId) {
    const parent = await pool.query(
      'SELECT id, saved_deal_id FROM tasks WHERE id = $1',
      [parentTaskId]
    );
    if (!parent.rows.length || Number(parent.rows[0].saved_deal_id) !== Number(savedDealId)) {
      const err = new Error('Parent task not found on this deal');
      err.status = 400;
      throw err;
    }
  }

  let assignee = assigneeUserId != null ? Number(assigneeUserId) : null;
  if (assignee && Number.isFinite(assignee)) {
    // Must be self or active team member on team deals
    if (assignee !== Number(userId) && deal.team_id) {
      const member = await pool.query(
        `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 AND status = 'active'`,
        [deal.team_id, assignee]
      );
      if (!member.rows.length) {
        const err = new Error('Assignee must be a team member');
        err.status = 400;
        throw err;
      }
    } else if (assignee !== Number(userId) && !deal.team_id) {
      assignee = userId; // personal deals: only self
    }
  } else {
    assignee = userId;
  }

  const recipients = await resolveNotifyRecipients(userId, savedDealId, notifyRecipients);
  const taskMetadata = {
    ...metadata,
    createdBy: metadata.createdBy || userId,
    assignedBy: assignee !== Number(userId) ? userId : metadata.assignedBy || userId,
    notifyRecipients: recipients.map(({ type, email, name, contactId, userId: recipientUserId }) => ({
      type,
      email: email || null,
      name: name || null,
      contactId: contactId || null,
      userId: recipientUserId || null
    }))
  };

  const result = await pool.query(
    `INSERT INTO tasks (
       user_id, saved_deal_id, title, due_at, source, metadata,
       assignee_user_id, parent_task_id, priority, recurrence
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      userId,
      savedDealId,
      trimmed,
      dueAt || null,
      source,
      JSON.stringify(taskMetadata),
      assignee,
      parentTaskId || null,
      clampPriority(priority),
      normalizeRecurrence(recurrence)
    ]
  );

  const task = result.rows[0];

  if (dueAt) {
    const reminderUserId = assignee || userId;
    await createRemindersForTask(reminderUserId, savedDealId, task.id, dueAt, recipients);
  }

  if (assignee && Number(assignee) !== Number(userId)) {
    const assignerRes = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    const who = displayNameFromEmail(assignerRes.rows[0]?.email);
    await createUserAlert({
      userId: assignee,
      alertType: 'task_assigned',
      title: `${who} assigned you: ${trimmed.slice(0, 72)}`,
      body: deal.name ? `On ${deal.name}` : null,
      savedDealId,
      metadata: { taskId: task.id, assignedBy: userId, openTasks: true, dealName: deal.name || null }
    }).catch((err) => console.warn('[crmTask] assignee alert failed:', err.message));
  }

  await pool.query(
    `INSERT INTO activities (user_id, saved_deal_id, activity_type, body, metadata)
     VALUES ($1, $2, 'task_created', $3, $4)`,
    [
      userId,
      savedDealId,
      `Task: ${trimmed}`,
      JSON.stringify({
        taskId: task.id,
        dueAt: dueAt || null,
        assigneeUserId: assignee,
        notifyRecipients: taskMetadata.notifyRecipients
      })
    ]
  );

  console.log(
    `[crmTask] created task=${task.id} deal=${savedDealId} (${deal.name}) assignee=${assignee} recipients=${recipients.length}`
  );
  return task;
}

export async function createQuickFollowUp(
  userId,
  savedDealId,
  { preset, dueAt, title, notifyRecipients, force = false }
) {
  const days = FOLLOW_UP_PRESETS[preset];
  const resolvedDue = dueAt || (days != null ? addDays(days) : addDays(3));
  const deal = await assertDealOwned(userId, savedDealId, { write: true });
  const taskTitle = (title || '').trim() || `Follow up: ${deal.name}`;

  // Chip presets: avoid silent duplicate Tomorrow/3-day/1-week tasks unless forced
  if (preset && FOLLOW_UP_PRESETS[preset] != null && !force) {
    const dup = await pool.query(
      `SELECT id, title, due_at, status, source, metadata, created_at
       FROM tasks
       WHERE saved_deal_id = $1
         AND status = 'open'
         AND source = 'follow_up_chip'
         AND metadata->>'preset' = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [savedDealId, preset]
    );
    if (dup.rows[0]) {
      console.log('[crmTask] duplicate follow-up chip blocked', {
        dealId: savedDealId,
        preset,
        existingTaskId: dup.rows[0].id
      });
      const err = new Error(
        `An open “${preset}” follow-up already exists for this deal. Create another?`
      );
      err.status = 409;
      err.code = 'duplicate_follow_up';
      err.existingTask = dup.rows[0];
      throw err;
    }
  }

  return createTask(userId, savedDealId, {
    title: taskTitle,
    dueAt: resolvedDue,
    source: preset ? 'follow_up_chip' : 'follow_up_custom',
    metadata: { preset: preset || 'custom' },
    notifyRecipients
  });
}

function nextRecurrenceDue(fromDue, recurrence) {
  const base = fromDue ? new Date(fromDue) : new Date();
  if (Number.isNaN(base.getTime())) return null;
  if (recurrence === 'daily') base.setDate(base.getDate() + 1);
  else if (recurrence === 'weekly') base.setDate(base.getDate() + 7);
  else if (recurrence === 'monthly') base.setMonth(base.getMonth() + 1);
  else return null;
  base.setHours(9, 0, 0, 0);
  return base.toISOString();
}

export async function updateTask(userId, taskId, patch) {
  const existing = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!existing.rows.length) {
    const err = new Error('Task not found');
    err.status = 404;
    throw err;
  }

  const task = existing.rows[0];
  await assertDealOwned(userId, task.saved_deal_id, { write: true });

  const title = patch.title != null ? String(patch.title).trim() : task.title;
  const status = patch.status != null ? patch.status : task.status;
  const dueAt = patch.dueAt !== undefined ? patch.dueAt : task.due_at;
  const priority = patch.priority !== undefined ? clampPriority(patch.priority) : (task.priority ?? 3);
  const recurrence =
    patch.recurrence !== undefined ? normalizeRecurrence(patch.recurrence) : task.recurrence;
  let assigneeUserId =
    patch.assigneeUserId !== undefined ? patch.assigneeUserId : task.assignee_user_id;
  if (assigneeUserId != null) assigneeUserId = Number(assigneeUserId) || null;

  const completedAt =
    status === 'done' && task.status !== 'done'
      ? new Date().toISOString()
      : status === 'done'
        ? task.completed_at
        : null;

  const result = await pool.query(
    `UPDATE tasks SET
       title = $1, status = $2, due_at = $3, completed_at = $4,
       assignee_user_id = $5, priority = $6, recurrence = $7, updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [title, status, dueAt, completedAt, assigneeUserId, priority, recurrence, taskId]
  );

  if (status === 'done' && task.status !== 'done') {
    await pool.query(
      `INSERT INTO activities (user_id, saved_deal_id, activity_type, body, metadata)
       VALUES ($1, $2, 'task_completed', $3, $4)`,
      [userId, task.saved_deal_id, `Completed: ${title}`, JSON.stringify({ taskId })]
    );
    await notifyTaskAssignerOnComplete({
      completerUserId: userId,
      task: { ...task, title }
    }).catch((err) => {
      console.warn('[crmTask] assigner notify failed:', err.message);
    });

    // Recurring: spawn next occurrence
    const recur = recurrence || task.recurrence;
    if (recur) {
      const nextDue = nextRecurrenceDue(task.due_at || dueAt, recur);
      if (nextDue) {
        await createTask(userId, task.saved_deal_id, {
          title,
          dueAt: nextDue,
          source: task.source || 'manual',
          metadata: { ...(typeof task.metadata === 'object' ? task.metadata : {}), recurringFrom: taskId },
          assigneeUserId: assigneeUserId || task.assignee_user_id || userId,
          priority,
          recurrence: recur,
          notifyRecipients: [{ type: 'self' }]
        }).catch((err) => console.warn('[crmTask] recurrence spawn failed:', err.message));
      }
    }
  }

  return result.rows[0];
}

export async function listTaskComments(userId, taskId) {
  const existing = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!existing.rows.length) {
    const err = new Error('Task not found');
    err.status = 404;
    throw err;
  }
  await assertDealOwned(userId, existing.rows[0].saved_deal_id, { write: false });
  const result = await pool.query(
    `SELECT tc.id, tc.task_id, tc.body, tc.created_at, tc.user_id, u.email AS author_email
     FROM task_comments tc
     JOIN users u ON u.id = tc.user_id
     WHERE tc.task_id = $1
     ORDER BY tc.created_at ASC`,
    [taskId]
  );
  return result.rows;
}

export async function addTaskComment(userId, taskId, body) {
  const existing = await pool.query('SELECT * FROM tasks WHERE id = $1', [taskId]);
  if (!existing.rows.length) {
    const err = new Error('Task not found');
    err.status = 404;
    throw err;
  }
  await assertDealOwned(userId, existing.rows[0].saved_deal_id, { write: true });
  const trimmed = String(body || '').trim();
  if (!trimmed) {
    const err = new Error('Comment body required');
    err.status = 400;
    throw err;
  }
  const result = await pool.query(
    `INSERT INTO task_comments (task_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING id, task_id, body, created_at, user_id`,
    [taskId, userId, trimmed]
  );
  console.log('[crmTask] comment on task', taskId);
  return result.rows[0];
}

/** Alert the person who assigned/created the task (not the completer). */
async function notifyTaskAssignerOnComplete({ completerUserId, task }) {
  const meta = task.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const assignerId = Number(meta.assignedBy || meta.createdBy || task.user_id);
  if (!assignerId || assignerId === Number(completerUserId)) {
    console.log('[crmTask] skip assigner alert (self-complete or no assigner)', {
      taskId: task.id,
      assignerId,
      completerUserId
    });
    return;
  }

  const users = await pool.query(
    `SELECT id, email FROM users WHERE id = ANY($1::int[])`,
    [[assignerId, completerUserId]]
  );
  const byId = new Map(users.rows.map((u) => [Number(u.id), u]));
  const assigner = byId.get(assignerId);
  const completer = byId.get(Number(completerUserId));
  if (!assigner) return;

  const deal = await pool.query(`SELECT name FROM saved_deals WHERE id = $1`, [task.saved_deal_id]);
  const dealName = deal.rows[0]?.name || 'a deal';
  const completerLabel = completer?.email
    ? String(completer.email).split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'A teammate';

  await createUserAlert({
    userId: assignerId,
    alertType: 'task_completed',
    title: `${completerLabel} completed “${String(task.title || '').slice(0, 48)}”`,
    body: `On ${dealName}`,
    savedDealId: task.saved_deal_id,
    metadata: {
      taskId: task.id,
      dealName,
      completedBy: completerUserId,
      openTasks: true
    }
  });

  if (assigner.email) {
    const link = `${WEB_APP_URL}/dashboard?tab=crm&crmSubview=tasks&crmDeal=${task.saved_deal_id}`;
    await sendEmail({
      to: assigner.email,
      subject: `Task completed: ${task.title}`,
      html: `<p><strong>${completerLabel}</strong> marked a task done on <strong>${dealName}</strong>:</p>
             <p>${task.title}</p>
             <p><a href="${link}">Open Tasks in Vettr</a></p>`
    }).catch((err) => console.warn('[crmTask] completion email failed:', err.message));
  }

  console.log(
    `[crmTask] task=${task.id} completed by=${completerUserId}; alerted assigner=${assignerId}`
  );
}

export async function getTodayTaskSummary(userId) {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const result = await pool.query(
    `SELECT t.id, t.user_id, t.saved_deal_id, t.title, t.status, t.due_at, t.source,
            t.assignee_user_id, t.priority, t.recurrence, t.parent_task_id,
            sd.name AS deal_name, sd.progress_stage,
            ua.email AS assignee_email
     FROM tasks t
     JOIN saved_deals sd ON sd.id = t.saved_deal_id
     LEFT JOIN users ua ON ua.id = t.assignee_user_id
     WHERE ${VISIBLE_DEALS_SQL} AND t.status = 'open' AND t.parent_task_id IS NULL
     ORDER BY t.priority ASC, t.due_at ASC NULLS LAST, t.created_at DESC`,
    [userId]
  );

  const open = result.rows;
  const overdue = [];
  const dueToday = [];
  const upcoming = [];

  for (const task of open) {
    const assignedToMe =
      Number(task.assignee_user_id || task.user_id) === Number(userId);
    if (!task.due_at) {
      // Undated work assigned to me → Today
      if (assignedToMe) dueToday.push(task);
      else upcoming.push(task);
      continue;
    }
    const due = new Date(task.due_at);
    if (due < startOfDay) {
      if (assignedToMe) overdue.push(task);
      else upcoming.push(task);
    } else if (due <= endOfDay) {
      if (assignedToMe) dueToday.push(task);
      else upcoming.push(task);
    } else upcoming.push(task);
  }

  return {
    overdue,
    dueToday,
    upcoming,
    openCount: open.length,
    badgeCount: overdue.length + dueToday.length
  };
}
