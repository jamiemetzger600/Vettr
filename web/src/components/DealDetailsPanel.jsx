import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DealCalculator from './DealCalculator';
import IOIModal from './IOIModal';
import { getCalculatorDefaultsFromSettings } from '../utils/calculatorDefaultsFromSettings';
import { loadCalculatorState } from '../utils/dealCalculatorStorage';
import GatedPreviewText from './GatedPreviewText';
import { sbaReadinessScore } from '../utils/sbaReadiness';

const POSITION_OPTIONS = ['left', 'center', 'right'];
const DEFAULT_PRIMARY = 'description';
const DEFAULT_PINNED = 'overview';

export const SECTION_ICON_IDS = [
  'description',
  'overview',
  'calculator',
  'ioi',
  'broker',
  'pipeline',
  'followup',
  'checklist',
  'talk',
  'timeline',
  'notes',
  'broker-progress'
];

function SectionIcon({ name }) {
  const props = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  switch (name) {
    case 'description':
      return (
        <svg {...props}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'overview':
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      );
    case 'calculator':
      return (
        <svg {...props}>
          <rect x="4" y="2" width="16" height="20" rx="2" />
          <line x1="8" y1="6" x2="16" y2="6" />
          <line x1="8" y1="10" x2="8" y2="10.01" />
          <line x1="12" y1="10" x2="12" y2="10.01" />
          <line x1="16" y1="10" x2="16" y2="10.01" />
          <line x1="8" y1="14" x2="8" y2="14.01" />
          <line x1="12" y1="14" x2="12" y2="14.01" />
          <line x1="16" y1="14" x2="16" y2="14.01" />
          <line x1="8" y1="18" x2="8" y2="18.01" />
          <line x1="12" y1="18" x2="12" y2="18.01" />
          <line x1="16" y1="18" x2="16" y2="18.01" />
        </svg>
      );
    case 'ioi':
      return (
        <svg {...props}>
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case 'broker':
    case 'broker-progress':
      return (
        <svg {...props}>
          {/* shoulders / torso */}
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          {/* head */}
          <circle cx="12" cy="7" r="4" />
          {/* necktie: knot + blade */}
          <path d="M10.8 13.2 12 12.2l1.2 1-1.2.9Z" fill="currentColor" stroke="none" />
          <path d="M12 13.1 13.15 17.6 12 19.2 10.85 17.6Z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'pipeline':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="5" height="16" rx="1" />
          <rect x="10" y="8" width="5" height="12" rx="1" />
          <rect x="17" y="12" width="4" height="8" rx="1" />
        </svg>
      );
    case 'followup':
      return (
        <svg {...props}>
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <circle cx="12" cy="16" r="2.5" />
        </svg>
      );
    case 'checklist':
      return (
        <svg {...props}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
          <rect x="9" y="3" width="6" height="4" rx="1" />
          <path d="M9 12l2 2 4-4" />
          <path d="M9 18l2 2 4-4" />
        </svg>
      );
    case 'talk':
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'timeline':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 16 14" />
        </svg>
      );
    case 'notes':
      return (
        <svg {...props}>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}

function dashStr(v) {
  if (v == null || String(v).trim() === '') return '—';
  return String(v);
}

/** Read-only Deal Overview cards for saved deals when overview edit mode is off */
function SavedDealOverviewReadOnlyCards({ deal, savedAtDisplay, multiple }) {
  return (
    <>
      <InfoCard label="Saved Date" value={savedAtDisplay} />
      <InfoCard label="County" value={dashStr(deal.county)} />
      <InfoCard label="Country" value={dashStr(deal.country)} />
      <InfoCard label="Years Established" value={dashStr(deal.yearsEstablished)} />
      <InfoCard label="Franchise" value={dashStr(deal.franchise)} />
      <InfoCard label="Remote / Relocatable" value={dashStr(deal.remote)} wide />
      <InfoCard label="Asking Price" value={formatMoneyPanel(deal.askingPrice)} accent />
      <InfoCard label="EBITDA/SDE" value={formatMoneyPanel(deal.ebitda)} accent />
      <InfoCard label="Revenue" value={formatMoneyPanel(deal.revenue)} />
      <InfoCard label="Multiple" value={multiple} />
      <InfoCard label="Location" value={dashStr(deal.location || deal.city)} />
      <InfoCard label="City" value={dashStr(deal.city)} />
      <InfoCard label="State" value={dashStr(deal.state)} />
      <InfoCard label="Industry" value={dashStr(deal.industry)} wide />
      <InfoCard label="Listing URL" value={dashStr(deal.url)} wide />
    </>
  );
}

function SectionIconRail({
  sections,
  primarySection,
  pinnedSection,
  pinnedIds,
  focusedSection,
  onSelect,
  onKeyDown,
}) {
  const railRef = useRef(null);

  const handleKeyDown = (e, index) => {
    const buttons = railRef.current?.querySelectorAll('button');
    if (!buttons?.length) return;

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      const next = buttons[Math.min(index + 1, buttons.length - 1)];
      next?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = buttons[Math.max(index - 1, 0)];
      prev?.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(sections[index].id);
    }
    onKeyDown?.(e, index);
  };

  return (
    <nav className="deal-section-rail" aria-label="Deal sections" ref={railRef}>
      {sections.map((section, index) => {
        const isVisible =
          section.id === primarySection
          || (section.id === pinnedSection && pinnedIds.has(section.id));
        const isPinned = pinnedIds.has(section.id);
        const isFocused = section.id === focusedSection;
        return (
          <button
            key={section.id}
            type="button"
            className={[
              'deal-section-rail-btn',
              isVisible ? 'deal-section-rail-btn--visible' : '',
              isFocused ? 'deal-section-rail-btn--focused' : '',
              isPinned ? 'deal-section-rail-btn--pinned' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onSelect(section.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            aria-label={section.label}
            title={section.label}
            aria-current={isFocused ? 'true' : undefined}
          >
            <SectionIcon name={section.icon || section.id} />
            <span className="deal-section-rail-tooltip" role="tooltip">{section.label}</span>
            {isPinned ? <span className="deal-section-rail-pin-dot" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </nav>
  );
}

function SectionSlot({
  sectionId,
  label,
  isPinned,
  onTogglePin,
  editControl = null,
  hidePin = false,
  children,
}) {
  return (
    <section
      className="deal-section-slot"
      data-section={sectionId}
      aria-labelledby={`deal-section-heading-${sectionId}`}
    >
      <div className="deal-section-slot-header">
        <h3 id={`deal-section-heading-${sectionId}`} className="deal-section-slot-title">{label}</h3>
        <div className="deal-section-slot-actions">
          {editControl}
          {!hidePin ? (
            <button
              type="button"
              className={`deal-section-pin-btn ${isPinned ? 'deal-section-pin-btn--active' : ''}`}
              onClick={onTogglePin}
              aria-pressed={isPinned}
              aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
              title={isPinned ? 'Unpin — hide this section' : 'Pin — keep visible while browsing other sections'}
            >
              <svg className="deal-section-pin-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z" />
              </svg>
            </button>
          ) : null}
        </div>
      </div>
      <div className="deal-section-slot-body">{children}</div>
    </section>
  );
}

export default function DealDetailsPanel({
  isOpen,
  deal,
  position = 'center',
  onClose,
  onSaveDeal,
  onUnsaveDeal = null,
  isSavingDeal = false,
  dealSavedInMyDeals = false,
  saveButtonLabel = 'Save to My Deals',
  unsaveButtonTitle = 'Click to remove from My Deals',
  savedHighlightStyle = true,
  onPositionChange,
  settings = null,
  onSaveCalculatorDefaults = null,
  onCalculatorPersisted = null,
  panelOnly = false,
  showPositionToggle = true,
  showSaveButton = true,
  renderFooter = null,
  extraSections = [],
  overviewAdditions = null,
  onIOISent = null,
  onIOIPrefsSaved = null,
  headerProgressLabel = null,
  /** Editable progress in the header: { value, onChange, options, disabled, saving } */
  headerProgressControl = null,
  listingEdit = null,
  entitlements = null,
  isGuest = false,
  requireSignup = null,
  focusSectionId = null,
  /** When set, only these section ids appear in the rail / slots (CRM tab filtering). */
  visibleSectionIds = null,
}) {
  const [primarySection, setPrimarySection] = useState(DEFAULT_PRIMARY);
  const [pinnedSection, setPinnedSection] = useState(DEFAULT_PINNED);
  const [pinnedIds, setPinnedIds] = useState(() => new Set([DEFAULT_PINNED]));
  const [focusedSection, setFocusedSection] = useState(DEFAULT_PRIMARY);
  const [ioiData, setIoiData] = useState(null);
  const [ioiModalKey, setIoiModalKey] = useState(0);

  const dealRowId = deal?.id ?? deal?.vettrId ?? null;

  useEffect(() => {
    if (!dealRowId) return;
    const start = focusSectionId || DEFAULT_PRIMARY;
    setPrimarySection(start);
    setPinnedSection(DEFAULT_PINNED);
    setPinnedIds(new Set([DEFAULT_PINNED]));
    setFocusedSection(start);
    if (focusSectionId) {
      console.log('[DealDetailsPanel] focus section', focusSectionId, 'deal', dealRowId);
    }
  }, [dealRowId, focusSectionId]);

  useEffect(() => {
    if (!isOpen && !panelOnly) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, panelOnly, onClose]);

  const resolveIOIScenarios = useCallback(() => {
    if (!deal?.id) return null;
    const fromLs = loadCalculatorState(deal.id);
    if (fromLs?.scenarios?.length) {
      return { scenarios: fromLs.scenarios, activeScenario: fromLs.activeScenario ?? 0 };
    }
    const fromApi = deal.calculatorState;
    if (fromApi?.scenarios?.length) {
      return { scenarios: fromApi.scenarios, activeScenario: fromApi.activeScenario ?? 0 };
    }
    return null;
  }, [deal?.id, deal?.calculatorState]);

  const sba = useMemo(() => (deal ? sbaReadinessScore(deal) : null), [deal]);

  const openIOIModal = useCallback((data) => {
    if (isGuest && typeof requireSignup === 'function') {
      console.log('[DealDetailsPanel] Quick IOI blocked for guest');
      requireSignup('ioi', { dealDbId: deal?.dbId });
      return false;
    }
    const payload = data?.scenarios?.length ? data : resolveIOIScenarios();
    if (!payload?.scenarios?.length) {
      console.log('[DealDetailsPanel] Quick IOI missing scenarios — opening calculator');
      setPrimarySection('calculator');
      setFocusedSection('calculator');
      return false;
    }
    console.log('[DealDetailsPanel] opening Quick IOI', { dealId: deal?.id, scenarios: payload.scenarios.length });
    setIoiData(payload);
    setIoiModalKey((k) => k + 1);
    return true;
  }, [isGuest, requireSignup, deal?.dbId, deal?.id, resolveIOIScenarios]);

  const handleUseForIOI = useCallback((data) => {
    openIOIModal(data);
  }, [openIOIModal]);

  const handleCloseIOI = useCallback(() => {
    setIoiData(null);
  }, []);

  const handleRailClick = useCallback((sectionId) => {
    setFocusedSection(sectionId);

    if (sectionId === primarySection) {
      return;
    }

    const previousPrimary = primarySection;
    setPrimarySection(sectionId);

    const otherPinned = [...pinnedIds].filter((id) => id !== sectionId);
    if (otherPinned.includes(previousPrimary)) {
      setPinnedSection(previousPrimary);
    } else if (pinnedSection && pinnedSection !== sectionId && pinnedIds.has(pinnedSection)) {
      setPinnedSection(pinnedSection);
    } else if (otherPinned.length > 0) {
      setPinnedSection(otherPinned[0]);
    } else {
      setPinnedSection(null);
    }
  }, [primarySection, pinnedSection, pinnedIds]);

  const handlePinToggle = useCallback((sectionId) => {
    setPinnedIds((prevPinned) => {
      const wasPinned = prevPinned.has(sectionId);
      const nextPinned = new Set(prevPinned);

      if (wasPinned) {
        nextPinned.delete(sectionId);
        // Unpin = hide this section from the dual-pane view
        setPinnedSection((pinned) => {
          if (pinned !== sectionId) return pinned;
          return [...nextPinned].find((id) => id !== primarySection) ?? null;
        });
        setPrimarySection((primary) => {
          if (primary !== sectionId) return primary;
          const fallback =
            (pinnedSection && pinnedSection !== sectionId ? pinnedSection : null)
            || [...nextPinned][0]
            || (sectionId === DEFAULT_PRIMARY ? DEFAULT_PINNED : DEFAULT_PRIMARY);
          if (fallback === pinnedSection) {
            setPinnedSection(
              [...nextPinned].find((id) => id !== fallback) ?? null
            );
          }
          setFocusedSection(fallback);
          console.log('[DealDetailsPanel] unpinned/hid section', sectionId, '→ primary', fallback);
          return fallback;
        });
      } else {
        nextPinned.add(sectionId);
        // Pin = keep visible as the companion slot (unless it's already primary)
        if (sectionId !== primarySection) {
          setPinnedSection(sectionId);
        }
        console.log('[DealDetailsPanel] pinned section', sectionId);
      }

      return nextPinned;
    });
  }, [primarySection, pinnedSection]);

  const coreSections = useMemo(() => ([
    { id: 'description', label: 'Description', icon: 'description' },
    { id: 'overview', label: 'Deal Overview', icon: 'overview' },
    { id: 'calculator', label: 'Calculator', icon: 'calculator' },
    { id: 'ioi', label: 'Quick IOI', icon: 'ioi' }
  ]), []);

  const allSections = useMemo(() => {
    const extras = (extraSections || []).map((s) => ({
      id: s.id,
      label: s.label,
      icon: s.icon || s.id,
    }));
    const combined = [...coreSections, ...extras];
    if (!Array.isArray(visibleSectionIds) || visibleSectionIds.length === 0) {
      return combined;
    }
    const allow = new Set(visibleSectionIds);
    return combined.filter((s) => allow.has(s.id));
  }, [coreSections, extraSections, visibleSectionIds]);

  useEffect(() => {
    if (!allSections.length) return;
    const ids = new Set(allSections.map((s) => s.id));
    if (!ids.has(primarySection)) {
      const next = allSections[0].id;
      setPrimarySection(next);
      setFocusedSection(next);
      console.log('[DealDetailsPanel] primary reset to visible section', next);
    }
    if (pinnedSection && !ids.has(pinnedSection)) {
      setPinnedSection(null);
    }
  }, [allSections, primarySection, pinnedSection]);

  const sectionMetaById = useMemo(() => {
    const map = {};
    allSections.forEach((s) => { map[s.id] = s; });
    return map;
  }, [allSections]);

  if (!deal) return null;
  if (!panelOnly && !isOpen) return null;

  const calculatorDefaults = getCalculatorDefaultsFromSettings(settings);
  const listedDate = deal.discoveredAt ? new Date(deal.discoveredAt).toLocaleDateString() : '-';

  const parseMoneyInput = (raw) => {
    const n = parseFloat(String(raw ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : NaN;
  };
  const numOrNaN = (v) => {
    if (v == null || v === '') return NaN;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };
  const overviewEditing = Boolean(
    listingEdit?.overviewEditMode || listingEdit?.alwaysEditOverview
  );
  const askingN =
    overviewEditing
      ? parseMoneyInput(listingEdit.values.askingPrice)
      : numOrNaN(deal.askingPrice);
  const ebitdaN =
    overviewEditing
      ? parseMoneyInput(listingEdit.values.ebitda)
      : numOrNaN(deal.ebitda);
  const multiple =
    Number.isFinite(askingN) && Number.isFinite(ebitdaN) && ebitdaN !== 0
      ? `${(askingN / ebitdaN).toFixed(2)}x`
      : '-';

  const brokerName = deal.brokerName || deal.broker || '-';
  const brokerCompany = deal.brokerCompany || deal.source || '-';
  const brokerEmail = deal.brokerEmail || '-';
  const brokerPhone = deal.brokerPhone || '-';

  const descriptionEditControl = listingEdit?.onToggleDescriptionEdit ? (
    <button
      type="button"
      className={`btn-secondary deal-section-edit-btn ${listingEdit.descriptionEditMode ? 'deal-section-edit-btn--active' : ''}`}
      onClick={() => listingEdit.onToggleDescriptionEdit()}
      aria-pressed={listingEdit.descriptionEditMode}
    >
      {listingEdit.descriptionEditMode ? 'Done' : 'Edit'}
    </button>
  ) : null;

  const overviewEditControl = listingEdit?.onToggleOverviewEdit ? (
    <button
      type="button"
      className={`btn-secondary deal-section-edit-btn ${listingEdit.overviewEditMode ? 'deal-section-edit-btn--active' : ''}`}
      onClick={() => listingEdit.onToggleOverviewEdit()}
      aria-pressed={listingEdit.overviewEditMode}
    >
      {listingEdit.overviewEditMode ? 'Done' : 'Edit'}
    </button>
  ) : null;

  const sectionContentById = {
    description: listingEdit ? (
      listingEdit.descriptionEditMode ? (
        <textarea
          className="deal-details-description deal-details-description--edit"
          value={listingEdit.values.description}
          onChange={(e) => listingEdit.onChange('description', e.target.value)}
          placeholder="No description yet — add notes about this listing."
          rows={8}
        />
      ) : (
        <div className="deal-details-description">
          {deal.description || 'No description available.'}
        </div>
      )
    ) : isGuest ? (
      <GatedPreviewText
        text={deal.description || 'No description available.'}
        limit={entitlements?.previewCharLimit ?? 120}
        entitlements={entitlements}
        serverTruncated={deal.descriptionTruncated}
        className="deal-details-description"
        onRequireSignup={(reason) => requireSignup?.(reason, { dealDbId: deal.dbId })}
      />
    ) : (
      <div className="deal-details-description">
        {deal.description || 'No description available.'}
      </div>
    ),
    overview: (
      <div className="deal-overview-section-content">
        <div className="deal-overview-condensed">
          <div className="deal-overview-grid">
            {listingEdit ? (
              overviewEditing ? (
                <>
                  <InfoCard label="Saved Date" value={listingEdit.savedAtDisplay} />
                  <OverviewEditCard label="County" value={listingEdit.values.county} onChange={(v) => listingEdit.onChange('county', v)} placeholder="County" />
                  <OverviewEditCard label="Country" value={listingEdit.values.country} onChange={(v) => listingEdit.onChange('country', v)} placeholder="Country" />
                  <OverviewEditCard label="Years Established" value={listingEdit.values.yearsEstablished} onChange={(v) => listingEdit.onChange('yearsEstablished', v)} placeholder="Years" />
                  <OverviewEditCard label="Franchise" value={listingEdit.values.franchise} onChange={(v) => listingEdit.onChange('franchise', v)} placeholder="Yes / No" />
                  <OverviewEditCard label="Remote / Relocatable" value={listingEdit.values.remote} onChange={(v) => listingEdit.onChange('remote', v)} wide placeholder="Yes / No" />
                  <OverviewEditCard label="Asking Price" value={listingEdit.values.askingPrice} onChange={(v) => listingEdit.onChange('askingPrice', v)} accent placeholder="0" />
                  <OverviewEditCard label="EBITDA/SDE" value={listingEdit.values.ebitda} onChange={(v) => listingEdit.onChange('ebitda', v)} accent placeholder="0" />
                  <OverviewEditCard label="Revenue" value={listingEdit.values.revenue} onChange={(v) => listingEdit.onChange('revenue', v)} placeholder="0" />
                  <InfoCard label="Multiple" value={multiple} />
                  <OverviewEditCard label="Location" value={listingEdit.values.location} onChange={(v) => listingEdit.onChange('location', v)} placeholder="Location" />
                  <OverviewEditCard label="City" value={listingEdit.values.city} onChange={(v) => listingEdit.onChange('city', v)} placeholder="City" />
                  <OverviewEditCard label="State" value={listingEdit.values.state} onChange={(v) => listingEdit.onChange('state', v)} placeholder="State" />
                  <OverviewEditCard label="Industry" value={listingEdit.values.industry} onChange={(v) => listingEdit.onChange('industry', v)} wide placeholder="Industry" />
                  <OverviewEditCard label="Source" value={listingEdit.values.source} onChange={(v) => listingEdit.onChange('source', v)} placeholder="Source" />
                  <OverviewEditCard label="Listing URL" value={listingEdit.values.url} onChange={(v) => listingEdit.onChange('url', v)} wide placeholder="https://" />
                </>
              ) : (
                <SavedDealOverviewReadOnlyCards deal={deal} savedAtDisplay={listingEdit.savedAtDisplay} multiple={multiple} />
              )
            ) : (
              <>
                {overviewAdditions}
                <InfoCard label="Asking Price" value={formatMoneyPanel(deal.askingPrice)} accent />
                <InfoCard label="EBITDA/SDE" value={formatMoneyPanel(deal.ebitda)} accent />
                <InfoCard label="Revenue" value={formatMoneyPanel(deal.revenue)} />
                <InfoCard label="Multiple" value={multiple} />
                <InfoCard label="Location" value={deal.location || deal.city || '-'} />
                <InfoCard label="State" value={deal.state || '-'} />
                <InfoCard label="Industry" value={deal.industry || '-'} wide />
                <InfoCard label="Source" value={deal.source || deal.sourceType || '-'} wide />
              </>
            )}
          </div>
        </div>
        <div className="deal-broker-condensed">
          <h3>Broker Information</h3>
          {entitlements?.brokerContactVisible !== false ? (
            overviewEditing && listingEdit?.onBrokerChange ? (
              <div className="deal-broker-grid">
                <OverviewEditCard
                  label="Broker Name"
                  value={listingEdit.broker?.name || ''}
                  onChange={(v) => listingEdit.onBrokerChange('name', v)}
                  placeholder="Name"
                />
                <OverviewEditCard
                  label="Company"
                  value={listingEdit.broker?.company || ''}
                  onChange={(v) => listingEdit.onBrokerChange('company', v)}
                  placeholder="Company"
                />
                <OverviewEditCard
                  label="Email"
                  value={listingEdit.broker?.email || ''}
                  onChange={(v) => listingEdit.onBrokerChange('email', v)}
                  placeholder="email@example.com"
                />
                <OverviewEditCard
                  label="Phone"
                  value={listingEdit.broker?.phone || ''}
                  onChange={(v) => listingEdit.onBrokerChange('phone', v)}
                  placeholder="Phone"
                />
                <OverviewEditCard
                  label="Listed"
                  value={listingEdit.values.discoveredAt}
                  onChange={(v) => listingEdit.onChange('discoveredAt', v)}
                  wide
                  placeholder="Listed date"
                />
              </div>
            ) : (
              <div className="deal-broker-grid">
                <BrokerItem label="Broker Name" value={brokerName} />
                <BrokerItem label="Company" value={brokerCompany} />
                <BrokerItem label="Email" value={brokerEmail} href={brokerEmail !== '-' ? `mailto:${brokerEmail}` : null} />
                <BrokerItem label="Phone" value={brokerPhone} href={brokerPhone !== '-' ? `tel:${brokerPhone}` : null} />
                <BrokerItem label="Listed" value={listedDate} wide />
              </div>
            )
          ) : (
            <GatedPreviewText
              text={[brokerName, brokerCompany, brokerEmail, brokerPhone].filter((v) => v && v !== '-').join(' · ') || 'Broker contact available after sign up.'}
              limit={entitlements?.previewCharLimit ?? 120}
              entitlements={entitlements}
              reason="broker_click"
              className="deal-details-description"
              onRequireSignup={(reason) => requireSignup?.(reason, { dealDbId: deal.dbId })}
            />
          )}
        </div>
      </div>
    ),
    calculator: (
      <DealCalculator
        deal={deal}
        calculatorDefaults={calculatorDefaults}
        onSaveCalculatorDefaults={onSaveCalculatorDefaults}
        onCalculatorPersisted={onCalculatorPersisted}
        onUseForIOI={handleUseForIOI}
        showQuickIOI="always"
      />
    ),
    ioi: (
      <div className="deal-ioi-launch">
        <p className="deal-ioi-launch__lead">
          Draft an indicative offer email from your calculator scenarios. Configure financing in the Calculator, then generate and send the IOI here.
        </p>
        <button
          type="button"
          className="btn-primary deal-ioi-launch__btn"
          onClick={() => openIOIModal()}
        >
          Open Quick IOI
        </button>
        {!resolveIOIScenarios() ? (
          <p className="deal-ioi-launch__hint">
            No calculator scenarios saved yet — open the Calculator section first and set up at least one scenario.
          </p>
        ) : null}
      </div>
    ),
  };

  extraSections.forEach((extra) => {
    if (extra?.id && typeof extra.render === 'function') {
      sectionContentById[extra.id] = extra.render();
    }
  });

  // Companion slot only stays open when still pinned (unpin hides immediately)
  const companionSection =
    pinnedSection
    && pinnedIds.has(pinnedSection)
    && pinnedSection !== primarySection
      ? pinnedSection
      : [...pinnedIds].find((id) => id !== primarySection) ?? null;
  const visibleSlots = [primarySection, companionSection].filter(
    (id, i, arr) => id && arr.indexOf(id) === i
  );

  const renderSaveButton = (extraClass = '') => {
    if (!showSaveButton) return null;
    const className = extraClass ? ` ${extraClass}` : '';
    if (dealSavedInMyDeals) {
      return (
        <button
          type="button"
          className={`${savedHighlightStyle ? 'btn-save btn-save--saved' : 'btn-save btn-save--saved-muted'}${className}`}
          disabled={isSavingDeal || typeof onUnsaveDeal !== 'function'}
          title={unsaveButtonTitle}
          onClick={() => onUnsaveDeal && onUnsaveDeal(deal)}
        >
          {isSavingDeal ? 'Removing…' : 'Saved'}
        </button>
      );
    }
    return (
      <button
        type="button"
        className={`btn-primary${className}`}
        disabled={isSavingDeal}
        onClick={() => {
          if (isGuest && typeof requireSignup === 'function') requireSignup('save', { dealDbId: deal.dbId });
          else onSaveDeal(deal);
        }}
      >
        {isSavingDeal ? 'Saving...' : saveButtonLabel}
      </button>
    );
  };

  const renderSlot = (sectionId, { hidePin = false } = {}) => {
    const meta = sectionMetaById[sectionId];
    if (!meta || sectionContentById[sectionId] == null) return null;
    const editControl =
      sectionId === 'description' ? descriptionEditControl
        : sectionId === 'overview' ? overviewEditControl
          : null;
    return (
      <SectionSlot
        key={sectionId}
        sectionId={sectionId}
        label={meta.label}
        isPinned={pinnedIds.has(sectionId)}
        onTogglePin={() => handlePinToggle(sectionId)}
        editControl={editControl}
        hidePin={hidePin}
      >
        {sectionContentById[sectionId]}
      </SectionSlot>
    );
  };

  // CRM tab mode: stack all visible sections — no icon rail / pin dual-pane.
  const stackMode = Array.isArray(visibleSectionIds) && visibleSectionIds.length > 0;

  const panelContent = (
    <div className={`deal-details-panel panel-${position}`} onClick={panelOnly ? undefined : (e) => e.stopPropagation()}>
      <div className="deal-details-header">
        <div className="deal-details-header-title-block">
          {overviewEditing ? (
            <input
              type="text"
              className="deal-details-title-input"
              value={listingEdit.values.name}
              onChange={(e) => listingEdit.onChange('name', e.target.value)}
              placeholder="Deal name"
              aria-label="Deal name"
            />
          ) : (
            <>
              <h2>{deal.name || 'Deal Details'}</h2>
              {sba ? (
                <span className="sba-readiness-chip" title={sba.checks.map((c) => `${c.ok ? '✓' : '!'} ${c.label}`).join('\n')}>
                  SBA {sba.score} · {sba.label}
                </span>
              ) : null}
            </>
          )}
          <div className="deal-details-header-meta-row">
              <div className="deal-details-header-cta-row">
              {renderSaveButton('deal-details-header-save')}
              {deal.url ? (
                isGuest && !entitlements?.listingLinkEnabled ? (
                  <button
                    type="button"
                    className="btn-secondary deal-details-header-listing-link"
                    disabled
                    title="Sign up to open the original listing"
                    onClick={() => requireSignup?.('listing', { dealDbId: deal.dbId })}
                  >
                    View Original Listing
                  </button>
                ) : (
                  <a
                    href={deal.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary deal-details-header-listing-link"
                  >
                    View Original Listing
                  </a>
                )
              ) : null}
              </div>
              {headerProgressControl ? (
                <>
                <label className="deal-details-header-progress-control">
                  <span className="deal-details-header-progress-control__label">Status</span>
                  <select
                    className="deal-details-header-progress-select"
                    value={headerProgressControl.value || ''}
                    onChange={headerProgressControl.onChange}
                    disabled={Boolean(headerProgressControl.disabled || headerProgressControl.saving)}
                    aria-busy={Boolean(headerProgressControl.saving)}
                    aria-label="Deal status"
                    title="Same pipeline status as Vettr CRM — change anytime"
                  >
                    <option value="">Select status…</option>
                    {(headerProgressControl.options || []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {headerProgressControl.value
                      && !(headerProgressControl.options || []).includes(headerProgressControl.value) ? (
                      <option value={headerProgressControl.value}>
                        {headerProgressControl.value} (saved)
                      </option>
                    ) : null}
                  </select>
                </label>
                {headerProgressControl.value === 'Custom Status' && typeof headerProgressControl.onCustomLabelSave === 'function' ? (
                  <div className="deal-details-header-custom-status">
                    <input
                      type="text"
                      className="deal-details-header-custom-status__input"
                      value={headerProgressControl.customLabel || ''}
                      onChange={headerProgressControl.onCustomLabelChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          headerProgressControl.onCustomLabelSave();
                        }
                      }}
                      placeholder="e.g. Waiting on seller P&Ls"
                      maxLength={120}
                      disabled={Boolean(headerProgressControl.disabled || headerProgressControl.customLabelSaving)}
                      aria-label="Custom status message"
                    />
                    <button
                      type="button"
                      className="btn-secondary deal-details-header-custom-status__save"
                      disabled={Boolean(
                        headerProgressControl.disabled
                        || headerProgressControl.customLabelSaving
                        || !String(headerProgressControl.customLabel || '').trim()
                      )}
                      onClick={headerProgressControl.onCustomLabelSave}
                    >
                      {headerProgressControl.customLabelSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                ) : null}
                </>
              ) : headerProgressLabel ? (
                <p className="deal-details-header-progress" title="Current progress status">
                  <strong>{headerProgressLabel}</strong>
                </p>
              ) : null}
            </div>
        </div>
        <div className="deal-details-header-actions">
          <button
            type="button"
            className="btn-primary deal-details-ioi-header-btn"
            onClick={() => openIOIModal()}
          >
            Quick IOI
          </button>
          {showPositionToggle && (
            <div className="panel-position-toggle" aria-label="Panel position">
              {POSITION_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={position === option ? 'active' : ''}
                  onClick={() => onPositionChange(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="deal-details-close" onClick={onClose}>×</button>
        </div>
      </div>

      <div className={`deal-details-body${stackMode || allSections.length <= 1 ? ' deal-details-body--stack' : ' deal-details-body--rail'}`}>
        {!stackMode && allSections.length > 1 ? (
          <SectionIconRail
            sections={allSections}
            primarySection={primarySection}
            pinnedSection={pinnedSection}
            pinnedIds={pinnedIds}
            focusedSection={focusedSection}
            onSelect={handleRailClick}
          />
        ) : null}
        <div className="deal-section-slots">
          {stackMode || allSections.length <= 1
            ? allSections.map((s) => renderSlot(s.id, { hidePin: true }))
            : visibleSlots.map((id) => renderSlot(id))}
        </div>
      </div>

      {ioiData && createPortal(
        <IOIModal
          key={ioiModalKey}
          deal={deal}
          scenarios={ioiData.scenarios}
          activeScenario={ioiData.activeScenario}
          qualityPrefs={{
            targetCOC: parseFloat(calculatorDefaults.targetCOC) || 25,
            targetPayback: parseFloat(calculatorDefaults.targetPayback) || 4
          }}
          settings={settings}
          onClose={handleCloseIOI}
          onIOISent={(text) => {
            if (onIOISent) onIOISent(text);
            handleCloseIOI();
          }}
          onIOIPrefsSaved={onIOIPrefsSaved}
        />,
        document.body
      )}

      <div className="deal-details-footer">
        {renderFooter != null ? (typeof renderFooter === 'function' ? renderFooter() : renderFooter) : (
          <>
            {renderSaveButton()}
            {deal.url ? (
              entitlements?.listingLinkEnabled ? (
                <a href={deal.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">View Original Listing</a>
              ) : (
                <button type="button" className="btn-secondary" disabled={false} title="Sign up to open the original listing" onClick={() => requireSignup?.('listing', { dealDbId: deal.dbId })}>View Original Listing</button>
              )
            ) : (
              <button type="button" className="btn-secondary" disabled aria-label="No listing URL">No Listing URL Available</button>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (panelOnly) return panelContent;

  return (
    <div className={`deal-details-overlay panel-${position}`} onClick={(event) => event.target === event.currentTarget && onClose()}>
      {panelContent}
    </div>
  );
}

function OverviewEditCard({ label, value, onChange, accent = false, wide = false, placeholder = '' }) {
  return (
    <div className={`deal-overview-card deal-overview-card--edit ${accent ? 'accent' : ''} ${wide ? 'wide' : ''}`.trim()}>
      <label className="deal-overview-label">{label}</label>
      <input
        type="text"
        className="modal-input deal-overview-edit-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function InfoCard({ label, value, accent = false, wide = false }) {
  return (
    <div className={`deal-overview-card ${accent ? 'accent' : ''} ${wide ? 'wide' : ''}`.trim()}>
      <div className="deal-overview-label">{label}</div>
      <div className="deal-overview-value">{value}</div>
    </div>
  );
}

export function BrokerItem({ label, value, href = null, wide = false }) {
  return (
    <div className={`deal-broker-item ${wide ? 'wide' : ''}`.trim()}>
      <div className="deal-broker-label">{label}</div>
      <div className="deal-broker-value">
        {href ? <a href={href}>{value}</a> : value}
      </div>
    </div>
  );
}

export function formatMoneyPanel(value) {
  if (!value || Number.isNaN(value)) return '$0';
  return `$${Math.round(value).toLocaleString()}`;
}
