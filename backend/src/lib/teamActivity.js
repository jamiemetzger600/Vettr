/** Pure helpers for teammate CRM activity toasts and digest copy. */

export function firstPositiveId(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

export function actorLabel(email) {
  if (!email) return 'A teammate';
  const local = String(email).split('@')[0].trim();
  return local || 'A teammate';
}

export function actorDisplayName(email) {
  const local = actorLabel(email);
  if (local === 'A teammate') return local;
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'A teammate';
}

export function shortDealName(name, max = 42) {
  const t = String(name || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'a deal';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

const STAGE_ACTION = {
  'Passed On Deal': {
    one: (deal) => `passed on ${deal}`,
    many: (n) => `passed on ${n} deals`
  },
  'Requested NDA': {
    one: (deal) => `requested NDA on ${deal}`,
    many: (n) => `requested NDA on ${n} deals`
  },
  'Signed NDA': {
    one: (deal) => `signed NDA on ${deal}`,
    many: (n) => `signed NDA on ${n} deals`
  },
  'Review CIM': {
    one: (deal) => `started reviewing CIM for ${deal}`,
    many: (n) => `started reviewing CIM for ${n} deals`
  },
  'Seller Call': {
    one: (deal) => `moved ${deal} to Seller Call`,
    many: (n) => `moved ${n} deals to Seller Call`
  },
  'Review Financials': {
    one: (deal) => `started reviewing financials for ${deal}`,
    many: (n) => `started reviewing financials for ${n} deals`
  },
  'Review Tax Returns': {
    one: (deal) => `started reviewing tax returns for ${deal}`,
    many: (n) => `started reviewing tax returns for ${n} deals`
  },
  'Preliminary Valuation': {
    one: (deal) => `started valuation on ${deal}`,
    many: (n) => `started valuation on ${n} deals`
  },
  'Send IOI': {
    one: (deal) => `moved ${deal} to Send IOI`,
    many: (n) => `moved ${n} deals to Send IOI`
  },
  'Bank Pre-Approval': {
    one: (deal) => `moved ${deal} to Bank Pre-Approval`,
    many: (n) => `moved ${n} deals to Bank Pre-Approval`
  },
  'LOI Sent': {
    one: (deal) => `sent LOI on ${deal}`,
    many: (n) => `sent LOI on ${n} deals`
  },
  'LOI Signed': {
    one: (deal) => `signed LOI on ${deal}`,
    many: (n) => `signed LOI on ${n} deals`
  },
  'Starting Due Diligence': {
    one: (deal) => `started due diligence on ${deal}`,
    many: (n) => `started due diligence on ${n} deals`
  }
};

export function describeStageAction(stage, { dealName, count = 1 } = {}) {
  const s = String(stage || '').trim();
  const n = Number(count) || 0;
  const deal = shortDealName(dealName);
  const mapped = STAGE_ACTION[s];
  if (mapped) return n > 1 ? mapped.many(n) : mapped.one(deal);
  if (s) {
    return n > 1 ? `moved ${n} deals to ${s}` : `moved ${deal} to ${s}`;
  }
  return n > 1 ? `updated ${n} deals` : `updated ${deal}`;
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
  if (/\b(moved|passed on|requested nda|signed|reviewing|sent loi|started|updated)\b/i.test(title)) {
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
  const uniqueStages = [...new Set(stages.filter(Boolean))];
  if (uniqueStages.length <= 1) {
    return names.slice(0, limit);
  }
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
  if (count === 1 && name) return `${label} added ${shortDealName(name)}`;
  return `${label} added ${count} new deal${count === 1 ? '' : 's'}`;
}

export function stageActivityHeadline(row) {
  const label = row?.label || 'A teammate';
  const count = Number(row?.count) || 0;
  const stages = Array.isArray(row?.newStages) ? row.newStages : [];
  const firstStage = stages[0] || '';
  const sameStage = stages.length === 0 || stages.every((s) => (s || '') === firstStage);
  const action = describeStageAction(sameStage ? firstStage : '', {
    dealName: row?.names?.[0],
    count
  });
  return `${label} ${action}`;
}

const TEAM_ALERT_CAP = 8;

/**
 * One in-app / push item per teammate action (adds and stage groups).
 * Mentions already have talk_mention alerts — skip them here.
 */
export function teamActivityAlertItems(team) {
  const items = [];
  for (const row of team?.added || []) {
    if (!row?.count) continue;
    const title = addedActivityHeadline(row);
    const names = Array.isArray(row.names) ? row.names.filter(Boolean) : [];
    items.push({
      title,
      body: row.count > 1 ? names.slice(0, 4).join(' · ') : '',
      savedDealId: firstPositiveId(row.ids?.[0]),
      metadata: {
        headlines: [title],
        added: [row],
        stages: [],
        savedDealId: firstPositiveId(row.ids?.[0])
      }
    });
  }
  for (const row of team?.stages || []) {
    if (!row?.count) continue;
    const title = stageActivityHeadline(row);
    const names = Array.isArray(row.names) ? row.names.filter(Boolean) : [];
    items.push({
      title,
      body: row.count > 1 ? names.slice(0, 4).join(' · ') : '',
      savedDealId: firstPositiveId(row.ids?.[0]),
      metadata: {
        headlines: [title],
        added: [],
        stages: [row],
        savedDealId: firstPositiveId(row.ids?.[0])
      }
    });
  }
  return items.slice(0, TEAM_ALERT_CAP);
}
