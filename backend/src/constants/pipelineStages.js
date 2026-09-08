/** Acquisition pipeline stages — must match web/src/utils/pipelineStages.js */
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

export const UNSTAGED_KEY = '__unstaged__';

export const KANBAN_COLUMNS = [
  {
    id: UNSTAGED_KEY,
    label: 'Inbox',
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
