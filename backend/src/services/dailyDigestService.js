import pool from '../db/pool.js';
import { deliverUserEmail } from './googleGmailService.js';
import { sendPushToUser, userHasPushSubscription } from './pushService.js';
import { createUserAlert } from './userAlertService.js';
import { buildDigestNotification } from '../lib/digestNotification.js';
import {
  loadNewMarketDeals,
  matchUserBuyBoxes,
  summarizeMatchGroups
} from './dealMatchDigestService.js';
import { formatNearMatchReasons } from '../lib/buyBoxMatcher.js';
import { listingMetricCells, listingMetricsTableHtml } from '../lib/listingMetrics.js';
import { getTeamActivitySince } from './teamActivityDigestService.js';
import { stageActivityHeadline, teamActivityAlertItems } from '../lib/teamActivity.js';
import { notificationOpenLabel, notificationPath } from '../lib/notificationLinks.js';
import { excludeHiddenMarketDeals } from '../lib/hiddenDeals.js';
import { getTodayTaskSummary } from './crmTaskService.js';
import { getDdOverdueForToday, getRecentPortalComments } from './ddChecklistService.js';
import { findDormantDeals } from './crmPresenceService.js';
import { findStaleListings } from './crmStaleListing.js';
import { buildCrmFollowUpHtml, escapeHtml } from '../lib/crmDigestHtml.js';

const WEB_APP_URL = (process.env.WEB_APP_URL || 'http://localhost:5173').replace(/\/+$/, '');

function prefs(row) {
  return row?.preferences && typeof row.preferences === 'object' ? row.preferences : {};
}

function wantsBrowserAlerts(row) {
  const p = prefs(row);
  return p.browserNotifications === true || p.pushNotifications === true;
}

function crmEmailDigestOn(row) {
  return prefs(row).crmEmailDigest === true;
}

function hoursBackForFrequency(frequency) {
  if (frequency === 'weekly') return 7 * 24;
  if (frequency === 'instant') return 0.5;
  return 24;
}

function sinceDate(row, { frequency, team = false } = {}) {
  const col = team ? row.last_team_activity_notified : row.last_notification_sent;
  if (col) {
    const d = new Date(col);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date(Date.now() - hoursBackForFrequency(frequency) * 60 * 60 * 1000);
}

function truncateText(value, max) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}…`;
}

function dealHref(deal) {
  if (deal?.id) {
    const q = new URLSearchParams({ tab: 'aggregator', dealDbId: String(deal.id), newToday: '1' });
    return `${WEB_APP_URL}/dashboard?${q.toString()}`;
  }
  return deal.url || `${WEB_APP_URL}/dashboard`;
}

function dealCardHtml(deal) {
  const vettrHref = dealHref(deal);
  const industry = truncateText(deal.industry, 48);
  const meta = [deal.location, industry].filter(Boolean).join(' · ');
  const also = Array.isArray(deal.alsoMatches) && deal.alsoMatches.length
    ? `Also matches ${deal.alsoMatches.join(', ')}`
    : '';
  const isNear = deal.matchKind === 'near';
  const reasonText = formatNearMatchReasons(deal.matchReasons || []);
  const badge = isNear
    ? `Near match${reasonText ? ` · ${reasonText}` : ''}`
    : (reasonText.includes('Absentee/remote') ? 'Absentee/remote' : '');
  return `<a href="${escapeHtml(vettrHref)}" style="display:block;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin:8px 0;color:#111;text-decoration:none;">
    <div style="font-weight:600;">${escapeHtml(deal.name)}</div>
    ${listingMetricsTableHtml(deal, escapeHtml)}
    ${meta ? `<div style="color:#777;font-size:12px;margin-top:8px;">${escapeHtml(meta)}</div>` : ''}
    ${badge ? `<div style="color:#666;font-size:12px;margin-top:6px;">${escapeHtml(badge)}</div>` : ''}
    ${also ? `<div style="color:#888;font-size:12px;margin-top:2px;">${escapeHtml(also)}</div>` : ''}
  </a>`;
}

function buildDigestHtml({ grouped, team, crmItems }) {
  const sections = [];

  if (grouped?.total) {
    const sample = grouped.groups?.[0]?.deals?.[0];
    if (sample) {
      console.log('[digest] listing metrics sample', {
        name: sample.name,
        cells: listingMetricCells(sample)
      });
    }
    const boxesHtml = grouped.groups.map((g) => {
      const exactCount = g.deals.length + (g.overflow || 0);
      const nearCount = (g.nearDeals?.length || 0) + (g.nearOverflow || 0);
      const extra = g.overflow ? `<p style="color:#666;font-size:13px;">+${g.overflow} more in this buy box</p>` : '';
      const cards = (g.deals || []).map(dealCardHtml).join('');
      const nearExtra = g.nearOverflow
        ? `<p style="color:#666;font-size:13px;">+${g.nearOverflow} more near matches</p>`
        : '';
      const nearCards = (g.nearDeals || []).map(dealCardHtml).join('');
      const nearBlock = nearCount
        ? `<h4 style="margin:16px 0 6px;font-size:14px;">Near matches (${nearCount})</h4>
           <p style="color:#666;font-size:12px;margin:0 0 8px;">Outside the box by your Flexibility %, or absentee/remote (up to 20%).</p>
           ${nearCards}${nearExtra}`
        : '';
      const headingCount = exactCount + nearCount;
      return `<h3 style="margin:20px 0 8px;font-size:16px;">${escapeHtml(g.name)} (${headingCount})</h3>${cards}${extra}${nearBlock}`;
    }).join('');
    sections.push(`
      <h2 style="font-size:18px;margin:0 0 8px;">New deals matching your buy boxes</h2>
      <p style="color:#555;margin:0 0 12px;">Organized in buy-box order. Each listing appears under the first box it matches.</p>
      ${boxesHtml}
    `);
  }

  if (team?.headlines?.length) {
    const mentionItems = (team.mentions || []).slice(0, 8).map((m) =>
      `<li>@mention from ${escapeHtml(m.author_email)} on ${escapeHtml(m.deal_name || 'a deal')}</li>`
    ).join('');
    const addedItems = (team.added || []).map((r) => {
      const sample = r.names?.length ? ` (${r.names.slice(0, 3).map(escapeHtml).join(', ')})` : '';
      return `<li>${escapeHtml(r.label)} added ${r.count} new deal${r.count === 1 ? '' : 's'}${sample}</li>`;
    }).join('');
    const stageItems = (team.stages || []).map((r) => {
      const extra = r.count > 1 && r.names?.length
        ? ` (${r.names.slice(0, 3).map(escapeHtml).join(', ')})`
        : '';
      return `<li>${escapeHtml(stageActivityHeadline(r))}${extra}</li>`;
    }).join('');
    sections.push(`
      <h2 style="font-size:18px;margin:24px 0 8px;">Team activity</h2>
      <ul style="padding-left:18px;line-height:1.6;">${addedItems}${stageItems}${mentionItems}</ul>
    `);
  }

  const crmHtml = buildCrmFollowUpHtml(crmItems, WEB_APP_URL);
  if (crmHtml) sections.push(crmHtml);

  if (!sections.length) return null;

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.5;color:#222;max-width:640px;margin:0 auto;padding:20px;background:#f4f4f4;">
  <div style="background:#1a1a1a;color:#e4e4e4;padding:24px 28px;border-radius:12px 12px 0 0;">
    <h1 style="margin:0;font-size:20px;">Vettr daily summary</h1>
    <p style="margin:8px 0 0;opacity:0.8;font-size:14px;">Buy-box matches, team CRM updates, and mentions</p>
  </div>
  <div style="background:#fff;padding:24px 28px;border-radius:0 0 12px 12px;border:1px solid #e5e5e5;border-top:none;">
    ${sections.join('')}
    <p style="margin:28px 0 0;text-align:center;">
      <a href="${WEB_APP_URL}/dashboard" style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Open Vettr</a>
    </p>
    <p style="margin:16px 0 0;text-align:center;color:#888;font-size:12px;">
      Manage alerts in <a href="${WEB_APP_URL}/settings" style="color:#555;">Settings</a>
    </p>
  </div>
</body>
</html>`;
}

function crmItem({ kind, title, dealName, savedDealId, extra }) {
  return {
    kind,
    title,
    dealName: dealName || '',
    savedDealId: savedDealId || null,
    extra: extra || ''
  };
}

async function loadCrmItems(userId) {
  const tasks = await getTodayTaskSummary(userId).catch(() => ({ overdue: [], dueToday: [], badgeCount: 0 }));
  const ddOverdue = await getDdOverdueForToday(userId).catch(() => []);
  const portalComments = await getRecentPortalComments(userId).catch(() => []);
  const staleListings = await findStaleListings(userId).catch(() => []);
  const dormantDeals = await findDormantDeals(userId, { days: 14, limit: 10 }).catch(() => []);
  const approvals = await pool.query(
    `SELECT a.id, a.saved_deal_id, sd.name AS deal_name, a.action_type, a.to_value, u.email AS requester_email
     FROM deal_approvals a
     JOIN saved_deals sd ON sd.id = a.saved_deal_id
     JOIN users u ON u.id = a.requested_by
     JOIN team_members tm ON tm.team_id = a.team_id AND tm.user_id = $1
       AND tm.status = 'active' AND tm.role = 'admin'
     WHERE a.status = 'pending'
     ORDER BY a.created_at ASC
     LIMIT 20`,
    [userId]
  ).catch(() => ({ rows: [] }));

  return [
    ...approvals.rows.map((a) => crmItem({
      kind: 'approval',
      title: `Approval: ${a.deal_name || 'deal'}`,
      dealName: a.deal_name,
      savedDealId: a.saved_deal_id,
      extra: a.requester_email || ''
    })),
    ...(tasks.overdue || []).map((t) => crmItem({
      kind: 'overdue',
      title: t.title,
      dealName: t.deal_name,
      savedDealId: t.saved_deal_id
    })),
    ...(tasks.dueToday || []).map((t) => crmItem({
      kind: 'due_today',
      title: t.title,
      dealName: t.deal_name,
      savedDealId: t.saved_deal_id
    })),
    ...ddOverdue.map((d) => crmItem({
      kind: 'dd_overdue',
      title: `DD overdue: ${d.title}`,
      dealName: d.deal_name,
      savedDealId: d.saved_deal_id
    })),
    ...portalComments.map((c) => crmItem({
      kind: 'portal',
      title: `Portal comment: ${c.item_title || 'item'}`,
      dealName: c.deal_name,
      savedDealId: c.saved_deal_id
    })),
    ...staleListings.map((s) => crmItem({
      kind: 'stale',
      title: `Listing updated: ${s.name || s.deal_name || 'deal'}`,
      dealName: s.name || s.deal_name,
      savedDealId: s.savedDealId || s.id
    })),
    ...dormantDeals.map((d) => crmItem({
      kind: 'dormant',
      title: `Dormant: ${d.deal_name}`,
      dealName: d.deal_name,
      savedDealId: d.saved_deal_id,
      extra: d.days_idle ? `${d.days_idle}d` : ''
    }))
  ];
}

async function markDealMatchSent(userId) {
  await pool.query(
    'UPDATE user_settings SET last_notification_sent = NOW() WHERE user_id = $1',
    [userId]
  );
}

async function markTeamActivitySent(userId) {
  await pool.query(
    'UPDATE user_settings SET last_team_activity_notified = NOW() WHERE user_id = $1',
    [userId]
  );
}

export async function fetchDigestUsers() {
  const result = await pool.query(
    `SELECT u.id, u.email,
            us.buy_box, us.preferences, us.notify_new_deals,
            us.notification_frequency, us.notification_channel,
            us.last_notification_sent, us.last_team_activity_notified,
            us.hidden_deal_ids
     FROM users u
     JOIN user_settings us ON us.user_id = u.id`
  );
  return result.rows;
}

/**
 * Build + optionally send a user's digest (email, push, in-app alert).
 */
export async function sendUserDigest(userRow, {
  marketDeals,
  includeDeals = true,
  includeTeam = true,
  includeCrm = false,
  sendEmail: doEmail = true,
  sendPush = true,
  createAlert = true,
  markSent = true,
  frequency = 'daily'
} = {}) {
  const userId = userRow.id;
  const dealSince = sinceDate(userRow, { frequency });
  const teamSince = sinceDate(userRow, { frequency, team: true });

  let grouped = { groups: [], total: 0 };
  if (includeDeals && userRow.notify_new_deals !== false) {
    const deals = marketDeals || await loadNewMarketDeals(dealSince);
    const visible = excludeHiddenMarketDeals(deals, userRow.hidden_deal_ids);
    if (visible.length !== deals.length) {
      console.log('[digest] skipped hidden buy-box matches', {
        userId,
        hidden: deals.length - visible.length,
        remaining: visible.length
      });
    }
    grouped = matchUserBuyBoxes(visible, userRow);
  }

  const team = includeTeam ? await getTeamActivitySince(userId, teamSince) : { headlines: [], total: 0, mentions: [], added: [], stages: [] };
  const crmItems = includeCrm ? await loadCrmItems(userId) : [];

  const hasContent = grouped.total > 0 || team.total > 0 || crmItems.length > 0;
  if (!hasContent) {
    console.log('[digest] empty, skip', { email: userRow.email, frequency });
    return { sent: false, reason: 'empty', email: userRow.email };
  }

  const html = buildDigestHtml({ grouped, team, crmItems });
  const push = buildDigestNotification({ grouped, team, crmItems });
  const subjectParts = [];
  if (grouped.total) subjectParts.push(`${grouped.total} matching deal${grouped.total === 1 ? '' : 's'}`);
  if (team.added?.[0]) {
    const a = team.added[0];
    subjectParts.push(`${a.label} added ${a.count} new deal${a.count === 1 ? '' : 's'}`);
  } else if (team.mentions?.length) {
    subjectParts.push(`${team.mentions.length} mention${team.mentions.length === 1 ? '' : 's'}`);
  }
  const subject = subjectParts.length
    ? `Vettr: ${subjectParts.slice(0, 2).join(' · ')}`
    : push.title;

  const result = {
    email: userRow.email,
    deals: grouped.total,
    team: team.total,
    emailed: false,
    emailReason: null,
    pushed: 0
  };

  if (doEmail && html) {
    try {
      const mail = await deliverUserEmail(userId, { to: userRow.email, subject, html });
      result.emailed = Boolean(mail?.sent);
      result.emailReason = mail?.sent ? null : (mail?.message || mail?.reason || 'not_sent');
      console.log('[digest] email result', {
        email: userRow.email,
        emailed: result.emailed,
        reason: result.emailReason,
        via: mail?.id ? 'gmail' : mail?.messageId ? 'smtp' : 'none'
      });
    } catch (err) {
      result.emailReason = err.message;
      console.warn('[digest] email failed', { email: userRow.email, error: err.message });
    }
  } else if (doEmail && !html) {
    result.emailReason = 'empty_body';
  }

  console.log('[digest] push copy', {
    email: userRow.email,
    title: push.title,
    url: push.url,
    alertType: push.alertType
  });

  const teamItems = teamActivityAlertItems(team);
  const teamOnly = includeTeam && !includeDeals && !includeCrm;

  if (sendPush) {
    const hasSub = await userHasPushSubscription(userId);
    if (hasSub && teamOnly && teamItems.length) {
      for (let i = 0; i < Math.min(teamItems.length, 5); i += 1) {
        const item = teamItems[i];
        const pushed = await sendPushToUser(userId, {
          title: item.title,
          body: item.body || '',
          url: notificationPath({ alertType: 'team_activity', savedDealId: item.savedDealId }),
          tag: `team-activity-${item.savedDealId || i}`,
          actionTitle: notificationOpenLabel('team_activity', { savedDealId: item.savedDealId })
        });
        result.pushed += pushed.sent || 0;
      }
      console.log('[digest] team push items', {
        email: userRow.email,
        titles: teamItems.slice(0, 5).map((item) => item.title)
      });
    } else if (hasSub && !teamOnly) {
      const pushed = await sendPushToUser(userId, {
        title: push.title,
        body: push.body,
        url: push.url,
        tag: push.tag,
        actionTitle: push.actionTitle
      });
      result.pushed = pushed.sent || 0;
    }
  }

  if (createAlert) {
    if (grouped.total) {
      await createUserAlert({
        userId,
        alertType: 'deal_match',
        title: push.alertType === 'deal_match' ? push.title : `${grouped.total} new deals match your buy box`,
        body: push.alertType === 'deal_match' ? push.body : summarizeMatchGroups(grouped),
        metadata: {
          total: grouped.total,
          dealDbId: push.dealDbId || (Array.isArray(push.dealDbIds) && push.dealDbIds.length === 1 ? push.dealDbIds[0] : null),
          dealDbIds: push.dealDbIds || [],
          newToday: true,
          boxes: grouped.groups.map((g) => ({
            name: g.name,
            count: g.deals.length + (g.overflow || 0) + (g.nearDeals?.length || 0) + (g.nearOverflow || 0)
          }))
        }
      }).catch((err) => console.warn('[digest] deal_match alert failed', err.message));
      console.log('[digest] deal_match alert ids', {
        email: userRow.email,
        total: grouped.total,
        ids: (push.dealDbIds || []).length
      });
    }
    for (const item of teamItems) {
      await createUserAlert({
        userId,
        alertType: 'team_activity',
        title: item.title,
        body: item.body || null,
        savedDealId: item.savedDealId,
        metadata: item.metadata
      }).catch((err) => console.warn('[digest] team_activity alert failed', err.message));
    }
    if (teamItems.length) {
      console.log('[digest] team alerts', {
        email: userRow.email,
        titles: teamItems.map((item) => item.title)
      });
    }
    if (crmItems.length && !grouped.total && !team.total) {
      await createUserAlert({
        userId,
        alertType: push.alertType,
        title: push.title,
        body: push.body,
        savedDealId: push.savedDealId,
        metadata: { kind: crmItems[0]?.kind || null }
      }).catch((err) => console.warn('[digest] crm alert failed', err.message));
    }
  }

  if (markSent) {
    if (includeDeals) await markDealMatchSent(userId);
    if (includeTeam) await markTeamActivitySent(userId);
  }

  console.log('[digest] sent', result);
  return { sent: true, ...result };
}

export async function runMorningDigests({ weeklyOnly = false } = {}) {
  const users = await fetchDigestUsers();
  const lookback = new Date(Date.now() - (weeklyOnly ? 7 : 1) * 24 * 60 * 60 * 1000);
  const marketDeals = await loadNewMarketDeals(lookback);
  let sent = 0;

  for (const user of users) {
    const freq = user.notification_frequency || 'daily';
    if (weeklyOnly && freq !== 'weekly') continue;
    const includeDeals = user.notify_new_deals !== false && (
      weeklyOnly ? freq === 'weekly' : freq === 'daily'
    );
    const includeCrm = crmEmailDigestOn(user) && !weeklyOnly;
    const includeTeam = includeDeals || includeCrm || wantsBrowserAlerts(user);
    if (!includeDeals && !includeCrm && !includeTeam) continue;

    const wantsEmail = includeDeals || includeCrm;
    const wantsPush = wantsBrowserAlerts(user) || (await userHasPushSubscription(user.id));

    try {
      const r = await sendUserDigest(user, {
        marketDeals,
        includeDeals,
        includeTeam,
        includeCrm,
        sendEmail: wantsEmail,
        sendPush: wantsPush,
        frequency: weeklyOnly ? 'weekly' : 'daily'
      });
      if (r.sent) sent += 1;
    } catch (err) {
      console.error('[digest] user failed', user.email, err.message);
    }
  }

  console.log('[digest] morning job done', { weeklyOnly, users: users.length, sent, newDeals: marketDeals.length });
  return { sent };
}

export async function runInstantDealMatches() {
  const users = await fetchDigestUsers();
  const lookback = new Date(Date.now() - 30 * 60 * 1000);
  const marketDeals = await loadNewMarketDeals(lookback);
  if (!marketDeals.length) {
    console.log('[digest] instant: no new market deals');
    return { sent: 0 };
  }

  let sent = 0;
  const paid = await pool.query(
    `SELECT user_id FROM subscriptions WHERE status = 'active' AND COALESCE(plan, 'free') <> 'free'`
  );
  const paidSet = new Set(paid.rows.map((r) => Number(r.user_id)));

  for (const user of users) {
    if (user.notification_frequency !== 'instant') continue;
    if (user.notify_new_deals === false) continue;
    if (!paidSet.has(Number(user.id))) {
      console.log('[digest] instant skipped (not paid)', user.email);
      continue;
    }
    const wantsPush = wantsBrowserAlerts(user) || (await userHasPushSubscription(user.id));
    try {
      const r = await sendUserDigest(user, {
        marketDeals,
        includeDeals: true,
        includeTeam: false,
        includeCrm: false,
        sendEmail: true,
        sendPush: wantsPush,
        frequency: 'instant'
      });
      if (r.sent) sent += 1;
    } catch (err) {
      console.error('[digest] instant user failed', user.email, err.message);
    }
  }
  console.log('[digest] instant job done', { sent, newDeals: marketDeals.length });
  return { sent };
}

export async function runTeamActivityFlush() {
  const users = await fetchDigestUsers();
  let sent = 0;
  for (const user of users) {
    const wantsPush = wantsBrowserAlerts(user) || (await userHasPushSubscription(user.id));
    if (!wantsPush && !wantsBrowserAlerts(user)) {
      // Still create in-app alerts for anyone on a team (banner). Cheap query first.
    }
    try {
      const r = await sendUserDigest(user, {
        includeDeals: false,
        includeTeam: true,
        includeCrm: false,
        sendEmail: false,
        sendPush: wantsPush,
        createAlert: true,
        frequency: 'instant'
      });
      if (r.sent) sent += 1;
    } catch (err) {
      console.error('[digest] team flush failed', user.email, err.message);
    }
  }
  console.log('[digest] team activity flush done', { sent });
  return { sent };
}

export async function sendDigestNowForUser(userId) {
  const users = await fetchDigestUsers();
  const user = users.find((u) => Number(u.id) === Number(userId));
  if (!user) {
    const err = new Error('User settings not found');
    err.status = 404;
    throw err;
  }
  const lookback = sinceDate(user, { frequency: user.notification_frequency || 'daily' });
  const marketDeals = await loadNewMarketDeals(lookback);
  return sendUserDigest(user, {
    marketDeals,
    includeDeals: user.notify_new_deals !== false,
    includeTeam: true,
    includeCrm: crmEmailDigestOn(user),
    sendEmail: true,
    sendPush: true,
    markSent: false,
    frequency: user.notification_frequency || 'daily'
  });
}
