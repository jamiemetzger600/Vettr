/** Geometry + selection helpers for DD card/list bulk select. */

export function marqueeRectFromPoints(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  return {
    left,
    top,
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y)
  };
}

export function rectsIntersect(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function idsIntersectingMarquee(itemRects, marquee) {
  if (!marquee || marquee.right - marquee.left < 1 || marquee.bottom - marquee.top < 1) {
    return [];
  }
  const hits = [];
  for (const row of itemRects) {
    if (rectsIntersect(row.rect, marquee)) hits.push(String(row.id));
  }
  return hits;
}

export function rangeIds(orderedIds, fromId, toId) {
  const ordered = orderedIds.map(String);
  const a = ordered.indexOf(String(fromId));
  const b = ordered.indexOf(String(toId));
  if (a < 0 && b < 0) return [];
  if (a < 0) return [String(toId)];
  if (b < 0) return [String(fromId)];
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  return ordered.slice(start, end + 1);
}

export function applyClickSelection(prev, orderedIds, id, { shift = false, meta = false, anchorId = null } = {}) {
  const key = String(id);
  if (shift && anchorId) {
    return new Set(rangeIds(orderedIds, anchorId, key));
  }
  if (meta) {
    const next = new Set([...prev].map(String));
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }
  return new Set([key]);
}

export function mergeMarqueeSelection(prev, ids, additive) {
  const incoming = ids.map(String);
  if (additive) {
    const next = new Set([...prev].map(String));
    incoming.forEach((id) => next.add(id));
    return next;
  }
  return new Set(incoming);
}

export function collectItemRects(root) {
  if (!root) return [];
  return [...root.querySelectorAll('[data-dd-item-id]')].map((el) => {
    const r = el.getBoundingClientRect();
    return {
      id: el.getAttribute('data-dd-item-id'),
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }
    };
  });
}
