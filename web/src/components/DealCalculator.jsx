import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeDealScenario,
  buildFinancingCoefficients,
  calculateTargetOfferAnalytical,
  createDefaultScenarios,
  DEFAULT_CALC_SBA_RATE,
  isValidCalculatorPayload,
  parseMoney,
  SELLER_NOTE_TERM_YEARS,
  DEFAULT_SELLER_STANDBY_YEARS,
  stringifyDealNumber,
  defaultScenarioName,
  scenarioDisplayName
} from '../utils/dealCalculatorMath';
import {
  isScenario3Pristine,
  suggestScenario3Alternative
} from '../utils/suggestScenario3';
import { dealsAPI } from '../utils/api';
import {
  isSavedDealRowId,
  loadCalculatorState,
  saveCalculatorState
} from '../utils/dealCalculatorStorage';
import { useIsMobile } from '../hooks/useMediaQuery';

const PER_DEAL_PERSIST_DEBOUNCE_MS = 400;
/** Hidden for now — auto-suggest was not useful. Flip to true to restore the banner. */
const SHOW_SCENARIO3_SUGGESTION = false;

const DEFAULT_UI = {
  financingOpen: true,
  sbaOpen: true,
  equityOpen: false,
  sellerOpen: true,
  maxOpen: false,
  roiOpen: true,
  targetOfferOpen: true,
  actualOpen: false
};

export default function DealCalculator({
  deal,
  calculatorDefaults = {},
  onSaveCalculatorDefaults = null,
  onUseForIOI = null,
  onAddToMyDeals = null,
  onCalculatorPersisted = null,
  addToMyDealsInFooter = true,
  collectAddToMyDealsPayloadRef = null,
  showRefreshFromListing = true,
  className = '',
  /** 'always' = desktop footer + mobile top; 'mobile' = calculator top on phones only. */
  showQuickIOI = 'always'
}) {
  const isMobile = useIsMobile();
  const [activeScenario, setActiveScenario] = useState(0);
  const [scenarios, setScenarios] = useState([]);
  const [targetCOC, setTargetCOC] = useState('25');
  const [uiOpen, setUiOpen] = useState(() => ({ ...DEFAULT_UI }));
  const [targetOfferResult, setTargetOfferResult] = useState(null);
  const [addingToMyDeals, setAddingToMyDeals] = useState(false);
  const [showScenarioCompare, setShowScenarioCompare] = useState(false);
  const [renamingScenarioIndex, setRenamingScenarioIndex] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameInputRef = useRef(null);
  const persistTimerRef = useRef(null);
  const perDealPersistTimerRef = useRef(null);
  const canOpenIOI = typeof onUseForIOI === 'function' && scenarios.length > 0;
  const showMobileQuickIOI = canOpenIOI && isMobile && (showQuickIOI === 'mobile' || showQuickIOI === 'always');
  const showFooterIOI = canOpenIOI && showQuickIOI === 'always' && !isMobile;

  const qualityPrefs = useMemo(
    () => ({
      targetCOC: parseFloat(calculatorDefaults.targetCOC) || 25,
      targetPayback: parseFloat(calculatorDefaults.targetPayback) || 4
    }),
    [calculatorDefaults.targetCOC, calculatorDefaults.targetPayback]
  );

  useEffect(() => {
    if (!deal) return;
    setTargetOfferResult(null);
    const defaults = createDefaultScenarios(deal, calculatorDefaults);
    const n = defaults.length;

    const fromApi = deal.calculatorState;
    const fromLs = loadCalculatorState(deal.id);
    const fromListingKey =
      deal.dealId != null && deal.dealId !== deal.id ? loadCalculatorState(deal.dealId) : null;

    let stored = null;
    if (isValidCalculatorPayload(fromApi, n)) stored = fromApi;
    else if (isValidCalculatorPayload(fromLs, n)) stored = fromLs;
    else if (isValidCalculatorPayload(fromListingKey, n)) stored = fromListingKey;

    if (stored) {
      const merged = stored.scenarios.map((s, i) => {
        const mergedRow = { ...defaults[i], ...s };
        mergedRow.name = scenarioDisplayName(mergedRow, i);
        return mergedRow;
      });
      setScenarios(merged);
      setActiveScenario(Math.min(Number(stored.activeScenario) || 0, merged.length - 1));
      setTargetCOC(
        calculatorDefaults.targetCOC != null && calculatorDefaults.targetCOC !== ''
          ? String(calculatorDefaults.targetCOC)
          : stored.targetCOC != null && stored.targetCOC !== ''
            ? String(stored.targetCOC)
            : '25'
      );
      setUiOpen({ ...DEFAULT_UI, ...(stored.ui && typeof stored.ui === 'object' ? stored.ui : {}) });
    } else {
      const cocDefault =
        calculatorDefaults.targetCOC != null && calculatorDefaults.targetCOC !== ''
          ? String(calculatorDefaults.targetCOC)
          : '25';
      setActiveScenario(0);
      setScenarios(defaults);
      setTargetCOC(cocDefault);
      setUiOpen({ ...DEFAULT_UI });
    }
    setRenamingScenarioIndex(null);
    setRenameDraft('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset calculator state when switching deals; not when financing defaults sync from server
  }, [deal?.id]);

  // The active Buy Box is the source of truth for Target CoC when configured.
  // Keep the calculator in sync even if this deal has older persisted calculator state.
  useEffect(() => {
    if (!deal?.id) return;
    if (calculatorDefaults.targetCOC != null && calculatorDefaults.targetCOC !== '') {
      setTargetCOC(String(calculatorDefaults.targetCOC));
    }
  }, [deal?.id, calculatorDefaults.targetCOC]);

  // No per-deal saved state: keep target salary in sync when Buy Box / settings change.
  useEffect(() => {
    if (!deal?.id) return;
    const defaults = createDefaultScenarios(deal, calculatorDefaults);
    const n = defaults.length;
    const fromApi = deal.calculatorState;
    const fromLs = loadCalculatorState(deal.id);
    const fromListingKey =
      deal.dealId != null && deal.dealId !== deal.id ? loadCalculatorState(deal.dealId) : null;
    const hasStored =
      isValidCalculatorPayload(fromApi, n) ||
      isValidCalculatorPayload(fromLs, n) ||
      isValidCalculatorPayload(fromListingKey, n);
    if (hasStored) return;
    const sal =
      calculatorDefaults.salary != null && calculatorDefaults.salary !== ''
        ? String(calculatorDefaults.salary)
        : '150000';
    setScenarios((current) =>
      current.length > 0 ? current.map((s) => ({ ...s, salary: sal })) : current
    );
  }, [deal?.id, calculatorDefaults.salary]);

  const currentScenario = scenarios[activeScenario] || {};
  const analysis = useMemo(
    () => analyzeDealScenario(currentScenario, qualityPrefs),
    [currentScenario, qualityPrefs]
  );

  const compareAnalyses = useMemo(
    () => scenarios.map((scenario) => analyzeDealScenario(scenario, qualityPrefs)),
    [scenarios, qualityPrefs]
  );

  const bestCompareScenarioIndices = useMemo(() => {
    let maxCoc = -Infinity;
    for (const row of compareAnalyses) {
      if (row.coc > maxCoc) maxCoc = row.coc;
    }
    if (!Number.isFinite(maxCoc)) return new Set();
    const best = new Set();
    compareAnalyses.forEach((row, index) => {
      if (row.coc === maxCoc) best.add(index);
    });
    return best;
  }, [compareAnalyses]);

  const scenario3Suggestion = useMemo(() => {
    if (!SHOW_SCENARIO3_SUGGESTION || !deal || scenarios.length < 3) return null;
    return suggestScenario3Alternative(scenarios, qualityPrefs, calculatorDefaults, deal);
  }, [deal, scenarios, qualityPrefs, calculatorDefaults]);

  const showScenario3SuggestionBanner =
    SHOW_SCENARIO3_SUGGESTION &&
    scenario3Suggestion &&
    isScenario3Pristine(scenarios, calculatorDefaults, deal);

  const applyScenario3Suggestion = () => {
    if (!scenario3Suggestion) return;
    setScenarios((current) =>
      current.map((scenario, index) =>
        index === 2
          ? { ...scenario3Suggestion.scenario, dismissScenario3Suggestion: true }
          : scenario
      )
    );
    setActiveScenario(2);
    setShowScenarioCompare(false);
    console.log('[DealCalculator] Applied Scenario 3 suggestion', {
      label: scenario3Suggestion.label,
      coc: scenario3Suggestion.coc
    });
  };

  const dismissScenario3Suggestion = () => {
    setScenarios((current) =>
      current.map((scenario, index) =>
        index === 2 ? { ...scenario, dismissScenario3Suggestion: true } : scenario
      )
    );
  };

  useEffect(() => {
    setTargetOfferResult(null);
  }, [activeScenario]);

  useEffect(() => {
    if (!deal?.id || scenarios.length === 0) return;
    if (perDealPersistTimerRef.current) clearTimeout(perDealPersistTimerRef.current);
    perDealPersistTimerRef.current = setTimeout(() => {
      const payload = { scenarios, activeScenario, targetCOC, ui: uiOpen };
      saveCalculatorState(deal.id, payload);
      if (isSavedDealRowId(deal.id)) {
        const active = scenarios[Math.min(Number(activeScenario) || 0, scenarios.length - 1)] || scenarios[0];
        const syncPatch = { calculatorState: payload };
        const ap = parseMoney(active?.askingPrice);
        const eb = parseMoney(active?.ebitda);
        if (ap > 0) syncPatch.askingPrice = ap;
        if (eb > 0) syncPatch.ebitda = eb;
        dealsAPI
          .updateDeal(deal.id, syncPatch)
          .then(() => {
            if (typeof onCalculatorPersisted === 'function') onCalculatorPersisted();
          })
          .catch((err) => {
            console.warn('DealCalculator: failed to sync calculator to server', err);
          });
      }
    }, PER_DEAL_PERSIST_DEBOUNCE_MS);
    return () => {
      if (perDealPersistTimerRef.current) clearTimeout(perDealPersistTimerRef.current);
    };
  }, [deal?.id, scenarios, activeScenario, targetCOC, uiOpen, onCalculatorPersisted]);

  const patchScenario = useCallback((patch) => {
    setScenarios((current) =>
      current.map((scenario, index) => (index === activeScenario ? { ...scenario, ...patch } : scenario))
    );
  }, [activeScenario]);

  const commitScenarioName = useCallback((index, raw) => {
    const next = String(raw || '').trim() || defaultScenarioName(index);
    setScenarios((current) =>
      current.map((scenario, i) => (i === index ? { ...scenario, name: next } : scenario))
    );
    console.log('[DealCalculator] renamed scenario', { index, name: next, dealId: deal?.id });
    setRenamingScenarioIndex(null);
    setRenameDraft('');
  }, [deal?.id]);

  const startRenameScenario = useCallback((index) => {
    const current = scenarios[index];
    setShowScenarioCompare(false);
    setActiveScenario(index);
    setRenamingScenarioIndex(index);
    setRenameDraft(scenarioDisplayName(current, index));
  }, [scenarios]);

  useEffect(() => {
    if (renamingScenarioIndex == null) return undefined;
    const el = renameInputRef.current;
    if (!el) return undefined;
    el.focus();
    el.select();
    return undefined;
  }, [renamingScenarioIndex]);

  const updateScenario = useCallback(
    (field, value) => {
      const PERSISTED_CALC_FIELDS = [
        'sbaRate',
        'dscr',
        'sbaPercent',
        'sbaTerm',
        'equityPercent',
        'salary',
        'sellerRate',
        'sellerStandby',
        'sellerStandbyYears',
        'sellerPaymentType',
        'sellerTermYears'
      ];
      setScenarios((current) => {
        const next = current.map((scenario, index) => {
          if (index !== activeScenario) return scenario;
          const extra = {};
          if (field === 'sellerStandby' && value === 'yes' && !(parseFloat(scenario.sellerStandbyYears) > 0)) {
            extra.sellerStandbyYears = String(DEFAULT_SELLER_STANDBY_YEARS);
          }
          return { ...scenario, [field]: value, ...extra };
        });
        if (onSaveCalculatorDefaults && PERSISTED_CALC_FIELDS.includes(field)) {
          if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
          persistTimerRef.current = setTimeout(() => {
            const updated = next[activeScenario] || {};
            onSaveCalculatorDefaults({
              ...calculatorDefaults,
              sbaRate: updated.sbaRate ?? calculatorDefaults.sbaRate,
              dscr: updated.dscr ?? calculatorDefaults.dscr,
              sbaPercent: updated.sbaPercent ?? calculatorDefaults.sbaPercent,
              sbaTerm: updated.sbaTerm ?? calculatorDefaults.sbaTerm,
              equityPercent: updated.equityPercent ?? calculatorDefaults.equityPercent,
              salary: updated.salary ?? calculatorDefaults.salary,
              sellerRate: updated.sellerRate ?? calculatorDefaults.sellerRate,
              sellerStandby: updated.sellerStandby ?? calculatorDefaults.sellerStandby,
              sellerStandbyYears: updated.sellerStandbyYears ?? calculatorDefaults.sellerStandbyYears,
              sellerPaymentType: updated.sellerPaymentType ?? calculatorDefaults.sellerPaymentType,
              sellerTermYears: updated.sellerTermYears ?? calculatorDefaults.sellerTermYears
            });
          }, 600);
        }
        return next;
      });
    },
    [activeScenario, calculatorDefaults, onSaveCalculatorDefaults]
  );

  const toggleUi = (key) => {
    setUiOpen((u) => ({ ...u, [key]: !u[key] }));
  };

  const adjustDscr = (delta) => {
    const cur = parseFloat(currentScenario.dscr) || 1.25;
    const next = Math.max(1, Math.round((cur + delta) * 100) / 100);
    updateScenario('dscr', String(next));
  };

  const handleCalculateTargetOffer = () => {
    const ebitda = parseMoney(currentScenario.ebitda);
    const fin = buildFinancingCoefficients(currentScenario);
    const targetDSCR = parseFloat(currentScenario.dscr) || 1.25;
    const targetCOCNum = parseFloat(targetCOC) || 25;
    const result = calculateTargetOfferAnalytical({
      ebitda,
      askingPrice: parseMoney(currentScenario.askingPrice),
      targetSalary: parseMoney(currentScenario.salary),
      targetDSCR,
      targetCOC: targetCOCNum,
      equityPercent: fin.equityPercent,
      totalDSPer1: fin.totalDSPer1,
      sbaPercent: fin.sbaPercent,
      sellerPercent: fin.sellerPercent,
      sellerEnabled: fin.sellerEnabled,
      sellerPaymentType: fin.sellerPaymentType,
      sellerStandby: fin.sellerStandby,
      sellerStandbyYears: fin.sellerStandbyYears,
      sellerRate: fin.sellerRate
    });
    setTargetOfferResult(result);
  };

  const handleUseTargetOffer = () => {
    if (!targetOfferResult || targetOfferResult.error) return;
    const price = Math.round(targetOfferResult.finalPrice);
    setScenarios((current) =>
      current.map((scenario, index) =>
        index === activeScenario
          ? {
              ...scenario,
              askingPrice: String(price),
              usePurchaseOverride: false,
              purchasePrice: ''
            }
          : scenario
      )
    );
    setTargetOfferResult(null);
  };

  const handleApplyPurchaseOverride = () => {
    if (!targetOfferResult || targetOfferResult.error) return;
    const price = Math.round(targetOfferResult.finalPrice);
    setScenarios((current) =>
      current.map((scenario, index) =>
        index === activeScenario
          ? { ...scenario, usePurchaseOverride: true, purchasePrice: String(price) }
          : scenario
      )
    );
    setTargetOfferResult(null);
  };

  const getAddToMyDealsPayload = useCallback(() => {
    const scenario = scenarios[activeScenario] || {};
    return {
      calculatorState: { scenarios, activeScenario, targetCOC, ui: uiOpen },
      askingPrice: parseMoney(scenario.askingPrice),
      ebitda: parseMoney(scenario.ebitda)
    };
  }, [scenarios, activeScenario, targetCOC, uiOpen]);

  useEffect(() => {
    if (!collectAddToMyDealsPayloadRef) return;
    collectAddToMyDealsPayloadRef.current = getAddToMyDealsPayload;
    return () => {
      collectAddToMyDealsPayloadRef.current = null;
    };
  }, [collectAddToMyDealsPayloadRef, getAddToMyDealsPayload]);

  const handleAddToMyDealsClick = async () => {
    if (typeof onAddToMyDeals !== 'function' || addingToMyDeals) return;
    setAddingToMyDeals(true);
    try {
      await onAddToMyDeals(getAddToMyDealsPayload());
    } finally {
      setAddingToMyDeals(false);
    }
  };

  const resetScenarioFromListing = () => {
    if (!deal) return;
    setScenarios((current) =>
      current.map((scenario, index) =>
        index === activeScenario
          ? {
              ...scenario,
              ebitda: stringifyDealNumber(deal.ebitda),
              askingPrice: stringifyDealNumber(deal.askingPrice),
              usePurchaseOverride: false,
              purchasePrice: ''
            }
          : scenario
      )
    );
    setTargetOfferResult(null);
  };

  if (!deal) return null;

  const { qualityPresentation } = analysis;
  const finCoeff = analysis.fin;
  const offerDisplay = currentScenario.usePurchaseOverride
    ? formatNumberWithCommas(currentScenario.purchasePrice)
    : formatNumberWithCommas(currentScenario.askingPrice);

  return (
    <div className={`deal-calculator-body deal-calculator-extension-style ${className}`.trim()}>
      <div
        className="calc-quality-banner"
        style={{ borderBottomColor: qualityPresentation.borderColor }}
      >
        <div className="calc-quality-left">
          {qualityPresentation.badge ? (
            <span className="calc-quality-badge" aria-hidden>
              {qualityPresentation.badge}
            </span>
          ) : null}
          <div>
            <div className="calc-quality-kicker">Deal Quality</div>
            <div className="calc-quality-text" style={{ color: qualityPresentation.scoreColor }}>
              {qualityPresentation.text}
            </div>
          </div>
        </div>
        <div className="calc-quality-score" style={{ color: qualityPresentation.scoreColor }}>
          {analysis.qualityScore}
        </div>
      </div>

      <div className="calc-scenario-bar">
        <div className="calc-scenario-tabs">
          {scenarios.map((scenario, index) =>
            renamingScenarioIndex === index ? (
              <input
                key={`scenario-${index + 1}`}
                ref={renameInputRef}
                type="text"
                className="calc-scenario-tab calc-scenario-tab-input active"
                value={renameDraft}
                maxLength={80}
                aria-label={`Name for ${defaultScenarioName(index)}`}
                onChange={(event) => setRenameDraft(event.target.value)}
                onBlur={() => commitScenarioName(index, renameDraft)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitScenarioName(index, renameDraft);
                  } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setRenamingScenarioIndex(null);
                    setRenameDraft('');
                  }
                }}
              />
            ) : (
              <button
                key={`scenario-${index + 1}`}
                type="button"
                className={`calc-scenario-tab ${!showScenarioCompare && activeScenario === index ? 'active' : ''}`}
                title="Click the active tab again, or double-click, to rename"
                onClick={() => {
                  setShowScenarioCompare(false);
                  if (!showScenarioCompare && activeScenario === index) {
                    startRenameScenario(index);
                    return;
                  }
                  setActiveScenario(index);
                  setRenamingScenarioIndex(null);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  startRenameScenario(index);
                }}
              >
                {scenarioDisplayName(scenario, index)}
              </button>
            )
          )}
          <button
            type="button"
            className={`calc-scenario-tab calc-scenario-compare-btn ${showScenarioCompare ? 'active' : ''}`}
            onClick={() => setShowScenarioCompare((current) => !current)}
          >
            Compare
          </button>
        </div>
        {showScenarioCompare && (
          <ScenarioCompareTable
            analyses={compareAnalyses}
            bestScenarioIndices={bestCompareScenarioIndices}
            scenarioLabels={scenarios.map((scenario, index) => scenarioDisplayName(scenario, index))}
          />
        )}
      </div>

      {showMobileQuickIOI ? (
        <button
          type="button"
          className="btn-primary calc-ioi-btn calc-ioi-btn--mobile"
          onClick={() => {
            console.log('[DealCalculator] Quick IOI (mobile)', {
              dealId: deal?.id,
              activeScenario
            });
            onUseForIOI({ scenarios, activeScenario });
          }}
        >
          Quick IOI
        </button>
      ) : null}

      {showScenario3SuggestionBanner && (
        <div className="calc-scenario3-suggestion">
          <button
            type="button"
            className="calc-opportunity-dismiss"
            onClick={dismissScenario3Suggestion}
            title="Dismiss suggestion"
            aria-label="Dismiss Scenario 3 suggestion"
          >
            ×
          </button>
          <strong>Try a creative Scenario 3</strong>
          <p>
            Vettr found financing terms you have not used in Scenarios 1 or 2 that may improve ROI:{' '}
            <strong>{scenario3Suggestion.label}</strong> — estimated{' '}
            <strong>{scenario3Suggestion.coc.toFixed(1)}% CoC</strong>
            {scenario3Suggestion.improvementVsBest > 0 ? (
              <>
                {' '}
                (+{scenario3Suggestion.improvementVsBest.toFixed(1)}% vs Scenario{' '}
                {scenario3Suggestion.betterThanScenario})
              </>
            ) : null}
            .
          </p>
          <div className="calc-scenario3-suggestion-actions">
            <button type="button" className="btn-primary" onClick={applyScenario3Suggestion}>
              Apply to Scenario 3
            </button>
            <button type="button" className="btn-secondary" onClick={dismissScenario3Suggestion}>
              Not now
            </button>
          </div>
        </div>
      )}

      <div className="modal-grid two-col calc-top-inputs">
        <div className="form-group">
          <label>Business EBITDA ($)</label>
          <input
            value={formatNumberWithCommas(currentScenario.ebitda)}
            onChange={(e) => updateScenario('ebitda', stripNumberInput(e.target.value))}
          />
        </div>
        <div className="form-group">
          <label>Asking Price ($)</label>
          <input
            value={formatNumberWithCommas(currentScenario.askingPrice)}
            onChange={(e) => updateScenario('askingPrice', stripNumberInput(e.target.value))}
          />
        </div>
      </div>

      <CalcAccordion
        open={uiOpen.financingOpen}
        onToggle={() => toggleUi('financingOpen')}
        title="Financing Inputs"
      >
        {!analysis.pctOk && (
          <div className="calc-percent-warning">
            Total financing must equal 100% (currently {analysis.totalPercent.toFixed(1)}%)
          </div>
        )}

        <CalcAccordion
          open={uiOpen.sbaOpen}
          onToggle={() => toggleUi('sbaOpen')}
          title="A. SBA"
          summary={`${finCoeff.sbaPercent}% • ${currentScenario.sbaRate || DEFAULT_CALC_SBA_RATE}% • ${currentScenario.sbaTerm || '10'}yr • ${currentScenario.dscr || '1.25'}x DSCR`}
          nested
        >
          <div className="modal-grid two-col">
            <div className="form-group">
              <label>Percentage (%)</label>
              <input
                type="number"
                value={currentScenario.sbaPercent}
                onChange={(e) => updateScenario('sbaPercent', e.target.value)}
                step="0.1"
                min="0"
                max="100"
              />
            </div>
            <div className="form-group">
              <label>Loan Size ($)</label>
              <input value={formatMoneyReadonly(analysis.sbaLoanSize)} readOnly className="calc-readonly" />
            </div>
          </div>
          <div className="modal-grid three-col calc-sba-row">
            <div className="form-group">
              <label>Interest Rate (%)</label>
              <input
                type="number"
                value={currentScenario.sbaRate}
                onChange={(e) => updateScenario('sbaRate', e.target.value)}
                step="0.1"
              />
            </div>
            <div className="form-group">
              <label>Term (Yrs)</label>
              <input
                type="number"
                value={currentScenario.sbaTerm}
                onChange={(e) => updateScenario('sbaTerm', e.target.value)}
                min="1"
              />
            </div>
            <div className="form-group calc-dscr-field">
              <label>Target DSCR</label>
              <div className="calc-dscr-input-row">
                <input
                  type="number"
                  value={currentScenario.dscr}
                  onChange={(e) => updateScenario('dscr', e.target.value)}
                  step="0.05"
                  min="1"
                />
                <div className="calc-stepper-col">
                  <button type="button" className="calc-stepper-btn" onClick={() => adjustDscr(0.05)} title="Increase DSCR">
                    ▲
                  </button>
                  <button type="button" className="calc-stepper-btn" onClick={() => adjustDscr(-0.05)} title="Decrease DSCR">
                    ▼
                  </button>
                </div>
              </div>
            </div>
          </div>
        </CalcAccordion>

        <CalcAccordion
          open={uiOpen.equityOpen}
          onToggle={() => toggleUi('equityOpen')}
          title="B. Buyer Equity"
          summary={`${finCoeff.equityPercent}% (${formatCompactMoney(analysis.equityAmount)}) • ${formatCompactMoney(parseMoney(currentScenario.salary))} salary`}
          summaryWarn={analysis.salaryWarning}
          nested
        >
          <div className="modal-grid two-col">
            <div className="form-group">
              <label>Percentage (%)</label>
              <input
                type="number"
                value={currentScenario.equityPercent}
                onChange={(e) => updateScenario('equityPercent', e.target.value)}
                step="0.1"
                min="0"
                max="100"
              />
            </div>
            <div className="form-group">
              <label>Equity Amount ($)</label>
              <input value={formatMoneyReadonly(analysis.equityAmount)} readOnly className="calc-readonly" />
            </div>
          </div>
          <div className="form-group">
            <label>Target Owner Salary (Annual)</label>
            <input
              value={formatNumberWithCommas(currentScenario.salary)}
              onChange={(e) => updateScenario('salary', stripNumberInput(e.target.value))}
            />
            {analysis.salaryWarning && (
              <div className="calc-inline-warning">Target salary exceeds available cash flow at this price.</div>
            )}
          </div>
        </CalcAccordion>

        <div className="calc-accordion calc-accordion--nested">
          <div
            className={`calc-accordion-header calc-accordion-header--seller ${uiOpen.sellerOpen ? '' : 'collapsed'}`.trim()}
          >
            <button type="button" className="calc-accordion-toggle" onClick={() => toggleUi('sellerOpen')} aria-expanded={uiOpen.sellerOpen}>
              <span className="calc-accordion-arrow">{uiOpen.sellerOpen ? '▼' : '▶'}</span>
            </button>
            <label className="calc-seller-enable-label">
              <input
                type="checkbox"
                checked={Boolean(currentScenario.sellerEnabled)}
                onChange={(e) => updateScenario('sellerEnabled', e.target.checked)}
              />
              <span className="calc-accordion-title">C. Seller Note (Optional)</span>
            </label>
            <span
              className={`calc-accordion-summary ${!currentScenario.sellerEnabled ? 'calc-accordion-summary--muted' : ''}`.trim()}
            >
              {currentScenario.sellerEnabled
                ? `${finCoeff.sellerPercent}% • ${currentScenario.sellerRate || '6'}% • ${currentScenario.sellerTermYears || SELLER_NOTE_TERM_YEARS}yr • ${currentScenario.sellerPaymentType === 'interest-only' ? 'Interest Only' : 'Amortizing'}${finCoeff.sellerStandby === 'yes' ? ` • Standby ${finCoeff.sellerStandbyYears || DEFAULT_SELLER_STANDBY_YEARS}yr` : ''}`
                : 'Not enabled'}
            </span>
          </div>
          {uiOpen.sellerOpen && (
            <div className="calc-accordion-body">
              <div className="form-group">
                <label>Percentage (%)</label>
                <input
                  type="number"
                  value={currentScenario.sellerPercent}
                  onChange={(e) => updateScenario('sellerPercent', e.target.value)}
                  step="0.1"
                  min="0"
                  max="100"
                  disabled={!currentScenario.sellerEnabled}
                />
              </div>
              <div className="form-group">
                <label>Amount ($)</label>
                <input
                  value={formatMoneyReadonly(analysis.sellerNoteAmt)}
                  readOnly
                  className="calc-readonly"
                  disabled={!currentScenario.sellerEnabled}
                />
              </div>
              <div className="modal-grid three-col">
                <div className="form-group">
                  <label>Standby</label>
                  <select
                    value={currentScenario.sellerStandby || 'no'}
                    onChange={(e) => updateScenario('sellerStandby', e.target.value)}
                    disabled={!currentScenario.sellerEnabled}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
                {(currentScenario.sellerStandby || 'no') === 'yes' ? (
                  <div className="form-group">
                    <label>Standby (Yrs)</label>
                    <input
                      type="number"
                      value={currentScenario.sellerStandbyYears || DEFAULT_SELLER_STANDBY_YEARS}
                      onChange={(e) => updateScenario('sellerStandbyYears', e.target.value)}
                      min="1"
                      step="1"
                      max={currentScenario.sellerTermYears || SELLER_NOTE_TERM_YEARS}
                      disabled={!currentScenario.sellerEnabled}
                    />
                  </div>
                ) : null}
                <div className="form-group">
                  <label>Interest Rate (%)</label>
                  <input
                    type="number"
                    value={currentScenario.sellerRate}
                    onChange={(e) => updateScenario('sellerRate', e.target.value)}
                    step="0.1"
                    disabled={!currentScenario.sellerEnabled}
                  />
                </div>
                <div className="form-group">
                  <label>Term (Yrs)</label>
                  <input
                    type="number"
                    value={currentScenario.sellerTermYears || SELLER_NOTE_TERM_YEARS}
                    onChange={(e) => updateScenario('sellerTermYears', e.target.value)}
                    min="1"
                    step="1"
                    disabled={!currentScenario.sellerEnabled}
                  />
                </div>
                <div className="form-group">
                  <label>Payment Type</label>
                  <select
                    value={currentScenario.sellerPaymentType || 'amortizing'}
                    onChange={(e) => updateScenario('sellerPaymentType', e.target.value)}
                    disabled={!currentScenario.sellerEnabled}
                  >
                    <option value="amortizing">Amortizing</option>
                    <option value="interest-only">Interest Only</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </CalcAccordion>

      {analysis.isDealOpportunity && !currentScenario.dismissDealOpportunity && (
        <div className="calc-opportunity-banner">
          <button
            type="button"
            className="calc-opportunity-dismiss"
            onClick={() => updateScenario('dismissDealOpportunity', true)}
            title="Dismiss"
          >
            ×
          </button>
          <strong>Deal opportunity</strong>
          <p>Asking is {formatMoney(analysis.opportunitySavings)} below your max allowable (DSCR-based) price.</p>
        </div>
      )}

      <CalcAccordion
        open={uiOpen.maxOpen}
        onToggle={() => toggleUi('maxOpen')}
        title="Maximum Allowable (DSCR-Based)"
        kicker
      >
        <div className="calc-result-pair">
          <div className="calc-result-box">
            <div className="calc-result-box-title">Max Allowable Purchase Price</div>
            <div className="calc-result-box-value">{formatMoney(analysis.maxPurchasePrice)}</div>
          </div>
          <div className="calc-result-box calc-result-box--muted">
            <div className="calc-result-box-title">Max Annual Debt Service</div>
            <div className="calc-result-box-value">{formatMoney(analysis.maxAnnualDebtService)}</div>
          </div>
        </div>
      </CalcAccordion>

      <CalcAccordion open={uiOpen.roiOpen} onToggle={() => toggleUi('roiOpen')} title="Return on Investment (Year 1)" kicker>
        <div className="calc-result-pair">
          <div className="calc-result-box calc-result-box--coc">
            <div className="calc-result-box-title">Cash-on-Cash Return</div>
            <div className="calc-result-box-value calc-coc-value" data-tier={cocTier(analysis.coc)}>
              {analysis.coc.toFixed(1)}%
            </div>
            <div className="calc-result-box-sub">Annual return on equity</div>
          </div>
          <div className="calc-result-box calc-result-box--payback">
            <div className="calc-result-box-title">Payback Period</div>
            <div className="calc-result-box-value calc-payback-value" data-tier={paybackTier(analysis.payback)}>
              {analysis.payback > 0 && analysis.payback < 100 ? `${analysis.payback.toFixed(1)} yrs` : '—'}
            </div>
            <div className="calc-result-box-sub">Time to recover equity</div>
          </div>
        </div>
      </CalcAccordion>

      <CalcAccordion
        open={uiOpen.targetOfferOpen}
        onToggle={() => toggleUi('targetOfferOpen')}
        title="Target Offer Calculator"
        kicker
      >
        <div className="target-offer-criteria">
          <strong>Maximum offer that meets all of:</strong>
          <ul>
            <li>
              Achieves your target <strong>{targetCOC}%</strong> cash-on-cash return
            </li>
            <li>
              Salary is covered ({formatMoney(parseMoney(currentScenario.salary))})
            </li>
            <li>
              DSCR requirement ({currentScenario.dscr || '1.25'}x)
            </li>
            <li>Never exceeds the asking price</li>
          </ul>
          <p className="target-offer-criteria-note">Shows which constraint limits your offer.</p>
        </div>
        <div className="form-group">
          <label>Target COC Return (%)</label>
          <input
            type="number"
            value={targetCOC}
            onChange={(e) => setTargetCOC(e.target.value)}
            min={1}
            max={100}
            step={1}
          />
        </div>
        <button type="button" className="btn-primary target-offer-calc-btn calc-target-btn-full" onClick={handleCalculateTargetOffer}>
          Calculate Target Offer Price
        </button>
        {targetOfferResult && (
          <div className="target-offer-result calc-target-results">
            {targetOfferResult.error ? (
              <p className="target-offer-error">{targetOfferResult.error}</p>
            ) : (
              <>
                <div className="target-offer-price-box">
                  <span className="target-offer-label">Recommended Offer Price</span>
                  <span className="target-offer-value">{formatMoney(targetOfferResult.finalPrice)}</span>
                  <p className="target-offer-subtitle-ext">
                    Achieves <strong>{targetOfferResult.finalCOC.toFixed(0)}% COC</strong> with{' '}
                    <strong>{targetOfferResult.finalPayback.toFixed(1)} year</strong> payback • DSCR:{' '}
                    {targetOfferResult.actualDSCR.toFixed(2)}x
                    {targetOfferResult.bindingConstraint === 'Target COC' ? (
                      <span className="target-offer-limit target-offer-limit--success">
                        {' '}
                        · Meets your {targetCOC}% COC target
                      </span>
                    ) : (
                      <span className="target-offer-limit"> · Limited by {targetOfferResult.bindingLabel}</span>
                    )}
                  </p>
                </div>
                {targetOfferResult.askingPrice > 0 && (
                  <div
                    className={`target-offer-comparison ${targetOfferResult.diff >= 0 ? 'target-offer-comparison--warn' : 'target-offer-comparison--good'}`}
                  >
                    <div className="target-offer-comparison-row">
                      <span>vs Asking ({formatMoney(targetOfferResult.askingPrice)}):</span>
                      <span>
                        {targetOfferResult.diff >= 0
                          ? `+${formatMoney(targetOfferResult.diff)} above`
                          : `${formatMoney(-targetOfferResult.diff)} below`}{' '}
                        ({Math.abs(targetOfferResult.diffPct).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                )}
                {renderFinancingBreakdown(targetOfferResult.breakdownContext)}
                <div className="calc-target-metrics-grid">
                  <div>
                    <div className="calc-metric-label">Free Cash Flow</div>
                    <div className="calc-metric-value calc-metric-value--good">
                      {formatMoney(targetOfferResult.freeCashFlow)}
                    </div>
                  </div>
                  <div>
                    <div className="calc-metric-label">Total Take-Home</div>
                    <div className="calc-metric-value">{formatMoney(targetOfferResult.totalTakeHome)}</div>
                  </div>
                </div>
                <div className="calc-target-actions">
                  <button type="button" className="btn-secondary use-target-btn" onClick={handleUseTargetOffer}>
                    Use as Asking Price
                  </button>
                  <button type="button" className="btn-secondary" onClick={handleApplyPurchaseOverride}>
                    Use as Offer Price (override)
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </CalcAccordion>

      <CalcAccordion open={uiOpen.actualOpen} onToggle={() => toggleUi('actualOpen')} title="Actual Deal Scenario" kicker>
        <div className="form-group">
          <label>
            Offer Price ($){' '}
            <span className="calc-label-hint">
              {currentScenario.usePurchaseOverride ? '(overrides asking for math)' : '(uses asking price)'}
            </span>
          </label>
          <div className="calc-offer-row">
            <input
              value={offerDisplay}
              onChange={(e) => {
                const v = stripNumberInput(e.target.value);
                if (currentScenario.usePurchaseOverride) updateScenario('purchasePrice', v);
                else updateScenario('askingPrice', v);
              }}
            />
            <label className="calc-checkbox-inline">
              <input
                type="checkbox"
                checked={Boolean(currentScenario.usePurchaseOverride)}
                onChange={(e) => {
                  const on = e.target.checked;
                  if (on) {
                    const base =
                      stripNumberInput(currentScenario.askingPrice) || stripNumberInput(currentScenario.purchasePrice);
                    patchScenario({ usePurchaseOverride: true, purchasePrice: base });
                  } else {
                    patchScenario({ usePurchaseOverride: false, purchasePrice: '' });
                  }
                }}
              />
              <span>Separate from asking</span>
            </label>
          </div>
        </div>
        <div className="calc-result-pair calc-actual-stack">
          <div className="calc-result-box">
            <div className="calc-result-box-title">Total Debt Service (Annual)</div>
            <div className="calc-result-box-value">{formatMoney(analysis.totalDebtService)}</div>
            {finCoeff.sellerStandby === 'yes' && analysis.sellerStandbyYears > 0 && analysis.remainAfterStandby > 0 ? (
              <div className="calc-result-box-sub">After {analysis.sellerStandbyYears}yr standby: {formatMoney(analysis.totalDebtServiceAfterStandby)}</div>
            ) : null}
          </div>
          <div className="calc-result-box">
            <div className="calc-result-box-title">Free Cash Flow (Annual)</div>
            <div className="calc-result-box-value">{formatMoney(analysis.freeCashFlow)}</div>
            <div className="calc-result-box-sub">Monthly: {formatMoney(analysis.freeCashFlow / 12)}</div>
            {finCoeff.sellerStandby === 'yes' && analysis.sellerStandbyYears > 0 && analysis.remainAfterStandby > 0 ? (
              <div className="calc-result-box-sub">After {analysis.sellerStandbyYears}yr standby: {formatMoney(analysis.freeCashFlowAfterStandby)}</div>
            ) : null}
          </div>
          <div className="calc-result-box">
            <div className="calc-result-box-title">Total Owner Take-Home</div>
            <div className="calc-result-box-value">{formatMoney(analysis.totalTakeHome)}</div>
            <div className="calc-result-box-sub">Max available after debt: {formatMoney(analysis.availableCashFlow)}</div>
          </div>
          <div className="calc-result-box calc-result-box--muted">
            <div className="calc-result-box-title">DSCR (actual)</div>
            <div className="calc-result-box-value">{analysis.actualDSCR.toFixed(2)}x</div>
          </div>
        </div>
      </CalcAccordion>

      {(showFooterIOI ||
        (addToMyDealsInFooter && typeof onAddToMyDeals === 'function') ||
        showRefreshFromListing) && (
      <div className="calc-footer-actions">
        {showFooterIOI && (
          <button
            type="button"
            className="btn-primary calc-ioi-btn"
            onClick={() => onUseForIOI({ scenarios, activeScenario })}
          >
            Use for IOI
          </button>
        )}
        {addToMyDealsInFooter && typeof onAddToMyDeals === 'function' && (
          <button
            type="button"
            className="btn-primary"
            disabled={addingToMyDeals}
            onClick={handleAddToMyDealsClick}
          >
            {addingToMyDeals ? 'Saving…' : 'Add to My Deals'}
          </button>
        )}
        {showRefreshFromListing && (
          <button type="button" className="btn-secondary" onClick={resetScenarioFromListing}>
            Refresh from listing
          </button>
        )}
      </div>
      )}
    </div>
  );
}

const COMPARE_ROWS = [
  {
    key: 'coc',
    label: 'Cash-on-Cash',
    format: (a) => `${a.coc.toFixed(1)}%`,
    cellClass: (a) => `calc-compare-coc calc-coc-value`,
    cellDataTier: (a) => cocTier(a.coc)
  },
  {
    key: 'payback',
    label: 'Payback',
    format: (a) => (a.payback > 0 && a.payback < 100 ? `${a.payback.toFixed(1)} yrs` : '—'),
    cellClass: () => 'calc-compare-payback calc-payback-value',
    cellDataTier: (a) => paybackTier(a.payback)
  },
  {
    key: 'fcf',
    label: 'Free Cash Flow',
    format: (a) => formatMoney(a.freeCashFlow),
    cellClass: () => '',
    cellDataTier: () => null
  }
];

function ScenarioCompareTable({ analyses, bestScenarioIndices, scenarioLabels = [] }) {
  return (
    <div className="calc-scenario-compare" role="region" aria-label="Scenario comparison">
      <table className="calc-scenario-compare-table">
        <thead>
          <tr>
            <th scope="col" className="calc-scenario-compare-metric-head" />
            {analyses.map((_, index) => {
              const isBest = bestScenarioIndices.has(index);
              return (
                <th
                  key={`compare-head-${index + 1}`}
                  scope="col"
                  className={isBest ? 'calc-scenario-compare-col--best' : undefined}
                >
                  <span className="calc-scenario-compare-col-label">
                    {scenarioLabels[index] || defaultScenarioName(index)}
                  </span>
                  {isBest ? <span className="calc-scenario-best-pill">Best ROI</span> : null}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {COMPARE_ROWS.map((row) => (
            <tr key={row.key}>
              <th scope="row" className="calc-scenario-compare-metric-label">
                {row.label}
              </th>
              {analyses.map((analysis, index) => {
                const isBest = bestScenarioIndices.has(index);
                const tier = row.cellDataTier(analysis);
                return (
                  <td
                    key={`${row.key}-${index + 1}`}
                    className={`${isBest ? 'calc-scenario-compare-col--best' : ''} ${row.cellClass(analysis)}`.trim()}
                    data-tier={tier || undefined}
                  >
                    {row.format(analysis)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalcAccordion({ open, onToggle, title, summary, summaryWarn, summaryMuted, nested, kicker, children }) {
  return (
    <div className={`calc-accordion ${nested ? 'calc-accordion--nested' : ''} ${kicker ? 'calc-accordion--kicker' : ''}`.trim()}>
      <button type="button" className={`calc-accordion-header ${open ? '' : 'collapsed'}`.trim()} onClick={onToggle}>
        <span className="calc-accordion-arrow">{open ? '▼' : '▶'}</span>
        <span className="calc-accordion-title">{title}</span>
        {summary != null && (
          <span
            className={`calc-accordion-summary ${summaryMuted ? 'calc-accordion-summary--muted' : ''}`.trim()}
            style={summaryWarn ? { color: '#e74c3c', fontWeight: 700 } : undefined}
          >
            {summary}
          </span>
        )}
      </button>
      {open && <div className="calc-accordion-body">{children}</div>}
    </div>
  );
}

function renderFinancingBreakdown(ctx) {
  if (!ctx) return null;
  const ratePct = (ctx.sellerRate * 100).toFixed(1);
  let noteLine = '';
  if (ctx.sellerEnabled) {
    noteLine = `Seller note (${ctx.sellerPercent}%): ${formatMoney(ctx.sellerNote)} [${ctx.sellerPaymentType}, ${ratePct}%${ctx.sellerStandby === 'yes' ? `, ${ctx.sellerStandbyYears || DEFAULT_SELLER_STANDBY_YEARS}yr standby` : ''}]`;
  }
  return (
    <div className="calc-financing-breakdown">
      <div className="calc-financing-breakdown-title">Financing at recommended price</div>
      <div className="calc-financing-breakdown-lines">
        <div>SBA ({ctx.sbaPercent}%): {formatMoney(ctx.sbaLoan)}</div>
        <div>Buyer equity ({ctx.equityPercent}%): {formatMoney(ctx.equity)}</div>
        {noteLine && <div>{noteLine}</div>}
        <div>Target DSCR: {ctx.targetDSCR}x</div>
        <div>Target salary: {formatMoney(ctx.targetSalary)}</div>
      </div>
    </div>
  );
}

function cocTier(coc) {
  if (coc >= 100) return 'excellent';
  if (coc >= 50) return 'very-good';
  if (coc >= 25) return 'good';
  if (coc >= 0) return 'fair';
  return 'bad';
}

function paybackTier(years) {
  if (years <= 0 || years >= 100) return 'none';
  if (years <= 2) return 'excellent';
  if (years <= 4) return 'very-good';
  if (years <= 6) return 'good';
  if (years <= 10) return 'fair';
  return 'bad';
}

function formatNumberWithCommas(val) {
  if (val == null || val === '') return '';
  const digits = String(val).replace(/[^0-9]/g, '');
  if (digits === '') return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function stripNumberInput(str) {
  return String(str ?? '').replace(/[^0-9]/g, '');
}

function formatMoney(value) {
  if (value == null || Number.isNaN(value)) return '$0';
  return `$${Math.round(value).toLocaleString()}`;
}

function formatMoneyReadonly(value) {
  if (!value || Number.isNaN(value)) return '—';
  return formatMoney(value);
}

function formatCompactMoney(n) {
  if (!n || Number.isNaN(n)) return '$0';
  const x = Math.round(n);
  if (x >= 1000) return `$${Math.round(x / 1000)}k`;
  return `$${x}`;
}

