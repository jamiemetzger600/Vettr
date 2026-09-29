import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDdSummaryEmail, parseRecipientEmails } from './ddSummaryEmail.js';

const groups = [
  {
    name: 'Financial & QoE',
    items: [
      {
        title: 'Balance sheet <draft>',
        status: 'not_started',
        due_at: '2026-09-30T19:00:00.000Z',
        requests_document: true,
        description: 'Need the year-end statement',
        assignees: [],
        documents: [],
        comments: [{ body: 'Seller will send Friday', isExternal: true }]
      },
      {
        title: 'Tax returns',
        status: 'in_progress',
        due_at: '2026-10-02T19:00:00.000Z',
        requests_document: false,
        assignees: [{ name: 'Jamie Metzger', email: 'jamie@example.com' }],
        documents: [],
        comments: []
      },
      {
        title: 'Bank statements',
        status: 'complete',
        due_at: null,
        requests_document: true,
        assignees: [{ name: 'Jamie Metzger', email: 'jamie@example.com' }],
        documents: [{ filename: 'statements.pdf' }],
        comments: [{ body: 'Internal only', isExternal: false }]
      }
    ]
  }
];

describe('buildDdSummaryEmail', () => {
  it('lists open items by assignee and leaves documents out of the internal note', () => {
    const mail = buildDdSummaryEmail({ audience: 'internal', dealName: 'Alpine Co', groups });
    assert.match(mail.subject, /DD assignments: Alpine Co/);
    assert.match(mail.html, /Unassigned/);
    assert.match(mail.html, /Balance sheet &lt;draft&gt;/);
    assert.match(mail.html, /Financial &amp; QoE/);
    assert.match(mail.html, /Not started/);
    assert.match(mail.html, /Jamie Metzger/);
    assert.match(mail.html, /Tax returns/);
    assert.doesNotMatch(mail.html, /Document still needed/);
    assert.doesNotMatch(mail.html, /Internal only/);
  });

  it('shows documents, notes, due dates, and status for an outside reader', () => {
    const mail = buildDdSummaryEmail({ audience: 'external', dealName: 'Alpine Co', groups });
    assert.match(mail.subject, /Due diligence: Alpine Co/);
    assert.match(mail.html, /Still needed|still needed|1 still needed/);
    assert.match(mail.html, /Document still needed/);
    assert.match(mail.html, /Need the year-end statement/);
    assert.match(mail.html, /Seller will send Friday/);
    assert.match(mail.html, /Already in/);
    assert.match(mail.html, /Bank statements/);
    assert.doesNotMatch(mail.html, /Jamie Metzger/);
    assert.doesNotMatch(mail.html, /jamie@example.com/);
    assert.doesNotMatch(mail.html, /Internal only/);
  });
});

describe('parseRecipientEmails', () => {
  it('accepts a comma or newline list and rejects a bad address', () => {
    assert.deepEqual(
      parseRecipientEmails('A@Firm.com, b@firm.com\nc@firm.com'),
      ['a@firm.com', 'b@firm.com', 'c@firm.com']
    );
    assert.throws(() => parseRecipientEmails('not-an-email'), /Invalid email/);
    assert.throws(() => parseRecipientEmails(''), /at least one email/);
  });
});
