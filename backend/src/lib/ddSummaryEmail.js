const STATUS_LABEL = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting_on_other: 'Waiting',
  blocked: 'Blocked',
  complete: 'Complete',
  na: 'Not applicable'
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseRecipientEmails(raw) {
  const list = Array.isArray(raw) ? raw : String(raw || '').split(/[,;\n]+/);
  const emails = [...new Set(list.map((s) => String(s).trim().toLowerCase()).filter(Boolean))];
  if (!emails.length) {
    const err = new Error('Add at least one email address');
    err.status = 400;
    throw err;
  }
  if (emails.length > 20) {
    const err = new Error('Send to 20 people or fewer');
    err.status = 400;
    throw err;
  }
  const bad = emails.find((email) => !EMAIL_RE.test(email));
  if (bad) {
    const err = new Error(`Invalid email: ${bad}`);
    err.status = 400;
    throw err;
  }
  return emails;
}

function isOpen(item) {
  return item?.status !== 'complete' && item?.status !== 'na';
}

function statusLabel(status) {
  return STATUS_LABEL[status] || 'Not started';
}

function formatDue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles'
  });
}

function assigneeHeading(item) {
  const names = (item.assignees || [])
    .map((assignee) => String(assignee.name || assignee.email || '').trim())
    .filter(Boolean);
  return names.length ? names.join(', ') : 'Unassigned';
}

function noteLines(item) {
  const lines = [];
  const description = String(item.description || '').trim();
  if (description) lines.push(description);
  for (const comment of item.comments || []) {
    if (!comment?.isExternal && !comment?.is_external) continue;
    const body = String(comment.body || '').trim();
    if (body) lines.push(body);
  }
  return lines.slice(0, 3).map((line) => (line.length > 180 ? `${line.slice(0, 177)}…` : line));
}

function documentLine(item) {
  const files = (item.documents || []).map((doc) => String(doc.filename || '').trim()).filter(Boolean);
  if (item.requests_document && files.length === 0) return 'Document still needed';
  if (files.length) return `Received: ${files.join(', ')}`;
  return '';
}

function shell(dealName, intro, body) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#222;max-width:640px;margin:0 auto;padding:8px 4px;line-height:1.45;">
  <p style="margin:0 0 4px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#777;">Due diligence</p>
  <h1 style="margin:0 0 8px;font-size:22px;font-weight:650;">${escapeHtml(dealName)}</h1>
  <p style="margin:0 0 20px;font-size:15px;color:#444;">${escapeHtml(intro)}</p>
  ${body}
</div>`;
}

function itemBlock(title, meta, extraLines) {
  const extras = extraLines.filter(Boolean).map((line) => (
    `<div style="margin-top:4px;color:#444;font-size:14px;">${escapeHtml(line)}</div>`
  )).join('');
  return `<div style="border:1px solid #e6e6e6;border-radius:8px;padding:10px 12px;margin:0 0 8px;">
    <div style="font-weight:600;font-size:15px;">${escapeHtml(title)}</div>
    <div style="margin-top:2px;color:#666;font-size:13px;">${escapeHtml(meta)}</div>
    ${extras}
  </div>`;
}

function buildInternal(dealName, groups) {
  const buckets = new Map();
  let open = 0;
  let unassigned = 0;
  for (const group of groups || []) {
    for (const item of group.items || []) {
      if (!isOpen(item)) continue;
      open += 1;
      const heading = assigneeHeading(item);
      if (heading === 'Unassigned') unassigned += 1;
      if (!buckets.has(heading)) buckets.set(heading, []);
      const due = formatDue(item.due_at);
      buckets.get(heading).push(itemBlock(
        item.title || 'Untitled item',
        [group.name, statusLabel(item.status), due ? `Due ${due}` : 'No due date'].filter(Boolean).join(' · '),
        []
      ));
    }
  }
  const names = [...buckets.keys()].sort((a, b) => {
    if (a === 'Unassigned') return -1;
    if (b === 'Unassigned') return 1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });
  const body = names.length
    ? names.map((name) => `<h2 style="margin:18px 0 8px;font-size:16px;">${escapeHtml(name)} <span style="color:#888;font-weight:500;font-size:13px;">${buckets.get(name).length}</span></h2>${buckets.get(name).join('')}`).join('')
    : '<p style="color:#444;">Nothing is still open.</p>';
  const intro = open
    ? `${open} open · ${unassigned} unassigned`
    : 'Nothing is still open';
  return {
    subject: `DD assignments: ${dealName || 'Deal'}`,
    html: shell(dealName || 'Deal', intro, body)
  };
}

function buildExternal(dealName, groups) {
  let open = 0;
  let settled = 0;
  const openHtml = [];
  const settledHtml = [];
  for (const group of groups || []) {
    const openItems = [];
    for (const item of group.items || []) {
      const title = item.title || 'Untitled item';
      const due = formatDue(item.due_at);
      if (!isOpen(item)) {
        settled += 1;
        settledHtml.push(`<li style="margin:0 0 4px;">${escapeHtml(title)} <span style="color:#777;">· ${escapeHtml(group.name)} · ${escapeHtml(statusLabel(item.status))}</span></li>`);
        continue;
      }
      open += 1;
      openItems.push(itemBlock(
        title,
        [statusLabel(item.status), due ? `Due ${due}` : 'No due date'].join(' · '),
        [documentLine(item), ...noteLines(item).map((line) => `Note: ${line}`)]
      ));
    }
    if (openItems.length) {
      openHtml.push(`<h2 style="margin:18px 0 8px;font-size:16px;">${escapeHtml(group.name || 'Section')}</h2>${openItems.join('')}`);
    }
  }
  const settledBlock = settled
    ? `<h2 style="margin:22px 0 8px;font-size:16px;color:#555;">Already in</h2><ul style="margin:0;padding-left:18px;font-size:14px;">${settledHtml.join('')}</ul>`
    : '';
  const body = `${openHtml.join('') || '<p style="color:#444;">Nothing is still missing.</p>'}${settledBlock}`;
  const intro = open
    ? `${open} still needed${settled ? ` · ${settled} already in` : ''}`
    : 'Nothing is still missing';
  return {
    subject: `Due diligence: ${dealName || 'Deal'}`,
    html: shell(dealName || 'Deal', intro, body)
  };
}

export function buildDdSummaryEmail({ audience, dealName, groups }) {
  if (audience === 'external') return buildExternal(dealName, groups);
  return buildInternal(dealName, groups);
}
