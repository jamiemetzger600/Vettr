import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { crmAPI } from '../../utils/api';
import {
  addDays,
  allDayFormValues,
  allDayIsoRange,
  eventOnDay,
  formatAllDayLabel,
  formatDayLabel,
  formatTime,
  HOURS,
  monthMatrix,
  rangeForView,
  sameDay,
  startOfDay,
  startOfWeek,
  toDatetimeLocalValue
} from '../../utils/calendarUtils';

const VIEWS = ['month', 'week', 'day'];
/** Native `title` tooltips wait ~1s. Half that. */
const HOVER_TIP_MS = 500;

function formatEventWhen({ startsAt, endsAt, allDay }) {
  if (allDay) return formatAllDayLabel(startsAt);
  const start = new Date(startsAt);
  const datePart = start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  return `${datePart} · ${formatTime(startsAt)} – ${formatTime(endsAt)}`;
}

function placePopover(anchor) {
  const width = Math.min(400, window.innerWidth - 24);
  const estH = 320;
  if (!anchor) {
    return {
      top: Math.max(12, (window.innerHeight - estH) / 2),
      left: Math.max(12, (window.innerWidth - width) / 2),
      width
    };
  }
  let left = anchor.left;
  let top = anchor.bottom + 8;
  if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
  if (left < 12) left = 12;
  if (top + estH > window.innerHeight - 12) top = Math.max(12, anchor.top - estH - 8);
  return { top, left, width };
}

function IconBtn({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className="crm-cal-pop__icon"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function EventChip({ event, onClick, onTip }) {
  const sourceClass = event.source === 'google' ? 'crm-cal-event--google' : 'crm-cal-event--vettr';
  const time = event.allDay ? '' : formatTime(event.startsAt);
  const tip = time ? `${time} · ${event.title}` : event.title;
  const timerRef = useRef(null);

  const clearTip = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onTip?.(null);
  };

  return (
    <button
      type="button"
      className={`crm-cal-event ${sourceClass}`}
      onMouseEnter={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const text = tip;
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          onTip?.({ text, x: rect.left, y: rect.bottom });
        }, HOVER_TIP_MS);
      }}
      onMouseLeave={clearTip}
      onClick={(e) => {
        clearTip();
        e.stopPropagation();
        onClick?.(event, e.currentTarget);
      }}
    >
      {time ? <span className="crm-cal-event__time">{time}</span> : null}
      <span className="crm-cal-event__title">{event.title}</span>
    </button>
  );
}

function cellKeyDown(e, fn) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  fn();
}

export default function CrmCalendarView({ onDisconnect, disconnecting, onOpenDeal }) {
  const [view, setView] = useState('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hoverTip, setHoverTip] = useState(null);

  const range = useMemo(() => rangeForView(view, anchor), [view, anchor]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmAPI.getCalendarEvents(range.start.toISOString(), range.end.toISOString());
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message || 'Failed to load calendar');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [range.start, range.end]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      const data = await crmAPI.syncCalendar(range.start.toISOString(), range.end.toISOString());
      setEvents(data.events || []);
    } catch (err) {
      setError(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const shiftAnchor = (delta) => {
    if (view === 'month') setAnchor((d) => addDays(startOfDay(d), delta * 30));
    else if (view === 'week') setAnchor((d) => addDays(d, delta * 7));
    else setAnchor((d) => addDays(d, delta));
  };

  const openCreate = (day, hour = 9, el) => {
    const start = new Date(day);
    if (view !== 'month') start.setHours(hour, 0, 0, 0);
    else start.setHours(9, 0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const rect = el?.getBoundingClientRect?.();
    setHoverTip(null);
    console.debug('[CrmCalendar] open create popover', { day: start.toISOString() });
    setModal({
      mode: 'create',
      title: '',
      description: '',
      startsAt: toDatetimeLocalValue(start),
      endsAt: toDatetimeLocalValue(end),
      allDay: view === 'month',
      anchor: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null
    });
  };

  const openEdit = (event, el) => {
    const rect = el?.getBoundingClientRect?.();
    setHoverTip(null);
    console.debug('[CrmCalendar] open event popover', {
      id: event.id,
      source: event.source,
      taskId: event.taskId,
      savedDealId: event.savedDealId,
      allDay: event.allDay,
      startsAt: event.startsAt
    });
    const times = event.allDay
      ? allDayFormValues(event.startsAt, event.endsAt)
      : {
          startsAt: toDatetimeLocalValue(event.startsAt),
          endsAt: toDatetimeLocalValue(event.endsAt)
        };
    setModal({
      mode: 'view',
      id: event.id,
      title: event.title,
      description: event.description || '',
      startsAt: times.startsAt,
      endsAt: times.endsAt,
      allDay: event.allDay,
      source: event.source,
      taskId: event.taskId || null,
      savedDealId: event.savedDealId || null,
      dealName: event.dealName || null,
      anchor: rect ? { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right } : null
    });
  };

  const handleSave = async () => {
    if (!modal?.title?.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const times = modal.allDay
        ? allDayIsoRange(modal.startsAt, modal.endsAt)
        : {
            startsAt: new Date(modal.startsAt).toISOString(),
            endsAt: new Date(modal.endsAt).toISOString()
          };
      const payload = {
        title: modal.title.trim(),
        description: modal.description,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        allDay: modal.allDay
      };
      console.debug('[CrmCalendar] save event', {
        allDay: modal.allDay,
        localStarts: modal.startsAt,
        localEnds: modal.endsAt,
        payloadStarts: payload.startsAt,
        payloadEnds: payload.endsAt
      });
      if (modal.mode === 'create') {
        await crmAPI.createCalendarEvent(payload);
      } else if (modal.mode === 'edit' && modal.id) {
        await crmAPI.updateCalendarEvent(modal.id, payload);
      } else {
        return;
      }
      setModal(null);
      await loadEvents();
    } catch (err) {
      setError(err.message || 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!modal?.id || !window.confirm('Delete this event?')) return;
    setSaving(true);
    try {
      await crmAPI.deleteCalendarEvent(modal.id);
      setModal(null);
      await loadEvents();
    } catch (err) {
      setError(err.message || 'Failed to delete event');
    } finally {
      setSaving(false);
    }
  };

  const openLinkedRecord = () => {
    const dealId = modal?.savedDealId;
    if (!dealId || !onOpenDeal) return;
    console.debug('[CrmCalendar] open linked deal', { dealId, taskId: modal.taskId });
    setModal(null);
    onOpenDeal(dealId, { focusSection: 'crm-followup', openRecord: true });
  };

  useEffect(() => {
    if (!modal) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) setModal(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, saving]);

  const titleLabel = useMemo(() => {
    if (view === 'day') return formatDayLabel(anchor);
    if (view === 'week') {
      const start = startOfWeek(anchor);
      const end = addDays(start, 6);
      return `${formatDayLabel(start)} – ${formatDayLabel(end)}`;
    }
    return anchor.toLocaleDateString([], { month: 'long', year: 'numeric' });
  }, [view, anchor]);

  const monthWeeks = useMemo(() => (view === 'month' ? monthMatrix(anchor) : []), [view, anchor]);
  const weekDays = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);

  return (
    <div className="crm-calendar-view">
      <header className="crm-calendar-view__toolbar">
        <div className="crm-calendar-view__nav">
          <button type="button" className="btn-secondary" onClick={() => shiftAnchor(-1)}>←</button>
          <button type="button" className="btn-secondary" onClick={() => setAnchor(new Date())}>Today</button>
          <button type="button" className="btn-secondary" onClick={() => shiftAnchor(1)}>→</button>
          <h3 className="crm-calendar-view__title">{titleLabel}</h3>
        </div>
        <div className="crm-calendar-view__actions">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={`crm-chip${view === v ? ' crm-chip--active' : ''}`}
              onClick={() => setView(v)}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
          <button type="button" className="btn-secondary" disabled={syncing} onClick={handleSync}>
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => openCreate(anchor)}>
            + Event
          </button>
          <button type="button" className="btn-secondary" disabled={disconnecting} onClick={onDisconnect}>
            Disconnect
          </button>
        </div>
      </header>

      <p className="crm-muted crm-calendar-view__legend">
        <span className="crm-cal-legend crm-cal-event--vettr">Vettr</span>
        <span className="crm-cal-legend crm-cal-event--google">Google</span>
        Events sync both ways — create in Vettr or Google, then click Sync now.
      </p>

      {error ? <p className="crm-panel--error">{error}</p> : null}
      {loading ? <p className="crm-panel">Loading events…</p> : null}

      {!loading && view === 'month' ? (
        <div className="crm-cal-month">
          <div className="crm-cal-month__head">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="crm-cal-month__dow">{d}</div>
            ))}
          </div>
          {monthWeeks.map((week, wi) => (
            <div key={wi} className="crm-cal-month__row">
              {week.map((day) => {
                const dayEvents = events.filter((e) => eventOnDay(e, day));
                const muted = day.getMonth() !== anchor.getMonth();
                return (
                  <div
                    key={day.toISOString()}
                    role="button"
                    tabIndex={0}
                    className={`crm-cal-month__cell${muted ? ' crm-cal-month__cell--muted' : ''}${sameDay(day, new Date()) ? ' crm-cal-month__cell--today' : ''}`}
                    onClick={(e) => openCreate(day, 9, e.currentTarget)}
                    onKeyDown={(e) => cellKeyDown(e, () => openCreate(day))}
                  >
                    <span className="crm-cal-month__date">{day.getDate()}</span>
                    <div className="crm-cal-month__events">
                      {dayEvents.slice(0, 3).map((ev) => (
                        <EventChip key={ev.id} event={ev} onClick={openEdit} onTip={setHoverTip} />
                      ))}
                      {dayEvents.length > 3 ? (
                        <span className="crm-cal-month__more">+{dayEvents.length - 3} more</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {!loading && view === 'week' ? (
        <div className="crm-cal-week">
          <div className="crm-cal-week__head">
            <div className="crm-cal-week__gutter" />
            {weekDays.map((day) => (
              <div key={day.toISOString()} className={`crm-cal-week__dayhead${sameDay(day, new Date()) ? ' crm-cal-week__dayhead--today' : ''}`}>
                {formatDayLabel(day)}
              </div>
            ))}
          </div>
          <div className="crm-cal-week__body">
            <div className="crm-cal-week__hours">
              {HOURS.map((h) => (
                <div key={h} className="crm-cal-week__hour">{h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`}</div>
              ))}
            </div>
            {weekDays.map((day) => (
              <div key={day.toISOString()} className="crm-cal-week__col">
                {HOURS.map((h) => {
                  const slotEvents = events.filter((e) => {
                    if (!eventOnDay(e, day) || e.allDay) return false;
                    const start = new Date(e.startsAt);
                    return start.getHours() === h;
                  });
                  return (
                    <div
                      key={h}
                      role="button"
                      tabIndex={0}
                      className="crm-cal-week__slot"
                      onClick={(e) => openCreate(day, h, e.currentTarget)}
                      onKeyDown={(e) => cellKeyDown(e, () => openCreate(day, h))}
                    >
                      {slotEvents.map((ev) => (
                        <EventChip key={ev.id} event={ev} onClick={openEdit} onTip={setHoverTip} />
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!loading && view === 'day' ? (
        <div className="crm-cal-day">
          {HOURS.map((h) => {
            const slotEvents = events.filter((e) => {
              if (!eventOnDay(e, anchor) || e.allDay) return false;
              return new Date(e.startsAt).getHours() === h;
            });
            return (
              <div
                key={h}
                role="button"
                tabIndex={0}
                className="crm-cal-day__row"
                onClick={(e) => openCreate(anchor, h, e.currentTarget)}
                onKeyDown={(e) => cellKeyDown(e, () => openCreate(anchor, h))}
              >
                <span className="crm-cal-day__hour">{h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</span>
                <div className="crm-cal-day__slot">
                  {slotEvents.map((ev) => (
                    <EventChip key={ev.id} event={ev} onClick={openEdit} onTip={setHoverTip} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {hoverTip ? (
        <div className="crm-cal-tip" style={{ top: hoverTip.y + 6, left: hoverTip.x }}>
          {hoverTip.text}
        </div>
      ) : null}

      {modal ? (
        <div className="crm-cal-pop-backdrop" onClick={() => !saving && setModal(null)}>
          <div
            className="crm-cal-pop"
            style={placePopover(modal.anchor)}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={modal.mode === 'create' ? 'New event' : modal.title || 'Event'}
          >
            <div className="crm-cal-pop__toolbar">
              {modal.mode === 'view' ? (
                <IconBtn
                  label="Edit"
                  disabled={saving}
                  onClick={() => setModal({ ...modal, mode: 'edit' })}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </IconBtn>
              ) : null}
              {modal.id ? (
                <IconBtn label="Delete" disabled={saving} onClick={handleDelete}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                  </svg>
                </IconBtn>
              ) : null}
              <IconBtn label="Close" disabled={saving} onClick={() => setModal(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </IconBtn>
            </div>

            {modal.mode === 'view' ? (
              <div className="crm-cal-pop__body">
                <div className="crm-cal-pop__title-row">
                  <span className={`crm-cal-pop__swatch ${modal.source === 'google' ? 'crm-cal-pop__swatch--google' : 'crm-cal-pop__swatch--vettr'}`} />
                  <div>
                    <h3 className="crm-cal-pop__title">{modal.title}</h3>
                    <p className="crm-cal-pop__when">{formatEventWhen(modal)}</p>
                  </div>
                </div>
                {modal.description || modal.savedDealId ? (
                  <div className="crm-cal-pop__row">
                    <span className="crm-cal-pop__row-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 6h13" />
                        <path d="M8 12h13" />
                        <path d="M8 18h13" />
                        <path d="M3 6h.01" />
                        <path d="M3 12h.01" />
                        <path d="M3 18h.01" />
                      </svg>
                    </span>
                    {modal.savedDealId && onOpenDeal ? (
                      <button
                        type="button"
                        className="crm-cal-pop__desc crm-cal-pop__desc--link"
                        onClick={openLinkedRecord}
                      >
                        {modal.description || modal.dealName || 'Open deal'}
                        {modal.dealName ? (
                          <span className="crm-cal-pop__desc-sub">{modal.dealName}</span>
                        ) : null}
                      </button>
                    ) : (
                      <p className="crm-cal-pop__desc">{modal.description}</p>
                    )}
                  </div>
                ) : null}
                <div className="crm-cal-pop__row">
                  <span className="crm-cal-pop__row-icon" aria-hidden="true">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4" />
                      <path d="M8 2v4" />
                      <path d="M3 10h18" />
                    </svg>
                  </span>
                  <p className="crm-cal-pop__calname">{modal.source === 'google' ? 'Google' : 'Vettr'}</p>
                </div>
              </div>
            ) : (
              <div className="crm-cal-pop__form">
                <label className="crm-cal-field">
                  Title
                  <input className="crm-cal-pop__input" value={modal.title} onChange={(e) => setModal({ ...modal, title: e.target.value })} />
                </label>
                <label className="crm-cal-field">
                  Description
                  <textarea className="crm-cal-pop__input" rows={2} value={modal.description} onChange={(e) => setModal({ ...modal, description: e.target.value })} />
                </label>
                <label className="crm-cal-field crm-cal-field--inline">
                  <input type="checkbox" checked={modal.allDay} onChange={(e) => setModal({ ...modal, allDay: e.target.checked })} />
                  All day
                </label>
                <label className="crm-cal-field">
                  Starts
                  <input type="datetime-local" className="crm-cal-pop__input" value={modal.startsAt} onChange={(e) => setModal({ ...modal, startsAt: e.target.value })} />
                </label>
                <label className="crm-cal-field">
                  Ends
                  <input type="datetime-local" className="crm-cal-pop__input" value={modal.endsAt} onChange={(e) => setModal({ ...modal, endsAt: e.target.value })} />
                </label>
                {modal.source === 'google' ? (
                  <p className="crm-muted">Edits sync back to Google.</p>
                ) : null}
                <div className="crm-cal-pop__actions">
                  <button type="button" className="btn-primary" disabled={saving || !modal.title.trim()} onClick={handleSave}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={saving}
                    onClick={() => (modal.id ? setModal({ ...modal, mode: 'view' }) : setModal(null))}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
