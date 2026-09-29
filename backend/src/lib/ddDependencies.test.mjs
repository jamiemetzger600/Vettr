import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wouldCreateCycle,
  blockedPredecessors,
  cascadeDueShifts,
  statusRequiresPredecessors,
  isUnblocking
} from './ddDependencies.js';

const edges = [
  { predecessorId: 1, successorId: 2 },
  { predecessorId: 2, successorId: 3 }
];

test('finish-to-start rejects a loop and a self link', () => {
  assert.equal(wouldCreateCycle(edges, 3, 1), true);
  assert.equal(wouldCreateCycle(edges, 1, 1), true);
  assert.equal(wouldCreateCycle(edges, 1, 3), false);
});

test('a successor stays locked until predecessors are complete or not applicable', () => {
  const items = new Map([
    [1, { id: 1, title: 'Tax returns', status: 'in_progress' }],
    [2, { id: 2, title: 'Quality of earnings', status: 'not_started' }]
  ]);
  const blocked = blockedPredecessors(2, [{ predecessorId: 1, successorId: 2 }], items);
  assert.deepEqual(blocked.map((item) => item.title), ['Tax returns']);
  items.get(1).status = 'na';
  assert.equal(blockedPredecessors(2, [{ predecessorId: 1, successorId: 2 }], items).length, 0);
  assert.equal(isUnblocking('complete'), true);
  assert.equal(statusRequiresPredecessors('in_progress'), true);
  assert.equal(statusRequiresPredecessors('waiting_on_other'), false);
});

test('a later predecessor due date pushes the chain by the same amount', () => {
  const dues = new Map([
    [1, '2026-10-01T12:00:00.000Z'],
    [2, '2026-10-05T12:00:00.000Z'],
    [3, '2026-10-08T12:00:00.000Z'],
    [4, null]
  ]);
  const chain = [
    { predecessorId: 1, successorId: 2 },
    { predecessorId: 2, successorId: 3 },
    { predecessorId: 3, successorId: 4 }
  ];
  const updates = cascadeDueShifts({
    dues,
    edges: chain,
    changes: [{ id: 1, previousDue: dues.get(1), nextDue: '2026-10-03T12:00:00.000Z' }]
  });
  const byId = Object.fromEntries(updates.map((row) => [row.id, row.dueAt]));
  assert.equal(byId[2], '2026-10-07T12:00:00.000Z');
  assert.equal(byId[3], '2026-10-10T12:00:00.000Z');
  assert.equal(byId[4], undefined);
  assert.equal(cascadeDueShifts({
    dues,
    edges: chain,
    changes: [{ id: 1, previousDue: dues.get(1), nextDue: '2026-09-01T12:00:00.000Z' }]
  }).length, 0);
});
