import { useEffect, useMemo, useState } from 'react';
import { barStyle, buildGanttModel, formatGanttDay, localTodayMs, milestoneHeaders, viewerTimeZone } from './ddGantt.js';

const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting_on_other: 'Waiting',
  blocked: 'Blocked',
  complete: 'Complete',
  na: 'N/A'
};

function TaskRow({ task, rangeStart, rangeEnd, showAssignee }) {
  const style = barStyle(task.due, task.due, rangeStart, rangeEnd);
  const link = task.waitUntil != null && task.due != null
    ? barStyle(Math.min(task.waitUntil, task.due), Math.max(task.waitUntil, task.due) - 86400000, rangeStart, rangeEnd)
    : null;
  const after = task.after?.length ? `After ${task.after.join(', ')}` : '';
  return (
    <li className={`dd-gantt__task${task.blocked ? ' is-blocked' : ''}`}>
      <span className="dd-gantt__label" title={after || task.groupName}>
        <span className="dd-gantt__title">{task.title}</span>
        <span className="dd-gantt__sub">
          {task.milestone ? 'Milestone' : task.groupName}
          {task.due != null ? ` · ${formatGanttDay(task.due)}` : ' · No date'}
          {showAssignee ? ` · ${task.assignee || 'Unassigned'}` : ''}
          {!task.milestone ? ` · ${STATUS_LABEL[task.status] || 'Not started'}` : ''}
          {task.docNeeded ? ' · Document needed' : ''}
          {task.blocked ? ' · Blocked' : ''}
          {after ? ` · ${after}` : ''}
        </span>
      </span>
      <span className="dd-gantt__track">
        {link ? <span className="dd-gantt__link" style={link} /> : null}
        {style ? (
          <span
            className={`dd-gantt__bar dd-gantt__bar--task dd-gantt__bar--${task.milestone ? 'milestone' : task.status}`}
            style={style}
          />
        ) : null}
      </span>
    </li>
  );
}

export default function DdGantt({
  groups = [],
  startedAt = null,
  targetDate = null,
  milestones = [],
  onMilestoneDate = null,
  audience = 'internal',
  showAudienceToggle = false
}) {
  const [mode, setMode] = useState(audience === 'external' ? 'external' : 'internal');
  const [open, setOpen] = useState(() => new Set());
  const [todayMs, setTodayMs] = useState(() => localTodayMs());
  const shown = showAudienceToggle ? mode : (audience === 'external' ? 'external' : 'internal');
  const showAssignee = shown === 'internal';

  useEffect(() => {
    const zone = viewerTimeZone();
    console.log('[DdGantt] timezone', zone, formatGanttDay(localTodayMs()));
    const now = new Date();
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const timer = window.setTimeout(() => setTodayMs(localTodayMs()), nextMidnight - now.getTime() + 500);
    return () => window.clearTimeout(timer);
  }, []);

  const model = useMemo(
    () => buildGanttModel({
      groups,
      startedAt,
      targetDate,
      milestones,
      today: new Date(todayMs)
    }),
    [groups, startedAt, targetDate, milestones, todayMs]
  );
  const headers = useMemo(
    () => milestoneHeaders(model.stages, model.rangeStart, model.rangeEnd),
    [model.stages, model.rangeStart, model.rangeEnd]
  );
  const todayStyle = barStyle(model.todayMs, model.todayMs, model.rangeStart, model.rangeEnd);
  const todayLabel = formatGanttDay(model.todayMs);

  const toggleStage = (stage) => {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(stage.id)) next.delete(stage.id);
      else next.add(stage.id);
      console.log('[DdGantt] stage', stage.id, next.has(stage.id) ? 'open' : 'closed', stage.total);
      return next;
    });
  };

  const setAudience = (next) => {
    setMode(next);
    console.log('[DdGantt] audience', next);
  };

  return (
    <section className="dd-gantt" aria-label="Due diligence stages">
      <div className="dd-gantt__toolbar">
        <p className="crm-muted">
          {showAssignee
            ? 'Who owns the work in each stage. Open a stage to see its tasks.'
            : 'Documents, dates, and status. Assignee names stay off this view.'}
        </p>
        {showAudienceToggle ? (
          <div className="dd-portal-view-toggle panel-position-toggle" role="tablist" aria-label="Gantt audience">
            <button
              type="button"
              role="tab"
              aria-selected={shown === 'internal'}
              className={shown === 'internal' ? 'active' : ''}
              onClick={() => setAudience('internal')}
            >
              Internal
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={shown === 'external'}
              className={shown === 'external' ? 'active' : ''}
              onClick={() => setAudience('external')}
            >
              External
            </button>
          </div>
        ) : null}
      </div>

      <div className="dd-gantt__chart">
        <div className="dd-gantt__scale" aria-hidden="true">
          <span className="dd-gantt__label">Milestone</span>
          <span className="dd-gantt__track dd-gantt__track--scale">
            {headers.map((header) => (
              <span key={header.id} className="dd-gantt__tick" style={{ left: header.left }}>
                <span>{header.label}</span>
                <span className="dd-gantt__tick-date">{header.date}</span>
              </span>
            ))}
            {todayStyle ? (
              <span className="dd-gantt__today" style={{ left: todayStyle.left }} title={`Today ${todayLabel}`} />
            ) : null}
          </span>
          <span />
        </div>

        {model.stages.map((stage) => {
          const expanded = open.has(stage.id);
          const style = barStyle(stage.start, stage.end, model.rangeStart, model.rangeEnd);
          return (
            <div key={stage.id} className={`dd-gantt__stage${expanded ? ' is-open' : ''}`}>
              <div className="dd-gantt__row">
                <span className="dd-gantt__label">
                  <button type="button" className="dd-gantt__open" aria-expanded={expanded} onClick={() => toggleStage(stage)}>
                    {stage.label}
                    <span className="dd-gantt__count">
                      {stage.total ? `${stage.complete}/${stage.total}` : '0'}
                    </span>
                  </button>
                  {onMilestoneDate ? (
                    <input
                      type="date"
                      className="modal-input dd-gantt__milestone"
                      value={stage.dueOn || ''}
                      aria-label={`Due date for ${stage.label}`}
                      onChange={(e) => onMilestoneDate(stage.id, e.target.value)}
                    />
                  ) : stage.dueOn ? (
                    <span className="dd-gantt__tick-date">{formatGanttDay(stage.milestoneAt)}</span>
                  ) : null}
                </span>
                <button type="button" className="dd-gantt__track-btn" aria-label={`${expanded ? 'Hide' : 'View'} tasks in ${stage.label}`} onClick={() => toggleStage(stage)}>
                  <span className="dd-gantt__track">
                    {headers.map((header) => (
                      <span key={header.id} className="dd-gantt__grid" style={{ left: header.left }} />
                    ))}
                    {todayStyle ? <span className="dd-gantt__today" style={{ left: todayStyle.left }} /> : null}
                    {style ? (
                      <span className={`dd-gantt__bar dd-gantt__bar--stage dd-gantt__bar--${stage.tone}`} style={style} />
                    ) : (
                      <span className="dd-gantt__nodate">No dates</span>
                    )}
                  </span>
                </button>
                <button type="button" className="dd-gantt__action" onClick={() => toggleStage(stage)}>
                  {expanded ? 'Hide tasks' : 'View tasks'}
                </button>
              </div>
              {expanded ? (
                <ul className="dd-gantt__tasks">
                  {stage.tasks.length === 0 ? (
                    <li className="dd-gantt__none">
                      {stage.id === 'custom'
                        ? 'Groups you add outside the standard checklist show up here.'
                        : 'No tasks in this stage.'}
                    </li>
                  ) : stage.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      rangeStart={model.rangeStart}
                      rangeEnd={model.rangeEnd}
                      showAssignee={showAssignee}
                    />
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
