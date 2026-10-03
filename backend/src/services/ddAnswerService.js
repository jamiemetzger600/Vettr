import pool from '../db/pool.js';
import { requireDealAccess, getMembership } from '../lib/teamAcl.js';
import { normalizeQaCategory, normalizeQaSource, QA_CATEGORIES } from '../lib/cloudFiles.js';

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function mapAnswer(row) {
  return {
    id: row.id,
    teamId: row.team_id,
    savedDealId: row.saved_deal_id,
    dealName: row.deal_name || null,
    itemId: row.item_id,
    category: row.category,
    question: row.question,
    answer: row.answer,
    source: row.source,
    cloudProvider: row.cloud_provider,
    cloudFileId: row.cloud_file_id,
    updatedAt: row.updated_at
  };
}

export async function listDealAnswers(userId, savedDealId, { itemId, category, q } = {}) {
  await requireDealAccess(userId, savedDealId);
  const params = [savedDealId];
  let where = 'a.saved_deal_id = $1';
  if (itemId) {
    params.push(itemId);
    where += ` AND a.item_id = $${params.length}`;
  }
  if (category) {
    params.push(category);
    where += ` AND a.category = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (a.question ILIKE $${params.length} OR a.answer ILIKE $${params.length})`;
  }
  const result = await pool.query(
    `SELECT a.*, sd.name AS deal_name
     FROM dd_answers a
     JOIN saved_deals sd ON sd.id = a.saved_deal_id
     WHERE ${where}
     ORDER BY a.category ASC, a.updated_at DESC
     LIMIT 200`,
    params
  );
  return { categories: QA_CATEGORIES, answers: result.rows.map(mapAnswer) };
}

export async function searchTeamAnswers(userId, teamId, { q, category, savedDealId } = {}) {
  const membership = await getMembership(userId, teamId);
  if (!membership) throw fail('Team not found', 404);
  const params = [teamId];
  let where = 'a.team_id = $1';
  if (savedDealId) {
    params.push(savedDealId);
    where += ` AND a.saved_deal_id = $${params.length}`;
  }
  if (category) {
    params.push(category);
    where += ` AND a.category = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    where += ` AND (a.question ILIKE $${params.length} OR a.answer ILIKE $${params.length} OR a.category ILIKE $${params.length})`;
  }
  const result = await pool.query(
    `SELECT a.*, sd.name AS deal_name
     FROM dd_answers a
     JOIN saved_deals sd ON sd.id = a.saved_deal_id
     WHERE ${where}
     ORDER BY a.updated_at DESC
     LIMIT 100`,
    params
  );
  console.log('[dd-answers] search', { teamId, q: q || '', count: result.rows.length });
  return { categories: QA_CATEGORIES, answers: result.rows.map(mapAnswer) };
}

export async function createDealAnswer(userId, savedDealId, body) {
  const access = await requireDealAccess(userId, savedDealId, { write: true });
  const question = String(body.question || '').trim();
  const answer = String(body.answer || '').trim();
  if (!question) throw fail('A question is required');
  if (!answer) throw fail('Paste the answer before saving');
  const category = normalizeQaCategory(body.category, body.groupName);
  const source = normalizeQaSource(body.source);
  const result = await pool.query(
    `INSERT INTO dd_answers
      (team_id, saved_deal_id, item_id, category, question, answer, source, cloud_provider, cloud_file_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      access.deal.team_id || null,
      savedDealId,
      body.itemId || null,
      category,
      question,
      answer,
      source,
      body.cloudProvider || null,
      body.cloudFileId || null,
      userId
    ]
  );
  console.log('[dd-answers] created', { savedDealId, category, itemId: body.itemId || null });
  return mapAnswer({ ...result.rows[0], deal_name: access.deal.name });
}

export async function updateDealAnswer(userId, savedDealId, answerId, body) {
  await requireDealAccess(userId, savedDealId, { write: true });
  const answer = String(body.answer ?? '').trim();
  const question = body.question != null ? String(body.question).trim() : null;
  if (body.answer != null && !answer) throw fail('The answer cannot be empty');
  const result = await pool.query(
    `UPDATE dd_answers SET
       question = COALESCE($1, question),
       answer = COALESCE($2, answer),
       category = COALESCE($3, category),
       source = COALESCE($4, source),
       cloud_provider = COALESCE($5, cloud_provider),
       cloud_file_id = COALESCE($6, cloud_file_id),
       updated_at = NOW()
     WHERE id = $7 AND saved_deal_id = $8
     RETURNING *`,
    [
      question,
      body.answer != null ? answer : null,
      body.category ? normalizeQaCategory(body.category) : null,
      body.source ? normalizeQaSource(body.source) : null,
      body.cloudProvider || null,
      body.cloudFileId || null,
      answerId,
      savedDealId
    ]
  );
  if (!result.rows[0]) throw fail('Answer not found', 404);
  return mapAnswer(result.rows[0]);
}

export async function deleteDealAnswer(userId, savedDealId, answerId) {
  await requireDealAccess(userId, savedDealId, { write: true });
  const result = await pool.query(
    'DELETE FROM dd_answers WHERE id = $1 AND saved_deal_id = $2 RETURNING id',
    [answerId, savedDealId]
  );
  if (!result.rows[0]) throw fail('Answer not found', 404);
  console.log('[dd-answers] deleted', { savedDealId, answerId });
}
