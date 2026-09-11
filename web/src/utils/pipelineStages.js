/** Acquisition pipeline stages — shared by My Deals and CRM Kanban. */
export const PIPELINE_STAGES = [
  'Requested NDA',
  'Signed NDA',
  'Review CIM',
  'Seller Call',
  'Review Financials',
  'Review Tax Returns',
  'Preliminary Valuation',
  'Send IOI',
  'Bank Pre-Approval',
  'LOI Sent',
  'LOI Signed',
  'Starting Due Diligence',
  'Passed On Deal',
  'Custom Status'
];

/** Alias used by My Deals modal */
export const PIPELINE_STAGE_OPTIONS = PIPELINE_STAGES;

export const UNSTAGED_KEY = '__unstaged__';
export const UNSTAGED_LABEL = 'Inbox';

/**
 * Condensed Kanban columns — detailed stages still stored on the deal;
 * columns group related milestones for a simpler board UX.
 */
export const KANBAN_COLUMNS = [
  {
    id: UNSTAGED_KEY,
    label: UNSTAGED_LABEL,
    stages: [],
    defaultStage: null
  },
  {
    id: 'screening',
    label: 'Screening',
    stages: ['Requested NDA', 'Signed NDA', 'Review CIM', 'Seller Call'],
    defaultStage: 'Requested NDA'
  },
  {
    id: 'under_review',
    label: 'Under Review',
    stages: [
      'Review Financials',
      'Review Tax Returns',
      'Preliminary Valuation',
      'Send IOI',
      'Bank Pre-Approval',
      'Custom Status'
    ],
    defaultStage: 'Review Financials'
  },
  {
    id: 'loi',
    label: 'LOI',
    stages: ['LOI Sent', 'LOI Signed'],
    defaultStage: 'LOI Sent'
  },
  {
    id: 'diligence',
    label: 'Due Diligence',
    stages: ['Starting Due Diligence'],
    defaultStage: 'Starting Due Diligence'
  },
  {
    id: 'passed',
    label: 'Passed',
    stages: ['Passed On Deal'],
    defaultStage: 'Passed On Deal'
  }
];

export function kanbanColumnForStage(stage) {
  const trimmed = (stage || '').trim();
  if (!trimmed) return KANBAN_COLUMNS[0];
  for (const col of KANBAN_COLUMNS) {
    if (col.stages.includes(trimmed)) return col;
  }
  return KANBAN_COLUMNS.find((c) => c.id === 'under_review') || KANBAN_COLUMNS[0];
}

export function defaultStageForKanbanColumn(columnId) {
  const col = KANBAN_COLUMNS.find((c) => c.id === columnId);
  return col ? col.defaultStage : null;
}

/**
 * Pipeline stage key → user-facing label.
 * Built-in stages keep their names; "Custom Status" uses the saved custom label.
 * Keep in sync with backend/src/lib/teamActivity.js displayStageLabel.
 */
export function displayStageLabel(stage, customLabel) {
  const s = String(stage || '').trim();
  if (s === 'Custom Status') {
    const label = String(customLabel || '').trim();
    if (label) return label;
  }
  return s;
}

export function resolveDealStage(deal) {
  const stage = (deal?.progressStage || deal?.progress_stage || '').trim();
  return displayStageLabel(stage, deal?.customStageLabel || deal?.custom_stage_label);
}

export function daysInCurrentStage(deal) {
  const stage = resolveDealStage(deal);
  if (!stage) return null;

  const history = Array.isArray(deal?.progressHistory) ? deal.progressHistory : [];
  let stageEnteredAt = null;

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    const entryStage = (entry?.stage || entry?.status || '').trim();
    if (entryStage === stage) {
      stageEnteredAt = entry.timestamp || entry.date;
      break;
    }
  }

  const ref = stageEnteredAt || deal?.updatedAt || deal?.savedAt;
  if (!ref) return null;

  const ms = Date.now() - new Date(ref).getTime();
  if (!Number.isFinite(ms) || ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export function cocReturnTier(coc) {
  if (coc == null || !Number.isFinite(coc)) return 'neutral';
  if (coc >= 100) return 'excellent';
  if (coc >= 50) return 'very-good';
  if (coc >= 25) return 'good';
  if (coc >= 0) return 'fair';
  return 'bad';
}
