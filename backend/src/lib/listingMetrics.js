/** Listing financials — same four fields as aggregator / CRM deed cards. */

export function formatMoneyShort(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return m % 1 === 0 ? `$${m}M` : `$${m.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return k % 1 === 0 ? `$${k}K` : `$${k.toFixed(1)}K`;
  }
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function formatMultipleDisplay(deal) {
  const listed = Number(deal?.profitMultiple);
  if (Number.isFinite(listed) && listed > 0) return `${listed.toFixed(2)}X`;
  const price = Number(deal?.askingPrice);
  const ebitda = Number(deal?.ebitda);
  if (Number.isFinite(price) && Number.isFinite(ebitda) && ebitda > 0) {
    return `${(price / ebitda).toFixed(2)}X`;
  }
  return '—';
}

export function listingMetricCells(deal) {
  return [
    { label: 'Purchase Price', value: formatMoneyShort(deal?.askingPrice) },
    { label: 'Revenue', value: formatMoneyShort(deal?.revenue) },
    { label: 'EBITDA', value: formatMoneyShort(deal?.ebitda) },
    { label: 'Multiple', value: formatMultipleDisplay(deal) }
  ];
}

export function listingMetricsTableHtml(deal, escapeHtml) {
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s ?? '');
  const cells = listingMetricCells(deal);
  const tds = cells.map((cell) => (
    `<td style="width:25%;vertical-align:top;padding:8px 8px 0 0;">`
    + `<div style="font-size:14px;font-weight:600;color:#111;line-height:1.2;">${esc(cell.value)}</div>`
    + `<div style="font-size:11px;color:#777;margin-top:2px;">${esc(cell.label)}</div>`
    + `</td>`
  )).join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px;border-collapse:collapse;"><tr>${tds}</tr></table>`;
}
