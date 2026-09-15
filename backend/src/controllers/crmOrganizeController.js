import pool from '../db/pool.js';
import {
  listContacts,
  listCompanies,
  createContact,
  updateContact,
  deleteContact,
  createCompany,
  updateCompany,
  linkContactToDeal,
  unlinkContactFromDeal,
  createAndLinkContact,
  listDealContacts,
  CONTACT_ROLES
} from '../services/crmContactService.js';
import { importDealsFromCsv } from '../services/crmImportService.js';
import {
  listSavedViews,
  createSavedView,
  updateSavedView,
  deleteSavedView,
  getBuiltinViews
} from '../services/crmViewsService.js';
import {
  listAllTasks,
  listDdDealIds,
  createTask,
  listTaskComments,
  addTaskComment
} from '../services/crmTaskService.js';
import { parseQuickAdd, matchDealByHint } from '../services/crmQuickAddParse.js';
import { getDealAccess, assertCanWrite, VISIBLE_DEALS_SQL } from '../lib/teamAcl.js';

export { CONTACT_ROLES };

export const listCrmContacts = async (req, res) => {
  try {
    const contacts = await listContacts(req.user.userId);
    res.json({ contacts });
  } catch (error) {
    console.error('[crmOrganize] listContacts', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postCrmContact = async (req, res) => {
  try {
    const contact = await createContact(req.user.userId, req.body);
    res.status(201).json({ contact });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] postContact', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const patchCrmContact = async (req, res) => {
  try {
    const contact = await updateContact(req.user.userId, req.params.contactId, req.body);
    res.json({ contact });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] patchContact', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const removeCrmContact = async (req, res) => {
  try {
    const result = await deleteContact(req.user.userId, req.params.contactId);
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] deleteContact', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const listCrmCompanies = async (req, res) => {
  try {
    const companies = await listCompanies(req.user.userId);
    res.json({ companies });
  } catch (error) {
    console.error('[crmOrganize] listCompanies', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postCrmCompany = async (req, res) => {
  try {
    const company = await createCompany(req.user.userId, req.body);
    res.status(201).json({ company });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] postCompany', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const patchCrmCompany = async (req, res) => {
  try {
    const company = await updateCompany(req.user.userId, req.params.companyId, req.body);
    res.json({ company });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] patchCompany', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getDealContactList = async (req, res) => {
  try {
    const contacts = await listDealContacts(req.user.userId, req.params.id);
    res.json({ contacts, roles: CONTACT_ROLES });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] getDealContacts', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postDealContactLink = async (req, res) => {
  try {
    const { contactId, role, ...contactPayload } = req.body;
    if (contactId) {
      const link = await linkContactToDeal(req.user.userId, req.params.id, contactId, role);
      return res.status(201).json({ link });
    }
    const result = await createAndLinkContact(req.user.userId, req.params.id, {
      ...contactPayload,
      role
    });
    res.status(201).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] postDealContact', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const deleteDealContactLink = async (req, res) => {
  try {
    const role = req.query.role || req.body?.role;
    const result = await unlinkContactFromDeal(
      req.user.userId,
      req.params.id,
      req.params.contactId,
      role
    );
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] unlinkContact', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postCsvImport = async (req, res) => {
  try {
    const csvText = req.body?.csv || req.body?.text || '';
    const teamId = req.body?.teamId ? Number(req.body.teamId) : null;
    if (!String(csvText).trim()) {
      return res.status(400).json({ error: 'CSV text required' });
    }
    const result = await importDealsFromCsv(req.user.userId, csvText, { teamId });
    res.status(201).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] csvImport', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getCrmViews = async (req, res) => {
  try {
    const teamId = req.query.teamId ? Number(req.query.teamId) : null;
    const custom = await listSavedViews(req.user.userId, { teamId });
    res.json({ views: [...getBuiltinViews(), ...custom] });
  } catch (error) {
    console.error('[crmOrganize] getViews', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postCrmView = async (req, res) => {
  try {
    const view = await createSavedView(req.user.userId, req.body);
    res.status(201).json({ view });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] postView', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const patchCrmView = async (req, res) => {
  try {
    const view = await updateSavedView(req.user.userId, req.params.viewId, req.body);
    res.json({ view });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] patchView', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const removeCrmView = async (req, res) => {
  try {
    const result = await deleteSavedView(req.user.userId, req.params.viewId);
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] deleteView', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const getTaskComments = async (req, res) => {
  try {
    const comments = await listTaskComments(req.user.userId, req.params.taskId);
    res.json({ comments });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] getTaskComments', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postTaskComment = async (req, res) => {
  try {
    const comment = await addTaskComment(req.user.userId, req.params.taskId, req.body?.body);
    res.status(201).json({ comment });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] postTaskComment', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postQuickAddTask = async (req, res) => {
  try {
    const raw = req.body?.text || req.body?.title || '';
    const parsed = parseQuickAdd(raw);
    if (!parsed.title) {
      return res.status(400).json({ error: 'Task text required' });
    }

    let savedDealId = req.body?.savedDealId || req.body?.dealId || null;
    if (!savedDealId && parsed.dealHint) {
      const deals = await pool.query(
        `SELECT id, name FROM saved_deals WHERE ${VISIBLE_DEALS_SQL} ORDER BY updated_at DESC LIMIT 200`,
        [req.user.userId]
      );
      const match = matchDealByHint(deals.rows, parsed.dealHint);
      if (match) savedDealId = match.id;
    }
    if (!savedDealId) {
      return res.status(400).json({
        error: 'Pick a deal (or add “on DealName” / @DealName to the quick-add text)',
        parsed
      });
    }

    const task = await createTask(req.user.userId, savedDealId, {
      title: parsed.title,
      dueAt: req.body?.dueAt || parsed.dueAt,
      priority: req.body?.priority ?? parsed.priority ?? 3,
      assigneeUserId: req.body?.assigneeUserId || req.user.userId,
      recurrence: req.body?.recurrence || null,
      source: 'quick_add',
      notifyRecipients: [{ type: 'self' }]
    });
    res.status(201).json({ task, parsed });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] quickAdd', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const patchDealNote = async (req, res) => {
  try {
    const { activityId } = req.params;
    const { pinned, title, body, checklist } = req.body;
    const existing = await pool.query('SELECT * FROM activities WHERE id = $1', [activityId]);
    if (!existing.rows.length) {
      return res.status(404).json({ error: 'Note not found' });
    }
    const activity = existing.rows[0];
    if (activity.activity_type !== 'note') {
      return res.status(400).json({ error: 'Only notes can be updated this way' });
    }
    await assertCanWrite(await getDealAccess(req.user.userId, activity.saved_deal_id));

    const meta = {
      ...(typeof activity.metadata === 'object' && activity.metadata ? activity.metadata : {}),
      ...(checklist !== undefined ? { checklist } : {})
    };

    const result = await pool.query(
      `UPDATE activities SET
         body = COALESCE($1, body),
         title = COALESCE($2, title),
         pinned = COALESCE($3, pinned),
         metadata = $4::jsonb
       WHERE id = $5
       RETURNING id, activity_type, body, title, pinned, metadata, occurred_at`,
      [
        body !== undefined ? String(body) : null,
        title !== undefined ? (title ? String(title).trim() : null) : null,
        pinned !== undefined ? Boolean(pinned) : null,
        JSON.stringify(meta),
        activityId
      ]
    );
    res.json({ activity: result.rows[0] });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] patchNote', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postDealNoteRich = async (req, res) => {
  try {
    const { id } = req.params;
    const { body, title, pinned, checklist } = req.body;
    if (!body || !String(body).trim()) {
      return res.status(400).json({ error: 'Note body required' });
    }
    await assertCanWrite(await getDealAccess(req.user.userId, id));
    const result = await pool.query(
      `INSERT INTO activities (user_id, saved_deal_id, activity_type, body, title, pinned, metadata)
       VALUES ($1, $2, 'note', $3, $4, $5, $6::jsonb)
       RETURNING id, activity_type, body, title, pinned, metadata, occurred_at`,
      [
        req.user.userId,
        id,
        String(body).trim(),
        title?.trim() || null,
        Boolean(pinned),
        JSON.stringify(checklist ? { checklist } : {})
      ]
    );
    res.status(201).json({ activity: result.rows[0] });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[crmOrganize] postNoteRich', error);
    res.status(500).json({ error: 'Server error' });
  }
};

/** Re-export listAllTasks wrapper with assignee filter for routes that call organize controller */
export const getCrmTasksFiltered = async (req, res) => {
  try {
    const status = ['open', 'done', 'all'].includes(req.query.status) ? req.query.status : 'open';
    const assignee = req.query.assignee || null;
    const [tasks, ddDealIds] = await Promise.all([
      listAllTasks(req.user.userId, { status, assignee }),
      listDdDealIds(req.user.userId)
    ]);
    res.json({ tasks, ddDealIds });
  } catch (error) {
    console.error('[crmOrganize] getTasksFiltered', error);
    res.status(500).json({ error: 'Server error' });
  }
};
