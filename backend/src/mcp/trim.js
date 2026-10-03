const SKIP_KEYS = new Set([
  'calculator_state',
  'calculatorState',
  'progress_history',
  'progressHistory',
  'shareLinks',
  'password_hash',
  'access_token',
  'refresh_token'
]);

export function compactJson(value, opts = {}, depth = 0) {
  const maxString = opts.maxString ?? 400;
  const maxArray = opts.maxArray ?? 20;
  const maxDepth = opts.maxDepth ?? 6;
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > maxString ? `${value.slice(0, maxString)}…` : value;
  }
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= maxDepth) return '[truncated]';
  if (Array.isArray(value)) {
    const sliced = value.slice(0, maxArray).map((item) => compactJson(item, opts, depth + 1));
    if (value.length > maxArray) sliced.push({ truncated: value.length - maxArray });
    return sliced;
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (SKIP_KEYS.has(key)) continue;
    out[key] = compactJson(child, opts, depth + 1);
  }
  return out;
}

export function trimBuyBoxes(settings) {
  const boxes = Array.isArray(settings?.buyBoxes) ? settings.buyBoxes : [];
  return {
    activeBuyBoxIndex: settings?.activeBuyBoxIndex ?? 0,
    buyBoxes: boxes.map((slot, index) => ({
      index,
      name: slot?.name || `Buy box ${index + 1}`,
      feedSearch: slot?.feedSearch || '',
      excludeKeywords: slot?.excludeKeywords || [],
      excludeLists: slot?.excludeLists || {},
      currentExcludeList: slot?.currentExcludeList || '',
      currentSearchList: slot?.currentSearchList || '',
      minPrice: slot?.minPrice ?? null,
      maxPrice: slot?.maxPrice ?? null,
      minEbitda: slot?.minEbitda ?? null,
      maxEbitda: slot?.maxEbitda ?? null,
      minRevenue: slot?.minRevenue ?? null,
      maxRevenue: slot?.maxRevenue ?? null,
      targetStates: slot?.targetStates || [],
      excludeStates: slot?.excludeStates || [],
      targetIndustries: slot?.targetIndustries || [],
      includeNearMatchesPercent: slot?.includeNearMatchesPercent ?? 0
    }))
  };
}

export function trimChecklist(checklist) {
  if (!checklist) return null;
  const groups = Array.isArray(checklist.groups) ? checklist.groups : [];
  return {
    id: checklist.id,
    templateName: checklist.template_name || null,
    targetDate: checklist.target_date || null,
    startedAt: checklist.started_at || null,
    completedAt: checklist.completed_at || null,
    progress: checklist.progress || null,
    milestones: checklist.milestones || [],
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      items: (group.items || []).map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        dueAt: item.due_at || null,
        completedAt: item.completed_at || null,
        description: typeof item.description === 'string' ? item.description.slice(0, 240) : ''
      }))
    }))
  };
}
