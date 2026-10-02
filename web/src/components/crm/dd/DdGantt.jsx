import { useEffect, useMemo, useRef, useState } from 'react';
import {
  barSegments,
  buildGanttModel,
  dayMarker,
  formatGanttDay,
  holidaysForWeeks,
  localTodayMs,
  viewerTimeZone,
  weekColumns
} from './ddGantt.js';
import { downloadGanttShare, ganttShareRows } from './exportGanttShare.js';

const HOLIDAY_KEY = 'vettr.dd.bankHolidays';

function readHolidayToggle() {
  try {
    const stored = localStorage.getItem(HOLIDAY_KEY);
    if (stored == null || stored === '') return true;
    return stored === '1';
  } catch {
    return true;
  }
}

function MilestoneName({ stage, onRename, onDone }) {
  const [value, setValue] = useState(stage.label);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (raw, revert) => {
    const next = String(raw || '').trim();
    onDone();
    if (revert || !next || next === stage.label) return;
    console.log('[DdGantt] rename group', stage.groupId, next);
    Promise.resolve(onRename(stage.groupId, next)).catch((err) => {
      console.error('[DdGantt] rename failed', err);
    });
  };

  return (
    <input
      ref={inputRef}
      className="dd-gantt__mile-name"
      value={value}
      maxLength={255}
      aria-label={`Name for ${stage.label}`}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => finish(e.currentTarget.value, e.currentTarget.dataset.revert === '1')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.currentTarget.dataset.revert = '1';
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Track({ weeks, segments, diamond, holidays = [] }) {
  return (
    <div className="dd-gantt__span">
      {weeks.map((week) => (
        <div
          key={week.id}
          className={`dd-gantt__cell dd-gantt__cell--m${week.month}${week.today ? ' is-today' : ''}`}
        />
      ))}
      <div className="dd-gantt__bars">
        {segments.map((segment) => (
          <span
            key={segment.key}
            className={`dd-gantt__block dd-gantt__block--m${segment.month}`}
            style={{ left: `${segment.left}%`, width: `${segment.width}%` }}
          />
        ))}
        {holidays.map((holiday) => (
          <span
            key={holiday.key}
            className={`dd-gantt__holiday${holiday.weight === 'partial' ? ' dd-gantt__holiday--partial' : ''}`}
            style={{ left: `${holiday.left}%`, width: `${holiday.width}%` }}
            title={`${holiday.name} · ${holiday.note}`}
          />
        ))}
        {diamond ? (
          <span
            className={`dd-gantt__diamond dd-gantt__diamond--m${diamond.month}`}
            style={{ left: `${diamond.left}%` }}
            title={diamond.label || 'Close'}
          />
        ) : null}
      </div>
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
  onStageChange = null,
  onRenameGroup = null,
  onHide = null,
  shareTitle = ''
}) {
  const [mode, setMode] = useState(audience === 'external' ? 'external' : 'internal');
  const [todayMs, setTodayMs] = useState(() => localTodayMs());
  const [editingId, setEditingId] = useState(null);
  const [showHolidays, setShowHolidays] = useState(readHolidayToggle);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef(null);
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
  const holidays = useMemo(
    () => (showHolidays ? holidaysForWeeks(weeks) : []),
    [showHolidays, weeks]
  );
  const holidayOnDay = useMemo(() => {
    const map = new Map();
    for (const holiday of holidays) {
      if (holiday.weekId != null && holiday.dayIndex != null) {
        map.set(`${holiday.weekId}:${holiday.dayIndex}`, holiday);
      }
    }
    return map;
  }, [holidays]);

  const setHolidayToggle = (next) => {
    setShowHolidays(next);
    try { localStorage.setItem(HOLIDAY_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    console.log('[DdGantt] holiday closures', next ? 'shown' : 'hidden');
  };

  useEffect(() => {
    console.log('[DdGantt] weeks', {
      zone: viewerTimeZone(),
      today: todayLabel,
      todayLetter: (() => {
        const week = weeks.find((row) => row.todayDay != null);
        return week ? week.days[week.todayDay] : null;
      })(),
      count: weeks.length,
      first: weeks[0]?.label,
      last: weeks[weeks.length - 1]?.label,
      bars: model.stages
        .filter((stage) => stage.barStart != null && stage.barEnd != null)
        .map((stage) => `${stage.id} ${formatGanttDay(stage.barStart)} → ${formatGanttDay(stage.barEnd)}`),
      close: formatGanttDay(model.stages.find((stage) => stage.id === 'close')?.milestoneAt) || 'none',
      holidays: holidays.map((holiday) => `${holiday.name} ${holiday.observedOn}`)
    });
  }, [weeks, todayLabel, holidays, model.stages]);

  const selectStage = (stage) => {
    if (typeof onStageChange !== 'function') return;
    const next = activeStageId === stage.id ? null : stage.id;
    console.log('[DdGantt] stage tasks below', next || 'all', stage.total);
    onStageChange(next);
  };

  const setAudience = (next) => {
    setMode(next);
    console.log('[DdGantt] audience', next);
  };

  useEffect(() => {
    if (!exportOpen) return undefined;
    const close = (event) => {
      if (!exportRef.current?.contains(event.target)) setExportOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [exportOpen]);

  const runExport = async (format) => {
    setExportOpen(false);
    setExporting(true);
    try {
      const rows = ganttShareRows(model.stages);
      console.log('[DdGantt] export', format, shareTitle || 'timeline', rows);
      await downloadGanttShare({
        title: shareTitle,
        rows,
        format,
        chart: { weeks, stages: model.stages, holidays }
      });
    } catch (err) {
      console.error('[DdGantt] export failed', err);
      alert(`Could not export the chart: ${err.message || 'error'}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="dd-gantt" aria-label="Due diligence stages">
      <div className="dd-gantt__toolbar">
        <p className="crm-muted">
          {showAssignee
            ? 'Weekly view. Click a group name to rename it. Select a milestone to see its tasks below the chart.'
            : 'Weekly view. Assignee names stay off this view.'}
        </p>
        <label
          className="dd-gantt__holiday-toggle"
          title="Days when banks, law firms, courts, or businesses are often closed. A milestone on one of these days can slip."
        >
          <input
            type="checkbox"
            checked={showHolidays}
            onChange={(e) => setHolidayToggle(e.target.checked)}
          />
          Holiday closures
        </label>
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
        <div className="dd-gantt__export" ref={exportRef}>
          <button
            type="button"
            className="btn-secondary btn-secondary--sm dd-gantt__action"
            aria-expanded={exportOpen}
            aria-haspopup="menu"
            aria-busy={exporting}
            disabled={exporting}
            onClick={() => setExportOpen((open) => !open)}
          >
            {exporting ? 'Exporting…' : 'Export Gantt Chart'}
          </button>
          {exportOpen ? (
            <div className="dd-gantt__export-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => runExport('png')}>PNG</button>
              <button type="button" role="menuitem" onClick={() => runExport('jpeg')}>JPEG</button>
              <button type="button" role="menuitem" onClick={() => runExport('pdf')}>PDF</button>
            </div>
          ) : null}
        </div>
        {typeof onHide === 'function' ? (
          <button type="button" className="btn-secondary btn-secondary--sm dd-gantt__action" onClick={onHide}>
            Hide Gantt Chart
          </button>
        ) : null}
      </div>

      <div className="dd-gantt__scroll">
        <div className="dd-gantt__sheet" style={{ '--weeks': weeks.length }}>
          <div className="dd-gantt__line dd-gantt__line--head">
            <div className="dd-gantt__corner">Milestone</div>
            <div className="dd-gantt__span dd-gantt__span--head">
              {weeks.map((week) => (
                <div key={week.id} className={`dd-gantt__week dd-gantt__week--m${week.month}${week.today ? ' is-today' : ''}`}>
                  <span className="dd-gantt__week-label" title={week.label}>{week.label}</span>
                  <span className="dd-gantt__days">
                    {week.days.map((day, index) => {
                      const holiday = holidayOnDay.get(`${week.id}:${index}`);
                      const isToday = week.todayDay === index;
                      const className = [
                        holiday ? `is-holiday${holiday.weight === 'partial' ? ' is-holiday-partial' : ''}` : '',
                        isToday ? 'is-today' : ''
                      ].filter(Boolean).join(' ');
                      const title = [
                        isToday ? `Today · ${todayLabel}` : '',
                        holiday ? `${holiday.name} · ${holiday.note}` : ''
                      ].filter(Boolean).join(' · ');
                      return (
                        <span
                          key={`${week.id}-${index}`}
                          className={className || undefined}
                          title={title || undefined}
                        >
                          {day}
                        </span>
                      );
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {model.stages.map((stage) => {
            const selected = activeStageId === stage.id;
            const editing = editingId === stage.id;
            const canRename = stage.renameable && typeof onRenameGroup === 'function';
            const count = stage.total ? `${stage.complete}/${stage.total}` : '0';
            const isClose = stage.id === 'close';
            const placed = isClose ? dayMarker(stage.milestoneAt, weeks) : null;
            const diamond = placed
              ? { ...placed, label: `Close ${formatGanttDay(stage.milestoneAt)}` }
              : null;
            const hasSpan = stage.barStart != null && stage.barEnd != null && stage.barEnd > stage.barStart;
            const marker = stage.barStart != null && stage.barEnd != null && (!isClose || hasSpan)
              ? barSegments(stage.barStart, stage.barEnd, weeks)
              : [];
            const openName = () => {
              if (activeStageId !== stage.id) selectStage(stage);
              if (!canRename) return;
              console.log('[DdGantt] edit milestone name', stage.label);
              setEditingId(stage.id);
            };
            return (
              <div key={stage.id} className={`dd-gantt__stage dd-gantt__stage--${stage.kind || stage.id}${selected ? ' is-selected' : ''}`}>
                <div className="dd-gantt__line dd-gantt__line--mile">
                  <div className="dd-gantt__milebox">
                    {canRename ? (
                      <div className="dd-gantt__mile">
                        {editing ? (
                          <MilestoneName
                            stage={stage}
                            onRename={onRenameGroup}
                            onDone={() => setEditingId(null)}
                          />
                        ) : (
                          <button type="button" className="dd-gantt__mile-label" onClick={openName}>
                            {stage.label}
                          </button>
                        )}
                        <button
                          type="button"
                          className="dd-gantt__count"
                          aria-pressed={selected}
                          aria-label={`${count} tasks in ${stage.label}`}
                          onClick={() => selectStage(stage)}
                        >
                          {count}
                        </button>
                      </div>
                    ) : (
                    <button
                      type="button"
                      className="dd-gantt__mile"
                      aria-pressed={selected}
                      onClick={() => selectStage(stage)}
                    >
                      <span>{stage.label}</span>
                      <span className="dd-gantt__count">{count}</span>
                    </button>
                    )}
                  </div>
                  <Track weeks={weeks} segments={marker} diamond={diamond} holidays={holidays} />
                </div>
              </div>
            );
          })}
          {holidays.length > 0 ? (
            <div className="dd-gantt__holiday-layer">
              {holidays.map((holiday) => {
                const dateLabel = formatGanttDay(holiday.observedMs);
                return (
                  <span
                    key={holiday.key}
                    className={`dd-gantt__holiday-tag${holiday.weight === 'partial' ? ' dd-gantt__holiday-tag--partial' : ''}`}
                    style={{ left: `${holiday.left}%` }}
                    title={`${holiday.name} · ${dateLabel}${holiday.note ? ` · ${holiday.note}` : ''}`}
                  >
                    {holiday.name}
                    <span className="dd-gantt__holiday-tag-date"> · {dateLabel}</span>
                  </span>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
