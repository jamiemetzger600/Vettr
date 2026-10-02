import test from 'node:test';
import assert from 'node:assert/strict';
import { formatShareDate, ganttShareRows, ganttShareFilename } from './exportGanttShare.js';

test('share dates include the year', () => {
  assert.equal(formatShareDate(new Date(2026, 8, 28).getTime()), 'Sep 28, 2026');
  assert.equal(formatShareDate(null), '—');
});

test('each milestone row has a start and end', () => {
  const rows = ganttShareRows([
    { label: 'LOI', barStart: new Date(2026, 8, 28).getTime(), barEnd: new Date(2026, 9, 2).getTime() },
    { label: 'Close Date', barStart: null, barEnd: null }
  ]);
  assert.deepEqual(rows, [
    { milestone: 'LOI', start: 'Sep 28, 2026', end: 'Oct 2, 2026' },
    { milestone: 'Close Date', start: '—', end: '—' }
  ]);
});

test('export filenames stay readable', () => {
  assert.equal(
    ganttShareFilename('27-Year RF Technology Company', 'pdf'),
    '27-year-rf-technology-company-timeline.pdf'
  );
  assert.equal(ganttShareFilename('', 'jpeg'), 'due-diligence-timeline.jpg');
});
