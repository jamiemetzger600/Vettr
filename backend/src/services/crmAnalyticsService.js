import pool from '../db/pool.js';
import { KANBAN_COLUMNS, kanbanColumnForStage, UNSTAGED_KEY } from '../constants/pipelineStages.js';
import { VISIBLE_SAVED_DEALS_SQL, VISIBLE_DEALS_SQL } from '../lib/teamAcl.js';

export async function getCrmFunnelAnalytics(userId, { scope = 'all', teamId = null } = {}) {
  let whereSql = VISIBLE_SAVED_DEALS_SQL;
  const params = [userId];

  if (scope === 'team' && teamId) {
    whereSql = `team_id = $2 AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = saved_deals.team_id AND tm.user_id = $1 AND tm.status = 'active'
    )`;
    params.push(Number(teamId));
  } else if (scope === 'personal') {
    whereSql = `user_id = $1 AND team_id IS NULL`;
  }

  const deals = await pool.query(
    `SELECT id, progress_stage, saved_at, updated_at FROM saved_deals WHERE ${whereSql}`,
    params
  );

  const byColumn = Object.fromEntries(KANBAN_COLUMNS.map((c) => [c.id, 0]));
  let unstaged = 0;

  for (const row of deals.rows) {
    const col = kanbanColumnForStage(row.progress_stage);
    if (col.id === UNSTAGED_KEY) unstaged += 1;
    else byColumn[col.id] = (byColumn[col.id] || 0) + 1;
  }

  const openTasks = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM tasks t
     JOIN saved_deals sd ON sd.id = t.saved_deal_id
     WHERE ${VISIBLE_DEALS_SQL} AND t.status = 'open'`,
    [userId]
  );

  const ddActive = await pool.query(
    `SELECT COUNT(*)::int AS n FROM dd_checklists c
     JOIN saved_deals sd ON sd.id = c.saved_deal_id
     WHERE ${VISIBLE_DEALS_SQL}
       AND c.completed_at IS NULL`,
    [userId]
  );

  return {
    totalDeals: deals.rows.length,
    unstaged,
    stalled: deals.rows.filter((r) => {
      const ref = r.updated_at || r.saved_at;
      if (!ref) return false;
      const days = (Date.now() - new Date(ref).getTime()) / 86400000;
      return days >= 14 && r.progress_stage && r.progress_stage !== 'Passed On Deal';
    }).length,
    byColumn: KANBAN_COLUMNS.map((c) => ({
      id: c.id,
      label: c.label,
      count: byColumn[c.id] || 0
    })),
    openTasks: openTasks.rows[0]?.n ?? 0,
    activeDdChecklists: ddActive.rows[0]?.n ?? 0
  };
}
