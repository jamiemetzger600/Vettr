import { crmAPI } from '../../utils/api';
import { formatDate } from '../../utils/normalizeDeal';

function TaskRow({ task, onComplete, onSelectDeal }) {
  const dueLabel = task.due_at ? formatDate(task.due_at) : 'No due date';
  return (
    <li className="crm-today-task">
      <div className="crm-today-task__body">
        <button
          type="button"
          className="crm-today-task__deal"
          onClick={() => onSelectDeal?.(task.saved_deal_id)}
        >
          {task.deal_name || 'Deal'}
        </button>
        <span className="crm-today-task__title">{task.title}</span>
        <span className="crm-today-task__due">{dueLabel}</span>
        {task.progress_stage ? (
          <span className="crm-today-task__stage">{task.progress_stage}</span>
        ) : null}
      </div>
      <button
        type="button"
        className="btn-secondary btn-secondary--sm"
        onClick={() => onComplete(task.id)}
      >
        Done
      </button>
    </li>
  );
}

function activityPreview(activity) {
  if (activity.body) return activity.body;
  return activity.activity_type?.replace(/_/g, ' ') || 'Activity';
}

export default function CrmToday({ today, onSelectDeal, onRefresh }) {
  const tasks = today?.tasks || {};
  const overdue = tasks.overdue || [];
  const dueToday = tasks.dueToday || [];
  const stale = today?.staleListings || [];
  const ddOverdue = today?.ddOverdue || [];
  const portalComments = today?.portalComments || [];
  const pendingApprovals = today?.pendingApprovals || [];
  const unreadMentions = today?.unreadMentions || [];
  const nearingDd = today?.nearingDd || [];
  const recentActivities = today?.recentActivities || [];

  const handleCompleteTask = async (taskId) => {
    try {
      await crmAPI.updateTask(taskId, { status: 'done' });
      onRefresh?.();
    } catch (err) {
      alert('Failed to complete task: ' + err.message);
    }
  };

  const handleApproval = async (approvalId, decision) => {
    try {
      const { teamsAPI } = await import('../../utils/api');
      await teamsAPI.reviewApproval(approvalId, { decision });
      onRefresh?.();
    } catch (err) {
      alert(err.message || 'Approval failed');
    }
  };

  const openMention = (mention) => {
    console.log('[CrmToday] open mention', mention.message_id, 'deal', mention.saved_deal_id);
    onSelectDeal?.(mention.saved_deal_id, { focusSection: 'crm-talk' });
  };

  const hasWork =
    overdue.length > 0 ||
    dueToday.length > 0 ||
    stale.length > 0 ||
    ddOverdue.length > 0 ||
    portalComments.length > 0 ||
    pendingApprovals.length > 0 ||
    unreadMentions.length > 0 ||
    nearingDd.length > 0 ||
    recentActivities.length > 0;

  if (!hasWork) {
    return (
      <div className="crm-today-empty">
        <p>Nothing due today — you are caught up.</p>
        <p className="crm-muted">Use Pipeline to move deals forward or add a follow-up from a deal workspace.</p>
      </div>
    );
  }

  return (
    <div className="crm-today-feed">
      {unreadMentions.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title crm-today-section__title--warn">
            Mentions ({unreadMentions.length})
          </h3>
          <ul className="crm-today-task-list">
            {unreadMentions.map((m) => (
              <li key={m.message_id} className="crm-today-task">
                <div className="crm-today-task__body">
                  <button
                    type="button"
                    className="crm-today-task__deal"
                    onClick={() => openMention(m)}
                  >
                    {m.deal_name || 'Deal'}
                  </button>
                  <span className="crm-today-task__title">
                    {m.author_email || 'Teammate'} mentioned you
                  </span>
                  <span className="crm-today-task__due">
                    {formatDate(m.created_at)} · no due date
                  </span>
                  <span className="crm-portal-comment-preview">{m.body}</span>
                </div>
                <button
                  type="button"
                  className="btn-primary btn-secondary--sm"
                  onClick={() => openMention(m)}
                >
                  Open Talk
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pendingApprovals.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title">Approvals ({pendingApprovals.length})</h3>
          <ul className="crm-today-task-list">
            {pendingApprovals.map((a) => (
              <li key={a.id} className="crm-today-task">
                <div className="crm-today-task__body">
                  <button
                    type="button"
                    className="crm-today-task__deal"
                    onClick={() => onSelectDeal?.(a.saved_deal_id)}
                  >
                    {a.deal_name || 'Deal'}
                  </button>
                  <span className="crm-today-task__title">
                    {a.action_type === 'share'
                      ? `${a.requester_email} wants to share this deal with ${a.team_name || 'the team'}`
                      : `${a.requester_email}: “${a.from_value || 'Inbox'}” → “${a.to_value}”`}
                  </span>
                </div>
                <button type="button" className="btn-primary btn-secondary--sm" onClick={() => handleApproval(a.id, 'approve')}>
                  Approve
                </button>
                <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => handleApproval(a.id, 'reject')}>
                  Reject
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {overdue.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title crm-today-section__title--warn">
            Waiting on a reply ({overdue.length})
          </h3>
        <p className="crm-today-hint">Follow-ups and diligence dates you set.</p>
          <ul className="crm-today-task-list">
            {overdue.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onComplete={handleCompleteTask}
                onSelectDeal={onSelectDeal}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {dueToday.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title">Due today ({dueToday.length})</h3>
          <ul className="crm-today-task-list">
            {dueToday.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onComplete={handleCompleteTask}
                onSelectDeal={onSelectDeal}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {ddOverdue.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title crm-today-section__title--warn">
            DD overdue ({ddOverdue.length})
          </h3>
          <ul className="crm-today-task-list">
            {ddOverdue.map((item) => (
              <li key={item.id} className="crm-today-task">
                <div className="crm-today-task__body">
                  <button
                    type="button"
                    className="crm-today-task__deal"
                    onClick={() => onSelectDeal?.(item.saved_deal_id)}
                  >
                    {item.deal_name}
                  </button>
                  <span className="crm-today-task__title">{item.title}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {portalComments.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title">
            DD portal comments ({portalComments.length})
          </h3>
          <ul className="crm-today-task-list">
            {portalComments.map((comment) => (
              <li key={comment.id} className="crm-today-task">
                <div className="crm-today-task__body">
                  <button
                    type="button"
                    className="crm-today-task__deal"
                    onClick={() => onSelectDeal?.(comment.saved_deal_id)}
                  >
                    {comment.deal_name}
                  </button>
                  <span className="crm-today-task__title">{comment.item_title}</span>
                  <span className="crm-today-task__due">
                    {comment.author_name || 'Guest'} · {formatDate(comment.created_at)}
                  </span>
                  <span className="crm-portal-comment-preview">{comment.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stale.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title">Stale listings ({stale.length})</h3>
          <ul className="crm-stale-list">
            {stale.map((s) => (
              <li key={s.savedDealId}>
                <button
                  type="button"
                  className="crm-stale-item"
                  onClick={() => onSelectDeal?.(s.savedDealId)}
                >
                  <strong>{s.name}</strong>
                  <span>Feed financials changed — refresh from listing</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {nearingDd.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title">
            Nearing diligence ({nearingDd.length})
          </h3>
          <p className="crm-today-hint">IOI / LOI deals that do not have a DD list yet. Set a follow-up if you are waiting on someone.</p>
          <ul className="crm-today-task-list">
            {nearingDd.map((d) => (
              <li key={d.saved_deal_id} className="crm-today-task">
                <div className="crm-today-task__body">
                  <button
                    type="button"
                    className="crm-today-task__deal"
                    onClick={() => onSelectDeal?.(d.saved_deal_id, { focusSection: 'crm-followup' })}
                  >
                    {d.deal_name || 'Deal'}
                  </button>
                  <span className="crm-today-task__title">{d.progress_stage || 'Near diligence'}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {recentActivities.length > 0 ? (
        <section className="crm-today-section">
          <h3 className="crm-today-section__title">
            Recent activity ({Math.min(recentActivities.length, 20)})
          </h3>
          <ul className="crm-today-task-list">
            {recentActivities.slice(0, 20).map((a) => (
              <li key={a.id} className="crm-today-task">
                <div className="crm-today-task__body">
                  <button
                    type="button"
                    className="crm-today-task__deal"
                    onClick={() => onSelectDeal?.(a.saved_deal_id)}
                  >
                    {a.deal_name || 'Deal'}
                  </button>
                  <span className="crm-today-task__title">{activityPreview(a)}</span>
                  <span className="crm-today-task__due">
                    {(a.actor_email || 'Someone').split('@')[0]} · {formatDate(a.occurred_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
