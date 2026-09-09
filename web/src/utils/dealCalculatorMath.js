/**
 * Deal analyzer calculations aligned with chrome extension content.js (calculate / calculateTargetOffer).
 */

export const SELLER_NOTE_TERM_YEARS = 5;
export const DEFAULT_SELLER_STANDBY_YEARS = 2;

export function parseMoney(value) {
  if (value == null || value === '') return 0;
  return parseFloat(String(value).replace(/[$,]/g, '')) || 0;
}

export function calcSbaDebtServicePer1(bankRateDecimal, bankYears) {
  if (bankRateDecimal > 0 && bankYears > 0) {
    const r = bankRateDecimal / 12;
    const n = bankYears * 12;
    const monthlyPer1 = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    return monthlyPer1 * 12;
  }
  if (bankYears > 0) return 1 / bankYears;
  return 0;
}

export function resolveSellerNoteTermYears(scenario) {
  const fromScenario = parseFloat(scenario?.sellerTermYears ?? scenario?.sellerTerm);
  if (fromScenario > 0) return fromScenario;
  return SELLER_NOTE_TERM_YEARS;
}

/** Years of $0 seller-note payments. 0 with standby=yes means full-term standby (legacy). */
export function resolveSellerStandbyYears(scenario, termYears = SELLER_NOTE_TERM_YEARS) {
  if (scenario?.sellerStandby !== 'yes') return 0;
  const n = parseFloat(scenario?.sellerStandbyYears);
  if (!(n > 0)) return 0;
  const term = termYears > 0 ? termYears : SELLER_NOTE_TERM_YEARS;
  return Math.min(n, term);
}

export function calcSellerAnnualDebtService(noteAmt, sellerRate, paymentType, years) {
  if (!(noteAmt > 0)) return 0;
  if (paymentType === 'interest-only') return noteAmt * sellerRate;
  const sy = years > 0 ? years : SELLER_NOTE_TERM_YEARS;
  if (sellerRate === 0) return noteAmt / sy;
  const r = sellerRate / 12;
  const n = sy * 12;
  const monthly = noteAmt * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return monthly * 12;
}

export function calcSellerDebtServicePer1(sellerRateDecimal, paymentType, sellerYears = SELLER_NOTE_TERM_YEARS) {
  if (paymentType === 'interest-only') return sellerRateDecimal;
  const years = sellerYears > 0 ? sellerYears : SELLER_NOTE_TERM_YEARS;
  if (sellerRateDecimal === 0) return 1 / years;
  const r = sellerRateDecimal / 12;
  const n = years * 12;
  const monthlyPer1 = (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return monthlyPer1 * 12;
}

export function calculateDealQualityScore(askingPrice, maxPrice, cocReturn, paybackPeriod, targetCOC, targetPayback) {
  let score = 0;
  const tc = targetCOC || 25;
  const tp = targetPayback || 4;

  if (maxPrice > 0 && askingPrice > 0) {
    const priceRatio = askingPrice / maxPrice;
    if (priceRatio <= 1.0) score += 40;
    else if (priceRatio <= 1.1) score += 30;
    else if (priceRatio <= 1.2) score += 20;
    else if (priceRatio <= 1.3) score += 10;
  }

  if (cocReturn >= tc * 1.5) score += 35;
  else if (cocReturn >= tc) score += 30;
  else if (cocReturn >= tc * 0.75) score += 20;
  else if (cocReturn >= tc * 0.5) score += 10;

  if (paybackPeriod > 0 && paybackPeriod < 100) {
    if (paybackPeriod <= tp * 0.75) score += 25;
    else if (paybackPeriod <= tp) score += 20;
    else if (paybackPeriod <= tp * 1.5) score += 15;
    else if (paybackPeriod <= tp * 2) score += 5;
  }

  return Math.round(score);
}

export function getQualityPresentation(score) {
  if (score >= 80) {
    return { badge: '', text: 'Excellent Deal', scoreColor: '#27ae60', borderColor: '#27ae60' };
  }
  if (score >= 60) {
    return { badge: '', text: 'Good Deal', scoreColor: '#f39c12', borderColor: '#f39c12' };
  }
  if (score >= 40) {
    return { badge: '', text: 'Fair Deal', scoreColor: '#e67e22', borderColor: '#e67e22' };
  }
  return { badge: '', text: 'Weak Deal', scoreColor: '#e74c3c', borderColor: '#e74c3c' };
}

/**
 * Build total debt service per $1 of purchase price for DSCR / target-offer constraints.
 * Standby seller note excluded from DSCR (extension behavior).
 */
export function buildFinancingCoefficients(scenario) {
  const sbaPercent = parseFloat(scenario.sbaPercent) || 0;
  const equityPercent = parseFloat(scenario.equityPercent) || 0;
  const sellerEnabled = Boolean(scenario.sellerEnabled);
  const sellerPercent = sellerEnabled ? (parseFloat(scenario.sellerPercent) || 0) : 0;
  const sellerStandby = scenario.sellerStandby === 'yes' ? 'yes' : 'no';
  const sellerRate = (parseFloat(scenario.sellerRate) || 0) / 100;
  const sellerPaymentType = scenario.sellerPaymentType === 'interest-only' ? 'interest-only' : 'amortizing';
  const sellerTermYears = resolveSellerNoteTermYears(scenario);
  const sellerStandbyYears = resolveSellerStandbyYears(scenario, sellerTermYears);
  const bankRate = (parseFloat(scenario.sbaRate) || 0) / 100;
  const bankYears = parseFloat(scenario.sbaTerm) || 10;

  const sbaDSPer1 = calcSbaDebtServicePer1(bankRate, bankYears);
  let sellerDSPer1 = 0;
  if (sellerEnabled && sellerPercent > 0) {
    sellerDSPer1 = calcSellerDebtServicePer1(sellerRate, sellerPaymentType, sellerTermYears);
  }
  const sellerDSForDSCR = sellerStandby === 'yes' ? 0 : sellerDSPer1;
  const totalDSPer1 =
    (sbaPercent / 100) * sbaDSPer1 + (sellerPercent / 100) * sellerDSForDSCR;

  return {
    sbaPercent,
    equityPercent,
    sellerPercent,
    sellerEnabled,
    sellerStandby,
    sellerStandbyYears,
    sellerPaymentType,
    sellerRate,
    sellerTermYears,
    bankRate,
    bankYears,
    sbaDSPer1,
    sellerDSPer1,
    totalDSPer1
  };
}

export function analyzeDealScenario(scenario, qualityPrefs = {}) {
  const ebitda = parseMoney(scenario.ebitda);
  const askingPrice = parseMoney(scenario.askingPrice);
  const usePurchaseOverride = Boolean(scenario.usePurchaseOverride);
  const rawPurchase = usePurchaseOverride ? parseMoney(scenario.purchasePrice) : askingPrice;
  const purchasePrice = rawPurchase > 0 ? rawPurchase : 0;

  const targetDSCR = parseFloat(scenario.dscr) || 1.25;
  const salary = parseMoney(scenario.salary);

  const fin = buildFinancingCoefficients(scenario);
  const { sbaPercent, equityPercent, sellerPercent, sellerEnabled, sellerStandby, sellerStandbyYears, sellerPaymentType, sellerRate, bankRate, bankYears } = fin;

  const totalPercent = sbaPercent + equityPercent + sellerPercent;
  const pctOk = Math.abs(totalPercent - 100) <= 0.01;

  const maxAnnualDebtService = ebitda > 0 && targetDSCR > 0 ? ebitda / targetDSCR : 0;
  const totalDSPer1DSCR = fin.totalDSPer1;
  const maxPurchasePrice = totalDSPer1DSCR > 0 ? maxAnnualDebtService / totalDSPer1DSCR : 0;

  const sbaLoanSize = (sbaPercent / 100) * purchasePrice;
  const equityAmount = (equityPercent / 100) * purchasePrice;
  const sellerNoteAmt = sellerEnabled ? (sellerPercent / 100) * purchasePrice : 0;

  let sbaAnnualDS = 0;
  if (sbaLoanSize > 0 && bankRate > 0 && bankYears > 0) {
    const r = bankRate / 12;
    const n = bankYears * 12;
    const monthlyPayment = sbaLoanSize * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
    sbaAnnualDS = monthlyPayment * 12;
  } else if (sbaLoanSize > 0 && bankYears > 0) {
    sbaAnnualDS = sbaLoanSize / bankYears;
  }

  let sellerAnnualDS = 0;
  if (sellerNoteAmt > 0 && sellerStandby !== 'yes') {
    sellerAnnualDS = calcSellerAnnualDebtService(
      sellerNoteAmt,
      sellerRate,
      sellerPaymentType,
      fin.sellerTermYears || SELLER_NOTE_TERM_YEARS
    );
  }

  const remainAfterStandby = (fin.sellerTermYears || SELLER_NOTE_TERM_YEARS) - (sellerStandbyYears || 0);
  let sellerAnnualDSAfterStandby = sellerAnnualDS;
  if (sellerNoteAmt > 0 && sellerStandby === 'yes') {
    sellerAnnualDSAfterStandby = remainAfterStandby > 0 && sellerStandbyYears > 0
      ? calcSellerAnnualDebtService(sellerNoteAmt, sellerRate, sellerPaymentType, remainAfterStandby)
      : 0;
  }

  const totalDebtService = sbaAnnualDS + sellerAnnualDS;
  const totalDebtServiceAfterStandby = sbaAnnualDS + sellerAnnualDSAfterStandby;
  const availableCashFlow = ebitda - totalDebtService;
  const freeCashFlow = availableCashFlow - salary;
  const freeCashFlowAfterStandby = ebitda - totalDebtServiceAfterStandby - salary;
  const totalTakeHome = salary + freeCashFlow;
  const actualDSCR = totalDebtService > 0 ? ebitda / totalDebtService : 0;
  const coc = equityAmount > 0 ? (totalTakeHome / equityAmount) * 100 : 0;
  const payback = totalTakeHome > 0 ? equityAmount / totalTakeHome : 0;

  const isDealOpportunity = askingPrice > 0 && maxPurchasePrice > 0 && askingPrice < maxPurchasePrice;
  const opportunitySavings = isDealOpportunity ? maxPurchasePrice - askingPrice : 0;
  const salaryWarning = salary > 0 && availableCashFlow > 0 && salary > availableCashFlow;

  const targetCOC = qualityPrefs.targetCOC ?? 25;
  const targetPayback = qualityPrefs.targetPayback ?? 4;
  const priceForQuality = askingPrice > 0 ? askingPrice : purchasePrice;
  const qualityScore = calculateDealQualityScore(
    priceForQuality,
    maxPurchasePrice,
    coc,
    payback,
    targetCOC,
    targetPayback
  );
  const qualityPresentation = getQualityPresentation(qualityScore);

  if (sellerStandby === 'yes') {
    console.log('[dealCalculator] seller standby FCF', {
      standbyYears: sellerStandbyYears,
      remainAfterStandby,
      sellerAnnualDS,
      sellerAnnualDSAfterStandby,
      freeCashFlow,
      freeCashFlowAfterStandby
    });
  }

  return {
    ebitda,
    askingPrice,
    purchasePrice,
    totalPercent,
    pctOk,
    maxPurchasePrice,
    maxAnnualDebtService,
    isDealOpportunity,
    opportunitySavings,
    sbaLoanSize,
    equityAmount,
    sellerNoteAmt,
    totalDebtService,
    totalDebtServiceAfterStandby,
    availableCashFlow,
    freeCashFlow,
    freeCashFlowAfterStandby,
    sellerStandbyYears,
    remainAfterStandby,
    totalTakeHome,
    actualDSCR,
    coc,
    payback,
    salaryWarning,
    qualityScore,
    qualityPresentation,
    fin
  };
}

function constraintBindingLabel(name) {
  if (name === 'Asking Price') return 'asking price';
  if (name === 'Target COC') return 'target COC';
  if (name === 'Salary') return 'salary requirement';
  if (name === 'DSCR') return 'DSCR requirement';
  return name;
}

/**
 * Extension-style MIN of four constraints; returns metrics at the recommended price.
 */
export function calculateTargetOfferAnalytical({
  ebitda: E,
  askingPrice,
  targetSalary: S,
  targetDSCR,
  targetCOC,
  equityPercent,
  totalDSPer1: ds,
  sbaPercent,
  sellerPercent,
  sellerEnabled,
  sellerPaymentType,
  sellerStandby,
  sellerStandbyYears = 0,
  sellerRate
}) {
  if (E <= 0) return { error: 'Enter EBITDA first' };

  const downPercent = equityPercent;
  const totalPct = sbaPercent + downPercent + sellerPercent;
  if (Math.abs(totalPct - 100) > 0.01) {
    return { error: 'Financing percentages must total 100% before calculating target offer.' };
  }

  const d = equityPercent / 100;
  if (d <= 0) return { error: 'Buyer equity % must be greater than 0.' };
  if (ds <= 0) return { error: 'Debt service per dollar is zero. Check SBA rate, term, and seller note settings.' };

  if (S > 0 && E <= S) {
    return {
      error: `EBITDA must be greater than your target salary ($${Math.round(S).toLocaleString()}) so there is room for debt service.`
    };
  }

  const maxPriceFromDSCR = E / (targetDSCR * ds);
  const maxPriceFromSalary = S > 0 ? (E - S) / ds : Infinity;
  const cocDecimal = targetCOC / 100;
  const maxPriceFromCOC = E / (cocDecimal * d + ds);
  const maxPriceFromAsking = askingPrice > 0 ? askingPrice : Infinity;

  const targetOfferPrice = Math.min(maxPriceFromDSCR, maxPriceFromSalary, maxPriceFromCOC, maxPriceFromAsking);

  if (!Number.isFinite(targetOfferPrice) || targetOfferPrice <= 0) {
    return { error: 'Unable to calculate a valid target offer. Check your inputs.' };
  }

  const tol = Math.max(1, targetOfferPrice * 1e-9);
  const order = [
    ['Asking Price', maxPriceFromAsking],
    ['Target COC', maxPriceFromCOC],
    ['Salary', maxPriceFromSalary],
    ['DSCR', maxPriceFromDSCR]
  ];
  let binding = 'DSCR';
  for (const [name, v] of order) {
    if (!Number.isFinite(v)) continue;
    if (Math.abs(v - targetOfferPrice) <= tol) {
      binding = name;
      break;
    }
  }

  const equity = targetOfferPrice * d;
  const totalDebtService = targetOfferPrice * ds;
  const availableCash = E - totalDebtService;
  const freeCashFlow = availableCash - S;
  const totalTakeHome = availableCash;
  const actualCOC = equity > 0 ? (totalTakeHome / equity) * 100 : 0;
  const actualPayback = totalTakeHome > 0 ? equity / totalTakeHome : 0;
  const actualDSCR = totalDebtService > 0 ? E / totalDebtService : 0;

  const diff = askingPrice > 0 ? askingPrice - targetOfferPrice : 0;
  const diffPct = askingPrice > 0 ? (diff / askingPrice) * 100 : 0;

  return {
    finalPrice: targetOfferPrice,
    finalCOC: actualCOC,
    finalPayback: actualPayback,
    actualDSCR,
    freeCashFlow,
    totalTakeHome,
    bindingConstraint: binding,
    bindingLabel: constraintBindingLabel(binding),
    askingPrice,
    diff,
    diffPct,
    breakdownContext: {
      sbaPercent,
      equityPercent: downPercent,
      sellerPercent,
      sellerEnabled,
      sellerPaymentType,
      sellerRate,
      sellerStandby,
      sellerStandbyYears,
      targetDSCR,
      targetSalary: S,
      sbaLoan: targetOfferPrice * (sbaPercent / 100),
      equity,
      sellerNote: sellerEnabled ? targetOfferPrice * (sellerPercent / 100) : 0
    }
  };
}

/** Matches extension / DealCalculator default SBA rate string. */
export const DEFAULT_CALC_SBA_RATE = '9.25';

export function stringifyDealNumber(value) {
  return value ? String(Math.round(value)) : '';
}

export function defaultScenarioName(index) {
  return `Scenario ${index + 1}`;
}

export function scenarioDisplayName(scenario, index) {
  const name = typeof scenario?.name === 'string' ? scenario.name.trim() : '';
  return name || defaultScenarioName(index);
}

export function isValidCalculatorPayload(data, scenarioCount) {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.scenarios) &&
    data.scenarios.length === scenarioCount
  );
}

/**
 * Three preset financing scenarios (aligned with DealCalculator).
 */
export function createDefaultScenarios(deal, calculatorDefaults = {}) {
  const base = {
    ebitda: stringifyDealNumber(deal.ebitda),
    askingPrice: stringifyDealNumber(deal.askingPrice),
    dscr: String(calculatorDefaults.dscr ?? '1.25'),
    sbaPercent: String(calculatorDefaults.sbaPercent ?? '80'),
    sbaRate: String(calculatorDefaults.sbaRate ?? DEFAULT_CALC_SBA_RATE),
    sbaTerm: String(calculatorDefaults.sbaTerm ?? '10'),
    equityPercent: String(calculatorDefaults.equityPercent ?? '10'),
    salary: String(calculatorDefaults.salary ?? '150000'),
    sellerEnabled: false,
    sellerPercent: '10',
    sellerRate: String(calculatorDefaults.sellerRate ?? '6'),
    sellerTermYears: String(calculatorDefaults.sellerTermYears ?? SELLER_NOTE_TERM_YEARS),
    sellerStandby: calculatorDefaults.sellerStandby === 'yes' ? 'yes' : 'no',
    sellerStandbyYears: String(calculatorDefaults.sellerStandbyYears ?? DEFAULT_SELLER_STANDBY_YEARS),
    sellerPaymentType: calculatorDefaults.sellerPaymentType === 'interest-only' ? 'interest-only' : 'amortizing',
    usePurchaseOverride: false,
    purchasePrice: '',
    dismissDealOpportunity: false
  };
  return [
    { ...base, name: defaultScenarioName(0) },
    { ...base, name: defaultScenarioName(1), sbaPercent: '70', equityPercent: '20', sellerEnabled: true, sellerPercent: '10' },
    { ...base, name: defaultScenarioName(2), sbaPercent: '60', equityPercent: '20', sellerEnabled: true, sellerPercent: '20' }
  ];
}
