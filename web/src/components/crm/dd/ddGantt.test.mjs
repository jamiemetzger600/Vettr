import test from 'node:test';
import assert from 'node:assert/strict';
import { stageIdForGroup, buildGanttModel, barStyle, milestoneHeaders, localTodayMs } from './ddGantt.js';

test('groups land in the closing stages', () => {
  assert.equal(stageIdForGroup('Tax'), 'diligence');
  assert.equal(stageIdForGroup('Legal & Corporate'), 'diligence');
  assert.equal(stageIdForGroup('Financial & QoE'), 'qoe');
  assert.equal(stageIdForGroup('SBA'), 'bank');
  assert.equal(stageIdForGroup('Bank commitment'), 'bank');
  assert.equal(stageIdForGroup('PSA draft'), 'psa');
  assert.equal(stageIdForGroup('Closing checklist'), 'close');
  assert.equal(stageIdForGroup('Seller follow-ups'), 'custom');
});

test('stage bars use task dates and the target close', () => {
  const model = buildGanttModel({
    startedAt: '2026-09-01',
    targetDate: '2026-11-15',
    today: new Date(2026, 8, 20),
    groups: [
      {
        name: 'Tax',
        items: [
          { id: 1, title: 'Returns', status: 'in_progress', due_at: '2026-09-20' },
          { id: 2, title: 'Sales tax', status: 'not_started', due_at: '2026-10-02', assignees: [{ name: 'Alesha' }] }
        ]
      },
      {
        name: 'Financial & QoE',
        items: [{ id: 3, title: 'Add-backs', status: 'not_started', requests_document: true, documents: [] }]
      },
      { name: 'Broker questions', items: [{ id: 4, title: 'Customer list', status: 'complete' }] }
    ]
  });

  const byId = Object.fromEntries(model.stages.map((stage) => [stage.id, stage]));
  assert.equal(byId.diligence.total, 2);
  assert.equal(byId.diligence.tasks[1].assignee, 'Alesha');
  assert.equal(byId.qoe.tasks[0].docNeeded, true);
  assert.equal(byId.custom.total, 1);
  assert.equal(byId.custom.tone, 'complete');
  assert.equal(byId.close.tasks.some((task) => task.milestone && task.title === 'Target close'), true);
  assert.equal(byId.diligence.start, new Date(2026, 8, 20).getTime());
  assert.equal(byId.diligence.end, new Date(2026, 9, 2).getTime());
  assert.ok(model.rangeStart < byId.diligence.start);
  assert.ok(model.rangeEnd > new Date(2026, 10, 15).getTime());
});

test('a milestone date is the stage header and the tasks inherit that day', () => {
  const model = buildGanttModel({
    today: new Date(2026, 8, 29, 15, 30),
    milestones: [{ stageId: 'psa', dueOn: '2026-10-20' }],
    groups: [
      { name: 'PSA draft', items: [{ id: 9, title: 'Draft PSA', status: 'not_started', due_at: '2026-10-01' }] }
    ]
  });
  const psa = model.stages.find((stage) => stage.id === 'psa');
  assert.equal(psa.dueOn, '2026-10-20');
  assert.equal(psa.start, new Date(2026, 9, 20).getTime());
  const headers = milestoneHeaders(model.stages, model.rangeStart, model.rangeEnd);
  assert.equal(headers.find((header) => header.id === 'psa').label, 'PSA');
  assert.match(headers.find((header) => header.id === 'psa').date, /Oct 20/);
  assert.equal(model.todayMs, localTodayMs(new Date(2026, 8, 29, 15, 30)));
});

test('a one-day bar stays inside the timeline', () => {
  const start = new Date(2026, 8, 10).getTime();
  const end = new Date(2026, 9, 10).getTime();
  const style = barStyle(start, start, start - 86400000, end);
  assert.ok(style);
  assert.match(style.left, /%$/);
  assert.match(style.width, /%$/);
  assert.ok(parseFloat(style.left) >= 0);
  assert.ok(parseFloat(style.left) + parseFloat(style.width) <= 100.01);
});
