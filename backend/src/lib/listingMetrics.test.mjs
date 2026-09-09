import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatMoneyShort,
  formatMultipleDisplay,
  listingMetricCells,
  listingMetricsTableHtml
} from './listingMetrics.js';

describe('formatMoneyShort', () => {
  it('matches aggregator short money', () => {
    assert.equal(formatMoneyShort(2500000), '$2.5M');
    assert.equal(formatMoneyShort(955942), '$955.9K');
    assert.equal(formatMoneyShort(null), '—');
  });
});

describe('listingMetricCells', () => {
  it('always returns purchase price, revenue, EBITDA, and multiple', () => {
    const cells = listingMetricCells({
      askingPrice: 1050000,
      revenue: 955942,
      ebitda: 400000,
      profitMultiple: 2.625
    });
    assert.deepEqual(cells.map((c) => c.label), [
      'Purchase Price',
      'Revenue',
      'EBITDA',
      'Multiple'
    ]);
    assert.equal(cells[0].value, '$1.1M');
    assert.equal(cells[1].value, '$955.9K');
    assert.equal(cells[2].value, '$400K');
    assert.equal(cells[3].value, '2.63X');
  });

  it('uses em dash when a field is missing and computes multiple from price / EBITDA', () => {
    const cells = listingMetricCells({
      askingPrice: 2500000,
      revenue: null,
      ebitda: 500000
    });
    assert.equal(cells[1].value, '—');
    assert.equal(cells[3].value, '5.00X');
  });
});

describe('listingMetricsTableHtml', () => {
  it('includes all four labels', () => {
    const html = listingMetricsTableHtml({ askingPrice: 1, revenue: 2, ebitda: 3, profitMultiple: 1.5 }, (s) => s);
    assert.match(html, /Purchase Price/);
    assert.match(html, /Revenue/);
    assert.match(html, /EBITDA/);
    assert.match(html, /Multiple/);
  });
});

describe('formatMultipleDisplay', () => {
  it('returns em dash when there is no multiple', () => {
    assert.equal(formatMultipleDisplay({}), '—');
    assert.equal(formatMultipleDisplay({ profitMultiple: 0 }), '—');
  });
});
