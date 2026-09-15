import {
  analyzeDealScenario,
  createDefaultScenarios,
  isValidCalculatorPayload,
  stringifyDealNumber
} from './dealCalculatorMath';
import { loadCalculatorState } from './dealCalculatorStorage';

function resolveStoredCalculatorState(deal, scenarioCount) {
  const fromLs = loadCalculatorState(deal.id);
  const fromListingKey =
    deal.dealId != null && deal.dealId !== deal.id ? loadCalculatorState(deal.dealId) : null;
  const fromApi = deal.calculatorState;

  // Prefer localStorage — it is updated immediately when the calculator edits; parent `deals` may lag.
  if (isValidCalculatorPayload(fromLs, scenarioCount)) return fromLs;
  if (isValidCalculatorPayload(fromListingKey, scenarioCount)) return fromListingKey;
  if (isValidCalculatorPayload(fromApi, scenarioCount)) return fromApi;
  return null;
}

/**
 * Patch asking price / EBITDA on all calculator scenarios after listing financials change.
 */
export function patchCalculatorStateListingFinancials(deal, { askingPrice, ebitda }, calculatorDefaults = {}) {
  const defaults = createDefaultScenarios(deal, calculatorDefaults);
  const n = defaults.length;
  const stored = resolveStoredCalculatorState(deal, n);
  const askStr = stringifyDealNumber(askingPrice);
  const ebitdaStr = stringifyDealNumber(ebitda);

  if (stored) {
    return {
      ...stored,
      scenarios: stored.scenarios.map((s) => ({
        ...s,
        askingPrice: askStr,
        ebitda: ebitdaStr,
        usePurchaseOverride: false,
        purchasePrice: ''
      }))
    };
  }

  return {
    scenarios: defaults.map((s) => ({
      ...s,
      askingPrice: askStr,
      ebitda: ebitdaStr
    })),
    activeScenario: 0,
    targetCOC: String(calculatorDefaults.targetCOC ?? '25'),
    ui: {}
  };
}

/**
 * CoC % and deal quality score for a saved deal, using the same rules as DealCalculator
 * (merged calculator_state / localStorage + active scenario + buy-box quality targets).
 */
export function getSavedDealCalculatorSummary(deal, calculatorDefaults = {}) {
  if (!deal) {
    return { qualityScore: null, cocReturn: null, askingPrice: null, ebitda: null };
  }

  const defaults = createDefaultScenarios(deal, calculatorDefaults);
  const n = defaults.length;
  const stored = resolveStoredCalculatorState(deal, n);

  const scenarios = stored
    ? stored.scenarios.map((s, i) => ({ ...defaults[i], ...s }))
    : defaults;
  const activeIdx = stored
    ? Math.min(Number(stored.activeScenario) || 0, scenarios.length - 1)
    : 0;

  const scenario = scenarios[activeIdx] || scenarios[0];
  if (!scenario) {
    return { qualityScore: null, cocReturn: null, askingPrice: null, ebitda: null };
  }

  const qualityPrefs = {
    targetCOC: parseFloat(calculatorDefaults.targetCOC) || 25,
    targetPayback: parseFloat(calculatorDefaults.targetPayback) || 4
  };

  const analysis = analyzeDealScenario(scenario, qualityPrefs);
  return {
    qualityScore: analysis.qualityScore,
    cocReturn: analysis.coc,
    dscr: analysis.actualDSCR,
    paybackYears: analysis.payback,
    freeCashFlow: analysis.freeCashFlow,
    askingPrice: analysis.askingPrice > 0 ? analysis.askingPrice : null,
    ebitda: analysis.ebitda > 0 ? analysis.ebitda : null
  };
}
