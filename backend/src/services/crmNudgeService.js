import pool from '../db/pool.js';
import { VISIBLE_DEALS_SQL } from '../lib/teamAcl.js';
import { createTask, updateTask } from './crmTaskService.js';
import { updateDealPipelineStage } from './crmStageService.js';
import { adminActionForStage, adminActionByKey } from '../constants/adminPlaybook.js';
import { matchIndustryKey, isFranchiseTagged } from '../lib/industryMatcher.js';

const NUDGE_SOURCES = ['intake_nudge', 'stage_nudge'];
const FOLLOW_NDA_MIN_DAYS = 2;

/**
 * Off: do not auto-create industry/stage next-step tasks.
 * Re-enable with a confirm-first UI — see docs/misc/ROADMAP.md
 */
export const AUTO_QUEUE_STAGE_NUDGES = false;

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

function industryKeyFor(industry) {
  return isFranchiseTagged(industry) ? 'franchise' : matchIndustryKey(industry);
}

function sourceForAction(action) {
  return action?.key === 'request_nda' ? 'intake_nudge' : 'stage_nudge';
}

async function findOpenNudge(savedDealId, key) {
  const row = await pool.query(
    `SELECT id, title, due_at, source, metadata
     FROM tasks
     WHERE saved_deal_id = $1
       AND status = 'open'
       AND source = ANY($2::text[])
       AND metadata->>'key' = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [savedDealId, NUDGE_SOURCES, key]
  );
  return row.rows[0] || null;
}

async function hasAnyOpenNudge(savedDealId) {
  const row = await pool.query(
    `SELECT id FROM tasks
     WHERE saved_deal_id = $1 AND status = 'open' AND source = ANY($2::text[])
     LIMIT 1`,
    [savedDealId, NUDGE_SOURCES]
  );
  return Boolean(row.rows[0]);
}

export async function ensureNudgeTask(userId, savedDealId, action) {
  if (!action?.title) return null;
  const existing = await findOpenNudge(savedDealId, action.key);
  if (existing) {
    return { task: existing, created: false };
  }

  const dueAt = action.dueDays != null ? addDays(action.dueDays) : null;
  const task = await createTask(userId, savedDealId, {
    title: action.title,
    dueAt,
    source: sourceForAction(action),
    metadata: { key: action.key },
    priority: 2
  });
  console.log('[crmNudge] queued', {
    savedDealId,
    taskId: task.id,
    key: action.key,
    dueAt
  });
  return { task, created: true };
}

/** First save to CRM (Inbox): queue Request NDA. Later stages: queue that stage's next step. */
export async function ensureIntakeNudge(userId, savedDealId) {
  if (!AUTO_QUEUE_STAGE_NUDGES) {
    console.log('[crmNudge] auto-queue off, skip intake', { userId, savedDealId });
    return null;
  }
  const row = await pool.query(
    `SELECT id, progress_stage, industry
     FROM saved_deals WHERE id = $1`,
    [savedDealId]
  );
  const deal = row.rows[0];
  if (!deal) return null;
  const action = adminActionForStage(deal.progress_stage, industryKeyFor(deal.industry));
  return ensureNudgeTask(userId, savedDealId, action);
}

export async function ensureStageNudge(userId, savedDealId, stage, industry) {
  if (!AUTO_QUEUE_STAGE_NUDGES) {
    console.log('[crmNudge] auto-queue off, skip stage', { userId, savedDealId, stage });
    return null;
  }
  const action = adminActionForStage(stage, industryKeyFor(industry));
  return ensureNudgeTask(userId, savedDealId, action);
}

/**
 * Inbox + early screening deals that still need an admin step and have no
 * open nudge task yet (covers deals saved before this feature).
 */
export async function listComputedNudges(userId, { limit = 25 } = {}) {
  if (!AUTO_QUEUE_STAGE_NUDGES) return [];
  const result = await pool.query(
    `SELECT sd.id AS saved_deal_id,
            sd.name AS deal_name,
            sd.progress_stage,
            sd.industry,
            sd.saved_at,
            GREATEST(
              0,
              EXTRACT(DAY FROM NOW() - COALESCE(sd.updated_at, sd.saved_at))::int
            ) AS days_in_stage
     FROM saved_deals sd
     WHERE ${VISIBLE_DEALS_SQL}
       AND (
         sd.progress_stage IS NULL
         OR TRIM(sd.progress_stage) = ''
         OR sd.progress_stage IN ('Requested NDA', 'Signed NDA', 'Review CIM', 'Seller Call')
       )
       AND (sd.progress_stage IS NULL OR sd.progress_stage NOT ILIKE '%passed%')
       AND NOT EXISTS (
         SELECT 1 FROM tasks t
         WHERE t.saved_deal_id = sd.id
           AND t.status = 'open'
           AND t.source = ANY($2::text[])
       )
     ORDER BY sd.saved_at DESC
     LIMIT $3`,
    [userId, NUDGE_SOURCES, limit]
  );

  const nudges = [];
  for (const row of result.rows) {
    const stage = (row.progress_stage || '').trim();
    if (stage === 'Requested NDA' && Number(row.days_in_stage) < FOLLOW_NDA_MIN_DAYS) {
      continue;
    }
    const action = adminActionForStage(stage, industryKeyFor(row.industry));
    if (!action) continue;
    nudges.push({
      saved_deal_id: row.saved_deal_id,
      deal_name: row.deal_name,
      progress_stage: stage || null,
      title: action.title,
      key: action.key,
      ctaLabel: action.ctaLabel,
      task_id: null,
      due_at: null
    });
  }
  return nudges;
}

export async function listNudgeQueue(userId, { limit = 25 } = {}) {
  const open = await pool.query(
    `SELECT t.id AS task_id,
            t.saved_deal_id,
            t.title,
            t.due_at,
            t.metadata,
            sd.name AS deal_name,
            sd.progress_stage
     FROM tasks t
     JOIN saved_deals sd ON sd.id = t.saved_deal_id
     WHERE ${VISIBLE_DEALS_SQL}
       AND t.status = 'open'
       AND t.source = ANY($2::text[])
     ORDER BY t.due_at ASC NULLS FIRST, t.created_at DESC
     LIMIT $3`,
    [userId, NUDGE_SOURCES, limit]
  );

  const fromTasks = open.rows.map((row) => {
    const meta = typeof row.metadata === 'object' && row.metadata ? row.metadata : {};
    const action = adminActionByKey(meta.key) || adminActionForStage(row.progress_stage);
    return {
      saved_deal_id: row.saved_deal_id,
      deal_name: row.deal_name,
      progress_stage: row.progress_stage || null,
      title: row.title,
      key: meta.key || action?.key || 'request_nda',
      ctaLabel: action?.ctaLabel || 'Did it',
      task_id: row.task_id,
      due_at: row.due_at
    };
  });

  const seen = new Set(fromTasks.map((n) => Number(n.saved_deal_id)));
  const computed = await listComputedNudges(userId, { limit });
  const rest = computed.filter((n) => !seen.has(Number(n.saved_deal_id)));
  return [...fromTasks, ...rest].slice(0, limit);
}

export async function completeNudge(userId, savedDealId, { taskId = null, actionKey = null } = {}) {
  const dealRow = await pool.query(
    `SELECT id, progress_stage, industry FROM saved_deals WHERE id = $1`,
    [savedDealId]
  );
  const deal = dealRow.rows[0];
  if (!deal) {
    const err = new Error('Deal not found');
    err.status = 404;
    throw err;
  }

  let action = actionKey ? adminActionByKey(actionKey) : null;
  let resolvedTaskId = taskId ? Number(taskId) : null;

  if (resolvedTaskId) {
    const taskRow = await pool.query(
      `SELECT id, metadata, source FROM tasks WHERE id = $1 AND saved_deal_id = $2`,
      [resolvedTaskId, savedDealId]
    );
    const task = taskRow.rows[0];
    if (!task) {
      const err = new Error('Task not found on this deal');
      err.status = 404;
      throw err;
    }
    const meta = typeof task.metadata === 'object' ? task.metadata : {};
    if (!action && meta?.key) action = adminActionByKey(meta.key);
  }

  if (!action) {
    action = adminActionForStage(deal.progress_stage, industryKeyFor(deal.industry));
  }
  if (!action) {
    const err = new Error('No next step for this deal');
    err.status = 400;
    throw err;
  }

  if (!resolvedTaskId) {
    const ensured = await ensureNudgeTask(userId, savedDealId, action);
    resolvedTaskId = Number(ensured?.task?.id);
  }

  if (resolvedTaskId) {
    await updateTask(userId, resolvedTaskId, { status: 'done' });
  }

  let stageResult = null;
  if (action.completeStage) {
    stageResult = await updateDealPipelineStage(userId, savedDealId, action.completeStage);
  }

  console.log('[crmNudge] completed', {
    savedDealId,
    taskId: resolvedTaskId,
    key: action.key,
    nextStage: action.completeStage || null
  });

  return { ok: true, taskId: resolvedTaskId, action, stageResult };
}

export { hasAnyOpenNudge };
