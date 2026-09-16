/** Parse `compareIds=1,2,3` from a share URL. Max 3 unique numeric ids. */
export function parseCompareIds(raw) {
  if (raw == null || raw === '') return [];
  const seen = new Set();
  const ids = [];
  const text = Array.isArray(raw) ? raw.join(',') : String(raw);
  for (const part of text.split(',')) {
    const n = Number(String(part).trim());
    if (!Number.isFinite(n) || n <= 0) continue;
    const key = String(n);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(n);
    if (ids.length >= 3) break;
  }
  return ids;
}

export function serializeCompareIds(ids) {
  return parseCompareIds(Array.isArray(ids) ? ids.join(',') : ids).join(',');
}

export function dealMatchesCompareId(deal, id) {
  if (!deal || id == null) return false;
  const sid = String(id);
  return String(deal.id) === sid || String(deal.vettrId ?? '') === sid;
}

export function cocTier(coc) {
  if (!(coc > -Infinity)) return 'none';
  if (coc >= 100) return 'excellent';
  if (coc >= 50) return 'very-good';
  if (coc >= 25) return 'good';
  if (coc >= 0) return 'fair';
  return 'bad';
}

export function paybackTier(years) {
  if (years <= 0 || years >= 100) return 'none';
  if (years <= 2) return 'excellent';
  if (years <= 4) return 'very-good';
  if (years <= 6) return 'good';
  if (years <= 10) return 'fair';
  return 'bad';
}

/** Highest cash-on-cash wins, same rule as calculator scenario compare. */
export function bestDealIndices(rows) {
  let maxCoc = -Infinity;
  for (const row of rows || []) {
    const coc = Number(row?.coc);
    if (row?.coc == null || !Number.isFinite(coc)) continue;
    if (coc > maxCoc) maxCoc = coc;
  }
  if (!Number.isFinite(maxCoc)) return new Set();
  const best = new Set();
  (rows || []).forEach((row, index) => {
    const coc = Number(row?.coc);
    if (row?.coc == null || !Number.isFinite(coc)) return;
    if (coc === maxCoc) best.add(index);
  });
  return best;
}
