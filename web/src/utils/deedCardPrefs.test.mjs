import { emptyDeedCardPrefs, partitionDeedDeals } from './deedCardPrefs.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const prefs = {
  ...emptyDeedCardPrefs(),
  pins: { 1: true },
  order: ['1', '2', '3']
};

const deals = [
  { id: 1, name: 'Pinned old', savedAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, name: 'Older save', savedAt: '2026-08-01T00:00:00.000Z' },
  { id: 3, name: 'Newest save', savedAt: '2026-09-08T17:00:00.000Z' }
];

const { pinned, rest } = partitionDeedDeals(deals, prefs);
assert(pinned.map((d) => d.id).join() === '1', `pinned stays first: ${pinned.map((d) => d.id)}`);
assert(rest.map((d) => d.id).join() === '3,2', `saved deals newest-first: ${rest.map((d) => d.id)}`);
assert(rest[0].name === 'Newest save', 'leftmost unpinned is the newest save');

console.log('deedCardPrefs tests passed');
