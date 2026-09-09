import { crmDealPath, crmQueuePath } from './notificationLinks.js';

export const CRM_DIGEST_GROUPS = [
  { kind: 'approval', heading: 'Approvals', preview: 5, filter: 'approvals', bucket: 'now' },
  { kind: 'overdue', heading: 'Overdue', preview: 5, filter: 'overdue', bucket: 'now' },
  { kind: 'due_today', heading: 'Due today', preview: 5, filter: 'dueToday', bucket: 'now' },
  { kind: 'dd_overdue', heading: 'DD overdue', preview: 5, filter: 'ddOverdue', bucket: 'now' },
  { kind: 'portal', heading: 'Seller portal', preview: 3, filter: null, bucket: 'now' },
  { kind: 'stale', heading: 'Stale listings', preview: 3, filter: 'stale', bucket: 'later' },
  { kind: 'dormant', heading: 'Quiet deals', preview: 3, filter: 'dormant', bucket: 'later' }
];

export function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function truncateLabel(s, max = 52) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function stripPrefix(title, prefixes) {
  let out = String(title || '').trim();
  for (const prefix of prefixes) {
    const re = new RegExp(`^${prefix}\\s*`, 'i');
    out = out.replace(re, '');
  }
  return out.trim();
}

export function crmDigestLine(item) {
  const deal = truncateLabel(item.dealName, 48);
  const title = String(item.title || '').trim();
  switch (item.kind) {
    case 'overdue':
    case 'due_today':
      return { primary: truncateLabel(title, 56), secondary: deal };
    case 'dd_overdue':
      return {
        primary: truncateLabel(stripPrefix(title, ['DD overdue:']), 56),
        secondary: deal
      };
    case 'approval':
      return {
        primary: `Approve ${deal || 'deal'}`,
        secondary: truncateLabel(item.extra, 40)
      };
    case 'portal':
      return {
        primary: truncateLabel(stripPrefix(title, ['Portal comment:']), 56),
        secondary: deal
      };
    case 'stale':
      return { primary: deal || truncateLabel(stripPrefix(title, ['Listing updated:']), 48), secondary: '' };
    case 'dormant':
      return {
        primary: deal || truncateLabel(stripPrefix(title, ['Dormant:']), 48),
        secondary: item.extra ? `${item.extra} quiet` : ''
      };
    default:
      return { primary: truncateLabel(title, 56), secondary: deal };
  }
}

function absUrl(webAppUrl, path) {
  const base = String(webAppUrl || '').replace(/\/+$/, '');
  return `${base}${path}`;
}

function itemRowHtml(item, webAppUrl) {
  const { primary, secondary } = crmDigestLine(item);
  if (!primary) return '';
  const label = secondary
    ? `<span style="font-weight:600;text-decoration:underline;">${escapeHtml(primary)}</span><span style="color:#555;font-size:13px;"> — ${escapeHtml(secondary)}</span>`
    : `<span style="font-weight:600;text-decoration:underline;">${escapeHtml(primary)}</span>`;
  if (!item.savedDealId) {
    return `<p style="margin:0 0 8px;font-size:14px;line-height:1.45;">${label}</p>`;
  }
  const href = absUrl(webAppUrl, crmDealPath(item.savedDealId));
  return `<p style="margin:0 0 8px;font-size:14px;line-height:1.45;"><a href="${escapeHtml(href)}" style="color:#111;text-decoration:none;">${label}</a></p>`;
}

function groupHtml(group, items, webAppUrl) {
  if (!items.length) return '';
  const preview = items.slice(0, group.preview);
  const hidden = items.length - preview.length;
  const headingColor = group.kind === 'overdue' || group.kind === 'dd_overdue' ? '#9a3412' : '#111';
  const rows = preview.map((item) => itemRowHtml(item, webAppUrl)).join('');
  let more = '';
  if (hidden > 0) {
    const href = absUrl(webAppUrl, crmQueuePath(group.filter));
    more = `<p style="margin:4px 0 0;font-size:13px;"><a href="${escapeHtml(href)}" style="color:#555;">${hidden} more in Vettr →</a></p>`;
  }
  return `<div style="margin:0 0 18px;">
    <h3 style="font-size:14px;margin:0 0 8px;color:${headingColor};">${escapeHtml(group.heading)} · ${items.length}</h3>
    ${rows}${more}
  </div>`;
}

function summaryBits(grouped) {
  const bits = [];
  for (const { group, items } of grouped) {
    if (!items.length) continue;
    if (group.kind === 'overdue') bits.push(`${items.length} overdue`);
    else if (group.kind === 'due_today') bits.push(`${items.length} due today`);
    else if (group.kind === 'dd_overdue') bits.push(`${items.length} DD overdue`);
    else if (group.kind === 'approval') bits.push(`${items.length} approval${items.length === 1 ? '' : 's'}`);
    else if (group.bucket === 'later') bits.push(`${items.length} to review later`);
  }
  const collapsed = [];
  let later = 0;
  for (const bit of bits) {
    if (bit.endsWith('to review later')) {
      later += Number(bit.split(' ')[0]) || 0;
    } else collapsed.push(bit);
  }
  if (later) collapsed.push(`${later} to review later`);
  return collapsed.join(' · ');
}

export function groupCrmDigestItems(crmItems = []) {
  return CRM_DIGEST_GROUPS.map((group) => ({
    group,
    items: crmItems.filter((item) => item.kind === group.kind)
  })).filter((row) => row.items.length > 0);
}

export function buildCrmFollowUpHtml(crmItems = [], webAppUrl) {
  const grouped = groupCrmDigestItems(crmItems);
  if (!grouped.length) return '';

  const now = grouped.filter((row) => row.group.bucket === 'now');
  const later = grouped.filter((row) => row.group.bucket === 'later');
  const summary = summaryBits(grouped);
  const queueHref = absUrl(webAppUrl, crmQueuePath());

  const nowHtml = now.map((row) => groupHtml(row.group, row.items, webAppUrl)).join('');
  const laterHtml = later.length
    ? `<p style="margin:8px 0 10px;color:#888;font-size:11px;letter-spacing:0.04em;text-transform:uppercase;">Later</p>
       ${later.map((row) => groupHtml(row.group, row.items, webAppUrl)).join('')}`
    : '';

  const shown = grouped.reduce((n, row) => n + Math.min(row.items.length, row.group.preview), 0);
  console.log('[digest] crm follow-ups html', {
    total: crmItems.length,
    shown,
    groups: grouped.map((row) => `${row.group.kind}:${row.items.length}`)
  });

  return `
    <h2 style="font-size:18px;margin:24px 0 6px;">CRM follow-ups</h2>
    ${summary ? `<p style="color:#555;margin:0 0 16px;font-size:14px;">${escapeHtml(summary)}</p>` : ''}
    ${nowHtml}
    ${laterHtml}
    <p style="margin:4px 0 0;font-size:13px;">
      <a href="${escapeHtml(queueHref)}" style="color:#555;">Open today's queue in Vettr →</a>
    </p>
  `;
}
