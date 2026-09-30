import { useEffect, useMemo, useState } from 'react';
import {
  barSegments,
  buildGanttModel,
  formatGanttDay,
  localTodayMs,
  taskSpan,
  viewerTimeZone,
  weekColumns
} from './ddGantt.js';

const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting_on_other: 'Waiting',
  blocked: 'Blocked',
  complete: 'Complete',
  na: 'N/A'
};

function Track({ weeks, segments }) {
  return (
    <div className="dd-gantt__span">
      {weeks.map((week) => (
        <div
          key={week.id}
          className={`dd-gantt__cell dd-gantt__cell--m${week.month}${week.today ? ' is-today' : ''}`}
        />
      ))}
      {segments.map((segment) => (
        <span
          key={segment.key}
          className={`dd-gantt__block dd-gantt__block--m${segment.month}`}
          style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
        />
      ))}
    </div>
  );
}

function ItemRow({ task, weeks, showAssignee }) {
  const span = taskSpan(task);
  const segments = span ? barSegments(span.start, span.end, weeks) : [];
  const after = task.after?.length ? `After ${task.after.join(', ')}` : '';
  return (
    <div className={`dd-gantt__line dd-gantt__line--item${task.blocked ? ' is-blocked' : ''}`}>
      <div className="dd-gantt__item" title={after || task.groupName}>
        <span className="dd-gantt__title">{task.title}</span>
        <span className="dd-gantt__sub">
          {task.groupName}
          {task.due != null ? ` · ${formatGanttDay(task.due)}` : ' · No date'}
          {showAssignee ? ` · ${task.assignee || 'Unassigned'}` : ''}
          {` · ${STATUS_LABEL[task.status] || 'Not started'}`}
        </span>
      </div>
      <Track weeks={weeks} segments={segments} />
    </div>
  );
}

export default function DdGantt({
  groups = [],
  startedAt = null,
  targetDate = null,
  milestones = [],
  onMilestoneDate = null,
  audience = 'internal',
  showAudienceToggle = false,
  activeStageId = null,
  onStageChange = null
}) {
  const [mode, setMode] = useState(audience === 'external' ? 'external' : 'internal');
  const [open, setOpen] = useState(null);
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
  const weeks = useMemo(
    () => weekColumns(model.rangeStart, model.rangeEnd, model.todayMs),
    [model.rangeStart, model.rangeEnd, model.todayMs]
  );
  const todayLabel = formatGanttDay(model.todayMs);

  useEffect(() => {
    console.log('[DdGantt] weeks', {
      zone: viewerTimeZone(),
      today: todayLabel,
      count: weeks.length,
      first: weeks[0]?.label,
      last: weeks[weeks.length - 1]?.label,
      months: [...new Set(weeks.map((week) => week.monthKey))]
    });
  }, [weeks, todayLabel]);

  const isOpen = (stage) => (open == null ? stage.total > 0 : open.has(stage.id));

  const toggleStage = (stage) => {
    setOpen((current) => {
      const base = current ?? new Set(model.stages.filter((row) => row.total > 0).map((row) => row.id));
      const next = new Set(base);
      if (next.has(stage.id)) next.delete(stage.id);
      else next.add(stage.id);
      console.log('[DdGantt] stage', stage.id, next.has(stage.id) ? 'open' : 'closed', stage.total);
      return next;
    });
    if (typeof onStageChange === 'function') {
      const next = activeStageId === stage.id ? null : stage.id;
      onStageChange(next);
    }
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
            ? 'Weekly view. Each month has its own color. Open a milestone to see its tasks.'
            : 'Weekly view. Assignee names stay off this view.'}
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

      <div className="dd-gantt__scroll">
        <div className="dd-gantt__sheet" style={{ '--weeks': weeks.length }}>
          <div className="dd-gantt__line dd-gantt__line--head">
            <div className="dd-gantt__corner">Milestone</div>
            <div className="dd-gantt__span dd-gantt__span--head">
              {weeks.map((week) => (
                <div key={week.id} className={`dd-gantt__week dd-gantt__week--m${week.month}${week.today ? ' is-today' : ''}`}>
                  <span className="dd-gantt__week-label">{week.label}</span>
                  <span className="dd-gantt__days">
                    {week.days.map((day, index) => (
                      <span key={`${week.id}-${index}`}>{day}</span>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {model.stages.map((stage) => {
            const expanded = isOpen(stage);
            const work = stage.tasks.filter((task) => !task.milestone);
            const marker = stage.milestoneAt != null ? barSegments(stage.milestoneAt, stage.milestoneAt, weeks) : [];
            return (
              <div key={stage.id} className={`dd-gantt__stage dd-gantt__stage--${stage.id}${expanded ? ' is-open' : ''}`}>
                <div className="dd-gantt__line dd-gantt__line--mile">
                  <div className="dd-gantt__milebox">
                    <button
                      type="button"
                      className="dd-gantt__mile"
                      aria-expanded={expanded}
                      onClick={() => toggleStage(stage)}
                    >
                      <span>{stage.label}</span>
                      <span className="dd-gantt__count">{stage.total ? `${stage.complete}/${stage.total}` : '0'}</span>
                    </button>
                    {onMilestoneDate ? (
                      <input
                        type="date"
                        className="modal-input dd-gantt__milestone"
                        value={stage.dueOn || ''}
                        aria-label={`Due date for ${stage.label}`}
                        onChange={(e) => onMilestoneDate(stage.id, e.target.value)}
                      />
                    ) : null}
                  </div>
                  <Track weeks={weeks} segments={marker} />
                </div>
                {expanded ? (
                  work.length === 0 ? (
                    <div className="dd-gantt__line dd-gantt__line--item">
                      <div className="dd-gantt__item dd-gantt__item--empty">
                        {stage.id === 'custom'
                          ? 'Groups you add outside the standard checklist show up here.'
                          : 'No tasks in this stage.'}
                      </div>
                      <Track weeks={weeks} segments={[]} />
                    </div>
                  ) : work.map((task) => (
                    <ItemRow key={task.id} task={task} weeks={weeks} showAssignee={showAssignee} />
                  ))
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
