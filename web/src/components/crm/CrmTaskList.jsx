import { useCallback, useEffect, useMemo, useState } from 'react';
import { crmAPI, teamsAPI } from '../../utils/api';
import { useTeam } from '../../context/TeamContext';
import { useAuth } from '../../context/AuthContext';
import CrmQuickAdd from './CrmQuickAdd';
import CrmTaskRow from './CrmTaskRow';
import {
  TIME_SECTIONS,
  groupTasksByDeal,
  groupTasksByTime,
  matchesTaskQuery
} from '../../utils/taskTime';

const FILTERS = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
  { id: 'all', label: 'All' }
];

const SCOPE = [
  { id: 'all', label: 'All tasks' },
  { id: 'me', label: 'Mine' },
  { id: 'team', label: 'Team' }
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function canWriteDeal(deal, teams) {
  const teamId = deal?.team_id ?? deal?.teamId ?? null;
  if (teamId == null || teamId === '') return true;
  const membership = (teams || []).find((t) => Number(t.id) === Number(teamId));
  if (!membership) return false;
  return membership.role === 'admin' || membership.role === 'member';
}

function SectionHead({ label, count, warn, collapsed, onToggle }) {
  return (
    <button
      type="button"
      className={`crm-task-section__head${warn ? ' crm-task-section__head--warn' : ''}`}
      onClick={onToggle}
      aria-expanded={!collapsed}
    >
      <span className="crm-task-section__title">{label}</span>
      <span className="crm-task-section__count">{count}</span>
    </button>
  );
}

export default function CrmTaskList({ deals = [], onSelectDeal, onRefresh }) {
  const { teams, activeTeamId } = useTeam();
  const { user } = useAuth();
  const [filter, setFilter] = useState('open');
  const [scope, setScope] = useState('all');
  const [groupMode, setGroupMode] = useState('time');
  const [query, setQuery] = useState('');
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [dealId, setDealId] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [priority, setPriority] = useState(3);
  const [recurrence, setRecurrence] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [formError, setFormError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [collapsed, setCollapsed] = useState(() => new Set(['nodate']));

  const writableDeals = useMemo(
    () => (deals || []).filter((d) => canWriteDeal(d, teams)),
    [deals, teams]
  );

  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => {
    if (!activeTeamId) {
      setTeamMembers([]);
      return;
    }
    teamsAPI.get(activeTeamId)
      .then((data) => {
        const rows = data.members || data.team?.members || [];
        setTeamMembers(rows.map((m) => ({
          userId: m.user_id || m.userId || m.id,
          email: m.email
        })));
      })
      .catch((err) => {
        console.warn('[CrmTaskList] team members load failed', err.message);
        setTeamMembers([]);
      });
  }, [activeTeamId]);

  const members = useMemo(() => {
    if (teamMembers.length) return teamMembers;
    if (user?.userId || user?.id) {
      return [{ userId: user.userId || user.id, email: user.email }];
    }
    return [];
  }, [teamMembers, user]);

  const canCreate = writableDeals.length > 0;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const assignee = scope === 'all' ? null : scope;
      const data = await crmAPI.getTasks(filter, { assignee });
      setTasks(data.tasks || []);
    } catch (err) {
      setError(err.message || 'Failed to load tasks');
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [filter, scope]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!dealId && writableDeals.length === 1) {
      const id = writableDeals[0].vettrId ?? writableDeals[0].id;
      setDealId(id != null ? String(id) : '');
    }
  }, [writableDeals, dealId]);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => matchesTaskQuery(t, query)),
    [tasks, query]
  );

  const timeGroups = useMemo(() => groupTasksByTime(visibleTasks), [visibleTasks]);
  const dealGroups = useMemo(() => groupTasksByDeal(visibleTasks), [visibleTasks]);

  const handleToggleComplete = async (taskId, status) => {
    await crmAPI.updateTask(taskId, { status });
    await load();
    onRefresh?.();
  };

  const toggleCollapsed = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setTitle('');
    setDueDate(defaultDueDate());
    setPriority(3);
    setRecurrence('');
    setAssigneeUserId('');
    setFormError('');
    if (writableDeals.length === 1) {
      const id = writableDeals[0].vettrId ?? writableDeals[0].id;
      setDealId(id != null ? String(id) : '');
    } else {
      setDealId('');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (creating) return;
    const trimmed = title.trim();
    if (!trimmed) {
      setFormError('Enter a task title.');
      return;
    }
    if (!dealId) {
      setFormError('Pick a deal for this task.');
      return;
    }
    setCreating(true);
    setFormError('');
    try {
      const dueAt = dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null;
      await crmAPI.createTask(dealId, {
        title: trimmed,
        dueAt,
        source: 'manual',
        priority: Number(priority) || 3,
        recurrence: recurrence || null,
        assigneeUserId: assigneeUserId ? Number(assigneeUserId) : undefined,
        notifyRecipients: [{ type: 'self' }]
      });
      setShowCreate(false);
      resetForm();
      await load();
      onRefresh?.();
    } catch (err) {
      setFormError(err.message || 'Failed to create task');
    } finally {
      setCreating(false);
    }
  };

  const renderRows = (list, { showDeal = true } = {}) => (
    <ul className="crm-task-list__items">
      {list.map((task) => (
        <CrmTaskRow
          key={task.id}
          task={task}
          showDeal={showDeal}
          members={members}
          onToggleComplete={handleToggleComplete}
          onSelectDeal={onSelectDeal}
          onChanged={load}
          expanded={expandedId === task.id}
          onExpand={(id) => setExpandedId((cur) => (cur === id ? null : id))}
        />
      ))}
    </ul>
  );

  return (
    <div className="crm-task-list">
      <CrmQuickAdd deals={writableDeals} onCreated={() => { load(); onRefresh?.(); }} />

      <div className="crm-task-list__toolbar">
        <div className="crm-task-list__filters">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`crm-chip${filter === f.id ? ' crm-chip--active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="crm-task-list__filters">
          {SCOPE.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`crm-chip${scope === f.id ? ' crm-chip--active' : ''}`}
              onClick={() => setScope(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="crm-task-list__filters">
          <button
            type="button"
            className={`crm-chip${groupMode === 'time' ? ' crm-chip--active' : ''}`}
            onClick={() => {
              console.log('[CrmTaskList] group mode time');
              setGroupMode('time');
            }}
          >
            Time
          </button>
          <button
            type="button"
            className={`crm-chip${groupMode === 'deal' ? ' crm-chip--active' : ''}`}
            onClick={() => {
              console.log('[CrmTaskList] group mode deal');
              setGroupMode('deal');
            }}
          >
            By deal
          </button>
        </div>
        <div className="crm-task-list__toolbar-right">
          <input
            type="search"
            className="crm-task-list__search"
            placeholder="Filter tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filter tasks"
          />
          {canCreate ? (
            <button
              type="button"
              className="btn-primary btn-secondary--sm"
              onClick={() => {
                setShowCreate((v) => !v);
                setFormError('');
              }}
            >
              {showCreate ? 'Close' : 'New task'}
            </button>
          ) : null}
        </div>
      </div>

      {!loading && !error && filter === 'open' && query ? (
        <p className="crm-task-list__summary">{visibleTasks.length} match</p>
      ) : null}

      {showCreate && canCreate ? (
        <form className="crm-task-create" onSubmit={handleCreate}>
          <div className="crm-task-create__row">
            <label className="crm-task-create__field">
              <span>Task</span>
              <input
                type="text"
                className="modal-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                maxLength={300}
              />
            </label>
          </div>
          <div className="crm-task-create__row crm-task-create__row--split">
            <label className="crm-task-create__field">
              <span>Deal</span>
              <select className="modal-input" value={dealId} onChange={(e) => setDealId(e.target.value)} required>
                <option value="">Select deal…</option>
                {writableDeals.map((d) => {
                  const id = d.vettrId ?? d.id;
                  return <option key={id} value={id}>{d.name || `Deal ${id}`}</option>;
                })}
              </select>
            </label>
            <label className="crm-task-create__field">
              <span>Due date</span>
              <input type="date" className="modal-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>
          </div>
          <div className="crm-task-create__row crm-task-create__row--split">
            <label className="crm-task-create__field">
              <span>Priority</span>
              <select className="modal-input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value={1}>P1 — Urgent</option>
                <option value={2}>P2 — High</option>
                <option value={3}>P3 — Normal</option>
                <option value={4}>P4 — Low</option>
              </select>
            </label>
            <label className="crm-task-create__field">
              <span>Repeat</span>
              <select className="modal-input" value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                <option value="">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            <label className="crm-task-create__field">
              <span>Assignee</span>
              <select className="modal-input" value={assigneeUserId} onChange={(e) => setAssigneeUserId(e.target.value)}>
                <option value="">Me</option>
                {members.map((m) => (
                  <option key={m.userId || m.id} value={m.userId || m.id}>
                    {m.email || m.name || m.userId || m.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {formError ? <p className="crm-task-create__error">{formError}</p> : null}
          <div className="crm-task-create__actions">
            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create task'}
            </button>
            <button type="button" className="btn-secondary" disabled={creating} onClick={() => { setShowCreate(false); resetForm(); }}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <div className="crm-panel">Loading tasks…</div> : null}
      {error ? (
        <div className="crm-panel crm-panel--error">
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={load}>Retry</button>
        </div>
      ) : null}

      {!loading && !error && visibleTasks.length === 0 ? (
        <div className="crm-today-empty">
          <p>
            {query
              ? 'No tasks match that filter.'
              : filter === 'done'
                ? 'No completed tasks yet.'
                : 'No open tasks — add one above, or open a deal and set the next step.'}
          </p>
        </div>
      ) : null}

      {!loading && !error && visibleTasks.length > 0 && groupMode === 'time' ? (
        TIME_SECTIONS.map((section) => {
          const list = timeGroups[section.id] || [];
          if (!list.length) return null;
          const isCollapsed = collapsed.has(section.id);
          return (
            <section key={section.id} className="crm-task-section">
              <SectionHead
                label={section.label}
                count={list.length}
                warn={section.warn}
                collapsed={isCollapsed}
                onToggle={() => toggleCollapsed(section.id)}
              />
              {isCollapsed ? null : renderRows(list)}
            </section>
          );
        })
      ) : null}

      {!loading && !error && visibleTasks.length > 0 && groupMode === 'deal' ? (
        dealGroups.map((group) => {
          const key = String(group.dealId ?? group.dealName);
          const isCollapsed = collapsed.has(`deal-${key}`);
          return (
            <section key={key} className="crm-task-section">
              <SectionHead
                label={group.dealName}
                count={group.tasks.length}
                collapsed={isCollapsed}
                onToggle={() => toggleCollapsed(`deal-${key}`)}
              />
              {isCollapsed ? null : renderRows(group.tasks, { showDeal: false })}
            </section>
          );
        })
      ) : null}
    </div>
  );
}
