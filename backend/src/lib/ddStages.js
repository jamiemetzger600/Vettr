/** Closing stages shared by the diligence Gantt and milestone dates. */
export const DD_STAGE_IDS = ['loi', 'psa', 'diligence', 'qoe', 'bank', 'custom', 'close'];

const STANDARD_DILIGENCE = new Set([
  'tax',
  'legal & corporate',
  'operations',
  'hr & benefits',
  'real estate & facilities',
  'it & systems',
  'customer & revenue',
  'licenses & permits',
  'regulatory & compliance',
  'insurance'
]);

export function stageIdForGroup(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return 'custom';
  if (/qoe|qofe|quality of earnings|\bfinancial\b/.test(n)) return 'qoe';
  if (/\bloi\b|letter of intent/.test(n)) return 'loi';
  if (/\bsba\b|\bbank\b|underwriting|\blender\b/.test(n)) return 'bank';
  if (/\bpsa\b|purchase and sale|purchase & sale|asset purchase/.test(n)) return 'psa';
  if (/close date|\bclosing\b|\bclose\b/.test(n)) return 'close';
  if (STANDARD_DILIGENCE.has(n)) return 'diligence';
  return 'custom';
}

export function isStageId(value) {
  return DD_STAGE_IDS.includes(String(value || ''));
}
