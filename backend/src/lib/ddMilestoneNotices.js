/** Lead windows before a diligence milestone starts or ends. */
export const MILESTONE_LEAD_DAYS = [7, 3, 1];

export const STAGE_LABELS = {
  loi: 'LOI',
  diligence: 'Due Diligence',
  qoe: 'QofE',
  bank: 'Bank Underwriting',
  psa: 'PSA',
  custom: 'User submitted',
  close: 'Close Date'
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isoDay(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${value.getFullYear()}-${month}-${day}`;
  }
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function daysUntil(today, date) {
  const start = isoDay(today);
  const end = isoDay(date);
  if (!start || !end) return null;
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const from = Date.UTC(sy, sm - 1, sd);
  const to = Date.UTC(ey, em - 1, ed);
  return Math.round((to - from) / 86400000);
}

/**
 * 7, 3, or 1 day window. A missed morning still sends while the date is
 * inside that window and before the next shorter one.
 */
export function noticeWindow(days) {
  if (days == null || days <= 0) return null;
  if (days <= 1) return 1;
  if (days <= 3) return 3;
  if (days <= 7) return 7;
  return null;
}

export function formatNoticeDay(iso) {
  const day = isoDay(iso);
  if (!day) return '';
  const [, month, date] = day.split('-').map(Number);
  return `${MONTHS[month - 1]} ${date}`;
}

export function whenPhrase(days) {
  if (days === 1) return 'tomorrow';
  if (days === 7) return 'in 1 week';
  if (days === 3) return 'in 3 days';
  return `in ${days} days`;
}

/**
 * End is the milestone date on the chart.
 * Start is the previous milestone in calendar order (the handoff), or the
 * checklist start when this is the earliest date.
 */
export function milestoneEdges(milestones = [], startedOn = null) {
  const dated = (milestones || [])
    .map((row) => ({
      stageId: String(row?.stageId || row?.stage_id || ''),
      dueOn: isoDay(row?.dueOn || row?.due_on)
    }))
    .filter((row) => row.stageId && row.dueOn)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.stageId.localeCompare(b.stageId));

  const startFloor = isoDay(startedOn);
  const edges = [];
  dated.forEach((stage, index) => {
    const previous = index > 0 ? dated[index - 1].dueOn : null;
    const start = previous && previous < stage.dueOn
      ? previous
      : (startFloor && startFloor < stage.dueOn ? startFloor : null);
    if (start) edges.push({ stageId: stage.stageId, edge: 'start', on: start });
    edges.push({ stageId: stage.stageId, edge: 'end', on: stage.dueOn });
  });
  return edges;
}

export function noticesDue(edges, today) {
  return (edges || []).flatMap((edge) => {
    const remaining = daysUntil(today, edge.on);
    const leadDays = noticeWindow(remaining);
    if (!leadDays) return [];
    return [{ ...edge, leadDays, daysUntil: remaining }];
  });
}

export function noticeCopy({ stageId, edge, daysUntil: remaining, dealName, on }) {
  const label = STAGE_LABELS[stageId] || 'Milestone';
  const verb = edge === 'start' ? 'starts' : 'ends';
  const when = whenPhrase(remaining);
  const title = `${label} ${verb} ${when}`;
  const whenOn = formatNoticeDay(on);
  const body = [dealName, whenOn].filter(Boolean).join(' · ');
  return { title, body, label };
}
