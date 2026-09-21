process.env.SCRAPE_CLI_ONCE = '1';

const { selectDealsToUpsert, sortDealsForSync, assessSnapshot, readSnapshotRowCount } = await import('./airtableScraper.js');
const { default: pool } = await import('../db/pool.js');

import assert from 'node:assert/strict';
import test from 'node:test';

test.after(async () => {
  await pool.end();
});

test('selects listings missing from the database even when their dates are older', () => {
  const existing = [
    {
      source_id: 'recNEWER',
      listing_url: 'https://example.com/newer',
      source_added_at: '2026-09-21T07:00:00.000Z',
      source_updated_at: '2026-09-21T07:00:00.000Z',
      is_active: true,
    },
  ];
  const deals = [
    {
      airtable_record_id: 'recOLDER',
      airtable_id: 101,
      listing_url: 'https://example.com/older',
      airtable_added_at: '2026-06-02T00:00:00.000Z',
      airtable_updated_at: '2026-06-02T00:00:00.000Z',
    },
    {
      airtable_record_id: 'recNEWER',
      listing_url: 'https://example.com/newer',
      airtable_added_at: '2026-09-21T07:00:00.000Z',
      airtable_updated_at: '2026-09-21T07:00:00.000Z',
    },
  ];

  const { selected, skipped } = selectDealsToUpsert(deals, existing);
  assert.equal(skipped, 1);
  assert.deepEqual(selected.map((d) => d.airtable_record_id), ['recOLDER']);
});

test('matches an existing numeric source id or listing URL and reactivates inactive rows', () => {
  const existing = [
    {
      source_id: '3559174',
      listing_url: 'https://example.com/kept#section',
      source_added_at: '2026-06-08T00:00:00.000Z',
      source_updated_at: '2026-06-08T00:00:00.000Z',
      is_active: true,
    },
    {
      source_id: 'recGONE',
      listing_url: 'https://example.com/inactive',
      source_added_at: '2026-06-08T00:00:00.000Z',
      source_updated_at: '2026-06-08T00:00:00.000Z',
      is_active: false,
    },
  ];
  const deals = [
    {
      airtable_record_id: 'recURL',
      airtable_id: 999,
      listing_url: 'https://example.com/kept',
      airtable_added_at: '2026-06-08T00:00:00.000Z',
      airtable_updated_at: '2026-06-08T00:00:00.000Z',
    },
    {
      airtable_record_id: 'recGONE',
      listing_url: 'https://example.com/inactive',
      airtable_added_at: '2026-06-08T00:00:00.000Z',
      airtable_updated_at: '2026-06-08T00:00:00.000Z',
    },
  ];

  const { selected, skipped } = selectDealsToUpsert(deals, existing);
  assert.equal(skipped, 1);
  assert.deepEqual(selected.map((d) => d.airtable_record_id), ['recGONE']);
});

test('sync order puts missing listings ahead of updates, newest first', () => {
  const existing = [
    {
      source_id: 'recOLD',
      listing_url: 'https://example.com/old',
      source_added_at: '2026-01-01T00:00:00.000Z',
      source_updated_at: '2026-01-01T00:00:00.000Z',
      is_active: true,
    },
  ];
  const deals = [
    {
      airtable_record_id: 'recMISSING_OLD',
      listing_url: 'https://example.com/missing-old',
      airtable_added_at: '2026-06-02T00:00:00.000Z',
    },
    {
      airtable_record_id: 'recOLD',
      listing_url: 'https://example.com/old',
      airtable_added_at: '2026-09-21T00:00:00.000Z',
      airtable_updated_at: '2026-09-21T00:00:00.000Z',
    },
    {
      airtable_record_id: 'recMISSING_NEW',
      listing_url: 'https://example.com/missing-new',
      airtable_added_at: '2026-09-20T00:00:00.000Z',
    },
  ];

  const ordered = sortDealsForSync(deals, existing);
  assert.deepEqual(ordered.map((d) => d.airtable_record_id), [
    'recMISSING_NEW',
    'recMISSING_OLD',
    'recOLD',
  ]);
});

test('a short or halved Airtable payload is not treated as the full list', () => {
  assert.equal(assessSnapshot(50, null).ok, false);
  assert.equal(assessSnapshot(40000, 48646).ok, true);
  assert.equal(assessSnapshot(20000, 48646).reason, 'snapshot_shrunk');
  assert.equal(readSnapshotRowCount('{"rows":48646,"inserted":1}'), 48646);
  assert.equal(readSnapshotRowCount({ inserted: 1 }), null);
});
