import {
  listUnreadAlerts,
  countUnreadAlerts,
  markAlertRead,
  markAllAlertsRead
} from '../services/userAlertService.js';
import { getTeamActivitySince } from '../services/teamActivityDigestService.js';
import { savedDealIdForTeamAlert } from '../lib/teamActivity.js';
import pool from '../db/pool.js';

async function hydrateTeamActivityDeal(userId, alerts) {
  for (const alert of alerts) {
    if (alert.alert_type !== 'team_activity' || Number(alert.saved_deal_id) > 0) continue;
    try {
      const created = new Date(alert.created_at);
      const since = Number.isNaN(created.getTime())
        ? new Date(Date.now() - 26 * 60 * 60 * 1000)
        : new Date(created.getTime() - 26 * 60 * 60 * 1000);
      const team = await getTeamActivitySince(userId, since);
      const id = savedDealIdForTeamAlert(alert, team);
      if (!id) continue;
      alert.saved_deal_id = id;
      if (!alert.deal_name) {
        const nameRow = await pool.query('SELECT name FROM saved_deals WHERE id = $1', [id]);
        alert.deal_name = nameRow.rows[0]?.name || alert.deal_name;
      }
      await pool.query(
        `UPDATE user_alerts
         SET saved_deal_id = $1
         WHERE id = $2 AND user_id = $3 AND saved_deal_id IS NULL`,
        [id, alert.id, userId]
      );
      console.log('[alerts] hydrated team_activity', { alertId: alert.id, savedDealId: id });
    } catch (err) {
      console.warn('[alerts] hydrate team_activity failed', err.message);
    }
  }
}

export const getUnreadAlerts = async (req, res) => {
  try {
    const userId = req.user.userId;
    const [alerts, unreadCount] = await Promise.all([
      listUnreadAlerts(userId),
      countUnreadAlerts(userId)
    ]);
    await hydrateTeamActivityDeal(userId, alerts);
    res.json({ alerts, unreadCount });
  } catch (error) {
    console.error('[alerts] getUnreadAlerts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const patchAlertRead = async (req, res) => {
  try {
    const alertId = Number(req.params.alertId);
    const ok = await markAlertRead(req.user.userId, alertId);
    if (!ok) return res.status(404).json({ error: 'Alert not found' });
    res.json({ read: true, id: alertId });
  } catch (error) {
    console.error('[alerts] patchAlertRead error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

export const postAlertsReadAll = async (req, res) => {
  try {
    const count = await markAllAlertsRead(req.user.userId);
    res.json({ read: count });
  } catch (error) {
    console.error('[alerts] postAlertsReadAll error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
