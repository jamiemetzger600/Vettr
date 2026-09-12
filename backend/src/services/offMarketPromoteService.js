import pool from '../db/pool.js';
import { httpError } from '../lib/httpError.js';
import { getMembership } from '../lib/teamAcl.js';
import { createCompany, createContact, linkContactToDeal } from './crmContactService.js';

export async function promoteProspect(userId, prospectId, { teamId: teamIdRaw } = {}) {
  const prospectRes = await pool.query(
    `SELECT p.*, c.name AS campaign_name, c.vertical, c.geography, c.team_id AS campaign_team_id
     FROM off_market_prospects p
     JOIN off_market_campaigns c ON c.id = p.campaign_id
     WHERE p.id = $1 AND p.user_id = $2`,
    [prospectId, userId]
  );
  const prospect = prospectRes.rows[0];
  if (!prospect) throw httpError(404, 'Prospect not found');
  if (prospect.saved_deal_id) {
    return { savedDealId: prospect.saved_deal_id, alreadyPromoted: true };
  }

  let teamId = teamIdRaw ? Number(teamIdRaw) : (prospect.campaign_team_id ? Number(prospect.campaign_team_id) : null);
  if (teamId) {
    const membership = await getMembership(userId, teamId);
    if (!membership || (membership.role !== 'admin' && membership.role !== 'member')) {
      throw httpError(403, 'Cannot save deals to this team');
    }
  }

  const dealId = `offm_${prospect.id}`;
  const existing = await pool.query(
    teamId
      ? 'SELECT id FROM saved_deals WHERE team_id = $1 AND deal_id = $2'
      : 'SELECT id FROM saved_deals WHERE user_id = $1 AND team_id IS NULL AND deal_id = $2',
    teamId ? [teamId, dealId] : [userId, dealId]
  );
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE off_market_prospects SET saved_deal_id = $1, status = 'promoted' WHERE id = $2`,
      [existing.rows[0].id, prospect.id]
    );
    return { savedDealId: existing.rows[0].id, alreadyPromoted: true };
  }

  const notes = [
    prospect.notes,
    prospect.owner_name ? `Owner: ${prospect.owner_name}` : null,
    prospect.email ? `Email: ${prospect.email}` : null,
    prospect.title ? `Title: ${prospect.title}` : null,
    `Campaign: ${prospect.campaign_name}`
  ].filter(Boolean).join('\n');

  const inserted = await pool.query(
    `INSERT INTO saved_deals (
       user_id, deal_id, name, url, description, source, source_type,
       location, industry, notes, status, team_id, shared_by_user_id,
       owner_user_id, referral_source, external_source_type, tags
     ) VALUES (
       $1,$2,$3,$4,$5,'Off Market','off_market',
       $6,$7,$8,'none',$9,$10,
       $1,$11,'proprietary',$12
     )
     RETURNING id`,
    [
      userId,
      dealId,
      prospect.company_name,
      prospect.source_url || null,
      prospect.notes || null,
      prospect.location || prospect.geography || null,
      prospect.vertical || null,
      notes,
      teamId,
      teamId ? userId : null,
      prospect.campaign_name,
      ['off-market']
    ]
  );
  const savedDealId = inserted.rows[0].id;

  let companyId = prospect.company_id;
  if (!companyId && prospect.company_name) {
    const company = await createCompany(userId, {
      name: prospect.company_name,
      teamId: teamId || null,
      companyType: 'target'
    });
    companyId = company.id;
  }

  let contactId = prospect.contact_id;
  if (!contactId && (prospect.owner_name || prospect.email)) {
    const contact = await createContact(userId, {
      name: prospect.owner_name || prospect.company_name,
      email: prospect.email,
      title: prospect.title,
      companyId,
      notes: prospect.notes,
      teamId: teamId || null
    });
    contactId = contact.id;
  }
  if (contactId) {
    await linkContactToDeal(userId, savedDealId, contactId, 'seller');
  }

  const messages = await pool.query(
    `SELECT * FROM off_market_messages WHERE prospect_id = $1 ORDER BY id ASC`,
    [prospect.id]
  );
  for (const msg of messages.rows) {
    await pool.query(
      `INSERT INTO activities (user_id, saved_deal_id, contact_id, activity_type, body, title, metadata, occurred_at)
       VALUES ($1,$2,$3,'email',$4,$5,$6::jsonb, COALESCE($7, NOW()))`,
      [
        userId,
        savedDealId,
        contactId || null,
        msg.body_text || msg.status,
        msg.subject || `Off Market email (${msg.status})`,
        JSON.stringify({
          gmailThreadId: msg.gmail_thread_id,
          gmailMessageId: msg.gmail_message_id,
          offMarketMessageId: msg.id,
          status: msg.status
        }),
        msg.sent_at
      ]
    );
  }

  await pool.query(
    `UPDATE off_market_prospects
     SET saved_deal_id = $1, status = 'promoted', company_id = COALESCE($2, company_id), contact_id = COALESCE($3, contact_id)
     WHERE id = $4`,
    [savedDealId, companyId || null, contactId || null, prospect.id]
  );

  console.log('[off-market] promoted', { userId, prospectId, savedDealId, teamId: teamId || null });
  return { savedDealId, alreadyPromoted: false, contactId: contactId || null };
}
