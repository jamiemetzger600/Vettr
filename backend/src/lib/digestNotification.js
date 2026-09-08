import { notificationOpenLabel, notificationPath } from './notificationLinks.js';
import { primaryTeamSavedDealId } from './teamActivity.js';

function actorLabel(email) {
  if (!email) return 'A teammate';
  const local = String(email).split('@')[0].trim();
  return local || 'A teammate';
}

function firstMatchingDeals(grouped, limit = 3) {
  const deals = [];
  for (const group of grouped?.groups || []) {
    for (const deal of [...(group.deals || []), ...(group.nearDeals || [])]) {
      deals.push(deal);
      if (deals.length >= limit) return deals;
    }
  }
  return deals;
}

function matchingDealIds(grouped, limit = 400) {
  const ids = [];
  const seen = new Set();
  for (const group of grouped?.groups || []) {
    const fromIds = Array.isArray(group.dealIds) ? group.dealIds : [];
    const fromDeals = [...(group.deals || []), ...(group.nearDeals || [])].map((d) => d?.id);
    for (const id of [...fromIds, ...fromDeals]) {
      const n = Number(id);
      if (!Number.isFinite(n) || n <= 0 || seen.has(n)) continue;
      seen.add(n);
      ids.push(n);
      if (ids.length >= limit) return ids;
    }
  }
  return ids;
}

function stripAppName(title) {
  const cleaned = String(title || '').replace(/^vettr[:\s-]+/i, '').trim();
  return cleaned || 'New activity in your pipeline';
}

/**
 * Pick a specific PWA/desktop notification for a digest — never a generic "Vettr summary".
 * Click URL matches the headline item (deal, task, mention, or CRM card).
 */
export function buildDigestNotification({ grouped, team, crmItems = [] } = {}) {
  const matches = Number(grouped?.total) || 0;
  const mention = team?.mentions?.[0];
  const added = team?.added?.[0];
  const stages = team?.stages?.[0];
  const overdue = crmItems.filter((i) => i.kind === 'overdue');
  const dueToday = crmItems.filter((i) => i.kind === 'due_today');
  const listedDeals = firstMatchingDeals(grouped);
  const firstDeal = listedDeals[0];
  const dealDbIds = matchingDealIds(grouped);

  let primary = null;

  if (mention?.saved_deal_id) {
    const who = actorLabel(mention.author_email);
    primary = {
      title: `${who} mentioned you`,
      body: mention.deal_name || String(mention.body || '').slice(0, 120),
      alertType: 'talk_mention',
      savedDealId: mention.saved_deal_id
    };
  } else if (overdue.length === 1) {
    const item = overdue[0];
    primary = {
      title: `Overdue: ${item.title}`,
      body: item.dealName || '',
      alertType: 'task_due',
      savedDealId: item.savedDealId
    };
  } else if (overdue.length > 1) {
    primary = {
      title: `${overdue.length} overdue tasks`,
      body: overdue.map((i) => i.title).slice(0, 3).join(' · '),
      alertType: 'task_due',
      savedDealId: overdue[0]?.savedDealId || null
    };
  } else if (dueToday.length === 1) {
    const item = dueToday[0];
    primary = {
      title: `Due today: ${item.title}`,
      body: item.dealName || '',
      alertType: 'task_due',
      savedDealId: item.savedDealId
    };
  } else if (dueToday.length > 1) {
    primary = {
      title: `${dueToday.length} tasks due today`,
      body: dueToday.map((i) => i.title).slice(0, 3).join(' · '),
      alertType: 'task_due',
      savedDealId: dueToday[0]?.savedDealId || null
    };
  } else if (matches === 1 && firstDeal) {
    primary = {
      title: firstDeal.name || 'New buy-box match',
      body: [firstDeal.location, grouped.groups?.[0]?.name].filter(Boolean).join(' · '),
      alertType: 'deal_match',
      dealDbId: firstDeal.id,
      dealDbIds,
      newToday: true
    };
  } else if (matches > 1) {
    primary = {
      title: `${matches} new deals match your buy box`,
      body: listedDeals.map((d) => d.name).filter(Boolean).join(' · '),
      alertType: 'deal_match',
      dealDbIds,
      newToday: true
    };
  } else if (added?.count === 1 && (added.names?.[0] || added.ids?.[0])) {
    primary = {
      title: `${added.label} added ${added.names?.[0] || 'a deal'}`,
      body: 'New deal in your CRM',
      alertType: 'team_activity',
      savedDealId: added.ids?.[0] || null
    };
  } else if (added?.count > 1) {
    primary = {
      title: `${added.label} added ${added.count} new deals`,
      body: (added.names || []).slice(0, 3).join(' · '),
      alertType: 'team_activity',
      savedDealId: added.ids?.[0] || null
    };
  } else if (stages?.count === 1 && (stages.names?.[0] || stages.ids?.[0])) {
    const stage = stages.newStages?.[0];
    primary = {
      title: `${stages.label} moved ${stages.names?.[0] || 'a deal'}${stage ? ` to ${stage}` : ' into the pipeline'}`,
      body: stage ? `Now: ${stage}` : 'Moved in your pipeline',
      alertType: 'team_activity',
      savedDealId: stages.ids?.[0] || null
    };
  } else if (stages?.count > 1) {
    primary = {
      title: `${stages.label} moved ${stages.count} deals in the pipeline`,
      body: (stages.names || []).slice(0, 3).join(' · '),
      alertType: 'team_activity',
      savedDealId: stages.ids?.[0] || null
    };
  } else if (team?.headlines?.[0]) {
    primary = {
      title: team.headlines[0],
      body: team.headlines.slice(1).join(' · '),
      alertType: 'team_activity',
      savedDealId: primaryTeamSavedDealId(team)
    };
  } else if (crmItems[0]) {
    const item = crmItems[0];
    primary = {
      title: item.title,
      body: item.dealName || '',
      alertType: 'crm_followup',
      savedDealId: item.savedDealId || null
    };
  } else {
    primary = {
      title: 'New activity in your pipeline',
      body: '',
      alertType: 'team_activity'
    };
  }

  const extras = [];
  if (matches && primary.alertType !== 'deal_match') {
    extras.push(`${matches} buy-box match${matches === 1 ? '' : 'es'}`);
  }
  if (team?.headlines?.[0] && primary.alertType !== 'team_activity' && primary.alertType !== 'talk_mention') {
    extras.push(team.headlines[0]);
  }
  if (crmItems.length && !['task_due', 'crm_followup'].includes(primary.alertType)) {
    extras.push(crmItems[0].title);
  }

  const title = stripAppName(primary.title).slice(0, 120);
  const body = [primary.body, ...extras].filter(Boolean).join(' · ').slice(0, 220);
  const pathOpts = {
    alertType: primary.alertType,
    savedDealId: primary.savedDealId || null,
    dealDbId: primary.dealDbId || null,
    dealDbIds: primary.dealDbIds || [],
    newToday: Boolean(primary.newToday)
  };

  return {
    title,
    body,
    url: notificationPath(pathOpts),
    tag: primary.alertType === 'deal_match' ? 'deal-match' : String(primary.alertType || 'vettr'),
    actionTitle: notificationOpenLabel(primary.alertType, { savedDealId: primary.savedDealId }),
    alertType: primary.alertType,
    savedDealId: primary.savedDealId || null,
    dealDbId: primary.dealDbId || null,
    dealDbIds: primary.dealDbIds || [],
    newToday: Boolean(primary.newToday)
  };
}
