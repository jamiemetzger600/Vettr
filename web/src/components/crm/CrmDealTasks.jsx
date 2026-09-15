import { useCallback, useEffect, useMemo, useState } from 'react';
import { crmAPI, teamsAPI } from '../../utils/api';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import CrmQuickAdd from './CrmQuickAdd';
import CrmTaskRow from './CrmTaskRow';
import QuickFollowUp from './QuickFollowUp';
import { TIME_SECTIONS, groupTasksByTime } from '../../utils/taskTime';
import { isFollowUpTask } from '../../utils/crmTaskKinds';

export default function CrmDealTasks({
  dealId,
  dealName,
  progressStage = '',
  contacts = [],
  userEmail = '',
  onCreated,
  disabled = false,
  onSelectDeal
}) {
  const { activeTeamId } = useTeam();
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [ddReady, setDdReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [members, setMembers] = useState([]);

  const dealForQuickAdd = useMemo(
    () => [{ id: dealId, vettrId: dealId, name: dealName }],
    [dealId, dealName]
  );

  const load = useCallback(async () => {
    if (!dealId) return;
    setLoading(true);
    setError(null);
    try {
      const [data, dd] = await Promise.all([
        crmAPI.getDealTasks(dealId),
        crmAPI.getDealDd(dealId).catch(() => ({ checklist: null }))
      ]);
      const rows = (data.tasks || []).filter((t) => !t.parent_task_id);
      setTasks(rows);
      setDdReady(Boolean(dd?.checklist));
    } catch (err) {
      console.error('[CrmDealTasks] load failed', err);
      setError(err.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeTeamId) {
      const selfId = user?.userId || user?.id;
      setMembers(selfId ? [{ userId: selfId, email: user.email }] : []);
      return;
    }
    teamsAPI.get(activeTeamId)
      .then((data) => {
        const rows = data.members || data.team?.members || [];
        setMembers(rows.map((m) => ({
          userId: m.user_id || m.userId || m.id,
          email: m.email
        })));
      })
      .catch(() => setMembers([]));
  }, [activeTeamId, user]);

  const handleToggleComplete = async (taskId, status) => {
    await crmAPI.updateTask(taskId, { status });
    await load();
    onCreated?.();
  };

  const openTasks = useMemo(
    () => (ddReady ? tasks.filter((t) => t.status !== 'done' && !isFollowUpTask(t)) : []),
    [tasks, ddReady]
  );
  const timeGroups = useMemo(() => groupTasksByTime(openTasks), [openTasks]);

  const refreshAll = () => {
    load();
    onCreated?.();
  };

  return (
    <div className="crm-deal-tasks">
      {ddReady && !disabled ? (
      <CrmQuickAdd
        deals={dealForQuickAdd}
        defaultDealId={dealId}
        onCreated={refreshAll}
      />
      ) : null}
      {ddReady && disabled ? (
        <p className="crm-muted">Viewer role — tasks are read-only.</p>
      ) : null}
      {!ddReady ? (
        <p className="crm-muted">
          Tasks unlock after you start a due diligence list. Use a follow-up below to remind yourself when you are waiting on a broker, seller, or bank.
        </p>
      ) : null}

      {loading ? <p className="crm-muted">Loading tasks…</p> : null}
      {error ? <p className="crm-task-create__error">{error}</p> : null}

      {!loading && !error && ddReady && openTasks.length === 0 ? (
        <p className="crm-muted">No diligence tasks yet. Add one above with a date.</p>
      ) : null}

      {!loading && openTasks.length > 0 ? (
        TIME_SECTIONS.filter((s) => s.id !== 'done').map((section) => {
          const list = timeGroups[section.id] || [];
          if (!list.length) return null;
          return (
            <section key={section.id} className="crm-task-section">
              <h3 className={`crm-task-section__title-static${section.warn ? ' crm-task-section__head--warn' : ''}`}>
                {section.label}
                <span className="crm-task-section__count">{list.length}</span>
              </h3>
              <ul className="crm-task-list__items">
                {list.map((task) => (
                  <CrmTaskRow
                    key={task.id}
                    task={{
                      ...task,
                      deal_name: dealName,
                      progress_stage: task.progress_stage || progressStage
                    }}
                    showDeal={false}
                    members={members}
                    onToggleComplete={handleToggleComplete}
                    onSelectDeal={onSelectDeal}
                    onChanged={load}
                    expanded={expandedId === task.id}
                    onExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
                    readOnly={disabled}
                  />
                ))}
              </ul>
            </section>
          );
        })
      ) : null}

      <QuickFollowUp
        dealId={dealId}
        dealName={dealName}
        contacts={contacts}
        userEmail={userEmail}
        onCreated={refreshAll}
        disabled={disabled}
      />
    </div>
  );
}
