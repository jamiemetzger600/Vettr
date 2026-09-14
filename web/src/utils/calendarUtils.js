export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function endOfDay(date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function startOfWeek(date, weekStartsOn = 0) {
  const d = startOfDay(date);
  const start = Number(weekStartsOn) === 1 ? 1 : 0;
  const offset = (d.getDay() - start + 7) % 7;
  d.setDate(d.getDate() - offset);
  return d;
}

export function endOfWeek(date, weekStartsOn = 0) {
  const d = startOfWeek(date, weekStartsOn);
  d.setDate(d.getDate() + 7);
  d.setMilliseconds(-1);
  return d;
}

export function startOfMonth(date) {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

export function endOfMonth(date) {
  const d = startOfMonth(date);
  d.setMonth(d.getMonth() + 1);
  d.setMilliseconds(-1);
  return d;
}

export function monthMatrix(anchorDate, weekStartsOn = 0) {
  const start = startOfWeek(startOfMonth(anchorDate), weekStartsOn);
  const weeks = [];
  let cursor = new Date(start);
  for (let w = 0; w < 6; w += 1) {
    const week = [];
    for (let d = 0; d < 7; d += 1) {
      week.push(new Date(cursor));
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

export function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatDayLabel(date) {
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function toDatetimeLocalValue(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** YYYY-MM-DD from a datetime-local value or ISO string — never timezone-shifted. */
export function civilDateFromValue(value) {
  const m = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function addCivilDays(yyyyMmDd, days) {
  const d = new Date(`${yyyyMmDd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive local dates → UTC midnight start + exclusive end (Google all-day). */
export function allDayIsoRange(startsLocal, endsLocal) {
  const start = civilDateFromValue(startsLocal);
  let lastInclusive = civilDateFromValue(endsLocal) || start;
  if (!start) return { startsAt: '', endsAt: '' };
  if (lastInclusive < start) lastInclusive = start;
  return {
    startsAt: `${start}T00:00:00.000Z`,
    endsAt: `${addCivilDays(lastInclusive, 1)}T00:00:00.000Z`
  };
}

/** Stored all-day (exclusive end) → datetime-local values on the civil date. */
export function allDayFormValues(startsAt, endsAt) {
  const start = civilDateFromValue(startsAt);
  const endExcl = civilDateFromValue(endsAt);
  const lastInclusive = !endExcl || endExcl <= start ? start : addCivilDays(endExcl, -1);
  return {
    startsAt: start ? `${start}T00:00` : '',
    endsAt: lastInclusive ? `${lastInclusive}T00:00` : ''
  };
}

export function formatAllDayLabel(startsAt) {
  const [y, m, d] = civilDateFromValue(startsAt).split('-').map(Number);
  if (!y || !m || !d) return '';
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

export function rangeForView(view, anchorDate, weekStartsOn = 0) {
  if (view === 'day') {
    return { start: startOfDay(anchorDate), end: endOfDay(anchorDate) };
  }
  if (view === 'week') {
    return { start: startOfWeek(anchorDate, weekStartsOn), end: endOfWeek(anchorDate, weekStartsOn) };
  }
  const monthStart = startOfMonth(anchorDate);
  const monthEnd = endOfMonth(anchorDate);
  return {
    start: startOfWeek(monthStart, weekStartsOn),
    end: endOfWeek(monthEnd, weekStartsOn)
  };
}

export function eventOnDay(event, day) {
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  if (event.allDay) {
    const start = civilDateFromValue(event.startsAt);
    let endExcl = civilDateFromValue(event.endsAt);
    if (!start) return false;
    if (!endExcl || endExcl <= start) endExcl = addCivilDays(start, 1);
    return dayKey >= start && dayKey < endExcl;
  }
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return start <= dayEnd && end >= dayStart;
}

export const HOURS = Array.from({ length: 24 }, (_, i) => i);

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function weekStartsOnFromPrefs(preferences) {
  return Number(preferences?.calendarWeekStartsOn) === 1 ? 1 : 0;
}

export function weekdayLabels(weekStartsOn = 0) {
  const start = Number(weekStartsOn) === 1 ? 1 : 0;
  return Array.from({ length: 7 }, (_, i) => DOW_SHORT[(start + i) % 7]);
}
