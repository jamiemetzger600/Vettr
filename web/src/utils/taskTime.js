/** Local-day helpers for CRM task grouping and due labels. */

export function startOfLocalDay(date) {
  const x = new Date(date);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function taskBucket(task, now = new Date()) {
  if (task?.status === 'done') return 'done';
  if (!task?.due_at) return 'nodate';
  const due = startOfLocalDay(new Date(task.due_at));
  if (Number.isNaN(due.getTime())) return 'nodate';
  const today = startOfLocalDay(now);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'today';
  if (diffDays <= 7) return 'week';
  return 'later';
}

export function formatRelativeDue(dueAt, now = new Date()) {
  if (!dueAt) return { label: 'No date', tone: 'muted' };
  const due = startOfLocalDay(new Date(dueAt));
  if (Number.isNaN(due.getTime())) return { label: 'No date', tone: 'muted' };
  const today = startOfLocalDay(now);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return { label: n === 1 ? 'Yesterday' : `${n}d overdue`, tone: 'warn' };
  }
  if (diffDays === 0) return { label: 'Today', tone: 'today' };
  if (diffDays === 1) return { label: 'Tomorrow', tone: 'ok' };
  if (diffDays <= 7) {
    return { label: due.toLocaleDateString('en-US', { weekday: 'short' }), tone: 'ok' };
  }
  return {
    label: due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    tone: 'muted'
  };
}

export const TIME_SECTIONS = [
  { id: 'overdue', label: 'Overdue', warn: true },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'This week' },
  { id: 'later', label: 'Later' },
  { id: 'nodate', label: 'No date' },
  { id: 'done', label: 'Done' }
];

export function groupTasksByTime(tasks, now = new Date()) {
  const groups = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    nodate: [],
    done: []
  };
  for (const task of tasks || []) {
    const bucket = taskBucket(task, now);
    (groups[bucket] || groups.nodate).push(task);
  }
  return groups;
}

function dealUrgency(tasks, now = new Date()) {
  if (tasks.some((t) => taskBucket(t, now) === 'overdue')) return 0;
  if (tasks.some((t) => taskBucket(t, now) === 'today')) return 1;
  if (tasks.some((t) => taskBucket(t, now) === 'week')) return 2;
  return 3;
}

export function groupTasksByDeal(tasks, now = new Date()) {
  const map = new Map();
  for (const task of tasks || []) {
    const key = String(task.saved_deal_id ?? 'none');
    if (!map.has(key)) {
      map.set(key, {
        dealId: task.saved_deal_id,
        dealName: task.deal_name || 'Deal',
        tasks: []
      });
    }
    map.get(key).tasks.push(task);
  }
  return [...map.values()].sort((a, b) => {
    const urg = dealUrgency(a.tasks, now) - dealUrgency(b.tasks, now);
    if (urg !== 0) return urg;
    return String(a.dealName).localeCompare(String(b.dealName));
  });
}

export function shortAssignee(email) {
  if (!email) return '';
  return String(email).split('@')[0];
}

export function matchesTaskQuery(task, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  const hay = `${task.title || ''} ${task.deal_name || ''} ${shortAssignee(task.assignee_email)}`.toLowerCase();
  return hay.includes(q);
}
