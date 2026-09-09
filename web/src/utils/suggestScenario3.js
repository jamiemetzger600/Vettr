import {
  analyzeDealScenario,
  buildFinancingCoefficients,
  createDefaultScenarios
} from './dealCalculatorMath';

const FINANCING_FINGERPRINT_KEYS = [
  'sbaPercent',
  'equityPercent',
  'sellerEnabled',
  'sellerPercent',
  'sellerStandby',
  'sellerPaymentType'
];

export function financingFingerprint(scenario) {
  if (!scenario) return '';
  return FINANCING_FINGERPRINT_KEYS.map((key) => `${key}:${scenario[key]}`).join('|');
}

/** Scenario 3 still uses the factory preset (user has not customized it). */
export function isScenario3Pristine(scenarios, calculatorDefaults, deal) {
  if (!scenarios || scenarios.length < 3) return false;
  const defaults = createDefaultScenarios(deal || {}, calculatorDefaults);
  return financingFingerprint(scenarios[2]) === financingFingerprint(defaults[2]);
}

export function describeFinancingPatch(patch) {
  const parts = [`${patch.sbaPercent}% SBA`, `${patch.equityPercent}% equity`];
  if (patch.sellerEnabled) {
    let seller = `${patch.sellerPercent}% seller note`;
    if (patch.sellerStandby === 'yes') {
      seller += patch.sellerStandbyYears
        ? `, ${patch.sellerStandbyYears}yr standby`
        : ', standby';
    }
    if (patch.sellerPaymentType === 'interest-only') seller += ', interest-only';
    parts.push(seller);
  } else {
    parts.push('no seller note');
  }
  return parts.join(' · ');
}

function buildCreativeFinancingCandidates() {
  const candidates = [];
  const seen = new Set();
  const sbaOptions = [50, 55, 60, 65, 75, 85, 90];
  const sellerPcts = [5, 10, 15, 25, 30];
  const sellerVariants = [
    { sellerStandby: 'no', sellerPaymentType: 'amortizing' },
    { sellerStandby: 'yes', sellerPaymentType: 'amortizing', sellerStandbyYears: '2' },
    { sellerStandby: 'no', sellerPaymentType: 'interest-only' }
  ];

  const add = (patch) => {
    const fp = financingFingerprint({ sellerEnabled: false, sellerPercent: '10', ...patch });
    if (seen.has(fp)) return;
    seen.add(fp);
    candidates.push(patch);
  };

  for (const sba of sbaOptions) {
    add({
      sbaPercent: String(sba),
      equityPercent: String(100 - sba),
      sellerEnabled: false,
      sellerPercent: '10',
      sellerStandby: 'no',
      sellerPaymentType: 'amortizing'
    });

    for (const sellerPct of sellerPcts) {
      const equity = 100 - sba - sellerPct;
      if (equity < 5 || equity > 35) continue;
      for (const variant of sellerVariants) {
        add({
          sbaPercent: String(sba),
          equityPercent: String(equity),
          sellerEnabled: true,
          sellerPercent: String(sellerPct),
          ...variant
        });
      }
    }
  }

  return candidates;
}

/**
 * Suggest an alternative Scenario 3 structure not used in Scenarios 1–2, optimized for CoC.
 * Returns null when Scenario 3 is customized, inputs are incomplete, or no better structure exists.
 */
export function suggestScenario3Alternative(scenarios, qualityPrefs, calculatorDefaults = {}, deal = {}) {
  if (!scenarios || scenarios.length < 3) return null;
  if (!isScenario3Pristine(scenarios, calculatorDefaults, deal)) return null;
  if (scenarios[2]?.dismissScenario3Suggestion) return null;

  const base = scenarios[0];
  const asking = parseFloat(String(base?.askingPrice || '').replace(/,/g, '')) || 0;
  const ebitda = parseFloat(String(base?.ebitda || '').replace(/,/g, '')) || 0;
  if (asking <= 0 || ebitda <= 0) return null;

  const usedFingerprints = new Set([
    financingFingerprint(scenarios[0]),
    financingFingerprint(scenarios[1])
  ]);

  const analysis0 = analyzeDealScenario(scenarios[0], qualityPrefs);
  const analysis1 = analyzeDealScenario(scenarios[1], qualityPrefs);
  const bestExistingCoc = Math.max(analysis0.coc, analysis1.coc);

  let best = null;
  let bestCoc = bestExistingCoc;

  for (const patch of buildCreativeFinancingCandidates()) {
    if (usedFingerprints.has(financingFingerprint(patch))) continue;

    const candidate = { ...base, ...patch };
    const fin = buildFinancingCoefficients(candidate);
    const totalPct = fin.sbaPercent + fin.equityPercent + (fin.sellerEnabled ? fin.sellerPercent : 0);
    if (Math.abs(totalPct - 100) > 0.01) continue;

    const analysis = analyzeDealScenario(candidate, qualityPrefs);
    if (!analysis.pctOk) continue;
    if (analysis.coc <= bestCoc) continue;

    bestCoc = analysis.coc;
    best = { patch, analysis, scenario: candidate };
  }

  if (!best) return null;

  const betterThanIndex = analysis0.coc >= analysis1.coc ? 0 : 1;

  return {
    scenario: best.scenario,
    patch: best.patch,
    analysis: best.analysis,
    label: describeFinancingPatch(best.patch),
    coc: best.analysis.coc,
    improvementVsBest: best.analysis.coc - bestExistingCoc,
    betterThanScenario: betterThanIndex + 1
  };
}
