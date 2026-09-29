export function blockedBy(item) {
  return Array.isArray(item?.blockedBy) ? item.blockedBy : [];
}

export function blockedLabel(item) {
  const rows = blockedBy(item);
  if (!rows.length) return '';
  if (rows.length === 1) return `Blocked by ${rows[0].title}`;
  return `Blocked by ${rows.length} tasks`;
}

export function blockedTooltip(item) {
  const rows = blockedBy(item);
  if (!rows.length) return '';
  return `Finish first: ${rows.map((row) => row.title).join(', ')}`;
}

export function canSetStatus(item, status) {
  if (status !== 'in_progress' && status !== 'complete') return true;
  return blockedBy(item).length === 0;
}
