import pool from '../db/pool.js';
import { getUnreadMentions } from './dealThreadService.js';
import { addedActivityHeadline, stageActivityHeadline } from '../lib/teamActivity.js';

export function actorLabel(email) {
  if (!email) return 'A teammate';
  const local = String(email).split('@')[0].trim();
  return local || 'A teammate';
}

function sinceOrDefault(sinceDate, hours = 24) {
  if (sinceDate) {
    const d = sinceDate instanceof Date ? sinceDate : new Date(sinceDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

/**
 * Team CRM activity since `sinceDate` for a recipient (excludes their own actions).
 */
export async function getTeamActivitySince(userId, sinceDate) {
  const since = sinceOrDefault(sinceDate);

  const added = await pool.query(
    `SELECT sd.shared_by_user_id AS actor_id,
            u.email AS actor_email,
            COUNT(*)::int AS n,
            ARRAY_AGG(sd.name ORDER BY sd.saved_at DESC) FILTER (WHERE sd.name IS NOT NULL) AS names,
            ARRAY_AGG(sd.id ORDER BY sd.saved_at DESC) AS ids
     FROM saved_deals sd
     JOIN users u ON u.id = COALESCE(sd.shared_by_user_id, sd.user_id)
     JOIN team_members me ON me.team_id = sd.team_id AND me.user_id = $1 AND me.status = 'active'
     WHERE sd.team_id IS NOT NULL
       AND COALESCE(sd.shared_by_user_id, sd.user_id) <> $1
       AND sd.saved_at >= $2
     GROUP BY sd.shared_by_user_id, u.email
     ORDER BY n DESC`,
    [userId, since.toISOString()]
  ).catch((err) => {
    console.warn('[teamActivity] added query failed', err.message);
    return { rows: [] };
  });

  const stages = await pool.query(
    `SELECT actor_id,
            actor_email,
            COUNT(*)::int AS n,
            ARRAY_AGG(deal_name ORDER BY occurred_at DESC) FILTER (WHERE deal_name IS NOT NULL) AS names,
            ARRAY_AGG(saved_deal_id ORDER BY occurred_at DESC) AS ids,
            ARRAY_AGG(new_stage ORDER BY occurred_at DESC) FILTER (WHERE new_stage IS NOT NULL) AS new_stages
     FROM (
       SELECT DISTINCT ON (a.user_id, a.saved_deal_id)
              a.user_id AS actor_id,
              u.email AS actor_email,
              sd.name AS deal_name,
              a.saved_deal_id,
              a.occurred_at,
              NULLIF(TRIM(a.metadata->>'newStage'), '') AS new_stage
       FROM activities a
       JOIN saved_deals sd ON sd.id = a.saved_deal_id
       JOIN users u ON u.id = a.user_id
       JOIN team_members me ON me.team_id = sd.team_id AND me.user_id = $1 AND me.status = 'active'
       WHERE sd.team_id IS NOT NULL
         AND a.user_id <> $1
         AND a.activity_type = 'stage_change'
         AND a.occurred_at >= $2
       ORDER BY a.user_id, a.saved_deal_id, a.occurred_at DESC
     ) latest
     GROUP BY actor_id, actor_email
     ORDER BY n DESC`,
    [userId, since.toISOString()]
  ).catch((err) => {
    console.warn('[teamActivity] stage query failed', err.message);
    return { rows: [] };
  });

  const mentions = await getUnreadMentions(userId).catch(() => []);

  const addedRows = added.rows.map((r) => ({
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    label: actorLabel(r.actor_email),
    count: r.n,
    names: Array.isArray(r.names) ? r.names.filter(Boolean).slice(0, 8) : [],
    ids: Array.isArray(r.ids) ? r.ids.map((id) => Number(id)).filter((id) => id > 0).slice(0, 8) : []
  }));

  const stageRows = stages.rows.map((r) => ({
    actorId: r.actor_id,
    actorEmail: r.actor_email,
    label: actorLabel(r.actor_email),
    count: r.n,
    names: Array.isArray(r.names) ? r.names.filter(Boolean).slice(0, 8) : [],
    ids: Array.isArray(r.ids) ? r.ids.map((id) => Number(id)).filter((id) => id > 0).slice(0, 8) : [],
    newStages: Array.isArray(r.new_stages) ? r.new_stages.filter(Boolean).slice(0, 8) : []
  }));

  const headlines = [];
  for (const row of addedRows) {
    headlines.push(addedActivityHeadline(row));
  }
  for (const row of stageRows) {
    headlines.push(stageActivityHeadline(row));
  }
  if (mentions.length) {
    headlines.push(
      `${mentions.length} @mention${mentions.length === 1 ? '' : 's'} waiting in Talk`
    );
  }

  const total =
    addedRows.reduce((n, r) => n + r.count, 0) +
    stageRows.reduce((n, r) => n + r.count, 0) +
    mentions.length;

  return {
    since,
    added: addedRows,
    stages: stageRows,
    mentions,
    headlines,
    total
  };
}

export function teamActivityPushText(activity) {
  if (!activity?.headlines?.length) return '';
  return activity.headlines.slice(0, 3).join(' · ');
}
