import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dailyMatchRows,
  dailyMatchSection,
  feedFreshCutoff,
  isDefaultDateSort,
  isFirstSeenOnOrAfter,
} from './dailyMatchSection.js';

const DAY = Date.parse('2026-09-22T07:00:00.000Z');

function deal(firstSeenAt) {
  return { id: firstSeenAt, firstSeenAt };
}

describe('isDefaultDateSort', () => {
  it('is only a single date-desc sort', () => {
    assert.equal(isDefaultDateSort([{ field: 'date', direction: 'desc' }]), true);
    assert.equal(isDefaultDateSort([]), true);
    assert.equal(isDefaultDateSort([{ field: 'date', direction: 'asc' }]), false);
    assert.equal(isDefaultDateSort([{ field: 'price', direction: 'desc' }]), false);
    assert.equal(isDefaultDateSort([
      { field: 'date', direction: 'desc' },
      { field: 'price', direction: 'desc' },
    ]), false);
  });
});

describe('feedFreshCutoff', () => {
  it('keeps this visit on the saved cutoff, then the last look, then local midnight', () => {
    const now = new Date('2026-09-22T18:00:00.000Z')
    assert.equal(
      feedFreshCutoff({ sessionCutoff: '2026-09-15T15:00:00.000Z', previousViewedAt: '2026-09-22T12:00:00.000Z', now }),
      '2026-09-15T15:00:00.000Z'
    )
    assert.equal(
      feedFreshCutoff({ previousViewedAt: '2026-09-15T15:00:00.000Z', now }),
      '2026-09-15T15:00:00.000Z'
    )
    const first = new Date(feedFreshCutoff({ now }))
    assert.equal(first.getDate(), now.getDate())
    assert.equal(first.getHours(), 0)
  })
})

describe('dailyMatchSection', () => {
  const today = deal('2026-09-22T16:00:00.000Z');
  const older = deal('2026-09-21T16:00:00.000Z');

  it('treats a deal first seen after the last visit as fresh', () => {
    assert.equal(isFirstSeenOnOrAfter(today, DAY), true);
    assert.equal(isFirstSeenOnOrAfter(older, DAY), false);
    assert.equal(isFirstSeenOnOrAfter(deal(null), DAY), false);
  });

  it('keeps a week of unseen deals above the bar', () => {
    const weekAgo = Date.parse('2026-09-15T15:00:00.000Z')
    const midweek = deal('2026-09-18T16:00:00.000Z')
    const before = deal('2026-09-10T16:00:00.000Z')
    const section = dailyMatchSection({
      deals: [midweek, before],
      page: 1,
      perPage: 50,
      newTodayTotal: 1,
      enabled: true,
      freshSinceMs: weekAgo,
    })
    assert.equal(section.kind, 'boundary')
    assert.equal(section.dividerBefore, 1)
    assert.equal(section.newOnPage, 1)
  })

  it('puts the divider before the first older deal on the page', () => {
    const section = dailyMatchSection({
      deals: [today, today, older, older],
      page: 1,
      perPage: 50,
      newTodayTotal: 2,
      enabled: true,
      freshSinceMs: DAY,
    });
    assert.equal(section.kind, 'boundary');
    assert.equal(section.dividerBefore, 2);
    assert.equal(section.newOnPage, 2);
    assert.equal(section.olderOnPage, 2);
  });

  it('starts a later page with the divider when today filled the previous page', () => {
    const section = dailyMatchSection({
      deals: [older, older],
      page: 2,
      perPage: 50,
      newTodayTotal: 50,
      enabled: true,
      freshSinceMs: DAY,
    });
    assert.equal(section.kind, 'boundary');
    assert.equal(section.dividerBefore, 0);
    assert.equal(section.stickyWithoutDivider, false);
  });

  it('keeps the sticky cue without repeating the divider once the break is behind you', () => {
    const section = dailyMatchSection({
      deals: [older],
      page: 3,
      perPage: 50,
      newTodayTotal: 50,
      enabled: true,
      freshSinceMs: DAY,
    });
    assert.equal(section.kind, 'past-boundary');
    assert.equal(section.dividerBefore, null);
    assert.equal(section.stickyWithoutDivider, true);
  });

  it('does not pretend you scrolled past new matches when none arrived today', () => {
    const section = dailyMatchSection({
      deals: [older, older],
      page: 1,
      perPage: 50,
      newTodayTotal: 0,
      enabled: true,
      freshSinceMs: DAY,
    });
    assert.equal(section.kind, 'none-today');
    assert.equal(section.showNoneBanner, true);
    assert.equal(section.dividerBefore, null);
    const rows = dailyMatchRows([older], section);
    assert.equal(rows[0].type, 'notice');
    assert.equal(rows[1].type, 'deal');
  });

  it('stays off for a custom sort', () => {
    const section = dailyMatchSection({
      deals: [older, today],
      enabled: false,
      freshSinceMs: DAY,
      newTodayTotal: 1,
    });
    assert.equal(section.kind, 'off');
    assert.deepEqual(dailyMatchRows([older, today], section).map((row) => row.type), ['deal', 'deal']);
  });
});
