/** Stage lanes for the diligence Gantt. Close Date is last: it ends the transaction. */
export const GANTT_STAGES = [
  { id: 'loi', label: 'LOI' },
  { id: 'psa', label: 'PSA' },
  { id: 'diligence', label: 'Due Diligence' },
  { id: 'qoe', label: 'QofE' },
  { id: 'bank', label: 'Bank Underwriting' },
  { id: 'custom', label: 'User submitted' },
  { id: 'close', label: 'Close Date' }
];

const DAY = 24 * 60 * 60 * 1000;

const STANDARD_DILIGENCE = new Set([
  'tax',
  'legal & corporate',
  'operations',
  'hr & benefits',
  'real estate & facilities',
  'it & systems',
  'customer & revenue',
  'licenses & permits',
  'regulatory & compliance',
  'insurance'
]);

export function stageIdForGroup(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return 'custom';
  if (/qoe|qofe|quality of earnings|\bfinancial\b/.test(n)) return 'qoe';
  if (/\bloi\b|letter of intent/.test(n)) return 'loi';
  if (/\bsba\b|\bbank\b|underwriting|\blender\b/.test(n)) return 'bank';
  if (/\bpsa\b|purchase and sale|purchase & sale|asset purchase/.test(n)) return 'psa';
  if (/close date|\bclosing\b|\bclose\b/.test(n)) return 'close';
  if (STANDARD_DILIGENCE.has(n)) return 'diligence';
  return 'custom';
}

export function toDayMs(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).getTime();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function assigneeLabel(item) {
  const person = item?.assignees?.[0];
  const name = String(person?.name || person?.email || '').trim();
  return name || '';
}

function taskFromItem(item, group) {
  const status = item.status || 'not_started';
  const settled = status === 'complete' || status === 'na';
  const predecessors = item.predecessors || [];
  const predDues = predecessors.map((row) => toDayMs(row.dueAt || row.due_at)).filter((due) => due != null);
  return {
    id: item.id,
    title: item.title || 'Untitled',
    groupName: group.name || '',
    due: toDayMs(item.due_at),
    status,
    assignee: assigneeLabel(item),
    docNeeded: Boolean(item.requests_document) && !settled && !(item.documents || []).length,
    milestone: false,
    blocked: Boolean(item.blocked),
    after: predecessors.map((row) => row.title).filter(Boolean),
    waitUntil: predDues.length ? Math.max(...predDues) : null
  };
}

function stageTone(tasks, today) {
  const work = tasks.filter((task) => !task.milestone);
  const open = work.filter((task) => task.status !== 'complete' && task.status !== 'na');
  if (work.length && open.length === 0) return 'complete';
  if (open.some((task) => task.due != null && task.due < today)) return 'overdue';
  if (open.some((task) => task.status === 'in_progress' || task.status === 'blocked' || task.status === 'waiting_on_other')) {
    return 'active';
  }
  return 'idle';
}

export function viewerTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
}

export function localTodayMs(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function buildGanttModel({
  groups = [],
  startedAt = null,
  targetDate = null,
  milestones = [],
  today = new Date()
} = {}) {
  const buckets = new Map(GANTT_STAGES.map((stage) => [stage.id, []]));
  for (const group of groups) {
    const stageId = stageIdForGroup(group.name);
    const tasks = (group.items || []).map((item) => taskFromItem(item, group));
    buckets.get(stageId).push(...tasks);
  }

  const targetMs = toDayMs(targetDate);
  if (targetMs != null) {
    buckets.get('close').push({
      id: 'target-close',
      title: 'Target close',
      groupName: 'Close Date',
      due: targetMs,
      status: 'not_started',
      assignee: '',
      docNeeded: false,
      milestone: true
    });
  }

  const todayMs = localTodayMs(today);
  const milestoneByStage = new Map(
    (milestones || [])
      .filter((row) => row?.dueOn)
      .map((row) => [row.stageId, String(row.dueOn).slice(0, 10)])
  );
  if (targetDate && !milestoneByStage.has('close')) {
    milestoneByStage.set('close', String(targetDate).slice(0, 10));
  }
  const stages = GANTT_STAGES.map((stage) => {
    const tasks = buckets.get(stage.id);
    const work = tasks.filter((task) => !task.milestone);
    const dues = tasks.map((task) => task.due).filter((due) => due != null);
    const complete = work.filter((task) => task.status === 'complete' || task.status === 'na').length;
    const dueOn = milestoneByStage.get(stage.id) || '';
    const milestoneAt = dueOn ? toDayMs(dueOn) : null;
    let start = dues.length ? Math.min(...dues) : null;
    let end = dues.length ? Math.max(...dues) : null;
    if (milestoneAt != null) {
      start = milestoneAt;
      end = milestoneAt;
    }
    return {
      ...stage,
      tasks,
      total: work.length,
      complete,
      dueOn,
      milestoneAt,
      start,
      end,
      tone: stageTone(tasks, todayMs)
    };
  });

  const closeMs = stages.find((stage) => stage.id === 'close')?.milestoneAt ?? targetMs;
  const milestoneTimes = stages.map((stage) => stage.milestoneAt).filter((ms) => ms != null);
  const latestMilestone = milestoneTimes.length ? Math.max(...milestoneTimes) : null;
  const rangeStart = todayMs;
  let rangeEnd = closeMs != null && closeMs > todayMs ? closeMs : null;
  if (rangeEnd == null && latestMilestone != null && latestMilestone > todayMs) {
    rangeEnd = latestMilestone;
  }
  if (rangeEnd == null || rangeEnd <= rangeStart) {
    rangeEnd = rangeStart + 60 * DAY;
  }

  return { stages, rangeStart, rangeEnd, todayMs, closeMs };
}

export function barStyle(start, end, rangeStart, rangeEnd) {
  if (start == null || rangeEnd <= rangeStart) return null;
  const span = rangeEnd - rangeStart;
  const finish = end == null ? start + DAY : Math.max(end, start) + DAY;
  const left = ((start - rangeStart) / span) * 100;
  const width = ((finish - start) / span) * 100;
  const clampedLeft = Math.max(0, Math.min(left, 99));
  return {
    left: `${clampedLeft.toFixed(2)}%`,
    width: `${Math.max(0.8, Math.min(width, 100 - clampedLeft)).toFixed(2)}%`
  };
}

/**
 * Timeline reads left to right: Today, then dated milestones, then Close.
 * Milestones that share a date stack onto a second label row.
 */
export function milestoneHeaders(stages, rangeStart, rangeEnd, todayMs = rangeStart) {
  const span = rangeEnd - rangeStart;
  if (span <= 0) return [];
  const headers = [{
    id: 'today',
    label: 'Today',
    date: formatGanttDay(todayMs),
    left: '0%',
    align: 'start',
    lane: 0
  }];

  const endStage = (stages || []).find((stage) => (
    stage.milestoneAt != null && Math.abs(stage.milestoneAt - rangeEnd) < DAY
  ));
  const mids = [];
  for (const stage of stages || []) {
    if (stage.milestoneAt == null) continue;
    if (endStage && stage.id === endStage.id) continue;
    const ratio = (stage.milestoneAt - rangeStart) / span;
    const clamped = Math.min(0.96, Math.max(0.04, ratio));
    mids.push({
      id: stage.id,
      label: stage.label,
      date: formatGanttDay(stage.milestoneAt),
      ratio: clamped,
      left: `${(clamped * 100).toFixed(2)}%`,
      align: 'center',
      lane: 0
    });
  }
  mids.sort((a, b) => a.ratio - b.ratio);
  let previous = -1;
  for (const header of mids) {
    const crowded = previous >= 0 && header.ratio - previous < 0.16;
    const nearEnd = header.ratio > 0.82;
    header.lane = crowded || nearEnd ? 1 : 0;
    previous = header.ratio;
  }
  headers.push(...mids);

  const endIsClose = !endStage || endStage.id === 'close';
  headers.push({
    id: endStage?.id || 'close',
    label: endIsClose ? 'Close' : endStage.label,
    date: formatGanttDay(rangeEnd),
    left: '100%',
    align: 'end',
    lane: 0
  });
  return headers;
}

export function stageBar(milestoneAt, rangeStart, rangeEnd) {
  if (milestoneAt == null || rangeEnd <= rangeStart) return null;
  const end = Math.min(Math.max(milestoneAt, rangeStart), rangeEnd);
  return barStyle(rangeStart, end, rangeStart, rangeEnd);
}

export function monthTicks(rangeStart, rangeEnd) {
  const ticks = [];
  const span = rangeEnd - rangeStart;
  if (span <= 0) return ticks;
  const cursor = new Date(rangeStart);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  if (cursor.getTime() < rangeStart) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.getTime() <= rangeEnd && ticks.length < 18) {
    ticks.push({
      label: cursor.toLocaleDateString('en-US', { month: 'short' }),
      left: `${(((cursor.getTime() - rangeStart) / span) * 100).toFixed(2)}%`
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

export function formatGanttDay(ms) {
  if (ms == null) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const WEEK = 7 * DAY;
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F'];

function mondayOf(ms) {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + delta);
  return date.getTime();
}

function weekLabel(mondayMs) {
  const monday = new Date(mondayMs);
  const friday = new Date(mondayMs + 4 * DAY);
  const month = monday.toLocaleDateString('en-US', { month: 'short' });
  if (monday.getMonth() === friday.getMonth()) {
    return `${month} ${monday.getDate()}-${friday.getDate()}`;
  }
  const fridayMonth = friday.toLocaleDateString('en-US', { month: 'short' });
  return `${month} ${monday.getDate()} – ${fridayMonth} ${friday.getDate()}`;
}

/** Monday–Friday columns from the timeline, at least eight weeks so a month reads as four weeks. */
export function weekColumns(rangeStart, rangeEnd, todayMs = rangeStart) {
  const origin = mondayOf(rangeStart || Date.now());
  const lastNeeded = Math.max(rangeEnd || origin, origin + 7 * WEEK);
  const weeks = [];
  const monthIndex = new Map();
  let cursor = origin;
  while (cursor <= lastNeeded && weeks.length < 36) {
    const monday = new Date(cursor);
    const monthKey = `${monday.getFullYear()}-${monday.getMonth()}`;
    if (!monthIndex.has(monthKey)) monthIndex.set(monthKey, monthIndex.size % 6);
    weeks.push({
      id: `${monthKey}-${monday.getDate()}`,
      start: cursor,
      label: weekLabel(cursor),
      monthKey,
      month: monthIndex.get(monthKey),
      days: WEEKDAY_LETTERS,
      today: todayMs >= cursor && todayMs < cursor + WEEK
    });
    cursor += WEEK;
  }
  return weeks;
}

/** Checklist bars cover two to four weeks and finish on the due date. */
export function taskSpan(task) {
  if (task?.due == null) return null;
  const end = task.due;
  if (task.waitUntil != null && task.waitUntil < end) {
    const gap = end - task.waitUntil;
    if (gap >= 2 * DAY && gap <= 28 * DAY) return { start: task.waitUntil + DAY, end };
  }
  return { start: end - 14 * DAY, end };
}

/** Split a bar on week boundaries so each piece takes that week's month color. */
export function barSegments(startMs, endMs, weeks) {
  if (startMs == null || endMs == null || !weeks?.length) return [];
  const origin = weeks[0].start;
  const slots = weeks.length * 5;
  const slotAt = (ms) => {
    const delta = ms - origin;
    const weekIndex = Math.floor(delta / WEEK);
    const dayOffset = Math.floor((delta - weekIndex * WEEK) / DAY);
    const weekday = Math.min(4, Math.max(0, dayOffset));
    return Math.min(slots, Math.max(0, weekIndex * 5 + weekday));
  };
  const from = slotAt(Math.min(startMs, endMs));
  const to = Math.min(slots, slotAt(Math.max(startMs, endMs)) + 1);
  if (to <= from) return [];
  const segments = [];
  for (let i = 0; i < weeks.length; i += 1) {
    const cellStart = i * 5;
    const cellEnd = cellStart + 5;
    const segFrom = Math.max(from, cellStart);
    const segTo = Math.min(to, cellEnd);
    if (segTo <= segFrom) continue;
    segments.push({
      key: `${weeks[i].id}-${segFrom}`,
      month: weeks[i].month,
      left: (segFrom / slots) * 100,
      width: Math.max(((segTo - segFrom) / slots) * 100, 0.6)
    });
  }
  return segments;
}
