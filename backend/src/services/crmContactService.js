import pool from '../db/pool.js';
import { getDealAccess, assertCanRead, assertCanWrite, VISIBLE_DEALS_SQL } from '../lib/teamAcl.js';

export const CONTACT_ROLES = ['broker', 'seller', 'buyer', 'attorney', 'other'];

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function normalizeRole(role) {
  const r = String(role || 'other').toLowerCase().trim();
  return CONTACT_ROLES.includes(r) ? r : 'other';
}

export async function listContacts(userId) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.email, c.phone, c.title, c.notes, c.tags, c.company_id, c.team_id,
            c.user_id, c.created_at, c.updated_at,
            co.name AS company_name,
            COALESCE(linked.deals, '[]'::json) AS linked_deals,
            COALESCE(linked.deal_count, 0)::int AS deal_count
     FROM contacts c
     LEFT JOIN companies co ON co.id = c.company_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
                'id', sd.id,
                'name', sd.name,
                'role', dc.role
              ) ORDER BY sd.name) AS deals,
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
  return result.rows;
}

export async function listCompanies(userId) {
  const result = await pool.query(
    `SELECT co.id, co.name, co.domain, co.phone, co.company_type, co.notes, co.team_id, co.created_at,
            COUNT(DISTINCT c.id)::int AS contact_count
     FROM companies co
     LEFT JOIN contacts c ON c.company_id = co.id
     WHERE co.user_id = $1
        OR (co.team_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = co.team_id AND tm.user_id = $1 AND tm.status = 'active'
        ))
     GROUP BY co.id
     ORDER BY co.name`,
    [userId]
  );
  return result.rows;
}

export async function createCompany(userId, { name, domain, phone, companyType, notes, teamId }) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    const err = new Error('Company name is required');
    err.status = 400;
    throw err;
  }
  const result = await pool.query(
    `INSERT INTO companies (user_id, name, domain, phone, company_type, notes, team_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      userId,
      trimmed,
      domain?.trim() || null,
      phone?.trim() || null,
      companyType?.trim() || null,
      notes?.trim() || null,
      teamId || null
    ]
  );
  console.log('[crmContact] company created', result.rows[0].id);
  return result.rows[0];
}

export async function updateCompany(userId, companyId, patch) {
  const existing = await pool.query('SELECT * FROM companies WHERE id = $1', [companyId]);
  if (!existing.rows.length) {
    const err = new Error('Company not found');
    err.status = 404;
    throw err;
  }
  const co = existing.rows[0];
  if (Number(co.user_id) !== Number(userId)) {
    const err = new Error('Not allowed to edit this company');
    err.status = 403;
    throw err;
  }

  const result = await pool.query(
    `UPDATE companies SET
       name = COALESCE($1, name),
       domain = COALESCE($2, domain),
       phone = COALESCE($3, phone),
       company_type = COALESCE($4, company_type),
       notes = COALESCE($5, notes),
       updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [
      patch.name != null ? String(patch.name).trim() : null,
      patch.domain !== undefined ? (patch.domain?.trim() || null) : null,
      patch.phone !== undefined ? (patch.phone?.trim() || null) : null,
      patch.companyType !== undefined ? (patch.companyType?.trim() || null) : null,
      patch.notes !== undefined ? (patch.notes?.trim() || null) : null,
      companyId
    ]
  );
  return result.rows[0];
}

export async function createContact(userId, payload) {
  const name = (payload.name || '').trim();
  const email = (payload.email || '').trim().toLowerCase() || null;
  if (!name && !email) {
    const err = new Error('Contact name or email is required');
    err.status = 400;
    throw err;
  }

  let companyId = payload.companyId || null;
  if (!companyId && payload.companyName?.trim()) {
    const co = await createCompany(userId, {
      name: payload.companyName.trim(),
      teamId: payload.teamId || null
    });
    companyId = co.id;
  }

  if (email) {
    const existing = await pool.query(
      `SELECT * FROM contacts WHERE user_id = $1 AND lower(email) = $2 LIMIT 1`,
      [userId, email]
    );
    if (existing.rows[0]) {
      const row = existing.rows[0];
      console.log('[crmContact] reused existing contact', row.id, email);
      return row;
    }
  }

  const result = await pool.query(
    `INSERT INTO contacts (user_id, company_id, name, email, phone, title, notes, tags, team_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      companyId,
      name || null,
      email,
      payload.phone?.trim() || null,
      payload.title?.trim() || null,
      payload.notes?.trim() || null,
      normalizeTags(payload.tags),
      payload.teamId || null
    ]
  );
  console.log('[crmContact] contact created', result.rows[0].id);
  return result.rows[0];
}

export async function updateContact(userId, contactId, patch) {
  const existing = await pool.query('SELECT * FROM contacts WHERE id = $1', [contactId]);
  if (!existing.rows.length) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const c = existing.rows[0];
  // Allow edit if owner, or contact linked to a writable deal
  const canOwn = Number(c.user_id) === Number(userId);
  if (!canOwn) {
    const linked = await pool.query(
      `SELECT dc.saved_deal_id FROM deal_contacts dc
       WHERE dc.contact_id = $1 LIMIT 20`,
      [contactId]
    );
    let writable = false;
    for (const row of linked.rows) {
      try {
        const access = await getDealAccess(userId, row.saved_deal_id);
        assertCanWrite(access);
        writable = true;
        break;
      } catch {
        /* try next */
      }
    }
    if (!writable) {
      const err = new Error('Not allowed to edit this contact');
      err.status = 403;
      throw err;
    }
  }

  const tags = patch.tags !== undefined ? normalizeTags(patch.tags) : null;
  const result = await pool.query(
    `UPDATE contacts SET
       name = COALESCE($1, name),
       email = COALESCE($2, email),
       phone = COALESCE($3, phone),
       title = COALESCE($4, title),
       notes = COALESCE($5, notes),
       company_id = COALESCE($6, company_id),
       tags = COALESCE($7, tags),
       updated_at = NOW()
     WHERE id = $8
     RETURNING *`,
    [
      patch.name !== undefined ? (String(patch.name).trim() || null) : null,
      patch.email !== undefined ? (String(patch.email).trim().toLowerCase() || null) : null,
      patch.phone !== undefined ? (String(patch.phone).trim() || null) : null,
      patch.title !== undefined ? (String(patch.title).trim() || null) : null,
      patch.notes !== undefined ? (String(patch.notes).trim() || null) : null,
      patch.companyId !== undefined ? patch.companyId : null,
      tags,
      contactId
    ]
  );
  return result.rows[0];
}

export async function deleteContact(userId, contactId) {
  const existing = await pool.query('SELECT * FROM contacts WHERE id = $1', [contactId]);
  if (!existing.rows.length) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  if (Number(existing.rows[0].user_id) !== Number(userId)) {
    const err = new Error('Only the contact owner can delete it');
    err.status = 403;
    throw err;
  }
  await pool.query('DELETE FROM contacts WHERE id = $1', [contactId]);
  console.log('[crmContact] contact deleted', contactId);
  return { deleted: true };
}

export async function linkContactToDeal(userId, savedDealId, contactId, role = 'broker') {
  await assertCanWrite(await getDealAccess(userId, savedDealId));
  const contact = await pool.query('SELECT id FROM contacts WHERE id = $1', [contactId]);
  if (!contact.rows.length) {
    const err = new Error('Contact not found');
    err.status = 404;
    throw err;
  }
  const normalizedRole = normalizeRole(role);
  await pool.query(
    `INSERT INTO deal_contacts (saved_deal_id, contact_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (saved_deal_id, contact_id, role) DO NOTHING`,
    [savedDealId, contactId, normalizedRole]
  );
  console.log('[crmContact] linked contact', contactId, '→ deal', savedDealId, 'role', normalizedRole);
  return { savedDealId: Number(savedDealId), contactId: Number(contactId), role: normalizedRole };
}

export async function unlinkContactFromDeal(userId, savedDealId, contactId, role) {
  await assertCanWrite(await getDealAccess(userId, savedDealId));
  if (role) {
    await pool.query(
      `DELETE FROM deal_contacts WHERE saved_deal_id = $1 AND contact_id = $2 AND role = $3`,
      [savedDealId, contactId, normalizeRole(role)]
    );
  } else {
    await pool.query(
      `DELETE FROM deal_contacts WHERE saved_deal_id = $1 AND contact_id = $2`,
      [savedDealId, contactId]
    );
  }
  return { unlinked: true };
}

export async function createAndLinkContact(userId, savedDealId, payload) {
  await assertCanWrite(await getDealAccess(userId, savedDealId));
  const contact = await createContact(userId, payload);
  const link = await linkContactToDeal(userId, savedDealId, contact.id, payload.role || 'other');
  return { contact, link };
}

export async function listDealContacts(userId, savedDealId) {
  await assertCanRead(await getDealAccess(userId, savedDealId));
  const result = await pool.query(
    `SELECT c.id, c.name, c.email, c.phone, c.title, c.notes, c.tags, dc.role,
            co.name AS company_name, c.company_id
     FROM deal_contacts dc
     JOIN contacts c ON c.id = dc.contact_id
     LEFT JOIN companies co ON co.id = c.company_id
     WHERE dc.saved_deal_id = $1
     ORDER BY dc.role, c.name NULLS LAST`,
    [savedDealId]
  );
  return result.rows;
}
