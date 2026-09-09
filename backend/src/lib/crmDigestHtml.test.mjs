import {
  buildCrmFollowUpHtml,
  crmDigestLine,
  groupCrmDigestItems,
  truncateLabel
} from './crmDigestHtml.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const overdue = [
  { kind: 'overdue', title: 'Send IOI to broker', dealName: 'Highly Reputable Septic & Plumbing Company', savedDealId: 1 },
  { kind: 'overdue', title: 'Follow up on CIM', dealName: 'Midwest HVAC', savedDealId: 2 },
  { kind: 'overdue', title: 'Schedule call', dealName: 'Coastal Dental', savedDealId: 3 },
  { kind: 'overdue', title: 'Send questions', dealName: 'Valley Pest Control', savedDealId: 4 }
];

const dueToday = Array.from({ length: 15 }, (_, i) => ({
  kind: 'due_today',
  title: i === 0 ? 'Request NDA from broker' : `Follow-up ${i + 1}`,
  dealName: i === 0
    ? 'BG Logistics - Parcel Delivery'
    : `Deal ${i + 1} | $554K SDE | Tracking to $800K+ | Remote Owner`,
  savedDealId: 10 + i
}));

const stale = [
  { kind: 'stale', title: 'Listing updated: Soil Vapor Environmental Testing', dealName: 'Soil Vapor Environmental Testing', savedDealId: 30 }
];
const dormant = [
  { kind: 'dormant', title: 'Dormant: Seller Financed Valet', dealName: 'Seller Financed Valet and Parking Management Business', savedDealId: 40, extra: '50d' },
  { kind: 'dormant', title: 'Dormant: Two', dealName: 'Quiet Deal Two', savedDealId: 41, extra: '21d' },
  { kind: 'dormant', title: 'Dormant: Three', dealName: 'Quiet Deal Three', savedDealId: 42, extra: '18d' },
  { kind: 'dormant', title: 'Dormant: Four', dealName: 'Quiet Deal Four', savedDealId: 43, extra: '16d' }
];

const items = [...overdue, ...dueToday, ...stale, ...dormant];
assert(items.length === 24, `expected 24 fixture items, got ${items.length}`);

const line = crmDigestLine(dueToday[0]);
assert(line.primary === 'Request NDA from broker', `action first: ${line.primary}`);
assert(line.secondary.includes('BG Logistics'), `deal secondary: ${line.secondary}`);
assert(!truncateLabel('x'.repeat(80)).includes('x'.repeat(80)), 'truncate long names');

const grouped = groupCrmDigestItems(items);
assert(grouped.some((g) => g.group.kind === 'due_today' && g.items.length === 15), 'group due today');
assert(grouped.some((g) => g.group.bucket === 'later'), 'later bucket present');

const html = buildCrmFollowUpHtml(items, 'https://app.vettr.example');
assert(html.includes('CRM follow-ups'), 'section heading');
assert(html.includes('4 overdue'), `summary counts: ${html.slice(0, 400)}`);
assert(html.includes('15 due today'), 'due today count in summary');
assert(!html.includes('Due today:'), 'do not repeat Due today on every row');
assert(!html.includes('<ul'), 'not a flat bullet list');
assert((html.match(/Request NDA from broker/g) || []).length === 1, 'preview does not dump all due-today titles');
assert(html.includes('10 more in Vettr'), 'overflow link for due today');
assert(html.includes('crmFilter=dueToday'), 'overflow lands on due-today chip');
assert(html.includes('crmDeal=1'), 'overdue item links to deal');
assert(html.includes('section=overview'), 'deal link opens workspace');
assert(html.includes('Later'), 'later heading for stale/dormant');
assert(html.includes('50d quiet'), 'dormant idle days');
assert(html.includes('Open today&#39;s queue in Vettr') || html.includes("Open today's queue in Vettr"), 'queue CTA');
assert((html.match(/crmDeal=/g) || []).length <= 5 + 5 + 3 + 3, 'preview caps visible deal links');

console.log('crmDigestHtml tests passed');
console.log('[digest] fixture html bytes', html.length);
