import { useMemo } from 'react';
import { crmAPI, teamsAPI } from '../../utils/api';
import { formatRelativeDue } from '../../utils/taskTime';
import CrmTaskRow from './CrmTaskRow';

/** Build dealId → next action from overdue/due-today tasks (overdue wins), then computed nudges. */
export function buildNextActionByDealId(today) {
  const map = new Map();
  const overdue = today?.tasks?.overdue || [];
  const dueToday = today?.tasks?.dueToday || [];
  const nudges = today?.nudges || [];
  for (const t of dueToday) {
    const id = Number(t.saved_deal_id);
    if (!Number.isFinite(id) || map.has(id)) continue;
    map.set(id, { title: t.title, dueLabel: formatRelativeDue(t.due_at).label, urgent: false });
  }
  for (const t of overdue) {
    const id = Number(t.saved_deal_id);
    if (!Number.isFinite(id)) continue;
    map.set(id, { title: t.title, dueLabel: formatRelativeDue(t.due_at).label, urgent: true });
  }
  for (const n of nudges) {
    const id = Number(n.saved_deal_id);
    if (!Number.isFinite(id) || map.has(id)) continue;
    map.set(id, { title: n.title, dueLabel: 'Next step', urgent: false });
  }
  return map;
}

function dealIdsFromItems(items, pickId) {
  const ids = new Set();
  for (const item of items) {
    const id = Number(pickId(item));
    if (Number.isFinite(id) && id > 0) ids.add(id);
  }
  return ids;
}

export function getActionFilterDealIds(today, filterId) {
  if (!today || !filterId) return null;
  switch (filterId) {
    case 'mentions':
      return dealIdsFromItems(today.unreadMentions || [], (m) => m.saved_deal_id);
    case 'approvals':
      return dealIdsFromItems(today.pendingApprovals || [], (a) => a.saved_deal_id);
    case 'overdue':
      return dealIdsFromItems(today.tasks?.overdue || [], (t) => t.saved_deal_id);
    case 'dueToday':
      return dealIdsFromItems(today.tasks?.dueToday || [], (t) => t.saved_deal_id);
    case 'ddOverdue':
      return dealIdsFromItems(today.ddOverdue || [], (d) => d.saved_deal_id);
    case 'stale':
      return dealIdsFromItems(today.staleListings || [], (s) => s.savedDealId);
    case 'nudges':
      return dealIdsFromItems(today.nudges || [], (n) => n.saved_deal_id);
    case 'dormant':
      return dealIdsFromItems(today.dormantDeals || [], (d) => d.saved_deal_id);
    default:
      return null;
  }
}

function Chip({ id, label, count, warn, active, onClick }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      className={`crm-action-chip${warn ? ' crm-action-chip--warn' : ''}${active ? ' crm-action-chip--active' : ''}`}
      onClick={() => onClick(id)}
      aria-pressed={active}
    >
      <span className="crm-action-chip__count">{count}</span>
      <span className="crm-action-chip__label">{label}</span>
    </button>
  );
}

export default function CrmActionStrip({
  today,
  activeFilter,
  onFilterChange,
  onSelectDeal,
  onRefresh
}) {
  const chips = useMemo(() => {
    const tasks = today?.tasks || {};
    return [
      { id: 'nudges', label: 'Next steps', count: (today?.nudges || []).length, warn: false },
      { id: 'mentions', label: 'Mentions', count: (today?.unreadMentions || []).length, warn: true },
      { id: 'approvals', label: 'Approvals', count: (today?.pendingApprovals || []).length, warn: false },
      { id: 'overdue', label: 'Overdue', count: (tasks.overdue || []).length, warn: true },
      { id: 'dueToday', label: 'Due today', count: (tasks.dueToday || []).length, warn: false },
      { id: 'ddOverdue', label: 'DD overdue', count: (today?.ddOverdue || []).length, warn: true },
      { id: 'stale', label: 'Stale', count: (today?.staleListings || []).length, warn: false },
      { id: 'dormant', label: 'Quiet', count: (today?.dormantDeals || []).length, warn: false }
    ];
  }, [today]);

  const totalUrgent = chips.reduce((sum, c) => sum + c.count, 0);

  const handleCompleteNudge = async (dealId, item) => {
    try {
      console.log('[CrmActionStrip] complete nudge', dealId, item.nudgeKey);
      await crmAPI.completeNudge(dealId, {
        taskId: item.taskId || undefined,
        actionKey: item.nudgeKey || undefined
      });
      onRefresh?.();
    } catch (err) {
      alert('Failed to complete next step: ' + err.message);
    }
  };

  const handleToggleComplete = async (taskId, status) => {
    try {
      console.log('[CrmActionStrip] toggle task', taskId, status);
      await crmAPI.updateTask(taskId, { status });
      onRefresh?.();
    } catch (err) {
      throw err;
    }
  };

  const handleApproval = async (approvalId, decision) => {
    try {
      await teamsAPI.reviewApproval(approvalId, { decision });
      onRefresh?.();
    } catch (err) {
      alert(err.message || 'Approval failed');
    }
  };

  const detailItems = useMemo(() => {
    if (!today || !activeFilter) return [];
    switch (activeFilter) {
      case 'mentions':
        return (today.unreadMentions || []).map((m) => ({
          key: `m-${m.message_id}`,
          dealId: m.saved_deal_id,
          title: `${m.author_email || 'Teammate'} mentioned you`,
          sub: m.body,
          focusSection: 'crm-talk',
          actionLabel: 'Open Talk'
        }));
      case 'approvals':
        return (today.pendingApprovals || []).map((a) => ({
          key: `a-${a.id}`,
          dealId: a.saved_deal_id,
          title:
            a.action_type === 'share'
              ? `${a.requester_email} wants to share this deal`
              : `${a.requester_email}: stage change`,
          sub: a.deal_name,
          approvalId: a.id
        }));
      case 'overdue':
        return (today.tasks?.overdue || []).map((t) => ({
          key: `t-${t.id}`,
          dealId: t.saved_deal_id,
          title: t.title,
          sub: t.deal_name,
          taskId: t.id,
          task: t
        }));
      case 'dueToday':
        return (today.tasks?.dueToday || []).map((t) => ({
          key: `t-${t.id}`,
          dealId: t.saved_deal_id,
          title: t.title,
          sub: t.deal_name,
          taskId: t.id,
          task: t
        }));
      case 'ddOverdue':
        return (today.ddOverdue || []).map((d) => ({
          key: `dd-${d.id}`,
          dealId: d.saved_deal_id,
          title: d.title,
          sub: d.deal_name
        }));
      case 'stale':
        return (today.staleListings || []).map((s) => ({
          key: `s-${s.savedDealId}`,
          dealId: s.savedDealId,
          title: s.name,
          sub: 'Feed financials changed — refresh from listing'
        }));
      case 'nudges':
        return (today.nudges || []).map((n) => ({
          key: `n-${n.saved_deal_id}-${n.key}`,
          dealId: n.saved_deal_id,
          title: n.title,
          sub: n.deal_name,
          nudgeKey: n.key,
          taskId: n.task_id,
          ctaLabel: n.ctaLabel || 'Did it'
        }));
      case 'dormant':
        return (today.dormantDeals || []).map((d) => ({
          key: `d-${d.saved_deal_id}`,
          dealId: d.saved_deal_id,
          title: d.deal_name || 'Deal',
          sub: `${d.days_idle} days idle`
        }));
      default:
        return [];
    }
  }, [today, activeFilter]);

  return (
    <div className="crm-action-strip">
      <div className="crm-action-strip__chips">
        {chips.map((c) => (
          <Chip
            key={c.id}
            id={c.id}
            label={c.label}
            count={c.count}
            warn={c.warn}
            active={activeFilter === c.id}
            onClick={(id) => onFilterChange?.(activeFilter === id ? null : id)}
          />
        ))}
        {totalUrgent === 0 ? (
          <p className="crm-action-strip__empty">Nothing urgent — move a deal on the board below.</p>
        ) : (
          <p className="crm-action-strip__hint">
            Tap a chip to highlight matching deals on the board.
            {activeFilter ? (
              <button
                type="button"
                className="crm-action-strip__clear"
                onClick={() => onFilterChange?.(null)}
              >
                Clear filter
              </button>
            ) : null}
          </p>
        )}
      </div>

      {activeFilter && detailItems.length > 0 ? (
        <ul className="crm-action-strip__detail">
          {detailItems.slice(0, 8).map((item) => (
            item.task && !item.nudgeKey ? (
              <CrmTaskRow
                key={item.key}
                task={item.task}
                expandable={false}
                onToggleComplete={handleToggleComplete}
                onSelectDeal={(id) => onSelectDeal?.(id)}
              />
            ) : (
              <li key={item.key} className="crm-action-strip__row">
                <div className="crm-action-strip__row-body">
                  <button
                    type="button"
                    className="crm-action-strip__deal"
                    onClick={() =>
                      onSelectDeal?.(item.dealId, {
                        focusSection: item.focusSection || null
                      })
                    }
                  >
                    {item.sub || 'Deal'}
                  </button>
                  <span className="crm-action-strip__title">{item.title}</span>
                </div>
                <div className="crm-action-strip__row-actions">
                  {item.approvalId ? (
                    <>
                      <button
                        type="button"
                        className="btn-primary btn-secondary--sm"
                        onClick={() => handleApproval(item.approvalId, 'approve')}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="btn-secondary btn-secondary--sm"
                        onClick={() => handleApproval(item.approvalId, 'reject')}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  {item.nudgeKey ? (
                    <button
                      type="button"
                      className="btn-primary btn-secondary--sm"
                      onClick={() => handleCompleteNudge(item.dealId, item)}
                    >
                      {item.ctaLabel || 'Did it'}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn-secondary btn-secondary--sm"
                    onClick={() =>
                      onSelectDeal?.(item.dealId, {
                        focusSection: item.focusSection || 'crm-followup'
                      })
                    }
                  >
                    {item.actionLabel || 'Open'}
                  </button>
                </div>
              </li>
            )
          ))}
        </ul>
      ) : null}
    </div>
  );
}
