/** Finish-to-start links between due diligence items. */

export function isUnblocking(status) {
  return status === 'complete' || status === 'na';
}

export function statusRequiresPredecessors(status) {
  return status === 'in_progress' || status === 'complete';
}

/**
 * True when predecessor → successor would close a loop, including a self-link.
 * Edges point from the task that must finish to the task that may start.
 */
export function wouldCreateCycle(edges, predecessorId, successorId) {
  const predecessor = Number(predecessorId);
  const successor = Number(successorId);
  if (!predecessor || !successor || predecessor === successor) return true;

  const next = new Map();
  for (const edge of edges || []) {
    const from = Number(edge.predecessorId);
    const to = Number(edge.successorId);
    if (!from || !to) continue;
    if (!next.has(from)) next.set(from, []);
    next.get(from).push(to);
  }

  const stack = [successor];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (id === predecessor) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of next.get(id) || []) stack.push(child);
  }
  return false;
}

export function blockedPredecessors(successorId, edges, itemsById) {
  const id = Number(successorId);
  const blocked = [];
  for (const edge of edges || []) {
    if (Number(edge.successorId) !== id) continue;
    const item = itemsById.get(Number(edge.predecessorId));
    if (!item || isUnblocking(item.status)) continue;
    blocked.push(item);
  }
  return blocked;
}

function forwardDeltaMs(previousDue, nextDue) {
  if (previousDue == null || nextDue == null || nextDue === '') return 0;
  const previous = new Date(previousDue).getTime();
  const next = new Date(nextDue).getTime();
  if (!Number.isFinite(previous) || !Number.isFinite(next) || next <= previous) return 0;
  return next - previous;
}

/**
 * Push successor due dates by the same forward offset as a predecessor.
 * Items in `changes` keep the date the user set. Undated successors are skipped.
 * Walks the whole finish-to-start chain. The largest forward shift wins.
 */
export function cascadeDueShifts({ dues, edges, changes }) {
  const changed = new Set((changes || []).map((change) => Number(change.id)));
  const next = new Map();
  for (const edge of edges || []) {
    const from = Number(edge.predecessorId);
    const to = Number(edge.successorId);
    if (!from || !to) continue;
    if (!next.has(from)) next.set(from, []);
    next.get(from).push(to);
  }

  const extra = new Map();
  for (const change of changes || []) {
    const delta = forwardDeltaMs(change.previousDue, change.nextDue);
    if (delta <= 0) continue;
    const queue = [...(next.get(Number(change.id)) || [])];
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id) || changed.has(id)) continue;
      seen.add(id);
      extra.set(id, Math.max(extra.get(id) || 0, delta));
      for (const child of next.get(id) || []) queue.push(child);
    }
  }

  const updates = [];
  for (const [id, delta] of extra) {
    const due = dues?.get(id) ?? dues?.get(String(id));
    if (due == null || due === '') continue;
    const ms = new Date(due).getTime();
    if (!Number.isFinite(ms)) continue;
    updates.push({ id, dueAt: new Date(ms + delta).toISOString() });
  }
  return updates;
}
