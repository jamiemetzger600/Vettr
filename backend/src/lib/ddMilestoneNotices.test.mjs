import assert from 'node:assert/strict';
import {
  daysUntil,
  milestoneEdges,
  noticeCopy,
  noticeWindow,
  noticesDue
} from './ddMilestoneNotices.js';

const milestones = [
  { stageId: 'custom', dueOn: '2026-10-05' },
  { stageId: 'psa', dueOn: '2026-10-29' },
  { stageId: 'diligence', dueOn: '2026-10-30' },
  { stageId: 'close', dueOn: '2026-12-01' }
];

const edges = milestoneEdges(milestones, '2026-09-27');

assert.equal(daysUntil('2026-09-30', '2026-10-05'), 5);
assert.equal(noticeWindow(5), 7);
assert.equal(noticeWindow(3), 3);
assert.equal(noticeWindow(2), 3);
assert.equal(noticeWindow(1), 1);
assert.equal(noticeWindow(8), null);
assert.equal(noticeWindow(0), null);

const customEnd = edges.find((edge) => edge.stageId === 'custom' && edge.edge === 'end');
const psaStart = edges.find((edge) => edge.stageId === 'psa' && edge.edge === 'start');
const diligenceStart = edges.find((edge) => edge.stageId === 'diligence' && edge.edge === 'start');
assert.equal(customEnd.on, '2026-10-05');
assert.equal(psaStart.on, '2026-10-05', 'the next stage starts when the previous milestone lands');
assert.equal(diligenceStart.on, '2026-10-29');

const due = noticesDue(edges, '2026-09-30');
const kinds = due.map((row) => `${row.stageId}:${row.edge}:${row.leadDays}`).sort();
assert.deepEqual(kinds, ['custom:end:7', 'psa:start:7']);

const copy = noticeCopy({
  stageId: 'close',
  edge: 'end',
  daysUntil: 1,
  dealName: 'Royal Family Construction',
  on: '2026-12-01'
});
assert.equal(copy.title, 'Close Date ends tomorrow');
assert.match(copy.body, /Royal Family Construction/);
assert.match(copy.body, /Dec 1/);

const week = noticeCopy({ stageId: 'qoe', edge: 'start', daysUntil: 7, on: '2026-11-20' });
assert.equal(week.title, 'QofE starts in 1 week');

console.log('ddMilestoneNotices tests passed');
