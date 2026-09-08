import { useEffect, useMemo, useState } from 'react';
import { crmAPI } from '../../utils/api';
import { formatRelativeDue, shortAssignee } from '../../utils/taskTime';
import {
  buildExpandChecklist,
  checklistTitlesForTask
} from '../../utils/taskPlaybook';

export default function CrmTaskRow({
  task,
  onToggleComplete,
  onSelectDeal,
  onChanged,
  members = [],
  expanded = false,
  onExpand,
  showDeal = true,
  expandable = true,
  readOnly = false
}) {
  const isDone = task.status === 'done';
  const due = formatRelativeDue(task.due_at);
  const priority = task.priority != null ? Number(task.priority) : null;
  const [busy, setBusy] = useState(false);
  const [subTitle, setSubTitle] = useState('');
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [dealTasks, setDealTasks] = useState([]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [addingTitle, setAddingTitle] = useState(null);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    Promise.all([
      crmAPI.getTaskComments(task.id).catch(() => ({ comments: [] })),
      crmAPI.getDealTasks(task.saved_deal_id).catch(() => ({ tasks: [] }))
    ]).then(([commentData, dealData]) => {
      if (cancelled) return;
      const notes = commentData.comments || [];
      const rows = dealData.tasks || [];
      setComments(notes);
      setDealTasks(rows);
      setSubtasks(rows.filter((t) => Number(t.parent_task_id) === Number(task.id)));
      setMoreOpen(notes.length > 0);
    });
    return () => { cancelled = true; };
  }, [expanded, task.id, task.saved_deal_id]);

  const playbook = useMemo(() => {
    const titles = checklistTitlesForTask(task);
    return buildExpandChecklist({
      titles,
      parentId: task.id,
      subtasks,
      dealTasks
    });
  }, [task, subtasks, dealTasks]);

  const refreshKids = async () => {
    const dealData = await crmAPI.getDealTasks(task.saved_deal_id);
    const rows = dealData.tasks || [];
    setDealTasks(rows);
    setSubtasks(rows.filter((t) => Number(t.parent_task_id) === Number(task.id)));
  };

  const handleCheck = async (e) => {
    e.stopPropagation();
    if (busy) return;
    const nextDone = e.target.checked;
    setBusy(true);
    try {
      console.log('[CrmTaskRow] toggle complete', task.id, nextDone);
      await onToggleComplete?.(task.id, nextDone ? 'done' : 'open');
    } catch (err) {
      console.error('[CrmTaskRow] toggle failed', err);
      alert('Failed to update task: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const createChild = async (title, source = 'manual') => {
    await crmAPI.createTask(task.saved_deal_id, {
      title,
      parentTaskId: task.id,
      source,
      assigneeUserId: task.assignee_user_id || undefined,
      notifyRecipients: [{ type: 'self' }]
    });
    await refreshKids();
    onChanged?.();
  };

  const handleAddSubtask = async (e) => {
    e.preventDefault();
    const title = subTitle.trim();
    if (!title) return;
    try {
      await createChild(title, 'manual');
      setSubTitle('');
    } catch (err) {
      alert(err.message || 'Failed to add subtask');
    }
  };

  const handleAddPlaybook = async (title) => {
    if (addingTitle || readOnly) return;
    setAddingTitle(title);
    try {
      console.log('[CrmTaskRow] add playbook step', { taskId: task.id, title });
      await createChild(title, 'playbook');
    } catch (err) {
      console.error('[CrmTaskRow] playbook add failed', err);
      alert(err.message || 'Failed to add step');
    } finally {
      setAddingTitle(null);
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    const body = comment.trim();
    if (!body) return;
    try {
      await crmAPI.addTaskComment(task.id, body);
      setComment('');
      const data = await crmAPI.getTaskComments(task.id);
      setComments(data.comments || []);
    } catch (err) {
      alert(err.message || 'Failed to comment');
    }
  };

  const handleReassign = (e) => {
    const v = e.target.value;
    crmAPI.updateTask(task.id, { assigneeUserId: v ? Number(v) : null })
      .then(() => onChanged?.())
      .catch((err) => alert(err.message));
  };

  const toggleSubtask = async (sub, nextDone) => {
    try {
      await crmAPI.updateTask(sub.id, { status: nextDone ? 'done' : 'open' });
      setSubtasks((prev) => prev.map((s) => (
        s.id === sub.id ? { ...s, status: nextDone ? 'done' : 'open' } : s
      )));
      onChanged?.();
    } catch (err) {
      alert(err.message || 'Failed to update subtask');
    }
  };

  const renderCheckItem = (sub) => (
    <li key={sub.id} className="crm-task-sublist__item">
      <input
        type="checkbox"
        className="crm-task-row__check"
        checked={sub.status === 'done'}
        disabled={readOnly}
        onChange={(e) => toggleSubtask(sub, e.target.checked)}
        aria-label={sub.title}
      />
      <span className={sub.status === 'done' ? 'crm-task-row--done-text' : ''}>{sub.title}</span>
    </li>
  );

  return (
    <li className={`crm-task-row${isDone ? ' crm-task-row--done' : ''}${expanded ? ' crm-task-row--open' : ''}`}>
      <div className="crm-task-row__line">
        <input
          type="checkbox"
          className="crm-task-row__check"
          checked={isDone}
          disabled={busy || readOnly}
          onChange={handleCheck}
          onClick={(e) => e.stopPropagation()}
          aria-label={isDone ? `Reopen ${task.title}` : `Complete ${task.title}`}
        />
        <div className="crm-task-row__main">
          <button
            type="button"
            className="crm-task-row__title-line"
            onClick={() => {
              if (expandable) onExpand?.(task.id);
              else onSelectDeal?.(task.saved_deal_id);
            }}
          >
            <span className="crm-task-row__title">
              {priority != null && priority <= 2 ? (
                <span className={`crm-priority crm-priority--${priority}`}>P{priority}</span>
              ) : null}
              {task.title}
            </span>
            <span className={`crm-task-row__due crm-task-row__due--${due.tone}`}>
              {due.label}
            </span>
          </button>
          <div className="crm-task-row__meta">
            {showDeal ? (
              <button
                type="button"
                className="crm-task-row__deal"
                title={task.deal_name || 'Deal'}
                onClick={() => onSelectDeal?.(task.saved_deal_id)}
              >
                {task.deal_name || 'Deal'}
              </button>
            ) : null}
            {task.assignee_email ? (
              <span className="crm-task-row__assignee">{shortAssignee(task.assignee_email)}</span>
            ) : null}
            {task.recurrence ? <span className="crm-tag">{task.recurrence}</span> : null}
            {task.subtask_count > 0 ? (
              <span className="crm-task-row__subs">
                {task.subtask_done_count || 0}/{task.subtask_count}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {expanded && expandable ? (
        <div className="crm-task-expand">
          {playbook.items.length > 0 || playbook.extras.length > 0 ? (
            <div className="crm-task-playbook">
              {playbook.items.length > 0 ? (
                <p className="crm-task-playbook__label">Next steps</p>
              ) : null}
              <ul className="crm-task-sublist">
                {playbook.items.map((item) => {
                  if (item.kind === 'subtask') return renderCheckItem(item.task);
                  return (
                    <li key={item.title} className="crm-task-sublist__item crm-task-playbook__item">
                      <span className="crm-task-playbook__box" aria-hidden="true" />
                      <span>{item.title}</span>
                      {item.kind === 'suggest' && !readOnly ? (
                        <button
                          type="button"
                          className="crm-task-playbook__add"
                          disabled={addingTitle === item.title}
                          onClick={() => handleAddPlaybook(item.title)}
                        >
                          {addingTitle === item.title ? 'Adding…' : 'Add'}
                        </button>
                      ) : (
                        <span className="crm-task-playbook__on-deal">
                          {item.kind === 'on_deal_done' ? 'Done on deal' : 'On deal'}
                        </span>
                      )}
                    </li>
                  );
                })}
                {playbook.extras.map((sub) => renderCheckItem(sub))}
              </ul>
            </div>
          ) : null}
          {!readOnly ? (
            <form className="crm-task-expand__row" onSubmit={handleAddSubtask}>
              <input
                className="modal-input"
                placeholder="Add your own…"
                value={subTitle}
                onChange={(e) => setSubTitle(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              <button type="submit" className="btn-secondary btn-secondary--sm">Add</button>
            </form>
          ) : null}
          <div className="crm-task-expand__more">
            <button
              type="button"
              className="crm-task-expand__more-toggle"
              onClick={() => setMoreOpen((open) => !open)}
            >
              {moreOpen ? 'Hide assignee & notes' : 'Assignee & notes'}
            </button>
            {moreOpen ? (
              <>
                {!readOnly && members?.length ? (
                  <label className="crm-task-expand__row">
                    <span className="crm-muted">Assignee</span>
                    <select
                      className="modal-input"
                      defaultValue={task.assignee_user_id || ''}
                      onChange={handleReassign}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value="">Unassigned</option>
                      {members.map((m) => (
                        <option key={m.userId || m.id} value={m.userId || m.id}>
                          {m.email || m.name || m.userId || m.id}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <ul className="crm-task-comments">
                  {comments.map((c) => (
                    <li key={c.id}>
                      <strong>{shortAssignee(c.author_email)}</strong>: {c.body}
                    </li>
                  ))}
                </ul>
                {!readOnly ? (
                  <form className="crm-task-expand__row" onSubmit={handleComment}>
                    <input
                      className="modal-input"
                      placeholder="Comment…"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button type="submit" className="btn-secondary btn-secondary--sm">Comment</button>
                  </form>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
