import { useCallback, useEffect, useRef, useState } from 'react';
import { userAPI } from '../utils/api';
import {
  BUY_BOX_SLOT_COUNT,
  defaultBuyBoxSlotName,
  emptyBuyBoxCriteria,
  normalizeBuyBoxesState,
  snapshotSlotFeed
} from '../utils/buyBoxes';

const DEFAULT_BUYBOX = {
  minPrice: null,
  maxPrice: null,
  minEbitda: null,
  maxEbitda: null,
  minRevenue: null,
  maxRevenue: null,
  revenueMultiple: null,
  targetStates: [],
  excludeStates: [],
  /** Mirrors targetStates in the text field so Save always persists what the user sees */
  targetStatesInput: '',
  excludeStatesInput: '',
  targetIndustries: [],
  targetCOC: null,
  targetPayback: null,
  minBuyerSalary: null,
  includeNearMatchesPercent: 0,
  includeAbsenteeRemoteNearMatches: false
};

function statesArrayToCommaInput(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  return arr.map((s) => String(s).trim()).filter(Boolean).join(', ');
}

/** Prefer typed input; fall back to saved arrays so Save does not wipe states when the field was never edited. */
function parseStateCodes(inputStr, fallbackArr) {
  const raw =
    inputStr != null && String(inputStr).trim() !== ''
      ? String(inputStr)
      : statesArrayToCommaInput(fallbackArr);
  return raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
}

function parseNumberField(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = parseFloat(String(value).replace(/[$,]/g, ''));
  return Number.isNaN(num) ? null : num;
}

const FLEXIBILITY_PRESETS = [0, 5, 10, 15, 20];
const NEAR_MATCH_OPTIONS = [
  { value: 0, label: 'Off (strict match only)' },
  { value: 5, label: '5%' },
  { value: 10, label: '10%' },
  { value: 15, label: '15%' },
  { value: 20, label: '20%' },
  { value: 'custom', label: 'Custom' }
];

const INDUSTRIES = ['Healthcare', 'SaaS', 'Manufacturing', 'Restaurant', 'Retail', 'E-commerce', 'Services', 'Real Estate'];

/** Set true to show Target Industries checkboxes in the Buy Box modal again. */
const SHOW_TARGET_INDUSTRIES_IN_BUYBOX = false;

export default function BuyBoxModal({
  persistSettings: persistSettingsProp = null,
  isGuest = false,
  isOpen,
  settings,
  editingSlotIndex,
  onClose,
  onSaved,
  isOnboarding = false
}) {
  const persistSettings = persistSettingsProp || ((patch) => userAPI.updateSettings(patch));
  const [form, setForm] = useState(DEFAULT_BUYBOX);
  const [buyBoxName, setBuyBoxName] = useState(defaultBuyBoxSlotName(0));
  const [saving, setSaving] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const busyRef = useRef(false);
  busyRef.current = saving || dismissing;
  const onboardingDismissLock = useRef(false);
  /** True only if the current gesture started with pointerdown on the backdrop (not inside the card). Avoids closing when text selection ends on the overlay. */
  const closeGestureFromBackdropRef = useRef(false);
  /** Tracks unsaved edits; state (not ref) so close handlers always see the latest value after React commits. */
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);
  /** Avoid re-hydrating when only `settings` reference updates while the modal stays open. */
  const hydrateSessionRef = useRef({ open: false, slotKey: '' });

  useEffect(() => {
    if (!isOpen) {
      hydrateSessionRef.current = { open: false, slotKey: '' };
      setHasUnsavedEdits(false);
      return;
    }

    const { buyBoxes, activeBuyBoxIndex } = normalizeBuyBoxesState(settings);
    const idx = isOnboarding ? 0 : (Number.isFinite(editingSlotIndex) ? editingSlotIndex : activeBuyBoxIndex);
    const safeIdx = Math.min(BUY_BOX_SLOT_COUNT - 1, Math.max(0, idx));
    const slotKey = `${safeIdx}:${isOnboarding ? 'onboarding' : 'edit'}`;
    const sess = hydrateSessionRef.current;
    if (sess.open && sess.slotKey === slotKey) {
      return;
    }
    hydrateSessionRef.current = { open: true, slotKey };

    const slot = buyBoxes[safeIdx] || {};
    const { name, ...crit } = slot;
    const nextName = typeof name === 'string' && name.trim() ? name.trim() : defaultBuyBoxSlotName(safeIdx);
    const nextForm = {
      ...DEFAULT_BUYBOX,
      ...crit,
      targetStatesInput: statesArrayToCommaInput(crit.targetStates),
      excludeStatesInput: statesArrayToCommaInput(crit.excludeStates)
    };
    setHasUnsavedEdits(false);
    setBuyBoxName(nextName);
    setForm(nextForm);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- omit `settings`: parent refresh must not re-hydrate while open (was clearing unsaved-edits guard).
  }, [isOpen, editingSlotIndex, isOnboarding]);

  useEffect(() => {
    if (!isOpen) return;
    console.log('[BuyBoxModal] open', { isOnboarding, isGuest });
  }, [isOpen, isOnboarding, isGuest]);

  const dismissOnboarding = useCallback(async () => {
    if (onboardingDismissLock.current || saving) return;
    onboardingDismissLock.current = true;
    setDismissing(true);
    try {
      await persistSettings({ preferences: { buyBoxOnboardingDismissed: true } });
      onSaved();
      onClose();
    } catch (error) {
      console.error('[BuyBoxModal] dismiss onboarding failed:', error);
      onClose();
    } finally {
      onboardingDismissLock.current = false;
      setDismissing(false);
    }
  }, [onSaved, onClose, saving]);

  const tryConfirmDiscardChanges = useCallback(() => {
    if (busyRef.current) return false;
    if (!hasUnsavedEdits) return true;
    return window.confirm(
      'You have unsaved changes. If you close now, your buy box settings will not be saved.'
    );
  }, [hasUnsavedEdits]);

  const requestCloseEditor = useCallback(() => {
    if (!tryConfirmDiscardChanges()) return;
    onClose();
  }, [onClose, tryConfirmDiscardChanges]);

  const requestDismissOnboarding = useCallback(async () => {
    if (!tryConfirmDiscardChanges()) return;
    await dismissOnboarding();
  }, [dismissOnboarding, tryConfirmDiscardChanges]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || busyRef.current) return;
      if (isOnboarding) void requestDismissOnboarding();
      else requestCloseEditor();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isOnboarding, requestCloseEditor, requestDismissOnboarding]);

  if (!isOpen) return null;

  const busy = saving || dismissing;

  const updateField = (key, value) => {
    setHasUnsavedEdits(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const formatWithCommas = (val) => {
    if (val === null || val === undefined || val === '') return '';
    const num = Number(val);
    if (Number.isNaN(num)) return '';
    const s = String(num);
    const [intPart, decPart] = s.split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
  };
  const handleNumberChange = (key, rawInput) => {
    updateField(key, parseNumberField(rawInput));
  };

  const handleIndustryToggle = (industry) => {
    setHasUnsavedEdits(true);
    setForm((current) => ({
      ...current,
      targetIndustries: current.targetIndustries?.includes(industry)
        ? current.targetIndustries.filter((item) => item !== industry)
        : [...(current.targetIndustries || []), industry]
    }));
  };

  const handleSave = async () => {
    if (form.minPrice && form.maxPrice && Number(form.minPrice) > Number(form.maxPrice)) {
      alert('Min price cannot be greater than max price');
      return;
    }
    if (form.minEbitda && form.maxEbitda && Number(form.minEbitda) > Number(form.maxEbitda)) {
      alert('Min EBITDA cannot be greater than max EBITDA');
      return;
    }

    setSaving(true);
    try {
      const buyBoxPayload = {
        minPrice: parseNumberField(form.minPrice),
        maxPrice: parseNumberField(form.maxPrice),
        minEbitda: parseNumberField(form.minEbitda),
        maxEbitda: parseNumberField(form.maxEbitda),
        minRevenue: parseNumberField(form.minRevenue),
        revenueMultiple: parseNumberField(form.revenueMultiple),
        targetStates: parseStateCodes(form.targetStatesInput, form.targetStates),
        excludeStates: parseStateCodes(form.excludeStatesInput, form.excludeStates),
        targetIndustries: form.targetIndustries || [],
        targetCOC: parseNumberField(form.targetCOC),
        targetPayback: parseNumberField(form.targetPayback),
        minBuyerSalary: parseNumberField(form.minBuyerSalary),
        includeNearMatchesPercent: Number(form.includeNearMatchesPercent) || 0,
        includeAbsenteeRemoteNearMatches: Boolean(form.includeAbsenteeRemoteNearMatches)
      };

      const { buyBoxes, activeBuyBoxIndex } = normalizeBuyBoxesState(settings);
      const slotIndex = isOnboarding ? 0 : (Number.isFinite(editingSlotIndex) ? editingSlotIndex : activeBuyBoxIndex);
      const safeIdx = Math.min(BUY_BOX_SLOT_COUNT - 1, Math.max(0, slotIndex));
      const trimmed = buyBoxName.trim();
      const nextName = trimmed || defaultBuyBoxSlotName(safeIdx);
      const prevSlot = buyBoxes[safeIdx] || {};
      const nextSlots = [...buyBoxes];
      // Merge criteria onto existing slot so feedSearch / exclude keywords stay tied to this slot.
      nextSlots[safeIdx] = {
        ...prevSlot,
        name: nextName,
        ...buyBoxPayload
      };

      const preferencePayload = {
        buyBoxes: nextSlots,
        activeBuyBoxIndex
      };
      if (isOnboarding) {
        preferencePayload.buyBoxOnboardingDismissed = true;
      }

      const updates = { preferences: preferencePayload };
      if (safeIdx === activeBuyBoxIndex) {
        updates.buyBox = buyBoxPayload;
      }
      await persistSettings(updates);
      onSaved();
      onClose();
    } catch (error) {
      alert(`Failed to save buy box: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (
      !window.confirm(
        'Reset deal criteria for this buy box to defaults?\n\nSearch keywords and exclude lists saved on this slot stay as they are.'
      )
    )
      return;
    const { buyBoxes, activeBuyBoxIndex } = normalizeBuyBoxesState(settings);
    const slotIndex = isOnboarding ? 0 : (Number.isFinite(editingSlotIndex) ? editingSlotIndex : activeBuyBoxIndex);
    const safeIdx = Math.min(BUY_BOX_SLOT_COUNT - 1, Math.max(0, slotIndex));
    const nextSlots = buyBoxes.map((b, i) => {
      if (i !== safeIdx) return b;
      const feed = snapshotSlotFeed(b);
      return {
        name: defaultBuyBoxSlotName(safeIdx),
        ...emptyBuyBoxCriteria(),
        ...feed
      };
    });
    setForm(DEFAULT_BUYBOX);
    setBuyBoxName(defaultBuyBoxSlotName(safeIdx));
    try {
      const updates = {
        preferences: { buyBoxes: nextSlots, activeBuyBoxIndex }
      };
      if (safeIdx === activeBuyBoxIndex) {
        updates.buyBox = emptyBuyBoxCriteria();
      }
      await persistSettings(updates);
      onSaved();
      onClose();
    } catch (error) {
      alert(`Failed to reset buy box: ${error.message}`);
    }
  };

  return (
    <div
      className="modal-overlay buybox-modal-overlay"
      onPointerDownCapture={(e) => {
        if (busy) return;
        closeGestureFromBackdropRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || busy) return;
        if (!closeGestureFromBackdropRef.current) return;
        closeGestureFromBackdropRef.current = false;
        if (isOnboarding) void requestDismissOnboarding();
        else requestCloseEditor();
      }}
    >
      <div className="modal-card buybox-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header buybox-modal-header">
          <div className="buybox-modal-header__main">
            <h2>Configure Buy Box</h2>
            <label className="buybox-modal-name-field">
              <span className="buybox-modal-name-field__label">Name</span>
              <input
                type="text"
                className="buybox-modal-name-field__input"
                value={buyBoxName}
                onChange={(e) => {
                  setHasUnsavedEdits(true);
                  setBuyBoxName(e.target.value);
                }}
                placeholder={defaultBuyBoxSlotName(
                  isOnboarding ? 0 : (Number.isFinite(editingSlotIndex) ? editingSlotIndex : settings?.activeBuyBoxIndex ?? 0)
                )}
                maxLength={80}
                disabled={busy}
                autoComplete="off"
                aria-label="Buy box name"
              />
            </label>
          </div>
          <button
            type="button"
            className="column-close-btn"
            onClick={() => (isOnboarding ? void requestDismissOnboarding() : requestCloseEditor())}
            disabled={busy}
            aria-label={isOnboarding ? 'Skip buy box and browse deals' : 'Close'}
          >
            ×
          </button>
        </div>
        <div className="buybox-modal-body">
        {isOnboarding && (
          <p className="buybox-onboarding-intro">
            Set your buy box so the feed only loads deals that fit you. Skip to browse the pool — you can change this anytime from the dashboard.
          </p>
        )}

        <div className="modal-grid two-col">
          <div className="form-group"><label>Min Price</label><input value={formatWithCommas(form.minPrice)} onChange={(e) => handleNumberChange('minPrice', e.target.value)} placeholder="$500,000" /></div>
          <div className="form-group"><label>Max Price</label><input value={formatWithCommas(form.maxPrice)} onChange={(e) => handleNumberChange('maxPrice', e.target.value)} placeholder="$5,000,000" /></div>
          <div className="form-group"><label>Min EBITDA</label><input value={formatWithCommas(form.minEbitda)} onChange={(e) => handleNumberChange('minEbitda', e.target.value)} placeholder="$100,000" /></div>
          <div className="form-group"><label>Max EBITDA</label><input value={formatWithCommas(form.maxEbitda)} onChange={(e) => handleNumberChange('maxEbitda', e.target.value)} placeholder="$1,000,000" /></div>
          <div className="form-group"><label>Min Revenue</label><input value={formatWithCommas(form.minRevenue)} onChange={(e) => handleNumberChange('minRevenue', e.target.value)} placeholder="$1,000,000" /></div>
          <div className="form-group"><label>Revenue Multiple</label><input value={formatWithCommas(form.revenueMultiple)} onChange={(e) => handleNumberChange('revenueMultiple', e.target.value)} placeholder="3.5" /></div>
          <div className="form-group"><label>Target States</label><input value={form.targetStatesInput ?? form.targetStates?.join(', ') ?? ''} onChange={(e) => updateField('targetStatesInput', e.target.value)} placeholder="CA, TX, FL" /></div>
          <div className="form-group"><label>Exclude States</label><input value={form.excludeStatesInput ?? form.excludeStates?.join(', ') ?? ''} onChange={(e) => updateField('excludeStatesInput', e.target.value)} placeholder="AK, HI" /></div>
          {SHOW_TARGET_INDUSTRIES_IN_BUYBOX && (
            <div className="form-group full-width">
              <label>Target Industries</label>
              <div className="industry-checkboxes">
                {INDUSTRIES.map((industry) => (
                  <label key={industry} className="industry-checkbox">
                    <input type="checkbox" checked={form.targetIndustries?.includes(industry) || false} onChange={() => handleIndustryToggle(industry)} />
                    {industry}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="modal-grid three-col full-width buybox-analyzer-defaults-row" role="group" aria-label="Deal analyzer defaults">
            <div className="form-group">
              <label>Minimum CoC return (%)</label>
              <input
                value={formatWithCommas(form.targetCOC)}
                onChange={(e) => handleNumberChange('targetCOC', e.target.value)}
                placeholder="25"
                inputMode="decimal"
              />
            </div>
            <div className="form-group">
              <label>Payback period (years)</label>
              <input
                value={formatWithCommas(form.targetPayback)}
                onChange={(e) => handleNumberChange('targetPayback', e.target.value)}
                placeholder="4"
                inputMode="decimal"
              />
            </div>
            <div className="form-group">
              <label>Minimum Buyer Salary</label>
              <input
                value={formatWithCommas(form.minBuyerSalary)}
                onChange={(e) => handleNumberChange('minBuyerSalary', e.target.value)}
                placeholder="150,000"
                inputMode="numeric"
              />
            </div>
          </div>
        </div>

        <div className="buybox-near-matches">
          <h3 className="buybox-near-matches__title">Include near matches</h3>
          <p className="buybox-near-matches__desc">
            Show deals that are slightly over your maximums (or under your minimums) so you don’t miss listings that might negotiate. For example, with 10%, a $1M max price also shows deals up to $1.1M. Absentee/remote can be included even when Flexibility is off.
          </p>
          <label className="form-group buybox-near-matches__field">
            <span className="buybox-near-matches__label">Flexibility</span>
            <select
              value={FLEXIBILITY_PRESETS.includes(Number(form.includeNearMatchesPercent)) ? Number(form.includeNearMatchesPercent) : 'custom'}
              onChange={(e) => {
                const v = e.target.value;
                if (v !== 'custom') updateField('includeNearMatchesPercent', Number(v));
              }}
              className="buybox-near-matches__select"
            >
              {NEAR_MATCH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {!FLEXIBILITY_PRESETS.includes(Number(form.includeNearMatchesPercent)) && (
              <input
                type="number"
                min={0}
                max={100}
                className="buybox-near-matches__custom"
                value={form.includeNearMatchesPercent ?? ''}
                onChange={(e) => updateField('includeNearMatchesPercent', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                aria-label="Custom flexibility percent"
              />
            )}
          </label>
          <label className="buybox-near-matches__check">
            <input
              type="checkbox"
              checked={Boolean(form.includeAbsenteeRemoteNearMatches)}
              onChange={(e) => updateField('includeAbsenteeRemoteNearMatches', e.target.checked)}
            />
            <span>Include absentee / remote listings as near matches (up to 20% outside your limits)</span>
          </label>
        </div>
        </div>

        <div className="modal-actions buybox-modal-actions">
          {!isOnboarding && <button type="button" className="btn-secondary" onClick={handleReset} disabled={busy}>Reset</button>}
          {!isOnboarding && (
            <button type="button" className="btn-secondary" onClick={requestCloseEditor} disabled={busy}>
              Cancel
            </button>
          )}
          {isOnboarding && (
            <button type="button" className="btn-secondary" onClick={() => void requestDismissOnboarding()} disabled={busy}>
              {dismissing ? 'Skipping...' : 'Skip for now'}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={handleSave} disabled={busy}>
            {saving ? 'Saving...' : 'Save Buy Box'}
          </button>
        </div>
      </div>
    </div>
  );
}
