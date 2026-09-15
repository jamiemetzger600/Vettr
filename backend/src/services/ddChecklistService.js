import crypto from 'crypto';
import bcrypt from 'bcrypt';
import pool from '../db/pool.js';
import { BUSINESS_ACQUISITION_DD_TEMPLATE } from '../data/ddBusinessTemplate.js';
import {
  listWave2TemplateDefs,
  DD_SYSTEM_INDUSTRY_KEYS,
  WAVE2_INDUSTRY_KEYS
} from '../data/ddIndustryTemplates.js';
import { matchIndustryKey, isFranchiseTagged, INDUSTRY_LABELS } from '../lib/industryMatcher.js';
import { sendEmail } from './emailService.js';
import { createTask } from './crmTaskService.js';
import {
  getDealAccess,
  assertCanRead,
  assertCanWrite,
  VISIBLE_DEALS_SQL
} from '../lib/teamAcl.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'http://localhost:5173';

async function loadCommentsForChecklist(checklistId) {
  const res = await pool.query(
    `SELECT c.id, c.item_id, c.author_email, c.author_name, c.body, c.is_external, c.created_at
     FROM dd_item_comments c
     INNER JOIN dd_items i ON i.id = c.item_id
     INNER JOIN dd_groups g ON g.id = i.group_id
     WHERE g.checklist_id = $1
     ORDER BY c.created_at ASC`,
    [checklistId]
  );
  const byItem = new Map();
  for (const row of res.rows) {
    if (!byItem.has(row.item_id)) byItem.set(row.item_id, []);
    byItem.get(row.item_id).push({
      id: row.id,
      authorEmail: row.author_email,
      authorName: row.author_name,
      body: row.body,
      isExternal: row.is_external,
      createdAt: row.created_at
    });
  }
  return byItem;
}

async function notifyDealOwnerPortalComment(userId, savedDealId, { dealName, itemTitle, authorName, body }) {
  const user = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  const ownerEmail = user.rows[0]?.email;
  const author = authorName || 'Portal guest';
  const preview = body.length > 120 ? `${body.slice(0, 117)}…` : body;

  await pool.query(
    `INSERT INTO reminders (user_id, saved_deal_id, remind_at, channel)
     VALUES ($1, $2, NOW(), 'in_app')`,
    [userId, savedDealId]
  );

  if (!ownerEmail) {
    console.warn('[dd] portal comment alert skipped — no owner email', { userId, savedDealId });
    return;
  }

  try {
    await sendEmail({
      to: ownerEmail,
      subject: `DD portal comment on ${dealName}`,
      html: `<p><strong>${author}</strong> commented on <em>${itemTitle}</em>:</p>
             <blockquote style="margin:12px 0;padding:8px 12px;border-left:3px solid #7eb8ff;">${preview}</blockquote>
             <p><a href="${WEB_APP_URL}/dashboard">Open deal in Vettr CRM</a></p>`
    });
    console.log(`[dd] portal comment alert emailed to ${ownerEmail} deal=${savedDealId}`);
  } catch (err) {
    console.warn('[dd] portal comment email failed:', err.message);
  }
}

export async function getRecentPortalComments(userId, days = 7) {
  const result = await pool.query(
    `SELECT c.id, c.body, c.author_name, c.author_email, c.created_at,
            i.title AS item_title, i.id AS item_id,
            sd.id AS saved_deal_id, sd.name AS deal_name
     FROM dd_item_comments c
     JOIN dd_items i ON i.id = c.item_id
     JOIN dd_groups g ON g.id = i.group_id
     JOIN dd_checklists cl ON cl.id = g.checklist_id
     JOIN saved_deals sd ON sd.id = cl.saved_deal_id
     WHERE ${VISIBLE_DEALS_SQL}
       AND c.is_external = true
       AND c.created_at >= NOW() - ($2::int || ' days')::interval
     ORDER BY c.created_at DESC
     LIMIT 30`,
    [userId, days]
  );
  return result.rows;
}

async function seedTemplateTree(templateId, groups) {
  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const gRes = await pool.query(
      `INSERT INTO dd_template_groups (template_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
      [templateId, group.name, gi]
    );
    const groupId = gRes.rows[0].id;
    for (let ii = 0; ii < group.items.length; ii++) {
      const item = group.items[ii];
      await pool.query(
        `INSERT INTO dd_template_items (group_id, title, description, requests_document, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [groupId, item.title, item.description || null, !!item.requestsDocument, ii]
      );
    }
  }
}

/** Seed Wave 2 system templates (idempotent by industry_key). Returns generic template id. */
export async function ensureSystemDdTemplates() {
  // Backfill legacy generic row (pre–industry_key)
  await pool.query(
    `UPDATE dd_templates
     SET industry_key = 'generic'
     WHERE user_id IS NULL
       AND industry_key IS NULL
       AND name = $1`,
    [BUSINESS_ACQUISITION_DD_TEMPLATE.name]
  );

  for (const def of listWave2TemplateDefs()) {
    const existing = await pool.query(
      `SELECT id FROM dd_templates
       WHERE user_id IS NULL AND industry_key = $1
       LIMIT 1`,
      [def.industryKey]
    );
    if (existing.rows.length) continue;

    const tpl = await pool.query(
      `INSERT INTO dd_templates (user_id, name, asset_type, industry_key)
       VALUES (NULL, $1, $2, $3) RETURNING id`,
      [def.name, def.assetType || 'business', def.industryKey]
    );
    await seedTemplateTree(tpl.rows[0].id, def.groups);
    console.log(`[dd] seeded system template industry=${def.industryKey} id=${tpl.rows[0].id}`);
  }

  const generic = await pool.query(
    `SELECT id FROM dd_templates WHERE user_id IS NULL AND industry_key = 'generic' LIMIT 1`
  );
  if (!generic.rows.length) {
    // Fallback if unique index / name collision left generic unnamed
    const byName = await pool.query(
      `SELECT id FROM dd_templates WHERE user_id IS NULL AND name = $1 LIMIT 1`,
      [BUSINESS_ACQUISITION_DD_TEMPLATE.name]
    );
    if (byName.rows.length) return byName.rows[0].id;
    throw new Error('Failed to seed generic DD template');
  }
  return generic.rows[0].id;
}

/** @deprecated Prefer ensureSystemDdTemplates — kept for older call sites. */
export async function ensureSystemDdTemplate() {
  return ensureSystemDdTemplates();
}

export async function listSystemDdTemplates() {
  await ensureSystemDdTemplates();
  const result = await pool.query(
    `SELECT t.id, t.name, t.industry_key, t.asset_type,
            (SELECT COUNT(*)::int FROM dd_template_groups g WHERE g.template_id = t.id) AS group_count,
            (SELECT COUNT(*)::int
             FROM dd_template_items i
             JOIN dd_template_groups g ON g.id = i.group_id
             WHERE g.template_id = t.id) AS item_count
     FROM dd_templates t
     WHERE t.user_id IS NULL AND t.industry_key = ANY($1::text[])
     ORDER BY CASE t.industry_key
       WHEN 'generic' THEN 0
       WHEN 'restaurant' THEN 1
       WHEN 'healthcare' THEN 2
       WHEN 'saas' THEN 3
       WHEN 'services' THEN 4
       WHEN 'environmental' THEN 5
       WHEN 'retail' THEN 6
       WHEN 'manufacturing' THEN 7
       WHEN 'construction' THEN 8
       WHEN 'auto' THEN 9
       WHEN 'franchise' THEN 10
       ELSE 99
     END`,
    [DD_SYSTEM_INDUSTRY_KEYS]
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    industryKey: row.industry_key,
    label: INDUSTRY_LABELS[row.industry_key] || row.name,
    assetType: row.asset_type,
    groupCount: row.group_count,
    itemCount: row.item_count
  }));
}

export async function getDdTemplateSuggestionForDeal(userId, savedDealId) {
  await assertDealOwned(userId, savedDealId, { write: false });
  const deal = await pool.query(
    `SELECT id, name, industry FROM saved_deals WHERE id = $1`,
    [savedDealId]
  );
  if (!deal.rows.length) {
    const err = new Error('Deal not found');
    err.status = 404;
    throw err;
  }

  const industry = deal.rows[0].industry || '';
  let industryKey = isFranchiseTagged(industry) ? 'franchise' : matchIndustryKey(industry);
  if (!DD_SYSTEM_INDUSTRY_KEYS.includes(industryKey)) {
    console.log('[dd] industry matched but no system pack — using generic', {
      dealId: savedDealId,
      industry,
      industryKey
    });
    industryKey = 'generic';
  }

  const templates = await listSystemDdTemplates();
  const suggested = templates.find((t) => t.industryKey === industryKey) || templates[0];

  return {
    dealIndustry: industry || null,
    suggestedIndustryKey: industryKey,
    suggestedLabel: INDUSTRY_LABELS[industryKey] || suggested?.label,
    suggestedTemplateId: suggested?.id || null,
    templates
  };
}

async function assertDealOwned(userId, savedDealId, { write = true } = {}) {
  const access = await getDealAccess(userId, savedDealId);
  if (write) assertCanWrite(access);
  else assertCanRead(access);
  return {
    id: access.deal.id,
    name: access.deal.name,
    progress_stage: access.deal.progress_stage
  };
}

export async function getChecklistForDeal(userId, savedDealId) {
  await assertDealOwned(userId, savedDealId, { write: false });
  const cl = await pool.query(
    `SELECT c.id, c.template_id, c.started_at, c.completed_at, c.target_date, t.name AS template_name
     FROM dd_checklists c
     LEFT JOIN dd_templates t ON t.id = c.template_id
     WHERE c.saved_deal_id = $1`,
    [savedDealId]
  );
  if (!cl.rows.length) return null;

  const checklistId = cl.rows[0].id;
  const commentsByItem = await loadCommentsForChecklist(checklistId);
  const groupsRes = await pool.query(
    `SELECT id, name, sort_order FROM dd_groups WHERE checklist_id = $1 ORDER BY sort_order`,
    [checklistId]
  );

  const groups = [];
  let totalItems = 0;
  let completeItems = 0;
  let overdueItems = 0;
  const now = new Date();

  for (const g of groupsRes.rows) {
    const itemsRes = await pool.query(
      `SELECT i.id, i.title, i.description, i.status, i.due_at, i.requests_document,
              i.sort_order, i.completed_at
       FROM dd_items i WHERE i.group_id = $1 ORDER BY i.sort_order`,
      [g.id]
    );
    const assigneesRes = await pool.query(
      `SELECT a.item_id, a.email, a.name, a.role_label
       FROM dd_item_assignees a
       INNER JOIN dd_items i ON i.id = a.item_id AND i.group_id = $1`,
      [g.id]
    );
    const docsRes = await pool.query(
      `SELECT d.item_id, d.id, d.filename, d.mime_type, d.storage_key, d.uploaded_by_email,
              d.is_external, d.uploaded_at
       FROM dd_item_documents d
       INNER JOIN dd_items i ON i.id = d.item_id AND i.group_id = $1
       ORDER BY d.uploaded_at DESC`,
      [g.id]
    );
    const assigneesByItem = new Map();
    for (const a of assigneesRes.rows) {
      if (!assigneesByItem.has(a.item_id)) assigneesByItem.set(a.item_id, []);
      assigneesByItem.get(a.item_id).push({
        email: a.email,
        name: a.name,
        roleLabel: a.role_label
      });
    }
    const docsByItem = new Map();
    for (const d of docsRes.rows) {
      if (!docsByItem.has(d.item_id)) docsByItem.set(d.item_id, []);
      docsByItem.get(d.item_id).push({
        id: d.id,
        filename: d.filename,
        mimeType: d.mime_type,
        storageKey: d.storage_key,
        uploadedByEmail: d.uploaded_by_email,
        isExternal: d.is_external,
        uploadedAt: d.uploaded_at
      });
    }

    const items = itemsRes.rows.map((i) => {
      totalItems += 1;
      if (i.status === 'complete' || i.status === 'na') completeItems += 1;
      if (i.due_at && i.status !== 'complete' && i.status !== 'na' && new Date(i.due_at) < now) {
        overdueItems += 1;
      }
      return {
        ...i,
        assignees: assigneesByItem.get(i.id) || [],
        comments: commentsByItem.get(i.id) || [],
        documents: docsByItem.get(i.id) || []
      };
    });

    groups.push({ ...g, items });
  }

  const shareLinks = await pool.query(
    `SELECT id, label, mode, expires_at, revoked_at, show_deal_name, created_at,
            group_ids,
            (password_hash IS NOT NULL) AS has_password,
            (SELECT COUNT(*)::int FROM dd_share_access_log a WHERE a.share_link_id = sl.id) AS access_count
     FROM dd_share_links sl
     WHERE checklist_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [checklistId]
  );

  const linksWithAccess = [];
  for (const link of shareLinks.rows) {
    const access = await pool.query(
      `SELECT action, guest_name, guest_email, created_at
       FROM dd_share_access_log
       WHERE share_link_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [link.id]
    );
    linksWithAccess.push({
      id: link.id,
      label: link.label,
      mode: link.mode,
      expiresAt: link.expires_at,
      revokedAt: link.revoked_at,
      showDealName: link.show_deal_name,
      createdAt: link.created_at,
      groupIds: link.group_ids || [],
      hasPassword: Boolean(link.has_password),
      accessCount: link.access_count || 0,
      recentAccess: access.rows.map((a) => ({
        action: a.action,
        guestName: a.guest_name,
        guestEmail: a.guest_email,
        createdAt: a.created_at
      }))
    });
  }

  return {
    ...cl.rows[0],
    groups,
    progress: {
      totalItems,
      completeItems,
      percent: totalItems ? Math.round((completeItems / totalItems) * 100) : 0,
      overdueItems
    },
    shareLinks: linksWithAccess
  };
}

export async function startChecklistFromTemplate(userId, savedDealId, {
  templateId: requestedTemplateId,
  targetDate = null,
  milestones = []
} = {}) {
  const deal = await assertDealOwned(userId, savedDealId);
  const existing = await pool.query(
    'SELECT id FROM dd_checklists WHERE saved_deal_id = $1',
    [savedDealId]
  );
  if (existing.rows.length) {
    return getChecklistForDeal(userId, savedDealId);
  }

  await ensureSystemDdTemplates();

  let templateId = requestedTemplateId ? Number(requestedTemplateId) : null;
  if (templateId) {
    const ok = await pool.query(
      `SELECT id, name, industry_key FROM dd_templates
       WHERE id = $1 AND user_id IS NULL`,
      [templateId]
    );
    if (!ok.rows.length) {
      const err = new Error('DD template not found');
      err.status = 404;
      throw err;
    }
  } else {
    const suggestion = await getDdTemplateSuggestionForDeal(userId, savedDealId);
    templateId = suggestion.suggestedTemplateId;
  }

  if (!templateId) {
    templateId = await ensureSystemDdTemplates();
  }

  const tplMeta = await pool.query(
    `SELECT name, industry_key FROM dd_templates WHERE id = $1`,
    [templateId]
  );
  const templateName = tplMeta.rows[0]?.name || 'DD';
  const industryKey = tplMeta.rows[0]?.industry_key || 'generic';

  const parsedTarget = targetDate ? String(targetDate).slice(0, 10) : null;
  const clRes = await pool.query(
    `INSERT INTO dd_checklists (saved_deal_id, template_id, target_date)
     VALUES ($1, $2, $3) RETURNING id`,
    [savedDealId, templateId, parsedTarget || null]
  );
  const checklistId = clRes.rows[0].id;

  const tplGroups = await pool.query(
    `SELECT g.id, g.name, g.sort_order,
            json_agg(json_build_object(
              'title', i.title,
              'requests_document', i.requests_document,
              'sort_order', i.sort_order
            ) ORDER BY i.sort_order) AS items
     FROM dd_template_groups g
     JOIN dd_template_items i ON i.group_id = g.id
     WHERE g.template_id = $1
     GROUP BY g.id ORDER BY g.sort_order`,
    [templateId]
  );

  for (const g of tplGroups.rows) {
    const gIns = await pool.query(
      `INSERT INTO dd_groups (checklist_id, name, sort_order) VALUES ($1, $2, $3) RETURNING id`,
      [checklistId, g.name, g.sort_order]
    );
    const groupId = gIns.rows[0].id;
    const items = Array.isArray(g.items) ? g.items : [];
    for (const item of items) {
      await pool.query(
        `INSERT INTO dd_items (group_id, title, requests_document, sort_order, status)
         VALUES ($1, $2, $3, $4, 'not_started')`,
        [groupId, item.title, item.requests_document, item.sort_order]
      );
    }
  }

  await pool.query(
    `INSERT INTO activities (user_id, saved_deal_id, activity_type, body, metadata)
     VALUES ($1, $2, 'dd_started', $3, $4)`,
    [
      userId,
      savedDealId,
      `Started due diligence (${templateName}) for ${deal.name}`,
      JSON.stringify({ templateId, industryKey, templateName, targetDate: parsedTarget })
    ]
  );

  const milestoneRows = Array.isArray(milestones) ? milestones.slice(0, 6) : [];
  for (const row of milestoneRows) {
    const title = String(row?.title || '').trim();
    const dueRaw = row?.dueAt || row?.due_at || '';
    if (!title || !dueRaw) continue;
    const due = new Date(`${String(dueRaw).slice(0, 10)}T12:00:00`);
    if (Number.isNaN(due.getTime())) continue;
    await createTask(userId, savedDealId, {
      title,
      dueAt: due.toISOString(),
      source: 'dd_milestone',
      priority: 2,
      notifyRecipients: [{ type: 'self' }]
    });
  }

  console.log(
    `[dd] checklist=${checklistId} started deal=${savedDealId} template=${templateId} industry=${industryKey} milestones=${milestoneRows.length}`
  );
  return getChecklistForDeal(userId, savedDealId);
}

export async function patchDdItem(userId, savedDealId, itemId, patch) {
  await assertDealOwned(userId, savedDealId);
  const itemRow = await pool.query(
    `SELECT i.id, i.status, i.title, g.checklist_id, c.saved_deal_id
     FROM dd_items i
     JOIN dd_groups g ON g.id = i.group_id
     JOIN dd_checklists c ON c.id = g.checklist_id
     WHERE i.id = $1 AND c.saved_deal_id = $2`,
    [itemId, savedDealId]
  );
  if (!itemRow.rows.length) {
    const err = new Error('DD item not found');
    err.status = 404;
    throw err;
  }

  const item = itemRow.rows[0];
  const status = patch.status ?? item.status;
  const dueAt = patch.dueAt !== undefined ? patch.dueAt : undefined;
  const completedAt =
    status === 'complete' && item.status !== 'complete' ? new Date().toISOString() : undefined;

  const sets = ['status = $1'];
  const vals = [status];
  let idx = 2;
  if (dueAt !== undefined) {
    sets.push(`due_at = $${idx++}`);
    vals.push(dueAt);
  }
  if (completedAt) {
    sets.push(`completed_at = $${idx++}`);
    vals.push(completedAt);
  }
  vals.push(itemId);

  await pool.query(`UPDATE dd_items SET ${sets.join(', ')} WHERE id = $${idx}`, vals);

  // Clear assignee(s)
  if (patch.assignee === null) {
    await pool.query(`DELETE FROM dd_item_assignees WHERE item_id = $1`, [itemId]);
  } else if (patch.assignee?.email) {
    const email = String(patch.assignee.email).trim().toLowerCase();
    if (email) {
      // Single primary assignee for Vettr team picks — replace prior rows
      await pool.query(`DELETE FROM dd_item_assignees WHERE item_id = $1`, [itemId]);
      await pool.query(
        `INSERT INTO dd_item_assignees (item_id, email, name, role_label)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (item_id, email) DO UPDATE SET name = EXCLUDED.name, role_label = EXCLUDED.role_label`,
        [itemId, email, patch.assignee.name || null, patch.assignee.roleLabel || null]
      );
      notifyAssigneeEmail(email, patch.assignee.name, item.title, itemId, savedDealId, userId).catch((err) => {
        console.warn('[dd] assignee notify failed:', err.message);
      });
    }
  }

  return getChecklistForDeal(userId, savedDealId);
}

async function notifyAssigneeEmail(email, name, itemTitle, itemId, savedDealId, userId) {
  const deal = await pool.query('SELECT name FROM saved_deals WHERE id = $1', [savedDealId]);
  const dealName = deal.rows[0]?.name || 'a deal';
  await sendEmail({
    to: email,
    subject: `DD request: ${itemTitle}`,
    html: `<p>Hi${name ? ` ${name}` : ''},</p>
           <p>You were assigned a due diligence item on <strong>${dealName}</strong>:</p>
           <p><strong>${itemTitle}</strong></p>
           <p>The buyer will share a collaborative portal link separately if needed.</p>`
  });
  await pool.query(
    `UPDATE dd_item_assignees SET notified_at = NOW() WHERE item_id = $1 AND email = $2`,
    [itemId, email]
  );
}

export async function addDdGroup(userId, savedDealId, { name }) {
  const checklist = await getChecklistForDeal(userId, savedDealId);
  if (!checklist) {
    const err = new Error('Start a DD checklist first');
    err.status = 400;
    throw err;
  }
  const trimmed = (name || '').trim();
  if (!trimmed) {
    const err = new Error('Group name required');
    err.status = 400;
    throw err;
  }
  const maxOrder = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM dd_groups WHERE checklist_id = $1',
    [checklist.id]
  );
  await pool.query(
    'INSERT INTO dd_groups (checklist_id, name, sort_order) VALUES ($1, $2, $3)',
    [checklist.id, trimmed, maxOrder.rows[0].next]
  );
  return getChecklistForDeal(userId, savedDealId);
}

export async function addDdItem(userId, savedDealId, groupId, { title, requestsDocument = false }) {
  await assertDealOwned(userId, savedDealId);
  const trimmed = (title || '').trim();
  if (!trimmed) {
    const err = new Error('Item title required');
    err.status = 400;
    throw err;
  }
  const maxOrder = await pool.query(
    'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM dd_items WHERE group_id = $1',
    [groupId]
  );
  await pool.query(
    `INSERT INTO dd_items (group_id, title, requests_document, sort_order, status)
     VALUES ($1, $2, $3, $4, 'not_started')`,
    [groupId, trimmed, !!requestsDocument, maxOrder.rows[0].next]
  );
  return getChecklistForDeal(userId, savedDealId);
}

export async function addDdItemComment(userId, savedDealId, itemId, { body, authorName, isExternal = false }) {
  await assertDealOwned(userId, savedDealId);
  const text = (body || '').trim();
  if (!text) {
    const err = new Error('Comment required');
    err.status = 400;
    throw err;
  }
  const user = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  await pool.query(
    `INSERT INTO dd_item_comments (item_id, author_email, author_name, body, is_external)
     VALUES ($1, $2, $3, $4, $5)`,
    [itemId, user.rows[0]?.email || null, authorName || null, text, isExternal]
  );
  return getChecklistForDeal(userId, savedDealId);
}

export async function addDdItemDocument(
  userId,
  savedDealId,
  itemId,
  { filename, mimeType, storageKey, isExternal = false, uploadedByEmail = null }
) {
  await assertDealOwned(userId, savedDealId);
  const name = (filename || '').trim();
  if (!name) {
    const err = new Error('Filename required');
    err.status = 400;
    throw err;
  }
  const user = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  const uploader =
    (uploadedByEmail && String(uploadedByEmail).trim().toLowerCase()) ||
    user.rows[0]?.email ||
    null;
  await pool.query(
    `INSERT INTO dd_item_documents (item_id, filename, mime_type, storage_key, uploaded_by_email, is_external)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [itemId, name, mimeType || null, storageKey || name, uploader, isExternal]
  );
  return getChecklistForDeal(userId, savedDealId);
}

async function logShareAccess(shareLinkId, action, guest = {}) {
  try {
    await pool.query(
      `INSERT INTO dd_share_access_log (
         share_link_id, action, guest_name, guest_email, guest_session_id, ip_hash
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        shareLinkId,
        action,
        guest.guestName || null,
        guest.guestEmail || null,
        guest.guestSessionId || null,
        guest.ipHash || null
      ]
    );
  } catch (err) {
    console.warn('[dd] access log failed:', err.message);
  }
}

function guestFromRequest(meta = {}) {
  return {
    guestName: (meta.guestName || '').trim() || null,
    guestEmail: (meta.guestEmail || '').trim().toLowerCase() || null,
    guestSessionId: (meta.guestSessionId || '').trim() || null,
    ipHash: meta.ipHash || null
  };
}

async function loadActiveShareLink(token) {
  const link = await pool.query(
    `SELECT sl.*, c.saved_deal_id, sd.name AS deal_name, sd.user_id
     FROM dd_share_links sl
     JOIN dd_checklists c ON c.id = sl.checklist_id
     JOIN saved_deals sd ON sd.id = c.saved_deal_id
     WHERE sl.token = $1 AND sl.revoked_at IS NULL`,
    [token]
  );
  if (!link.rows.length) {
    const err = new Error('Link not found');
    err.status = 404;
    throw err;
  }
  const row = link.rows[0];
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    const err = new Error('Link expired');
    err.status = 410;
    throw err;
  }
  return row;
}

async function assertSharePassword(row, password) {
  if (!row.password_hash) return;
  if (!password) {
    const err = new Error('Password required');
    err.status = 401;
    err.requiresPassword = true;
    throw err;
  }
  const ok = await bcrypt.compare(String(password), row.password_hash);
  if (!ok) {
    const err = new Error('Incorrect password');
    err.status = 401;
    err.requiresPassword = true;
    throw err;
  }
}

function filterChecklistByGroupIds(checklist, groupIds) {
  if (!groupIds?.length) return checklist;
  const allowed = new Set(groupIds.map(Number));
  const groups = (checklist.groups || []).filter((g) => allowed.has(Number(g.id)));
  let totalItems = 0;
  let completeItems = 0;
  let overdueItems = 0;
  const now = new Date();
  for (const g of groups) {
    for (const i of g.items || []) {
      totalItems += 1;
      if (i.status === 'complete' || i.status === 'na') completeItems += 1;
      if (i.due_at && i.status !== 'complete' && i.status !== 'na' && new Date(i.due_at) < now) {
        overdueItems += 1;
      }
    }
  }
  return {
    ...checklist,
    groups,
    progress: {
      totalItems,
      completeItems,
      percent: totalItems ? Math.round((completeItems / totalItems) * 100) : 0,
      overdueItems
    }
  };
}

async function assertItemInShareScope(row, itemId) {
  const itemRow = await pool.query(
    `SELECT i.id, i.title, g.id AS group_id
     FROM dd_items i
     JOIN dd_groups g ON g.id = i.group_id
     JOIN dd_checklists c ON c.id = g.checklist_id
     WHERE i.id = $1 AND c.saved_deal_id = $2`,
    [itemId, row.saved_deal_id]
  );
  if (!itemRow.rows.length) {
    const err = new Error('Checklist item not found');
    err.status = 404;
    throw err;
  }
  const groupIds = row.group_ids || [];
  if (groupIds.length && !groupIds.map(Number).includes(Number(itemRow.rows[0].group_id))) {
    const err = new Error('Item not included in this share link');
    err.status = 403;
    throw err;
  }
  return itemRow.rows[0];
}

export async function addPublicDdComment(token, itemId, { body, authorName, authorEmail }, meta = {}) {
  const row = await loadActiveShareLink(token);
  await assertSharePassword(row, meta.password);
  if (row.mode !== 'collaborative') {
    const err = new Error('Collaborative access required');
    err.status = 403;
    throw err;
  }
  const item = await assertItemInShareScope(row, itemId);
  const guest = guestFromRequest({ ...meta, guestName: authorName || meta.guestName, guestEmail: authorEmail || meta.guestEmail });

  const text = (body || '').trim();
  if (!text) {
    const err = new Error('Comment required');
    err.status = 400;
    throw err;
  }
  if (!guest.guestName) {
    const err = new Error('Your name is required');
    err.status = 400;
    throw err;
  }

  const author = guest.guestName;
  const email = guest.guestEmail;

  await pool.query(
    `INSERT INTO dd_item_comments (item_id, author_email, author_name, body, is_external)
     VALUES ($1, $2, $3, $4, true)`,
    [itemId, email, author, text]
  );

  await pool.query(
    `INSERT INTO activities (user_id, saved_deal_id, activity_type, body, metadata)
     VALUES ($1, $2, 'dd_portal_comment', $3, $4)`,
    [
      row.user_id,
      row.saved_deal_id,
      `${author} commented on "${item.title}"`,
      JSON.stringify({ itemId, author, email, body: text })
    ]
  );

  await logShareAccess(row.id, 'comment', guest);

  notifyDealOwnerPortalComment(row.user_id, row.saved_deal_id, {
    dealName: row.deal_name,
    itemTitle: item.title,
    authorName: author,
    body: text
  }).catch((err) => console.warn('[dd] portal comment notify failed:', err.message));

  console.log(`[dd] portal comment on item=${itemId} deal=${row.saved_deal_id} by ${author}`);
  const full = await getChecklistForDeal(row.user_id, row.saved_deal_id);
  return filterChecklistByGroupIds(full, row.group_ids);
}

export async function addPublicDdDocument(
  token,
  itemId,
  { filename, mimeType, storageKey, authorEmail, authorName },
  meta = {}
) {
  const row = await loadActiveShareLink(token);
  await assertSharePassword(row, meta.password);
  if (row.mode !== 'collaborative') {
    const err = new Error('Collaborative access required');
    err.status = 403;
    throw err;
  }
  await assertItemInShareScope(row, itemId);
  const guest = guestFromRequest({
    ...meta,
    guestName: authorName || meta.guestName,
    guestEmail: authorEmail || meta.guestEmail
  });
  if (!guest.guestName) {
    const err = new Error('Your name is required');
    err.status = 400;
    throw err;
  }

  await logShareAccess(row.id, 'upload', guest);
  const checklist = await addDdItemDocument(row.user_id, row.saved_deal_id, itemId, {
    filename,
    mimeType,
    storageKey,
    isExternal: true,
    uploadedByEmail: guest.guestEmail || `${guest.guestName}@portal.guest`
  });
  return filterChecklistByGroupIds(checklist, row.group_ids);
}

export async function createShareLink(
  userId,
  savedDealId,
  {
    label,
    mode = 'view_only',
    expiresAt = null,
    showDealName = true,
    password = null,
    groupIds = null
  }
) {
  const checklist = await getChecklistForDeal(userId, savedDealId);
  if (!checklist) {
    const err = new Error('Start a DD checklist first');
    err.status = 400;
    throw err;
  }

  const allowedModes = new Set(['view_only', 'collaborative']);
  const resolvedMode = allowedModes.has(mode) ? mode : 'view_only';

  let resolvedGroupIds = null;
  if (Array.isArray(groupIds) && groupIds.length) {
    const validIds = new Set((checklist.groups || []).map((g) => Number(g.id)));
    resolvedGroupIds = groupIds.map(Number).filter((id) => validIds.has(id));
    if (!resolvedGroupIds.length) {
      const err = new Error('Select at least one valid DD group to share');
      err.status = 400;
      throw err;
    }
  }

  const resolvedExpires = expiresAt ? expiresAt : null;

  const token = crypto.randomBytes(32).toString('hex');
  const passwordHash = password ? await bcrypt.hash(String(password), 10) : null;
  const result = await pool.query(
    `INSERT INTO dd_share_links (
       checklist_id, token, label, mode, expires_at, show_deal_name, password_hash, group_ids
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, token, label, mode, expires_at, show_deal_name, group_ids, created_at`,
    [
      checklist.id,
      token,
      label || (resolvedMode === 'collaborative' ? 'Collaborate' : 'View only'),
      resolvedMode,
      resolvedExpires,
      showDealName !== false,
      passwordHash,
      resolvedGroupIds
    ]
  );

  const link = result.rows[0];
  console.log('[dd] share link created', {
    id: link.id,
    mode: link.mode,
    groups: resolvedGroupIds?.length || 'all',
    hasPassword: Boolean(passwordHash),
    expiresAt: link.expires_at
  });
  return {
    ...link,
    hasPassword: Boolean(passwordHash),
    groupIds: link.group_ids || []
  };
}

export async function revokeShareLink(userId, savedDealId, linkId) {
  await assertDealOwned(userId, savedDealId);
  await pool.query(
    `UPDATE dd_share_links sl SET revoked_at = NOW()
     FROM dd_checklists c
     WHERE sl.id = $1 AND sl.checklist_id = c.id AND c.saved_deal_id = $2`,
    [linkId, savedDealId]
  );
  return { revoked: true };
}

export async function getPublicChecklistByToken(token, meta = {}) {
  const row = await loadActiveShareLink(token);
  await assertSharePassword(row, meta.password);

  const guest = guestFromRequest(meta);
  await logShareAccess(row.id, 'view', guest);

  const full = await getChecklistForDeal(row.user_id, row.saved_deal_id);
  const checklist = filterChecklistByGroupIds(full, row.group_ids);

  return {
    mode: row.mode,
    label: row.label,
    showDealName: row.show_deal_name,
    dealName: row.show_deal_name ? row.deal_name : 'Due Diligence',
    requiresGuestIdentity: row.mode === 'collaborative',
    scopedGroupCount: row.group_ids?.length || 0,
    checklist
  };
}

export async function patchPublicDdItem(token, itemId, patch, meta = {}) {
  const row = await loadActiveShareLink(token);
  await assertSharePassword(row, meta.password);
  if (row.mode !== 'collaborative') {
    const err = new Error('Collaborative access required');
    err.status = 403;
    throw err;
  }
  await assertItemInShareScope(row, itemId);
  const guest = guestFromRequest(meta);
  await logShareAccess(row.id, 'status_change', guest);
  const checklist = await patchDdItem(row.user_id, row.saved_deal_id, itemId, patch);
  return filterChecklistByGroupIds(checklist, row.group_ids);
}

export async function getDdOverdueForToday(userId) {
  const result = await pool.query(
    `SELECT i.id, i.title, i.due_at, i.status, sd.id AS saved_deal_id, sd.name AS deal_name
     FROM dd_items i
     JOIN dd_groups g ON g.id = i.group_id
     JOIN dd_checklists c ON c.id = g.checklist_id
     JOIN saved_deals sd ON sd.id = c.saved_deal_id
     WHERE ${VISIBLE_DEALS_SQL}
       AND i.status NOT IN ('complete', 'na')
       AND i.due_at IS NOT NULL AND i.due_at < NOW()
     ORDER BY i.due_at ASC
     LIMIT 20`,
    [userId]
  );
  return result.rows;
}
