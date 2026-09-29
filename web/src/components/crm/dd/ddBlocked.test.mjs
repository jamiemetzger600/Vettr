import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedLabel, blockedTooltip, canSetStatus } from './ddBlocked.js';

const item = {
  blockedBy: [
    { id: 1, title: '3 years business tax returns' },
    { id: 2, title: 'Balance sheet' }
  ]
};

test('blocked badge names the unfinished predecessors', () => {
  assert.equal(blockedLabel(item), 'Blocked by 2 tasks');
  assert.equal(blockedLabel({ blockedBy: [{ title: 'Tax returns' }] }), 'Blocked by Tax returns');
  assert.equal(blockedLabel({}), '');
  assert.match(blockedTooltip(item), /3 years business tax returns/);
});

test('in progress and complete stay disabled while a predecessor is open', () => {
  assert.equal(canSetStatus(item, 'complete'), false);
  assert.equal(canSetStatus(item, 'in_progress'), false);
  assert.equal(canSetStatus(item, 'na'), true);
  assert.equal(canSetStatus({ blockedBy: [] }, 'complete'), true);
});
