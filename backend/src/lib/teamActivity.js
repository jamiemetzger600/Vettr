/** Pure helpers for teammate CRM activity toasts and digest copy. */

export function firstPositiveId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export function primaryTeamSavedDealId(team) {
  const added = team?.added?.[0];
  const stages = team?.stages?.[0];
  const mentionId = firstPositiveId(team?.mentions?.[0]?.saved_deal_id);
  if (added?.count === 1) {
    const id = firstPositiveId(added.ids?.[0]);
    if (id) return id;
  }
  if (stages?.count === 1) {
    const id = firstPositiveId(stages.ids?.[0]);
    if (id) return id;
  }
  if (mentionId) return mentionId;
  return firstPositiveId(added?.ids?.[0])
    || firstPositiveId(stages?.ids?.[0])
    || mentionId;
}

/** Prefer the deal that matches the toast copy when hydrating older alerts. */
export function savedDealIdForTeamAlert(alert, team) {
  const title = String(alert?.title || '');
  if (/moved/i.test(title)) {
    const id = firstPositiveId(team?.stages?.[0]?.ids?.[0]);
    if (id) return id;
  }
  if (/added/i.test(title)) {
    const id = firstPositiveId(team?.added?.[0]?.ids?.[0]);
    if (id) return id;
  }
  return primaryTeamSavedDealId(team);
}

export function addedActivityHeadline(row) {
  const label = row?.label || 'A teammate';
  const count = Number(row?.count) || 0;
  const name = row?.names?.[0];
  if (count === 1 && name) return `${label} added ${name}`;
  return `${label} added ${count} new deal${count === 1 ? '' : 's'}`;
}

export function stageActivityHeadline(row) {
  const label = row?.label || 'A teammate';
  const count = Number(row?.count) || 0;
  const name = row?.names?.[0];
  const stage = row?.newStages?.[0];
  if (count === 1 && name && stage) return `${label} moved ${name} to ${stage}`;
  if (count === 1 && name) return `${label} moved ${name} into the pipeline`;
  return `${label} moved ${count} deal${count === 1 ? '' : 's'} in the pipeline`;
}
