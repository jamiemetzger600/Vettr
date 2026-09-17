import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  marqueeRectFromPoints,
  rectsIntersect,
  idsIntersectingMarquee,
  rangeIds,
  applyClickSelection,
  mergeMarqueeSelection
} from './ddSelection.js';

describe('ddSelection', () => {
  it('builds a normalized marquee rect', () => {
    assert.deepEqual(marqueeRectFromPoints({ x: 10, y: 20 }, { x: 4, y: 8 }), {
      left: 4,
      top: 8,
      right: 10,
      bottom: 20
    });
  });

  it('hits icons that intersect the marquee', () => {
    const items = [
      { id: '1', rect: { left: 0, top: 0, right: 40, bottom: 40 } },
      { id: '2', rect: { left: 50, top: 0, right: 90, bottom: 40 } },
      { id: '3', rect: { left: 0, top: 80, right: 40, bottom: 120 } }
    ];
    const marquee = { left: 30, top: 10, right: 70, bottom: 30 };
    assert.deepEqual(idsIntersectingMarquee(items, marquee), ['1', '2']);
    assert.equal(rectsIntersect(items[2].rect, marquee), false);
  });

  it('ignores tiny marquees', () => {
    assert.deepEqual(
      idsIntersectingMarquee(
        [{ id: '1', rect: { left: 0, top: 0, right: 10, bottom: 10 } }],
        { left: 0, top: 0, right: 0, bottom: 8 }
      ),
      []
    );
  });

  it('selects a range and toggles with meta', () => {
    const ids = ['a', 'b', 'c', 'd'];
    assert.deepEqual(rangeIds(ids, 'b', 'd'), ['b', 'c', 'd']);
    const ranged = applyClickSelection(new Set(['a']), ids, 'd', { shift: true, anchorId: 'b' });
    assert.deepEqual([...ranged], ['b', 'c', 'd']);
    const toggled = applyClickSelection(new Set(['a']), ids, 'c', { meta: true });
    assert.deepEqual([...toggled].sort(), ['a', 'c']);
  });

  it('merges marquee hits additively', () => {
    const added = mergeMarqueeSelection(new Set(['1']), ['2', '3'], true);
    assert.deepEqual([...added].sort(), ['1', '2', '3']);
    const replaced = mergeMarqueeSelection(new Set(['1']), ['2'], false);
    assert.deepEqual([...replaced], ['2']);
  });
});
