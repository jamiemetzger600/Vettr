import pool from '../db/pool.js';
import { getDealAccess, assertCanWrite, VISIBLE_DEALS_SQL } from '../lib/teamAcl.js';
import {
  listGoogleCalendarEvents,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  isGoogleCalendarConnected
} from './googleCalendarService.js';

const VETTR_EXTENDED_PROP = 'vettrEventId';
const TASK_EXTENDED_PROP = 'vettrTaskId';

function mapRow(row) {
  const savedDealId = row.linked_deal_id ?? row.saved_deal_id ?? null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    allDay: row.all_day,
    source: row.source,
    googleEventId: row.google_event_id,
    taskId: row.task_id,
    savedDealId: savedDealId != null ? Number(savedDealId) : null,
    dealName: row.deal_name || null
  };
}

function defaultEnd(startIso, allDay = false) {
  const start = new Date(startIso);
  if (allDay) {
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return end.toISOString();
  }
  return new Date(start.getTime() + 60 * 60 * 1000).toISOString();
}

function civilDate(value) {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function addCivilDays(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function normalizeStoredTimes(startsAt, endsAt, allDay) {
  if (!allDay) {
    const start = new Date(startsAt).toISOString();
    const end = endsAt ? new Date(endsAt).toISOString() : defaultEnd(start, false);
    return { start, end };
  }
  const startDate = civilDate(startsAt);
  if (!startDate) {
    const err = new Error('Start time is required');
    err.status = 400;
    throw err;
  }
  let endDate = civilDate(endsAt);
  if (!endDate || endDate <= startDate) endDate = addCivilDays(startDate, 1);
  return {
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T00:00:00.000Z`
  };
}

function googleEventToLocal(userId, item) {
  const start = item.start?.dateTime || item.start?.date;
  const end = item.end?.dateTime || item.end?.date;
  const allDay = Boolean(item.start?.date && !item.start?.dateTime);
  const vettrId = item.extendedProperties?.private?.[VETTR_EXTENDED_PROP];
  const taskId = item.extendedProperties?.private?.[TASK_EXTENDED_PROP];

  return {
    userId,
    googleEventId: item.id,
    source: vettrId || taskId ? 'vettr' : 'google',
    title: item.summary || '(No title)',
    description: item.description || null,
    startsAt: allDay ? `${start}T00:00:00.000Z` : new Date(start).toISOString(),
    endsAt: allDay ? `${end}T00:00:00.000Z` : new Date(end).toISOString(),
    allDay,
    googleUpdatedAt: item.updated ? new Date(item.updated).toISOString() : null,
    deleted: item.status === 'cancelled',
    vettrEventId: vettrId ? Number(vettrId) : null,
    taskId: taskId ? Number(taskId) : null
  };
}

async function upsertGoogleEvent(local) {
  if (local.deleted) {
    await pool.query(
      `UPDATE calendar_events SET deleted_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND google_event_id = $2`,
      [local.userId, local.googleEventId]
    );
    return;
  }

  const existing = await pool.query(
    `SELECT id FROM calendar_events WHERE user_id = $1 AND google_event_id = $2`,
    [local.userId, local.googleEventId]
  );

  if (existing.rows.length) {
    await pool.query(
      `UPDATE calendar_events
       SET title = $1, description = $2, starts_at = $3, ends_at = $4, all_day = $5,
           google_updated_at = $6, deleted_at = NULL, updated_at = NOW(),
           task_id = COALESCE($7, task_id)
       WHERE id = $8`,
      [
        local.title,
        local.description,
        local.startsAt,
        local.endsAt,
        local.allDay,
        local.googleUpdatedAt,
        local.taskId,
        existing.rows[0].id
      ]
    );
    return;
  }

  await pool.query(
    `INSERT INTO calendar_events (
       user_id, google_event_id, source, title, description, starts_at, ends_at, all_day,
       google_updated_at, task_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      local.userId,
      local.googleEventId,
      local.source,
      local.title,
      local.description,
      local.startsAt,
      local.endsAt,
      local.allDay,
      local.googleUpdatedAt,
      local.taskId
    ]
  );
}

async function pushOpenTasksToGoogle(userId, startIso, endIso) {
  const tasks = await pool.query(
    `SELECT t.id, t.title, t.due_at, t.saved_deal_id, t.status, sd.name AS deal_name,
            ce.google_event_id
     FROM tasks t
     JOIN saved_deals sd ON sd.id = t.saved_deal_id
     LEFT JOIN calendar_events ce ON ce.task_id = t.id AND ce.user_id = $1 AND ce.deleted_at IS NULL
     WHERE ${VISIBLE_DEALS_SQL}
       AND t.status = 'open'
       AND t.due_at IS NOT NULL
       AND t.parent_task_id IS NULL
       AND (
         t.source IN ('follow_up_chip', 'follow_up_custom')
         OR EXISTS (SELECT 1 FROM dd_checklists c WHERE c.saved_deal_id = t.saved_deal_id)
       )
       AND t.due_at >= $2::timestamptz
       AND t.due_at <= $3::timestamptz`,
    [userId, startIso, endIso]
  );

  for (const task of tasks.rows) {
    const startsAt = new Date(task.due_at).toISOString();
    const endsAt = defaultEnd(startsAt, false);
    const title = task.deal_name ? `${task.title} (${task.deal_name})` : task.title;
    const description = 'Vettr CRM task';

    if (task.google_event_id) {
      await updateGoogleCalendarEvent(userId, task.google_event_id, {
        title,
        description,
        startsAt,
        endsAt,
        allDay: false,
        vettrEventId: null,
        taskId: task.id
      });
      await pool.query(
        `UPDATE calendar_events
         SET title = $1, description = $2, starts_at = $3, ends_at = $4,
             saved_deal_id = $7, task_id = $8, updated_at = NOW()
         WHERE user_id = $5 AND google_event_id = $6`,
        [title, description, startsAt, endsAt, userId, task.google_event_id, task.saved_deal_id, task.id]
      );
      continue;
    }

    const googleEvent = await createGoogleCalendarEvent(userId, {
      title,
      description,
      startsAt,
      endsAt,
      allDay: false,
      taskId: task.id
    });

    await pool.query(
      `INSERT INTO calendar_events (
         user_id, google_event_id, source, task_id, saved_deal_id, title, description,
         starts_at, ends_at, all_day, google_updated_at
       )
       VALUES ($1, $2, 'vettr', $3, $4, $5, $6, $7, $8, false, NOW())
       ON CONFLICT (user_id, google_event_id) WHERE google_event_id IS NOT NULL DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         starts_at = EXCLUDED.starts_at,
         ends_at = EXCLUDED.ends_at,
         task_id = EXCLUDED.task_id,
         updated_at = NOW(),
         deleted_at = NULL`,
      [
        userId,
        googleEvent.id,
        task.id,
        task.saved_deal_id,
        title,
        description,
        startsAt,
        endsAt
      ]
    );
  }
}

export async function syncCalendarRange(userId, startIso, endIso) {
  if (!(await isGoogleCalendarConnected(userId))) {
    return { synced: false, reason: 'not_connected' };
  }

  const googleItems = await listGoogleCalendarEvents(userId, startIso, endIso);
  for (const item of googleItems) {
    await upsertGoogleEvent(googleEventToLocal(userId, item));
  }

  await pushOpenTasksToGoogle(userId, startIso, endIso);
  console.log(`[crmCalendar] synced ${googleItems.length} Google events for user=${userId}`);
  return { synced: true, googleCount: googleItems.length };
}

export async function listCalendarEvents(userId, startIso, endIso, { sync = true } = {}) {
  if (sync) {
    await syncCalendarRange(userId, startIso, endIso);
  }

  const result = await pool.query(
    `SELECT ce.*,
            COALESCE(ce.saved_deal_id, t.saved_deal_id) AS linked_deal_id,
            COALESCE(sd.name, tsd.name) AS deal_name
     FROM calendar_events ce
     LEFT JOIN tasks t ON t.id = ce.task_id
     LEFT JOIN saved_deals sd ON sd.id = ce.saved_deal_id
     LEFT JOIN saved_deals tsd ON tsd.id = t.saved_deal_id
     WHERE ce.user_id = $1
       AND ce.deleted_at IS NULL
       AND ce.starts_at < $3::timestamptz
       AND ce.ends_at > $2::timestamptz
     ORDER BY ce.starts_at ASC`,
    [userId, startIso, endIso]
  );

  return result.rows.map(mapRow);
}

export async function createCalendarEvent(userId, { title, description, startsAt, endsAt, allDay, savedDealId }) {
  const trimmed = (title || '').trim();
  if (!trimmed) {
    const err = new Error('Event title is required');
    err.status = 400;
    throw err;
  }
  if (!startsAt) {
    const err = new Error('Start time is required');
    err.status = 400;
    throw err;
  }

  const { start, end } = normalizeStoredTimes(startsAt, endsAt, allDay);
  console.log('[calendar] create event', { allDay: !!allDay, start, end, title: trimmed });

  if (!(await isGoogleCalendarConnected(userId))) {
    const err = new Error('Connect Google Calendar first');
    err.status = 400;
    throw err;
  }

  if (savedDealId) {
    const access = await getDealAccess(userId, savedDealId);
    assertCanWrite(access);
  }

  const inserted = await pool.query(
    `INSERT INTO calendar_events (
       user_id, source, title, description, starts_at, ends_at, all_day, saved_deal_id
     )
     VALUES ($1, 'vettr', $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [userId, trimmed, description || null, start, end, !!allDay, savedDealId || null]
  );

  const local = inserted.rows[0];
  const googleEvent = await createGoogleCalendarEvent(userId, {
    title: trimmed,
    description: description || '',
    startsAt: start,
    endsAt: end,
    allDay: !!allDay,
    vettrEventId: local.id
  });

  const updated = await pool.query(
    `UPDATE calendar_events
     SET google_event_id = $1, google_updated_at = NOW(), updated_at = NOW()
     WHERE id = $2 AND user_id = $3
     RETURNING *`,
    [googleEvent.id, local.id, userId]
  );

  const row = await pool.query(
    `SELECT ce.*, sd.name AS deal_name
     FROM calendar_events ce
     LEFT JOIN saved_deals sd ON sd.id = ce.saved_deal_id
     WHERE ce.id = $1`,
    [updated.rows[0].id]
  );
  return mapRow(row.rows[0]);
}

export async function updateCalendarEvent(userId, eventId, patch) {
  const existing = await pool.query(
    'SELECT * FROM calendar_events WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [eventId, userId]
  );
  if (!existing.rows.length) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  const row = existing.rows[0];
  const title = patch.title != null ? String(patch.title).trim() : row.title;
  const description = patch.description !== undefined ? patch.description : row.description;
  const allDay = patch.allDay !== undefined ? !!patch.allDay : row.all_day;
  const times = (patch.startsAt || patch.endsAt || patch.allDay !== undefined)
    ? normalizeStoredTimes(
        patch.startsAt || row.starts_at,
        patch.endsAt || row.ends_at,
        allDay
      )
    : { start: row.starts_at, end: row.ends_at };
  const startsAt = times.start;
  const endsAt = times.end;
  console.log('[calendar] update event', { eventId, allDay, startsAt, endsAt });

  if (row.google_event_id) {
    await updateGoogleCalendarEvent(userId, row.google_event_id, {
      title,
      description: description || '',
      startsAt,
      endsAt,
      allDay,
      vettrEventId: row.id,
      taskId: row.task_id
    });
  }

  const updated = await pool.query(
    `UPDATE calendar_events
     SET title = $1, description = $2, starts_at = $3, ends_at = $4, all_day = $5, updated_at = NOW()
     WHERE id = $6 AND user_id = $7
     RETURNING *`,
    [title, description, startsAt, endsAt, allDay, eventId, userId]
  );

  const withDeal = await pool.query(
    `SELECT ce.*, sd.name AS deal_name
     FROM calendar_events ce
     LEFT JOIN saved_deals sd ON sd.id = ce.saved_deal_id
     WHERE ce.id = $1`,
    [updated.rows[0].id]
  );
  return mapRow(withDeal.rows[0]);
}

export async function deleteCalendarEvent(userId, eventId) {
  const existing = await pool.query(
    'SELECT * FROM calendar_events WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
    [eventId, userId]
  );
  if (!existing.rows.length) {
    const err = new Error('Event not found');
    err.status = 404;
    throw err;
  }

  const row = existing.rows[0];
  if (row.google_event_id) {
    await deleteGoogleCalendarEvent(userId, row.google_event_id);
  }

  await pool.query(
    'UPDATE calendar_events SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1',
    [eventId]
  );
  return { deleted: true };
}
