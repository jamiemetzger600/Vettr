import pool from '../db/pool.js';
import { hydrateCrmForSavedDeal } from '../services/crmHydration.js';
import {
  getDealAccess,
  assertCanRead,
  assertCanWrite,
  getMembership
} from '../lib/teamAcl.js';
import { getUnreadCounts } from '../services/dealThreadService.js';
import { attachUnseenFromTeam, markDealSeen } from '../services/savedDealViewsService.js';
import { coerceDiscoveredAt } from '../lib/discoveredAt.js';

/** Normalize URL for matching: same listing may appear with different fragments/casing. */
function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  const withoutHash = u.split('#')[0];
  return withoutHash.toLowerCase();
}

const DEAL_SELECT_FIELDS = `
  id, deal_id, name, url, description, broker, broker_name, broker_company,
  broker_email, broker_phone, source, source_type, discovered_at,
  asking_price, ebitda, revenue, location, city, state, county, country,
  industry, years_established, franchise, remote, listing_id,
  notes, status, progress_stage, progress_history,
  calculator_state, market_deal_id, listing_snapshot_at,
  team_id, shared_by_user_id, user_id,
  owner_user_id, close_target_date, referral_source, external_source_type,
  tags, custom_stage_label,
  saved_at, updated_at
`;

// Get saved deals — scope=personal|team|all (default personal for backward compat when no teamId)
export const getSavedDeals = async (req, res) => {
  try {
    const userId = req.user.userId;
    const scope = String(req.query.scope || 'personal').toLowerCase();
    const teamId = req.query.teamId ? Number(req.query.teamId) : null;

    let whereSql;
    let params;

    if (scope === 'team' && teamId) {
      const membership = await getMembership(userId, teamId);
      if (!membership) {
        return res.status(403).json({ error: 'Not a team member' });
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
      // personal (default)
      params = [userId];
      whereSql = `user_id = $1 AND team_id IS NULL`;
    }

    const result = await pool.query(
      `SELECT ${DEAL_SELECT_FIELDS}
       FROM saved_deals
       WHERE ${whereSql}
       ORDER BY saved_at DESC`,
      params
    );

    const unread = await getUnreadCounts(
      userId,
      result.rows.map((r) => r.id)
    ).catch(() => ({}));
    const withUnseen = await attachUnseenFromTeam(userId, result.rows).catch((err) => {
      console.warn('[deals] attachUnseenFromTeam skipped', err.message);
      return result.rows;
    });

    res.json({
      deals: withUnseen.map((d) => ({
        ...d,
        unread_messages: unread[d.id] || 0
      }))
    });
  } catch (error) {
    console.error('Get saved deals error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Save a new deal (or update existing saved deal when same listing by URL — keeps one saved deal per listing, never removes)
export const saveDeal = async (req, res) => {
  const {
    dealId, name, url, description, broker, brokerName, brokerCompany,
    brokerEmail, brokerPhone, source, sourceType, discoveredAt,
    askingPrice, ebitda, revenue, location, city, state, county, country,
    industry, yearsEstablished, franchise, remote, listingId,
    notes, status, progressStage,
    calculatorState, marketDealId,
    teamId: teamIdRaw,
    ownerUserId,
    closeTargetDate,
    referralSource,
    externalSourceType,
    tags,
    customStageLabel
  } = req.body;

  if (!dealId || !name) {
    return res.status(400).json({ error: 'Deal ID and name required' });
  }

  let teamId = teamIdRaw ? Number(teamIdRaw) : null;
  // Extension saves often omit teamId; if the user has exactly one team, land there
  // so deals show in the team CRM Inbox (matches typical Vettr workspace).
  if (!teamId && (sourceType === 'chrome_extension' || source === 'chrome_extension')) {
    const sole = await pool.query(
      `SELECT tm.team_id
       FROM team_members tm
       WHERE tm.user_id = $1 AND tm.status = 'active'
       ORDER BY tm.team_id ASC
       LIMIT 2`,
      [req.user.userId]
    );
    if (sole.rows.length === 1) {
      teamId = Number(sole.rows[0].team_id);
      console.log('[deals] chrome_extension save → sole team', {
        userId: req.user.userId,
        teamId
      });
    }
  }
  if (teamId) {
    const membership = await getMembership(req.user.userId, teamId);
    if (!membership || (membership.role !== 'admin' && membership.role !== 'member')) {
      return res.status(403).json({ error: 'Cannot save deals to this team' });
    }
  }

  try {
    const normalizedUrl = normalizeUrl(url);

    // If we have a URL, check for existing saved deal with same listing in the same scope.
    // Team path must not pass an unused $1 — node-pg/Postgres 42P18 ("could not determine data type").
    if (normalizedUrl) {
      const byUrl = teamId
        ? await pool.query(
            `SELECT id, saved_at FROM saved_deals
             WHERE url IS NOT NULL AND url != ''
             AND LOWER(TRIM(SPLIT_PART(url, '#', 1))) = $1
             AND team_id = $2`,
            [normalizedUrl, teamId]
          )
        : await pool.query(
            `SELECT id, saved_at FROM saved_deals
             WHERE url IS NOT NULL AND url != ''
             AND LOWER(TRIM(SPLIT_PART(url, '#', 1))) = $2
             AND user_id = $1 AND team_id IS NULL`,
            [req.user.userId, normalizedUrl]
          );

      if (byUrl.rows.length > 0) {
        const existingId = byUrl.rows[0].id;
        const access = await getDealAccess(req.user.userId, existingId);
        assertCanWrite(access);
        await pool.query(
          `UPDATE saved_deals SET
            deal_id = $1, name = $2, url = $3, description = $4, broker = $5, broker_name = $6,
            broker_company = $7, broker_email = $8, broker_phone = $9, source = $10, source_type = $11,
            discovered_at = $12, asking_price = $13, ebitda = $14, revenue = $15,
            location = $16, city = $17, state = $18, county = $19, country = $20,
            industry = $21, years_established = $22, franchise = $23, remote = $24, listing_id = $25,
            calculator_state = COALESCE($26::jsonb, calculator_state),
            updated_at = CURRENT_TIMESTAMP
           WHERE id = $27`,
          [
            dealId, name, url || null, description || null, broker || null, brokerName || null, brokerCompany || null,
            brokerEmail || null, brokerPhone || null, source || null, sourceType || null, coerceDiscoveredAt(discoveredAt),
            askingPrice ?? null, ebitda ?? null, revenue ?? null,
            location || null, city || null, state || null, county || null, country || null,
            industry || null, yearsEstablished || null, franchise || null, remote || null, listingId || null,
            calculatorState !== undefined ? calculatorState : null,
            existingId
          ]
        );
        await hydrateCrmForSavedDeal(req.user.userId, existingId, {
          dealId, marketDealId, listingId, source,
          brokerName, brokerCompany, brokerEmail, brokerPhone
        });
        return res.status(200).json({
          message: 'Deal already saved; listing info updated',
          vettrId: existingId,
          dealId: existingId,
          deal_id: dealId,
          teamId: teamId || null,
          savedAt: byUrl.rows[0].saved_at,
          updatedAt: new Date().toISOString()
        });
      }
    }

    // No existing row by URL; check by deal_id in scope
    const existing = await pool.query(
      teamId
        ? 'SELECT id FROM saved_deals WHERE team_id = $1 AND deal_id = $2'
        : 'SELECT id FROM saved_deals WHERE user_id = $1 AND team_id IS NULL AND deal_id = $2',
      teamId ? [teamId, dealId] : [req.user.userId, dealId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Deal already saved' });
    }

    const marketDealIdNum = marketDealId != null && marketDealId !== ''
      ? Number(marketDealId)
      : null;
    const marketDealIdParam = Number.isFinite(marketDealIdNum) && marketDealIdNum > 0
      ? marketDealIdNum
      : null;

    const ownerId = ownerUserId != null && Number(ownerUserId)
      ? Number(ownerUserId)
      : req.user.userId;
    const tagList = Array.isArray(tags)
      ? [...new Set(tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean))].slice(0, 20)
      : [];
    const extType = externalSourceType
      ? String(externalSourceType).trim().toLowerCase().replace(/\s+/g, '_')
      : (sourceType === 'manual' ? 'manual' : null);

    const result = await pool.query(
      `INSERT INTO saved_deals (
        user_id, deal_id, name, url, description, broker, broker_name, broker_company,
        broker_email, broker_phone, source, source_type, discovered_at,
        asking_price, ebitda, revenue, location, city, state, county, country,
        industry, years_established, franchise, remote, listing_id,
        notes, status, progress_stage, calculator_state,
        team_id, shared_by_user_id, market_deal_id,
        owner_user_id, close_target_date, referral_source, external_source_type,
        tags, custom_stage_label
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33,
        $34, $35, $36, $37, $38, $39
      )
      RETURNING id, saved_at, team_id`,
      [
        req.user.userId, dealId, name, url, description, broker, brokerName, brokerCompany,
        brokerEmail, brokerPhone, source, sourceType, coerceDiscoveredAt(discoveredAt),
        askingPrice, ebitda, revenue, location, city, state, county, country,
        industry, yearsEstablished, franchise, remote, listingId,
        notes, status || 'none', progressStage,
        calculatorState !== undefined ? calculatorState : null,
        teamId,
        teamId ? req.user.userId : null,
        marketDealIdParam,
        ownerId,
        closeTargetDate || null,
        referralSource?.trim?.() || referralSource || null,
        extType,
        tagList,
        customStageLabel?.trim?.() || customStageLabel || null
      ]
    );

    const savedDealId = result.rows[0].id;
    console.log('[deals] saved', {
      savedDealId,
      dealId,
      teamId: result.rows[0].team_id,
      userId: req.user.userId,
      marketDealId: marketDealIdParam
    });

    await hydrateCrmForSavedDeal(req.user.userId, savedDealId, {
      dealId, marketDealId, listingId, source,
      brokerName, brokerCompany, brokerEmail, brokerPhone
    });

    if (teamId) {
      await markDealSeen(req.user.userId, savedDealId).catch((err) => {
        console.warn('[deals] markDealSeen on save skipped', err.message);
      });
      await pool.query(
        `INSERT INTO deal_messages (saved_deal_id, author_user_id, body, message_kind)
         VALUES ($1, $2, $3, 'system')`,
        [savedDealId, req.user.userId, `${req.user.email || 'Someone'} saved this deal to the team`]
      ).catch((err) => console.warn('[deals] system message skipped:', err.message));
    }

    res.status(201).json({
      message: 'Deal saved successfully',
      vettrId: savedDealId,
      dealId: savedDealId,
      deal_id: dealId,
      teamId: result.rows[0].team_id,
      savedAt: result.rows[0].saved_at,
      updatedAt: result.rows[0].saved_at
    });

  } catch (error) {
    if (error?.code === '23505') {
      console.warn('[deals] unique conflict on save', {
        dealId,
        teamId,
        userId: req.user.userId,
        detail: error.detail
      });
      return res.status(409).json({
        error: teamId
          ? 'Deal already saved to this team'
          : 'Deal already saved to My Deals'
      });
    }
    console.error('Save deal error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      dealId,
      teamId,
      userId: req.user?.userId
    });
    res.status(500).json({ error: 'Server error' });
  }
};

// Update a saved deal
export const updateSavedDeal = async (req, res) => {
  const { id } = req.params;
  const { 
    notes, status, progressStage, progressHistory,
    brokerName, brokerCompany, brokerPhone, brokerEmail,
    calculatorState,
    name, description, url,
    askingPrice, ebitda, revenue,
    location, city, state, county, country,
    industry, yearsEstablished, franchise, remote,
    source, sourceType, discoveredAt, listingId,
    broker,
    ownerUserId, closeTargetDate, referralSource, externalSourceType,
    tags, customStageLabel
  } = req.body;

  try {
    const access = await getDealAccess(req.user.userId, id);
    assertCanWrite(access);

    const updateFields = [];
    const values = [id];
    let paramIndex = 2;

    if (notes !== undefined) {
      updateFields.push(`notes = $${paramIndex++}`);
      values.push(notes);
    }
    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      values.push(status);
    }
    if (progressStage !== undefined) {
      updateFields.push(`progress_stage = $${paramIndex++}`);
      values.push(progressStage);
    }
    if (progressHistory !== undefined) {
      updateFields.push(`progress_history = $${paramIndex++}`);
      values.push(JSON.stringify(progressHistory));
    }
    if (brokerName !== undefined) {
      updateFields.push(`broker_name = $${paramIndex++}`);
      values.push(brokerName);
    }
    if (brokerCompany !== undefined) {
      updateFields.push(`broker_company = $${paramIndex++}`);
      values.push(brokerCompany);
    }
    if (brokerPhone !== undefined) {
      updateFields.push(`broker_phone = $${paramIndex++}`);
      values.push(brokerPhone);
    }
    if (brokerEmail !== undefined) {
      updateFields.push(`broker_email = $${paramIndex++}`);
      values.push(brokerEmail);
    }
    if (calculatorState !== undefined) {
      updateFields.push(`calculator_state = $${paramIndex++}`);
      values.push(calculatorState);
    }
    if (name !== undefined) {
      updateFields.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updateFields.push(`description = $${paramIndex++}`);
      values.push(description);
    }
    if (url !== undefined) {
      updateFields.push(`url = $${paramIndex++}`);
      values.push(url);
    }
    if (askingPrice !== undefined) {
      updateFields.push(`asking_price = $${paramIndex++}`);
      values.push(askingPrice);
    }
    if (ebitda !== undefined) {
      updateFields.push(`ebitda = $${paramIndex++}`);
      values.push(ebitda);
    }
    if (revenue !== undefined) {
      updateFields.push(`revenue = $${paramIndex++}`);
      values.push(revenue);
    }
    if (location !== undefined) {
      updateFields.push(`location = $${paramIndex++}`);
      values.push(location);
    }
    if (city !== undefined) {
      updateFields.push(`city = $${paramIndex++}`);
      values.push(city);
    }
    if (state !== undefined) {
      updateFields.push(`state = $${paramIndex++}`);
      values.push(state);
    }
    if (county !== undefined) {
      updateFields.push(`county = $${paramIndex++}`);
      values.push(county);
    }
    if (country !== undefined) {
      updateFields.push(`country = $${paramIndex++}`);
      values.push(country);
    }
    if (industry !== undefined) {
      updateFields.push(`industry = $${paramIndex++}`);
      values.push(industry);
    }
    if (yearsEstablished !== undefined) {
      updateFields.push(`years_established = $${paramIndex++}`);
      values.push(yearsEstablished);
    }
    if (franchise !== undefined) {
      updateFields.push(`franchise = $${paramIndex++}`);
      values.push(franchise);
    }
    if (remote !== undefined) {
      updateFields.push(`remote = $${paramIndex++}`);
      values.push(remote);
    }
    if (source !== undefined) {
      updateFields.push(`source = $${paramIndex++}`);
      values.push(source);
    }
    if (sourceType !== undefined) {
      updateFields.push(`source_type = $${paramIndex++}`);
      values.push(sourceType);
    }
    if (discoveredAt !== undefined) {
      updateFields.push(`discovered_at = $${paramIndex++}`);
      values.push(coerceDiscoveredAt(discoveredAt));
    }
    if (listingId !== undefined) {
      updateFields.push(`listing_id = $${paramIndex++}`);
      values.push(listingId);
    }
    if (broker !== undefined) {
      updateFields.push(`broker = $${paramIndex++}`);
      values.push(broker);
    }
    if (ownerUserId !== undefined) {
      updateFields.push(`owner_user_id = $${paramIndex++}`);
      values.push(ownerUserId ? Number(ownerUserId) : null);
    }
    if (closeTargetDate !== undefined) {
      updateFields.push(`close_target_date = $${paramIndex++}`);
      values.push(closeTargetDate || null);
    }
    if (referralSource !== undefined) {
      updateFields.push(`referral_source = $${paramIndex++}`);
      values.push(referralSource || null);
    }
    if (externalSourceType !== undefined) {
      updateFields.push(`external_source_type = $${paramIndex++}`);
      values.push(externalSourceType || null);
    }
    if (tags !== undefined) {
      const tagList = Array.isArray(tags)
        ? [...new Set(tags.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean))].slice(0, 20)
        : [];
      updateFields.push(`tags = $${paramIndex++}`);
      values.push(tagList);
    }
    if (customStageLabel !== undefined) {
      updateFields.push(`custom_stage_label = $${paramIndex++}`);
      values.push(customStageLabel || null);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');

    const result = await pool.query(
      `UPDATE saved_deals SET ${updateFields.join(', ')} 
       WHERE id = $1 
       RETURNING id`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json({ message: 'Deal updated successfully' });

  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Update deal error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      id,
      discoveredAt
    });
    res.status(500).json({ error: 'Server error' });
  }
};

/** GET /api/deals/:id — single saved deal (CRM open-by-id when list is stale). */
export const getSavedDealById = async (req, res) => {
  const { id } = req.params;
  try {
    const access = await getDealAccess(req.user.userId, id);
    assertCanRead(access);

    const result = await pool.query(
      `SELECT ${DEAL_SELECT_FIELDS}
       FROM saved_deals
       WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    await markDealSeen(req.user.userId, id).catch((err) => {
      console.warn('[deals] markDealSeen on getById skipped', err.message);
    });
    const unread = await getUnreadCounts(req.user.userId, [Number(id)]).catch(() => ({}));
    const deal = {
      ...result.rows[0],
      unread_messages: unread[Number(id)] || 0,
      unseen_from_team: false
    };
    console.log('[deals] getById', { id, userId: req.user.userId, name: deal.name });
    res.json({ deal });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Get deal by id error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const markSavedDealSeen = async (req, res) => {
  const { id } = req.params;
  try {
    const access = await getDealAccess(req.user.userId, id);
    assertCanRead(access);
    await markDealSeen(req.user.userId, id);
    res.json({ ok: true });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('[deals] markSavedDealSeen error', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete a saved deal
export const deleteSavedDeal = async (req, res) => {
  const { id } = req.params;

  try {
    const access = await getDealAccess(req.user.userId, id);
    assertCanWrite(access);
    // Only admin or original owner can delete team deals
    if (access.deal.team_id && !access.canAdmin && access.deal.user_id !== req.user.userId) {
      return res.status(403).json({ error: 'Only admin or deal owner can delete' });
    }

    const result = await pool.query(
      'DELETE FROM saved_deals WHERE id = $1 RETURNING id',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    res.json({ message: 'Deal deleted successfully' });

  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    console.error('Delete deal error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
