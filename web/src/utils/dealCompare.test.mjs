import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCompareIds,
  serializeCompareIds,
  dealMatchesCompareId,
  bestDealIndices,
  cocTier,
  paybackTier
} from './dealCompare.js';

describe('parseCompareIds', () => {
  it('keeps up to 3 unique numeric ids', () => {
    assert.deepEqual(parseCompareIds('12,34,56,78'), [12, 34, 56]);
    assert.deepEqual(parseCompareIds('12,12,34'), [12, 34]);
    assert.deepEqual(parseCompareIds('nope,,0,-1,9'), [9]);
    assert.deepEqual(parseCompareIds([12, 34]), [12, 34]);
  });
});

describe('serializeCompareIds', () => {
  it('round-trips arrays', () => {
    assert.equal(serializeCompareIds([12, 34]), '12,34');
  });
});

describe('dealMatchesCompareId', () => {
  it('matches id or vettrId', () => {
    assert.equal(dealMatchesCompareId({ id: 12 }, 12), true);
    assert.equal(dealMatchesCompareId({ id: 1, vettrId: 99 }, 99), true);
    assert.equal(dealMatchesCompareId({ id: 1 }, 2), false);
  });
});

describe('bestDealIndices', () => {
  it('highlights the highest CoC, including ties', () => {
    const best = bestDealIndices([{ coc: 20 }, { coc: 40 }, { coc: 40 }]);
    assert.deepEqual([...best], [1, 2]);
  });

  it('returns empty when no finite CoC', () => {
    assert.equal(bestDealIndices([{ coc: null }]).size, 0);
  });
});

describe('tiers', () => {
  it('maps CoC and payback like the calculator', () => {
    assert.equal(cocTier(100), 'excellent');
    assert.equal(cocTier(10), 'fair');
    assert.equal(paybackTier(1.5), 'excellent');
    assert.equal(paybackTier(0), 'none');
  });
});
