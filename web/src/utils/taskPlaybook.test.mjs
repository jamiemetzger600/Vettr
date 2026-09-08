import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTaskTitle,
  playbookKeyForTask,
  checklistTitlesForTask,
  buildExpandChecklist
} from './taskPlaybook.js';

describe('normalizeTaskTitle', () => {
  it('trims and collapses whitespace', () => {
    assert.equal(normalizeTaskTitle('  Email  the broker  '), 'email the broker');
  });
});

describe('playbookKeyForTask', () => {
  it('uses metadata.key', () => {
    assert.equal(playbookKeyForTask({ title: 'x', metadata: { key: 'follow_nda' } }), 'follow_nda');
  });

  it('matches known follow-up titles', () => {
    assert.equal(
      playbookKeyForTask({ title: 'Follow up: heard back on the NDA?' }),
      'follow_nda'
    );
  });
});

describe('checklistTitlesForTask', () => {
  it('returns NDA follow-up steps and skips the parent title', () => {
    const titles = checklistTitlesForTask({
      title: 'Follow up: heard back on the NDA?',
      progress_stage: 'Requested NDA'
    });
    assert.equal(titles.length, 3);
    assert.ok(titles.includes('Email the broker about the NDA'));
    assert.ok(!titles.some((t) => /heard back on the NDA/i.test(t)));
  });

  it('skips parent titles that only differ by “the”', () => {
    const titles = checklistTitlesForTask({
      title: 'Send IOI to broker',
      progress_stage: 'Send IOI'
    });
    assert.ok(!titles.some((t) => /send ioi to/i.test(t)));
    assert.ok(titles.includes('Draft the IOI'));
  });

  it('falls back to stage checklist', () => {
    const titles = checklistTitlesForTask({
      title: 'Call Joe',
      progress_stage: 'Send IOI'
    });
    assert.deepEqual(titles, [
      'Draft the IOI',
      'Send IOI to the broker',
      'Confirm they received it'
    ]);
  });

  it('returns nothing for passed deals', () => {
    assert.deepEqual(
      checklistTitlesForTask({ title: 'Wrap up', progress_stage: 'Passed On Deal' }),
      []
    );
  });
});

describe('buildExpandChecklist', () => {
  it('marks existing subtasks, suggestions, and siblings', () => {
    const { items, extras } = buildExpandChecklist({
      titles: ['Email the broker about the NDA', 'Call if no reply', 'File the signed NDA when it arrives'],
      parentId: 10,
      subtasks: [
        { id: 21, title: 'Call if no reply', status: 'open', parent_task_id: 10 },
        { id: 22, title: 'Custom note', status: 'open', parent_task_id: 10 }
      ],
      dealTasks: [
        { id: 10, title: 'Follow up: heard back on the NDA?', status: 'open', parent_task_id: null },
        { id: 30, title: 'Email the broker about the NDA', status: 'open', parent_task_id: null }
      ]
    });
    assert.equal(items[0].kind, 'on_deal');
    assert.equal(items[1].kind, 'subtask');
    assert.equal(items[2].kind, 'suggest');
    assert.equal(extras.length, 1);
    assert.equal(extras[0].title, 'Custom note');
  });
});
