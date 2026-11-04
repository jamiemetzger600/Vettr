import assert from 'node:assert/strict';
import test from 'node:test';
import {
  planSnapshotSync,
  isSameBusiness,
  contentChanged,
  assessSnapshot,
  readSnapshotRowCount,
  isRecentAirtableListing,
} from './airtableSnapshotSync.js';

const money = { asking_price: 400000, annual_profit: 100000, annual_revenue: 500000 };

function deal(url, extra = {}) {
  return { listing_url: `https://example.com/${url}`, airtable_record_id: `rec${url}`, state: 'TX', ...extra };
}
function row(id, url, extra = {}) {
  return { id, source_id: `old${id}`, listing_url: `https://example.com/${url}`, state: 'TX', is_active: true, ...extra };
}

test('a new record id on a known URL keeps the same row', () => {
  const plan = planSnapshotSync([deal('a', { airtable_record_id: 'recRotated' })], [row(1, 'a')]);
  assert.equal(plan.businesses[0].row.id, 1);
  assert.deepEqual(plan.absentRowIds, []);
});

test('the same business on two sites becomes one row with both URLs linked', () => {
  const plan = planSnapshotSync(
    [deal('copy', { ...money, city: 'Austin' }), deal('kept', { ...money, city: 'Austin' })],
    [row(1, 'kept', money)]
  );
  assert.equal(plan.businesses.length, 1);
  assert.equal(plan.businesses[0].canonical.listing_url, 'https://example.com/kept');
  assert.equal(plan.businesses[0].members.length, 2);
});

test('the kept copy stays canonical across runs, so rows do not flip between sites', () => {
  const deals = [deal('z', money), deal('a', money)];
  const first = planSnapshotSync(deals, [row(1, 'z', money)]);
  const second = planSnapshotSync([...deals].reverse(), [row(1, 'z', money)]);
  assert.equal(first.businesses[0].canonical.listing_url, 'https://example.com/z');
  assert.equal(second.businesses[0].canonical.listing_url, 'https://example.com/z');
});

test('groups do not change when a previous run activated different rows', () => {
  const deals = [
    deal('a', { name: 'General Practice' }),
    deal('b', { name: 'General Practice', city: 'Erie' }),
    deal('c', { name: 'General Practice', city: 'York' }),
  ];
  const urls = (plan) => plan.businesses.map((b) => b.members.map((m) => m.key).sort().join()).sort();
  const first = planSnapshotSync(deals, [row(1, 'a', { name: 'General Practice' }), row(2, 'c', { name: 'General Practice', city: 'York', is_active: false })]);
  const second = planSnapshotSync(deals, [row(1, 'a', { name: 'General Practice', is_active: false }), row(2, 'c', { name: 'General Practice', city: 'York' })]);
  assert.deepEqual(urls(first), urls(second));
});

test('a blank city merges with a known city, two known cities stay separate', () => {
  const blank = deal('a', money);
  const austin = deal('b', { ...money, city: 'Austin' });
  const dallas = deal('c', { ...money, city: 'Dallas' });
  assert.equal(isSameBusiness(blank, austin), true);
  assert.equal(isSameBusiness(austin, dallas), false);
  const plan = planSnapshotSync([blank, austin, dallas], []);
  assert.equal(plan.businesses.length, 2);
  assert.equal(plan.businesses.reduce((n, b) => n + b.members.length, 0), 3);
});

test('a shared title with a differing number is two businesses', () => {
  const a = deal('a', { name: 'Electrical Contractor', ...money });
  const b = deal('b', { name: 'Electrical Contractor', ...money, annual_profit: 875000 });
  assert.equal(planSnapshotSync([a, b], []).businesses.length, 2);
});

test('a shared title with no differing number is one business', () => {
  const a = deal('a', { name: 'Recurring Revenue Business' });
  const b = deal('b', { name: 'recurring revenue business' });
  assert.equal(planSnapshotSync([a, b], []).businesses.length, 1);
});

test('a relisted business keeps its row and saved deals under the new URL', () => {
  const plan = planSnapshotSync(
    [deal('new-slug', { ...money, name: 'New title' })],
    [row(7, 'old-slug', { ...money, name: 'Old title' })]
  );
  assert.equal(plan.businesses[0].row.id, 7);
  assert.equal(plan.businesses[0].reused, true);
  assert.deepEqual(plan.absentRowIds, []);
});

test('a listing that left Airtable is deactivated when nothing replaces it', () => {
  const plan = planSnapshotSync([deal('a')], [row(1, 'a'), row(2, 'gone', { name: 'Gone' })]);
  assert.deepEqual(plan.absentRowIds, [2]);
});

test('two rows now seen as one business merge into the saved one', () => {
  const plan = planSnapshotSync(
    [deal('a', money), deal('b', { ...money, city: 'Austin' })],
    [row(1, 'a', money), row(2, 'b', { ...money, city: 'Austin' })],
    new Set([2])
  );
  assert.equal(plan.businesses[0].row.id, 2);
  assert.deepEqual(plan.surplus, [{ dupId: 1, keepId: 2, wasActive: true }]);
});

test('a repeated URL counts once and is reported', () => {
  const plan = planSnapshotSync([deal('a'), deal('a'), { state: 'TX' }], []);
  assert.equal(plan.businesses.length, 1);
  assert.equal(plan.duplicateRows, 1);
  assert.equal(plan.unidentifiedRows, 1);
});

test('only real value changes count, not dates or stored rounding', () => {
  const base = deal('a', { asking_price: 100, profit_multiple: 2.3333333, industries: ['HVAC'], airtable_updated_at: '2026-11-04' });
  const stored = row(1, 'a', { asking_price: '100.00', profit_multiple: '2.33', industries: ['HVAC'], source_updated_at: '2026-11-03' });
  assert.equal(contentChanged(base, stored), false);
  assert.equal(contentChanged({ ...base, asking_price: 90 }, stored), true);
  assert.equal(contentChanged({ ...base, broker_email: 'a@b.co' }, stored), true);
});

test('new listing dates are today or yesterday only', () => {
  const now = new Date('2026-10-02T12:18:00.000Z');
  assert.equal(isRecentAirtableListing('2026-10-02', now), true);
  assert.equal(isRecentAirtableListing('2026-10-01T00:00:00.000Z', now), true);
  assert.equal(isRecentAirtableListing('2026-09-30', now), false);
  assert.equal(isRecentAirtableListing(null, now), false);
});

test('a short or halved Airtable payload is not treated as the full list', () => {
  assert.equal(assessSnapshot(50, null).ok, false);
  assert.equal(assessSnapshot(40000, 48646).ok, true);
  assert.equal(assessSnapshot(20000, 48646).reason, 'snapshot_shrunk');
  assert.equal(readSnapshotRowCount('{"rows":48646,"inserted":1}'), 48646);
  assert.equal(readSnapshotRowCount({ inserted: 1 }), null);
});
