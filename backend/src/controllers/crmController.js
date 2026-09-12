import pool from '../db/pool.js';
import { hydrateCrmForSavedDeal } from '../services/crmHydration.js';
import { PIPELINE_STAGES, UNSTAGED_KEY, KANBAN_COLUMNS, kanbanColumnForStage } from '../constants/pipelineStages.js';
import { updateDealPipelineStage } from '../services/crmStageService.js';
import { findStaleListings } from '../services/crmStaleListing.js';
import {
  getTodayTaskSummary,
  listAllTasks,
  listDealTasks,
  createTask,
  createQuickFollowUp,
  updateTask
} from '../services/crmTaskService.js';
import { getDdOverdueForToday, getRecentPortalComments } from '../services/ddChecklistService.js';
import { getCrmFunnelAnalytics } from '../services/crmAnalyticsService.js';
import { listDealDocuments, addDealDocument } from '../services/crmDocumentService.js';
import {
  isGoogleCalendarOAuthConfigured,
  getGoogleCalendarAuthUrl,
  verifyOAuthState,
  exchangeCodeAndStoreTokens,
  disconnectGoogleCalendar,
  getGoogleCalendarRedirectUri,
  connectionHasGmailSend,
  connectionHasGmailReadonly
} from '../services/googleCalendarService.js';
import { sendGmailMessage } from '../services/googleGmailService.js';
import { isSmtpConfigured } from '../services/emailService.js';
import {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  syncCalendarRange
} from '../services/crmCalendarService.js';
import { getDealAccess, assertCanRead, assertCanWrite, getMembership, VISIBLE_DEALS_SQL } from '../lib/teamAcl.js';
import { getUnreadCounts, getUnreadMentions } from '../services/dealThreadService.js';
import { countUnreadAlerts } from '../services/userAlertService.js';
import { findDormantDeals, getLastActivityByDealIds } from '../services/crmPresenceService.js';
import { listNudgeQueue, completeNudge } from '../services/crmNudgeService.js';

  const KANBAN_DEAL_FIELDS = `
  id, deal_id, name, url, progress_stage, progress_history, status,
  asking_price, ebitda, revenue, city, state, industry, source,
  market_deal_id, calculator_state, saved_at, updated_at,
  team_id, shared_by_user_id, user_id,
  owner_user_id, close_target_date, referral_source, external_source_type,
  tags, custom_stage_label
`;

function normalizeProgressHistory(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function queryScopedDeals(userId, { scope, teamId, fields }) {
  let params;
  let whereSql;

  if (scope === 'team' && teamId) {
    const membership = await getMembership(userId, teamId);
    if (!membership) {
      const err = new Error('Not a team member');
      err.status = 403;
      throw err;
    }
    // Do not pass unused $1 (userId) — Postgres 42P18 with node-pg.
    params = [teamId];
    whereSql = `team_id = $1`;
  } else if (scope === 'all') {
    params = [userId];
    whereSql = `(
      (user_id = $1 AND team_id IS NULL)
      OR (
        team_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = saved_deals.team_id
            AND tm.user_id = $1 AND tm.status = 'active'
        )
      )
    )`;
  } else {
    params = [userId];
    whereSql = `user_id = $1 AND team_id IS NULL`;
  }

  return pool.query(
    `SELECT ${fields} FROM saved_deals WHERE ${whereSql} ORDER BY updated_at DESC`,
    params
  );
}

export const getCrmKanban = async (req, res) => {
  try {
    const userId = req.user.userId;
    const scope = String(req.query.scope || 'personal').toLowerCase();
    const teamId = req.query.teamId ? Number(req.query.teamId) : null;

    const result = await queryScopedDeals(userId, {
      scope,
      teamId,
      fields: KANBAN_DEAL_FIELDS
    });

    const dealIds = result.rows.map((r) => r.id);
    const unread = await getUnreadCounts(userId, dealIds).catch(() => ({}));
    const lastActivityByDeal = await getLastActivityByDealIds(dealIds).catch((err) => {
      console.warn('[crm] getLastActivityByDealIds skipped:', err.message);
      return {};
    });

    const pendingApprovals = teamId
      ? await pool.query(
          `SELECT saved_deal_id, id, to_value, from_value, status, requested_by
           FROM deal_approvals
           WHERE team_id = $1 AND status = 'pending'`,
          [teamId]
        ).catch(() => ({ rows: [] }))
      : { rows: [] };
    const pendingByDeal = new Map(
      pendingApprovals.rows.map((a) => [a.saved_deal_id, a])
    );

    const deals = result.rows.map((row) => ({
      ...row,
      progress_history: normalizeProgressHistory(row.progress_history),
      unread_messages: unread[row.id] || 0,
      pending_approval: pendingByDeal.get(row.id) || null,
      last_activity: lastActivityByDeal[row.id] || null
    }));

    const buckets = new Map(KANBAN_COLUMNS.map((col) => [col.id, []]));

    for (const deal of deals) {
      const col = kanbanColumnForStage(deal.progress_stage);
      buckets.get(col.id).push(deal);
    }

    const columns = KANBAN_COLUMNS.map((col) => ({
      id: col.id,
      label: col.label,
      stage: col.id,
      deals: buckets.get(col.id) || []
    }));

    res.json({
      columns,
      unstaged: buckets.get(UNSTAGED_KEY) || [],
      unstagedKey: UNSTAGED_KEY,
      stages: PIPELINE_STAGES,
      kanbanColumns: KANBAN_COLUMNS.map(({ id, label }) => ({ id, label })),
      totalDeals: deals.length,
      scope,
      teamId: teamId || null
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crm] getCrmKanban error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const patchDealStage = async (req, res) => {
  const { id } = req.params;
  const { progressStage } = req.body;

  try {
    const stageValue = progressStage == null || progressStage === '' ? null : progressStage;
    const result = await updateDealPipelineStage(req.user.userId, id, stageValue);
    res.json(result);
  } catch (error) {
    if (error.status === 404) {
      return res.status(404).json({ error: 'Deal not found' });
    }
    if (error.status === 403) {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Invalid pipeline stage') {
      return res.status(400).json({ error: error.message });
    }
    console.error('[crm] patchDealStage error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCrmToday = async (req, res) => {
  try {
    const userId = req.user.userId;
    const scope = String(req.query.scope || 'all').toLowerCase();
    const teamId = req.query.teamId ? Number(req.query.teamId) : null;

    const dealsResult = await queryScopedDeals(userId, {
      scope: scope === 'team' ? 'team' : scope === 'personal' ? 'personal' : 'all',
      teamId,
      fields: 'id, deal_id, name, progress_stage, market_deal_id, saved_at, updated_at, team_id'
    });

    const approvals = await pool.query(
      `SELECT a.id, a.saved_deal_id, a.team_id, a.action_type, a.from_value, a.to_value, a.created_at,
              sd.name AS deal_name, u.email AS requester_email, t.name AS team_name
       FROM deal_approvals a
       JOIN saved_deals sd ON sd.id = a.saved_deal_id
       JOIN users u ON u.id = a.requested_by
       JOIN teams t ON t.id = a.team_id
       JOIN team_members tm ON tm.team_id = a.team_id AND tm.user_id = $1
         AND tm.status = 'active' AND tm.role = 'admin'
       WHERE a.status = 'pending'
       ORDER BY a.created_at ASC`,
      [userId]
    ).catch(() => ({ rows: [] }));

    const taskSummary = await getTodayTaskSummary(userId).catch((err) => {
      console.warn('[crm] getTodayTaskSummary skipped:', err.message);
      return { overdue: [], dueToday: [], upcoming: [], badgeCount: 0 };
    });
    const staleListings = await findStaleListings(userId).catch((err) => {
      console.warn('[crm] findStaleListings skipped:', err.message);
      return [];
    });
    const ddOverdue = await getDdOverdueForToday(userId).catch((err) => {
      console.warn('[crm] getDdOverdueForToday skipped:', err.message);
      return [];
    });
    const portalComments = await getRecentPortalComments(userId).catch((err) => {
      console.warn('[crm] getRecentPortalComments skipped:', err.message);
      return [];
    });
    const unreadMentions = await getUnreadMentions(userId).catch((err) => {
      console.warn('[crm] getUnreadMentions skipped:', err.message);
      return [];
    });
    const unreadAlertCount = await countUnreadAlerts(userId).catch((err) => {
      console.warn('[crm] countUnreadAlerts skipped:', err.message);
      return 0;
    });
    const dormantDeals = await findDormantDeals(userId, { days: 14, limit: 15 }).catch((err) => {
      console.warn('[crm] findDormantDeals skipped:', err.message);
      return [];
    });
    const nudges = await listNudgeQueue(userId).catch((err) => {
      console.warn('[crm] listNudgeQueue skipped:', err.message);
      return [];
    });

    const recentActivities = await pool.query(
      `SELECT a.id, a.saved_deal_id, a.activity_type, a.body, a.occurred_at, a.metadata,
              sd.name AS deal_name, u.email AS actor_email
       FROM activities a
       JOIN saved_deals sd ON sd.id = a.saved_deal_id
       JOIN users u ON u.id = a.user_id
       WHERE ${VISIBLE_DEALS_SQL}
       ORDER BY a.occurred_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json({
      dealCount: dealsResult.rows.length,
      deals: dealsResult.rows,
      recentActivities: recentActivities.rows,
      dormantDeals,
      nudges,
      tasks: taskSummary,
      staleListings,
      ddOverdue,
      portalComments,
      pendingApprovals: approvals.rows,
      unreadMentions,
      unreadAlertCount,
      badgeCount:
        taskSummary.badgeCount
        + staleListings.length
        + ddOverdue.length
        + portalComments.length
        + approvals.rows.length
        + dormantDeals.length
        + nudges.length
        // Prefer durable alert count for Talk pings; fall back to mention rows
        + Math.max(unreadAlertCount, unreadMentions.length)
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crm] getCrmToday error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getDealActivities = async (req, res) => {
  const { id } = req.params;
  try {
    const access = await getDealAccess(req.user.userId, id);
    assertCanRead(access);

    const contacts = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, dc.role, co.name AS company_name,
              (
                SELECT COUNT(DISTINCT dc2.saved_deal_id)::int
                FROM deal_contacts dc2
                WHERE dc2.contact_id = c.id
              ) AS deal_count
       FROM deal_contacts dc
       JOIN contacts c ON c.id = dc.contact_id
       LEFT JOIN companies co ON co.id = c.company_id
       WHERE dc.saved_deal_id = $1`,
      [id]
    );

    const activities = await pool.query(
      `SELECT a.id, a.activity_type, a.body, a.title, a.pinned, a.metadata, a.occurred_at, a.contact_id,
              u.email AS actor_email
       FROM activities a
       JOIN users u ON u.id = a.user_id
       WHERE a.saved_deal_id = $1
       ORDER BY a.pinned DESC NULLS LAST, a.occurred_at DESC`,
      [id]
    );

    const last = activities.rows[0] || null;
    res.json({
      contacts: contacts.rows,
      activities: activities.rows,
      lastActivity: last
        ? {
            at: last.occurred_at,
            type: last.activity_type,
            actorEmail: last.actor_email,
            body: last.body
          }
        : null,
      access: {
        canWrite: access.canWrite,
        canUnshare: access.canUnshare,
        canApprove: access.canApprove,
        role: access.role,
        teamId: access.deal.team_id
      }
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crm] getDealActivities error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const addDealActivity = async (req, res) => {
  const { id } = req.params;
  const { body, activityType = 'note', title, pinned, checklist } = req.body;

  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Activity body required' });
  }

  try {
    const access = await getDealAccess(req.user.userId, id);
    assertCanWrite(access);

    const result = await pool.query(
      `INSERT INTO activities (user_id, saved_deal_id, activity_type, body, title, pinned, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id, activity_type, body, title, pinned, metadata, occurred_at`,
      [
        req.user.userId,
        id,
        activityType,
        String(body).trim(),
        title?.trim() || null,
        Boolean(pinned),
        JSON.stringify(checklist ? { checklist } : {})
      ]
    );

    res.status(201).json({ activity: result.rows[0] });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crm] addDealActivity error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const refreshDealFromListing = async (req, res) => {
  const { id } = req.params;
  try {
    const access = await getDealAccess(req.user.userId, id);
    assertCanWrite(access);

    const dealRow = await pool.query(
      `SELECT id, deal_id, listing_id, source, broker_name, broker_company, broker_email, broker_phone
       FROM saved_deals WHERE id = $1`,
      [id]
    );
    if (dealRow.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    const deal = dealRow.rows[0];
    const result = await hydrateCrmForSavedDeal(req.user.userId, deal.id, {
      dealId: deal.deal_id,
      listingId: deal.listing_id,
      source: deal.source,
      brokerName: deal.broker_name,
      brokerCompany: deal.broker_company,
      brokerEmail: deal.broker_email,
      brokerPhone: deal.broker_phone
    });

    res.json({ message: 'Listing data refreshed', ...result });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crm] refreshDealFromListing error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCrmTasks = async (req, res) => {
  try {
    const status = ['open', 'done', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const tasks = await listAllTasks(req.user.userId, { status });
    res.json({ tasks });
  } catch (error) {
    console.error('[crm] getCrmTasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getDealTasks = async (req, res) => {
  try {
    const tasks = await listDealTasks(req.user.userId, req.params.id);
    res.json({ tasks });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('[crm] getDealTasks error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postDealTask = async (req, res) => {
  try {
    const {
      title, dueAt, source, metadata, notifyRecipients,
      assigneeUserId, parentTaskId, priority, recurrence
    } = req.body;
    const task = await createTask(req.user.userId, req.params.id, {
      title,
      dueAt,
      source,
      metadata,
      notifyRecipients,
      assigneeUserId,
      parentTaskId,
      priority,
      recurrence
    });
    res.status(201).json({ task });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('[crm] postDealTask error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postQuickFollowUp = async (req, res) => {
  try {
    const { preset, dueAt, title, notifyRecipients, force } = req.body;
    const task = await createQuickFollowUp(req.user.userId, req.params.id, {
      preset,
      dueAt,
      title,
      notifyRecipients,
      force: Boolean(force)
    });
    res.status(201).json({ task });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    if (error.status === 409) {
      return res.status(409).json({
        error: error.message,
        code: error.code || 'conflict',
        existingTask: error.existingTask || null
      });
    }
    console.error('[crm] postQuickFollowUp error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postCompleteNudge = async (req, res) => {
  try {
    const result = await completeNudge(req.user.userId, req.params.id, {
      taskId: req.body?.taskId || null,
      actionKey: req.body?.actionKey || null
    });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crm] postCompleteNudge error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const patchTask = async (req, res) => {
  try {
    const task = await updateTask(req.user.userId, req.params.taskId, req.body);
    res.json({ task });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('[crm] patchTask error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCrmContacts = async (req, res) => {
  try {
    const userId = req.user.userId;
    // Contacts owned by user OR linked to any visible (personal/team) deal
    const result = await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, co.name AS company_name,
              COALESCE(linked.deals, '[]'::json) AS linked_deals,
              COALESCE(linked.deal_count, 0)::int AS deal_count
       FROM contacts c
       LEFT JOIN companies co ON co.id = c.company_id
       LEFT JOIN LATERAL (
         SELECT json_agg(json_build_object('id', sd.id, 'name', sd.name) ORDER BY sd.name) AS deals,
                COUNT(DISTINCT sd.id)::int AS deal_count
         FROM deal_contacts dc
         JOIN saved_deals sd ON sd.id = dc.saved_deal_id
         WHERE dc.contact_id = c.id
           AND ${VISIBLE_DEALS_SQL}
       ) linked ON true
       WHERE c.user_id = $1
          OR EXISTS (
            SELECT 1 FROM deal_contacts dc2
            JOIN saved_deals sd2 ON sd2.id = dc2.saved_deal_id
            WHERE dc2.contact_id = c.id
              AND (
                (sd2.user_id = $1 AND sd2.team_id IS NULL)
                OR (
                  sd2.team_id IS NOT NULL AND EXISTS (
                    SELECT 1 FROM team_members tm
                    WHERE tm.team_id = sd2.team_id AND tm.user_id = $1 AND tm.status = 'active'
                  )
                )
              )
          )
       ORDER BY c.name NULLS LAST, c.email`,
      [userId]
    );
    res.json({ contacts: result.rows });
  } catch (error) {
    console.error('[crm] getCrmContacts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCrmAnalytics = async (req, res) => {
  try {
    const scope = String(req.query.scope || 'all').toLowerCase();
    const teamId = req.query.teamId ? Number(req.query.teamId) : null;
    const analytics = await getCrmFunnelAnalytics(req.user.userId, { scope, teamId });
    res.json(analytics);
  } catch (error) {
    console.error('[crm] getCrmAnalytics error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getDealDocuments = async (req, res) => {
  try {
    const documents = await listDealDocuments(req.user.userId, req.params.id);
    res.json({ documents });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('[crm] getDealDocuments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postDealDocument = async (req, res) => {
  try {
    const document = await addDealDocument(req.user.userId, req.params.id, req.body);
    res.status(201).json({ document });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('[crm] postDealDocument error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCalendarOAuthConfig = async (req, res) => {
  try {
    const configured = isGoogleCalendarOAuthConfigured();
    res.json({
      oauthConfigured: configured,
      redirectUri: getGoogleCalendarRedirectUri()
    });
  } catch (error) {
    console.error('[crm] getCalendarOAuthConfig error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCalendarStatus = async (req, res) => {
  try {
    const row = await pool.query(
      `SELECT provider, calendar_id, connected_at, google_email, granted_scopes
       FROM calendar_connections WHERE user_id = $1`,
      [req.user.userId]
    );
    const connection = row.rows[0] || null;
    res.json({
      connected: Boolean(connection),
      provider: connection?.provider || null,
      connectedAt: connection?.connected_at || null,
      googleEmail: connection?.google_email || null,
      gmail: connectionHasGmailSend(connection),
      gmailReadonly: connectionHasGmailReadonly(connection),
      calendar: Boolean(connection),
      oauthConfigured: isGoogleCalendarOAuthConfigured(),
      redirectUri: getGoogleCalendarRedirectUri(),
      smtpConfigured: isSmtpConfigured()
    });
  } catch (error) {
    console.error('[crm] getCalendarStatus error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCalendarOAuthUrl = async (req, res) => {
  try {
    const returnTo = req.query.returnTo === 'settings' ? 'settings' : 'calendar';
    const gmailReadonly = req.query.gmailReadonly === '1' || req.query.gmailReadonly === 'true';
    const url = getGoogleCalendarAuthUrl(req.user.userId, returnTo, { gmailReadonly });
    res.json({ url });
  } catch (error) {
    if (error.status === 503) return res.status(503).json({ error: error.message });
    console.error('[crm] getCalendarOAuthUrl error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const googleCalendarOAuthCallback = async (req, res) => {
  const webBase = (
    process.env.NODE_ENV !== 'production'
      ? (process.env.WEB_APP_URL_LOCAL || 'http://localhost:5173')
      : (process.env.WEB_APP_URL || 'http://localhost:5173')
  )
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');

  const peekReturnTo = (state) => {
    try {
      return verifyOAuthState(String(state)).returnTo;
    } catch {
      return 'calendar';
    }
  };

  const redirectWith = (params, dest = 'calendar') => {
    if (dest === 'settings') {
      const qs = new URLSearchParams();
      qs.set('google', params.calendar === 'connected' ? 'connected' : 'error');
      if (params.message) qs.set('message', params.message);
      return res.redirect(`${webBase}/settings?${qs.toString()}`);
    }
    const qs = new URLSearchParams(params);
    return res.redirect(`${webBase}/dashboard?${qs.toString()}`);
  };

  try {
    const { code, state, error: oauthError } = req.query;
    const dest = state ? peekReturnTo(state) : 'calendar';
    if (oauthError) {
      return redirectWith({
        tab: 'crm',
        crmSubview: 'calendar',
        calendar: 'error',
        message: String(oauthError)
      }, dest);
    }
    if (!code || !state) {
      return redirectWith({
        tab: 'crm',
        crmSubview: 'calendar',
        calendar: 'error',
        message: 'Missing authorization code'
      }, dest);
    }

    const { userId } = verifyOAuthState(String(state));
    await exchangeCodeAndStoreTokens(userId, String(code));
    return redirectWith({ tab: 'crm', crmSubview: 'calendar', calendar: 'connected' }, dest);
  } catch (error) {
    console.error('[crm] googleCalendarOAuthCallback error:', error);
    const dest = req.query.state ? peekReturnTo(req.query.state) : 'calendar';
    return redirectWith({
      tab: 'crm',
      crmSubview: 'calendar',
      calendar: 'error',
      message: error.message || 'OAuth failed'
    }, dest);
  }
};

export const postGmailSend = async (req, res) => {
  try {
    const { to, subject, text } = req.body || {};
    if (!subject || !String(text || '').trim()) {
      return res.status(400).json({ error: 'subject and text are required' });
    }
    const result = await sendGmailMessage(req.user.userId, {
      to,
      subject,
      text
    });
    res.json(result);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error('[crm] postGmailSend error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteCalendarConnection = async (req, res) => {
  try {
    const result = await disconnectGoogleCalendar(req.user.userId);
    res.json(result);
  } catch (error) {
    console.error('[crm] deleteCalendarConnection error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCalendarEvents = async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required' });
    }
    const events = await listCalendarEvents(req.user.userId, start, end);
    res.json({ events });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('[crm] getCalendarEvents error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postCalendarEvent = async (req, res) => {
  try {
    const event = await createCalendarEvent(req.user.userId, req.body);
    res.status(201).json({ event });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('[crm] postCalendarEvent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const patchCalendarEvent = async (req, res) => {
  try {
    const event = await updateCalendarEvent(req.user.userId, req.params.eventId, req.body);
    res.json({ event });
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('[crm] patchCalendarEvent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const removeCalendarEvent = async (req, res) => {
  try {
    const result = await deleteCalendarEvent(req.user.userId, req.params.eventId);
    res.json(result);
  } catch (error) {
    if (error.status === 404) return res.status(404).json({ error: error.message });
    console.error('[crm] removeCalendarEvent error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postCalendarSync = async (req, res) => {
  try {
    const { start, end } = req.body || {};
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end required' });
    }
    const result = await syncCalendarRange(req.user.userId, start, end);
    const events = await listCalendarEvents(req.user.userId, start, end, { sync: false });
    res.json({ ...result, events });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ error: error.message });
    console.error('[crm] postCalendarSync error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/**
 * Lightweight CRM search across saved deals, contacts, and tasks (user-visible only).
 * Does not scan market_deals.
 */
export const getCrmSearch = async (req, res) => {
  try {
    const userId = req.user.userId;
    const q = String(req.query.q || '').trim();
    if (q.length < 1) {
      return res.json({ deals: [], contacts: [], tasks: [] });
    }
    if (q.length > 120) {
      return res.status(400).json({ error: 'Query too long' });
    }

    const pattern = `%${q.replace(/[%_\\]/g, '\\$&')}%`;
    const limit = 10;

    const [dealsResult, contactsResult, tasksResult] = await Promise.all([
      pool.query(
        `SELECT sd.id, sd.name, sd.progress_stage, sd.city, sd.state, sd.asking_price, sd.ebitda
         FROM saved_deals sd
         WHERE ${VISIBLE_DEALS_SQL}
           AND (
             sd.name ILIKE $2 ESCAPE '\\'
             OR COALESCE(sd.broker_name, '') ILIKE $2 ESCAPE '\\'
             OR COALESCE(sd.broker_company, '') ILIKE $2 ESCAPE '\\'
             OR COALESCE(sd.industry, '') ILIKE $2 ESCAPE '\\'
             OR COALESCE(sd.city, '') ILIKE $2 ESCAPE '\\'
             OR COALESCE(sd.state, '') ILIKE $2 ESCAPE '\\'
           )
         ORDER BY sd.updated_at DESC NULLS LAST
         LIMIT $3`,
        [userId, pattern, limit]
      ),
      pool.query(
        `SELECT c.id, c.name, c.email, c.phone, co.name AS company_name,
                COALESCE(linked.deal_count, 0)::int AS deal_count,
                linked.first_deal_id
         FROM contacts c
         LEFT JOIN companies co ON co.id = c.company_id
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT sd.id)::int AS deal_count,
                  MIN(sd.id) AS first_deal_id
           FROM deal_contacts dc
           JOIN saved_deals sd ON sd.id = dc.saved_deal_id
           WHERE dc.contact_id = c.id
             AND ${VISIBLE_DEALS_SQL}
         ) linked ON true
         WHERE (
           c.user_id = $1
           OR EXISTS (
             SELECT 1 FROM deal_contacts dc2
             JOIN saved_deals sd2 ON sd2.id = dc2.saved_deal_id
             WHERE dc2.contact_id = c.id
               AND (
                 (sd2.user_id = $1 AND sd2.team_id IS NULL)
                 OR (
                   sd2.team_id IS NOT NULL AND EXISTS (
                     SELECT 1 FROM team_members tm
                     WHERE tm.team_id = sd2.team_id AND tm.user_id = $1 AND tm.status = 'active'
                   )
                 )
               )
           )
         )
           AND (
             COALESCE(c.name, '') ILIKE $2 ESCAPE '\\'
             OR COALESCE(c.email, '') ILIKE $2 ESCAPE '\\'
             OR COALESCE(co.name, '') ILIKE $2 ESCAPE '\\'
           )
         ORDER BY c.name NULLS LAST
         LIMIT $3`,
        [userId, pattern, limit]
      ),
      pool.query(
        `SELECT t.id, t.title, t.status, t.due_at, t.saved_deal_id, sd.name AS deal_name
         FROM tasks t
         JOIN saved_deals sd ON sd.id = t.saved_deal_id
         WHERE ${VISIBLE_DEALS_SQL}
           AND t.status = 'open'
           AND t.title ILIKE $2 ESCAPE '\\'
         ORDER BY t.due_at NULLS LAST, t.created_at DESC
         LIMIT $3`,
        [userId, pattern, limit]
      )
    ]);

    console.log('[crm] search', {
      q: q.slice(0, 40),
      deals: dealsResult.rows.length,
      contacts: contactsResult.rows.length,
      tasks: tasksResult.rows.length
    });

    res.json({
      deals: dealsResult.rows,
      contacts: contactsResult.rows,
      tasks: tasksResult.rows
    });
  } catch (error) {
    console.error('[crm] getCrmSearch error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
