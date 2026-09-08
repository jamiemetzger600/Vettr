/** Stage and follow-up checklists shown when a CRM task row is expanded. */

export function normalizeTaskTitle(title) {
  return String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

const TASK_CHECKLISTS = {
  follow_nda: [
    'Email the broker about the NDA',
    'Call if no reply',
    'File the signed NDA when it arrives'
  ],
  request_nda: [
    'Find the broker email',
    'Send the NDA request',
    'Log the date you sent it'
  ],
  request_cim: [
    'Email the broker for the CIM',
    'Confirm the CIM arrived',
    'Block time to read it'
  ],
  review_cim: [
    'Read the CIM',
    'List questions for the broker',
    'Schedule a review call'
  ]
};

const TITLE_TO_KEY = {
  'follow up: heard back on the nda?': 'follow_nda',
  'follow up on nda request': 'follow_nda',
  'request nda from broker': 'request_nda',
  'request the cim from the broker': 'request_cim',
  'review the cim': 'review_cim',
  'review cim when received': 'review_cim'
};

const GENERIC_CHECKLIST = [
  'Write the next concrete step',
  'Put a date on it',
  'Tell the broker what you need'
];

export const STAGE_CHECKLISTS = {
  '': [
    'Request NDA from broker',
    'Confirm who gets the NDA',
    'Log the date you requested it'
  ],
  'Requested NDA': TASK_CHECKLISTS.follow_nda,
  'Signed NDA': TASK_CHECKLISTS.request_cim,
  'Review CIM': TASK_CHECKLISTS.review_cim,
  'Seller Call': [
    'Send an agenda to seller / broker',
    'Hold the seller call',
    'Write up notes after the call'
  ],
  'Review Financials': [
    'Request TTM P&L and tax returns',
    'Review the financial package',
    'Note add-backs and red flags'
  ],
  'Review Tax Returns': [
    'Request 3 years of tax returns',
    'Compare tax returns to the P&L',
    'Flag discrepancies'
  ],
  'Preliminary Valuation': [
    'Run the deal calculator',
    'Set a walk-away price',
    'Share the range with your partner'
  ],
  'Send IOI': [
    'Draft the IOI',
    'Send IOI to the broker',
    'Confirm they received it'
  ],
  'Bank Pre-Approval': [
    'Send the package to the lender',
    'Confirm SBA / lender pre-approval',
    'Note any conditions'
  ],
  'LOI Sent': [
    'Follow up on the LOI',
    'Schedule a discussion if needed',
    'Track broker / seller comments'
  ],
  'LOI Signed': [
    'Request the data room',
    'Align attorney and CPA',
    'Kick off the DD checklist'
  ],
  'Starting Due Diligence': [
    'Start the DD checklist',
    'Assign DD owners',
    'Set a weekly DD check-in'
  ],
  'Passed On Deal': [],
  'Custom Status': GENERIC_CHECKLIST
};

function metadataKey(task) {
  const raw = task?.metadata;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)?.key || null;
    } catch {
      return null;
    }
  }
  return raw.key || null;
}

export function playbookKeyForTask(task) {
  const key = metadataKey(task);
  if (key && TASK_CHECKLISTS[key]) return key;
  return TITLE_TO_KEY[normalizeTaskTitle(task?.title)] || null;
}

export function titlesMatch(a, b) {
  const na = normalizeTaskTitle(a);
  const nb = normalizeTaskTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const strip = (s) => s.replace(/\bthe\b/g, '').replace(/\s+/g, ' ').trim();
  return strip(na) === strip(nb);
}

export function checklistTitlesForTask(task) {
  const key = playbookKeyForTask(task);
  const titles = key
    ? TASK_CHECKLISTS[key]
    : (STAGE_CHECKLISTS[String(task?.progress_stage || '').trim()] || GENERIC_CHECKLIST);
  return titles
    .filter((title) => !titlesMatch(title, task?.title))
    .slice(0, 5);
}

/**
 * Merge playbook titles with existing subtasks / sibling deal tasks.
 * kind: 'subtask' | 'suggest' | 'on_deal' | 'on_deal_done'
 */
export function buildExpandChecklist({ titles = [], parentId, subtasks = [], dealTasks = [] } = {}) {
  const usedSubIds = new Set();
  const items = titles.map((title) => {
    const child = subtasks.find((t) => titlesMatch(t.title, title));
    if (child) {
      usedSubIds.add(Number(child.id));
      return { title, kind: 'subtask', task: child };
    }
    const sibling = dealTasks.find((t) => (
      Number(t.id) !== Number(parentId)
      && Number(t.parent_task_id) !== Number(parentId)
      && titlesMatch(t.title, title)
    ));
    if (sibling) {
      return {
        title,
        kind: sibling.status === 'done' ? 'on_deal_done' : 'on_deal',
        task: sibling
      };
    }
    return { title, kind: 'suggest', task: null };
  });
  const extras = subtasks.filter((t) => !usedSubIds.has(Number(t.id)));
  return { items, extras };
}
