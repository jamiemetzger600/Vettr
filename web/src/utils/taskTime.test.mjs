import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  taskBucket,
  formatRelativeDue,
  groupTasksByTime,
  groupTasksByDeal,
  matchesTaskQuery
} from './taskTime.js';

const NOW = new Date('2026-09-08T15:00:00-07:00');

describe('taskBucket', () => {
  it('buckets overdue, today, week, later, nodate, done', () => {
    assert.equal(taskBucket({ due_at: '2026-09-02T12:00:00', status: 'open' }, NOW), 'overdue');
    assert.equal(taskBucket({ due_at: '2026-09-08T12:00:00', status: 'open' }, NOW), 'today');
    assert.equal(taskBucket({ due_at: '2026-09-11T12:00:00', status: 'open' }, NOW), 'week');
    assert.equal(taskBucket({ due_at: '2026-09-20T12:00:00', status: 'open' }, NOW), 'later');
    assert.equal(taskBucket({ due_at: null, status: 'open' }, NOW), 'nodate');
    assert.equal(taskBucket({ due_at: '2026-09-02T12:00:00', status: 'done' }, NOW), 'done');
  });
});

describe('formatRelativeDue', () => {
  it('uses relative labels', () => {
    assert.deepEqual(formatRelativeDue('2026-09-07T12:00:00', NOW), { label: 'Yesterday', tone: 'warn' });
    assert.equal(formatRelativeDue('2026-09-02T12:00:00', NOW).label, '6d overdue');
    assert.deepEqual(formatRelativeDue('2026-09-08T12:00:00', NOW), { label: 'Today', tone: 'today' });
    assert.deepEqual(formatRelativeDue('2026-09-09T12:00:00', NOW), { label: 'Tomorrow', tone: 'ok' });
    assert.deepEqual(formatRelativeDue(null, NOW), { label: 'No date', tone: 'muted' });
  });
});

describe('groupTasksByTime', () => {
  it('splits a mixed list', () => {
    const groups = groupTasksByTime([
      { id: 1, due_at: '2026-09-02T12:00:00', status: 'open' },
      { id: 2, due_at: '2026-09-08T12:00:00', status: 'open' },
      { id: 3, due_at: null, status: 'open' }
    ], NOW);
    assert.equal(groups.overdue.length, 1);
    assert.equal(groups.today.length, 1);
    assert.equal(groups.nodate.length, 1);
  });
});

describe('groupTasksByDeal', () => {
  it('orders deals with overdue first', () => {
    const groups = groupTasksByDeal([
      { id: 1, saved_deal_id: 2, deal_name: 'Zebra', due_at: null, status: 'open' },
      { id: 2, saved_deal_id: 1, deal_name: 'Acme', due_at: '2026-09-02T12:00:00', status: 'open' }
    ], NOW);
    assert.equal(groups[0].dealName, 'Acme');
    assert.equal(groups[1].dealName, 'Zebra');
  });
});

describe('matchesTaskQuery', () => {
  it('matches title or deal', () => {
    const task = { title: 'Send IOI', deal_name: 'Septic Plumbing', assignee_email: 'jamie@x.com' };
    assert.equal(matchesTaskQuery(task, 'ioi'), true);
    assert.equal(matchesTaskQuery(task, 'septic'), true);
    assert.equal(matchesTaskQuery(task, 'jamie'), true);
    assert.equal(matchesTaskQuery(task, 'broker'), false);
  });
});
