import { useCallback, useRef, useState } from 'react';
import {
  collectItemRects,
  idsIntersectingMarquee,
  marqueeRectFromPoints,
  mergeMarqueeSelection
} from './ddSelection.js';

const DRAG_PX = 5;
const INTERACTIVE = 'input, select, button, textarea, a, label, .dd-bulk-bar, .dd-view-toggle, .dd-group__title, .dd-add-item-form';

export default function useDdMarquee({
  containerRef,
  selected,
  onSelectionChange,
  onItemClick,
  enabled = true
}) {
  const [marquee, setMarquee] = useState(null);
  const dragRef = useRef(null);

  const finish = useCallback((e) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setMarquee(null);
    if (!drag) return;
    const root = containerRef.current;
    if (root?.hasPointerCapture?.(e.pointerId)) {
      try { root.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    }
    if (drag.dragged) {
      const rect = marqueeRectFromPoints(drag.start, { x: e.clientX, y: e.clientY });
      const hits = idsIntersectingMarquee(collectItemRects(root), rect);
      const next = mergeMarqueeSelection(drag.snapshot, hits, drag.additive);
      onSelectionChange(next, hits[0] || drag.itemId);
      console.log('[DdChecklist] marquee select', { count: next.size, additive: drag.additive });
      return;
    }
    if (drag.itemId) {
      const touchToggle = drag.pointerType === 'touch' && drag.snapshot.size > 0;
      onItemClick(drag.itemId, {
        shift: drag.shift,
        meta: drag.meta || touchToggle
      });
      return;
    }
    if (!drag.additive) onSelectionChange(new Set(), null);
  }, [containerRef, onItemClick, onSelectionChange]);

  const onPointerDown = useCallback((e) => {
    if (!enabled || e.button !== 0) return;
    if (e.target.closest?.(INTERACTIVE)) return;
    if (e.pointerType === 'touch') {
      const itemEl = e.target.closest?.('[data-dd-item-id]');
      if (!itemEl) return;
    }
    const root = containerRef.current;
    if (!root || !root.contains(e.target)) return;
    const itemEl = e.target.closest?.('[data-dd-item-id]');
    dragRef.current = {
      start: { x: e.clientX, y: e.clientY },
      itemId: itemEl?.getAttribute('data-dd-item-id') || null,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
      shift: e.shiftKey,
      meta: e.metaKey || e.ctrlKey,
      pointerType: e.pointerType,
      dragged: false,
      snapshot: new Set(selected)
    };
    if (e.pointerType !== 'touch') {
      try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
  }, [containerRef, enabled, selected]);

  const onPointerMove = useCallback((e) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = e.clientX - drag.start.x;
    const dy = e.clientY - drag.start.y;
    if (!drag.dragged && (Math.abs(dx) > DRAG_PX || Math.abs(dy) > DRAG_PX)) {
      drag.dragged = true;
    }
    if (!drag.dragged) return;
    const rect = marqueeRectFromPoints(drag.start, { x: e.clientX, y: e.clientY });
    setMarquee(rect);
    const hits = idsIntersectingMarquee(collectItemRects(containerRef.current), rect);
    onSelectionChange(mergeMarqueeSelection(drag.snapshot, hits, drag.additive));
  }, [containerRef, onSelectionChange]);

  const onPointerUp = useCallback((e) => {
    if (!dragRef.current) return;
    finish(e);
  }, [finish]);

  const onPointerCancel = useCallback((e) => {
    if (!dragRef.current) return;
    finish(e);
  }, [finish]);

  return { marquee, onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}
