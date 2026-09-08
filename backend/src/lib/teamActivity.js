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

export function namedActivityBits(row, limit = 4) {
  const names = Array.isArray(row?.names) ? row.names.filter(Boolean) : [];
  const stages = Array.isArray(row?.newStages) ? row.newStages : [];
  return names.slice(0, limit).map((name, i) => {
    const stage = stages[i];
    return stage ? `${name} → ${stage}` : name;
  });
}

export function teamActivityDetailLine(team, { title } = {}) {
  const bits = [
    ...namedActivityBits(team?.stages?.[0]),
    ...(Array.isArray(team?.added?.[0]?.names) ? team.added[0].names.filter(Boolean).slice(0, 4) : [])
  ];
  const seen = new Set();
  const unique = [];
  for (const bit of bits) {
    const key = String(bit).trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(bit);
  }
  const extraHeadlines = (team?.headlines || []).slice(1);
  const text = [...unique, ...extraHeadlines].filter(Boolean).join(' · ');
  const folded = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const foldedTitle = String(title || '').replace(/\s+/g, ' ').trim().toLowerCase();
  if (!folded || folded === foldedTitle) return '';
  return text.slice(0, 220);
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
