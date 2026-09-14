/**
 * Lightweight SBA 7(a) readiness heuristic for listing cards.
 * Not a credit decision — flags common SOP 50 10 gaps.
 */
export function sbaReadinessScore(deal) {
  const price = Number(deal?.askingPrice ?? deal?.asking_price);
  const ebitda = Number(deal?.ebitda ?? deal?.annual_profit ?? deal?.annualProfit);
  const franchise = String(deal?.franchise || '').toLowerCase();
  const industry = String(deal?.industry || '').toLowerCase();
  const years = Number(deal?.yearsEstablished ?? deal?.years_established);

  const checks = [];
  let score = 0;

  const hasPrice = Number.isFinite(price) && price > 0;
  const hasEbitda = Number.isFinite(ebitda) && ebitda > 0;
  if (hasPrice && hasEbitda) {
    score += 25;
    checks.push({ ok: true, label: 'Price and cash flow present' });
    const inj = price * 0.1;
    checks.push({
      ok: true,
      label: `~10% equity injection ≈ $${Math.round(inj).toLocaleString()}`
    });
    score += 15;
    const dscrProxy = ebitda / Math.max(price * 0.09, 1);
    if (dscrProxy >= 1.25) {
      score += 20;
      checks.push({ ok: true, label: 'Cash flow vs price looks DSCR-viable' });
    } else {
      checks.push({ ok: false, label: 'Cash flow vs price may miss 1.25x DSCR' });
    }
  } else {
    checks.push({ ok: false, label: 'Need asking price and EBITDA' });
  }

  if (Number.isFinite(years) && years >= 2) {
    score += 15;
    checks.push({ ok: true, label: '2+ years in business' });
  } else {
    checks.push({ ok: false, label: 'Confirm 2+ years operating history' });
  }

  const isFranchise = franchise === 'yes' || franchise === 'true' || /\bfranchise/.test(industry);
  if (isFranchise) {
    checks.push({ ok: false, label: 'Franchise: confirm SBA Directory / 2462' });
  } else {
    score += 10;
    checks.push({ ok: true, label: 'Not flagged as franchise' });
  }

  const needsPhaseI = /\bmanufactur|chemical|gas station|dry.?clean|auto repair/.test(industry);
  if (needsPhaseI) {
    checks.push({ ok: false, label: 'Phase I ESA likely required' });
  } else {
    score += 15;
    checks.push({ ok: true, label: 'Phase I not obviously required' });
  }

  score = Math.max(0, Math.min(100, score));
  let label = 'Needs work';
  if (score >= 75) label = 'SBA-ready';
  else if (score >= 50) label = 'SBA possible';
  return { score, label, checks };
}
