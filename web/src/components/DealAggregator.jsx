import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { dealsAPI, userAPI } from '../utils/api';
import { loadCalculatorState, saveCalculatorState } from '../utils/dealCalculatorStorage';
import {
  fetchMarketDeals,
  fetchMarketDealsStats,
  fetchMarketDealByDbId,
  buildMarketDealsParams,
  mapSortField,
  encodeMarketDealsSortSpec,
} from '../utils/normalizeMarketDeal';
import {
  criteriaFromSlot,
  defaultBuyBoxSlotName,
  getExcludeListLibrary,
  getSearchListLibrary,
  joinSearchKeywords,
  mergeActiveSlotFeedPatch,
  normalizeBuyBoxesState,
  parseSearchKeywords,
  patchActiveBuyBoxFlexibility
} from '../utils/buyBoxes';
import DealAgeLegend from './DealAgeLegend';
import DealDetailsPanel from './DealDetailsPanel';
import DealInboxView from './DealInboxView';
import { useCrmStageControl } from '../hooks/useCrmStageControl';
import DealSwipeDeck from './DealSwipeDeck';
import MobileFeedToolbar from './MobileFeedToolbar';
import GatedPreviewText from './GatedPreviewText';
import { useIsMobile, useOrientation, startOfLocalDayISO, matchesMobileViewport } from '../hooks/useMediaQuery';
import { useTeam } from '../context/TeamContext';
import { claimPendingSaveDealDbId } from '../utils/pendingSaveDeal';
import { collapseListingEl, prefersReducedMotion } from '../utils/listingExit';
import {
  aggregatorCardStatus,
  aggregatorDeedColor,
  cardMetricLocation,
  cardViewDescriptionPreview,
  formatMoneyShort,
  formatRatio,
  formatDealDate,
  getListingAgeClass,
  listingAgeTitle,
  profitMultipleTier,
} from '../utils/dealCardDisplay';
import {
  hiddenDealIdToDbId,
  hiddenListingCount,
  hiddenStorageTokensForDeal,
  isDealHidden,
} from '../utils/hiddenDeals';

const PER_PAGE = 50;
const MAX_SEARCH_KEYWORDS = 8;
const SHOW_SORT_TIP = false;
/** Flip to true to show the mobile Focus swipe deck again. See docs/misc/ROADMAP.md. */
const SHOW_MOBILE_FOCUS = false;
const COLUMN_CONFIG = {
  name: { label: 'Name', default: true, required: true, sortable: true },
  date: { label: 'Date Added', default: true, sortable: true },
  industry: { label: 'Industry', default: true, sortable: true },
  description: { label: 'Description', default: false, sortable: false },
  city: { label: 'City', default: false, sortable: true },
  county: { label: 'County', default: false, sortable: true },
  state: { label: 'State', default: false, sortable: true },
  country: { label: 'Country', default: false, sortable: true },
  yearsEstablished: { label: 'Years Established', default: false, sortable: true },
  ebitda: { label: 'Annual Profit', default: true, sortable: true },
  revenue: { label: 'Annual Revenue', default: false, sortable: true },
  price: { label: 'Asking Price', default: true, sortable: true },
  profitMultiple: { label: 'Profit Multiple', default: false, sortable: true },
  revenueMultiple: { label: 'Revenue Multiple', default: false, sortable: true },
  remote: { label: 'Remote/Relocatable/Absentee-Run', headerLabel: 'REMOTE', default: false, sortable: true },
  franchise: { label: 'Franchise', default: false, sortable: true },
  fiveYearsInBusiness: { label: '5+ Years In Business', default: false, sortable: true },
  broker: { label: 'Broker Name', headerLabel: 'BROKER', default: false, sortable: true },
  brokerCompany: { label: 'Broker Company', default: false, sortable: true },
  brokerPhone: { label: 'Broker Contact', default: false, sortable: true },
  brokerEmail: { label: 'Broker Email', default: false, sortable: true },
  location: { label: 'Location', default: true, sortable: true },
  source: { label: 'Source', default: true, sortable: true },
  url: { label: 'Listing URL', default: false, sortable: true }
};
const DEFAULT_VISIBLE_COLUMNS = Object.fromEntries(
  Object.entries(COLUMN_CONFIG).map(([key, config]) => [key, config.default !== false])
);
const DEFAULT_COLUMN_ORDER = Object.keys(COLUMN_CONFIG);
const COLUMN_ORDER_STORAGE_KEY = 'vettr_column_order';
const DEAL_VIEW_STYLE_STORAGE_KEY = 'vettr_aggregator_view_style';
const DEAL_VIEW_STYLES = new Set(['table', 'card', 'inbox']);
const DEFAULT_SORT = [{ field: 'date', direction: 'desc' }];

function isDealViewStyle(value) {
  return DEAL_VIEW_STYLES.has(value);
}

function loadStoredDealViewStyle() {
  try {
    const saved = localStorage.getItem(DEAL_VIEW_STYLE_STORAGE_KEY);
    return isDealViewStyle(saved) ? saved : null;
  } catch {
    return null;
  }
}

function persistStoredDealViewStyle(style) {
  if (!isDealViewStyle(style)) return;
  try {
    localStorage.setItem(DEAL_VIEW_STYLE_STORAGE_KEY, style);
  } catch (err) {
    console.warn('[DealAggregator] view style local save failed', err);
  }
}

function resolveDealViewStyle(settingsStyle) {
  const stored = loadStoredDealViewStyle();
  if (stored) return stored;
  // Mobile cold load: prefer Cards. Ignore account/guest default of `table`
  // (SettingsPage / guestSettings defaults) so phones don't land on Table.
  // Explicit card/inbox account prefs still win. Desktop unchanged.
  if (matchesMobileViewport()) {
    if (settingsStyle === 'card' || settingsStyle === 'inbox') return settingsStyle;
    return 'card';
  }
  if (isDealViewStyle(settingsStyle)) return settingsStyle;
  return 'table';
}

function mobileModeFromViewStyle(style) {
  if (style === 'inbox') return 'inbox';
  if (style === 'card') return 'card';
  return 'table';
}

/** First direction when adding a column via Shift+click (numeric/date: high/newest first). */
function defaultDirectionForNewSortField(field) {
  const descFirst = new Set([
    'date',
    'price',
    'ebitda',
    'revenue',
    'profitMultiple',
    'revenueMultiple',
    'yearsEstablished'
  ]);
  return descFirst.has(field) ? 'desc' : 'asc';
}

const CARD_SORT_OPTIONS = [
  { value: 'date_desc', label: 'Date Added (newest first)', field: 'date', direction: 'desc' },
  { value: 'date_asc', label: 'Date Added (oldest first)', field: 'date', direction: 'asc' },
  { value: 'state_asc', label: 'State (A–Z)', field: 'state', direction: 'asc' },
  { value: 'state_desc', label: 'State (Z–A)', field: 'state', direction: 'desc' },
  { value: 'price_desc', label: 'Asking Price (high to low)', field: 'price', direction: 'desc' },
  { value: 'price_asc', label: 'Asking Price (low to high)', field: 'price', direction: 'asc' },
  { value: 'ebitda_desc', label: 'Cashflow (high to low)', field: 'ebitda', direction: 'desc' },
  { value: 'ebitda_asc', label: 'Cashflow (low to high)', field: 'ebitda', direction: 'asc' },
  { value: 'industry_asc', label: 'Industry (A–Z)', field: 'industry', direction: 'asc' },
  { value: 'industry_desc', label: 'Industry (Z–A)', field: 'industry', direction: 'desc' },
  { value: 'profitMultiple_desc', label: 'C.F. Multiple (high to low)', field: 'profitMultiple', direction: 'desc' },
  { value: 'profitMultiple_asc', label: 'C.F. Multiple (low to high)', field: 'profitMultiple', direction: 'asc' }
];

function getCardSortValue(sortConfig) {
  const primary = sortConfig?.[0];
  if (!primary) return CARD_SORT_OPTIONS[0].value;
  const found = CARD_SORT_OPTIONS.find(
    (opt) => opt.field === primary.field && opt.direction === primary.direction
  );
  return found ? found.value : CARD_SORT_OPTIONS[0].value;
}

const FLEXIBILITY_PRESETS = [0, 5, 10, 15, 20];
const FLEXIBILITY_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5%' },
  { value: 10, label: '10%' },
  { value: 15, label: '15%' },
  { value: 20, label: '20%' },
  { value: 'custom', label: 'Custom' }
];

const SWIPE_THRESHOLD = 80;
const DRAG_CLICK_THRESHOLD = 8;
const MAX_DRAG = 320;

const CARD_COLUMNS_OPTIONS = [1, 2, 3, 4, 6, 8];
const DEFAULT_CARD_COLUMNS = 4;

/** Returns page numbers to show: e.g. [1, 2, 3, 4, 5, '…', 50] for currentPage 3, totalPages 50. */
function getPaginationPages(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = [];
  pages.push(1);
  const left = Math.max(2, currentPage - 2);
  const right = Math.min(totalPages - 1, currentPage + 2);
  if (left > 2) pages.push('…');
  for (let p = left; p <= right; p += 1) pages.push(p);
  if (right < totalPages - 1) pages.push('…');
  if (totalPages > 1) pages.push(totalPages);
  return pages;
}

/** Listing keys used to match market deals ↔ saved rows (deal_id and market_deals.id). */
function marketDealMatchKeys(deal) {
  const keys = [];
  if (deal?.id != null && deal.id !== '') keys.push(String(deal.id));
  if (deal?.dbId != null && deal.dbId !== '') keys.push(String(deal.dbId));
  return keys;
}

function isDealInSavedList(deal, savedIdSet) {
  if (!savedIdSet?.size || !deal) return false;
  return marketDealMatchKeys(deal).some((key) => savedIdSet.has(key));
}

function crmMetaForDeal(deal, map) {
  if (!deal || !map) return null;
  for (const key of marketDealMatchKeys(deal)) {
    const row = map[key];
    if (row) return row;
  }
  return null;
}

/** Card in list view. Swipe gestures paused — enableSwipe kept for a future redesign. */
function SwipeableDealCard({ deal, isHidden, onHide, onLike, onTap, enableSwipe, children }) {
  const [dragX, setDragX] = useState(0);
  const startXRef = useRef(0);
  const isDragRef = useRef(false);
  const dragXRef = useRef(0);

  const handleStart = useCallback((clientX) => {
    startXRef.current = clientX;
    isDragRef.current = false;
  }, []);

  const handleMove = useCallback((clientX) => {
    const dx = clientX - startXRef.current;
    if (!isDragRef.current && Math.abs(dx) > DRAG_CLICK_THRESHOLD) {
      isDragRef.current = true;
    }
    const clamped = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
    dragXRef.current = clamped;
    setDragX(clamped);
  }, []);

  const handleEnd = useCallback(() => {
    const x = dragXRef.current;
    if (x < -SWIPE_THRESHOLD) {
      onHide(deal);
    } else if (x > SWIPE_THRESHOLD) {
      onLike(deal);
    }
    setDragX(0);
    dragXRef.current = 0;
  }, [deal, onHide, onLike]);

  const onMouseMove = useCallback((e) => handleMove(e.clientX), [handleMove]);
  const onMouseUp = useCallback(() => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    handleEnd();
  }, [handleEnd, onMouseMove]);

  const onTouchStart = useCallback((e) => {
    handleStart(e.touches[0].clientX);
  }, [handleStart]);

  const onTouchMove = useCallback((e) => {
    handleMove(e.touches[0].clientX);
    if (isDragRef.current) {
      e.preventDefault();
    }
  }, [handleMove]);

  const onTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    handleStart(e.clientX);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [handleStart, onMouseMove, onMouseUp]);

  const onClick = useCallback((e) => {
    if (enableSwipe && isDragRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onTap(deal);
  }, [deal, onTap, enableSwipe]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onTap(deal);
    }
  }, [deal, onTap]);

  if (!enableSwipe) {
    return (
      <div
        data-deal-id={deal?.id != null ? String(deal.id) : undefined}
        style={deal?.id != null ? { viewTransitionName: `vt-deal-${String(deal.id).replace(/[^a-zA-Z0-9_-]/g, '_')}` } : undefined}
        className={`deal-card ${isHidden ? 'deal-card--hidden' : ''}`}
        onClick={() => onTap(deal)}
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    );
  }

  const rotate = (dragX / MAX_DRAG) * 12;
  const nopeOpacity = dragX < 0 ? Math.min(1, Math.abs(dragX) / SWIPE_THRESHOLD) * 0.9 : 0;
  const likeOpacity = dragX > 0 ? Math.min(1, dragX / SWIPE_THRESHOLD) * 0.9 : 0;

  return (
    <div
      className="swipeable-card-outer"
      style={{
        transform: `translateX(${dragX}px) rotate(${rotate}deg)`,
        transition: dragX === 0 ? 'transform 0.25s ease-out' : 'none'
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onMouseDown={onMouseDown}
    >
      <div
        className={`deal-card ${isHidden ? 'deal-card--hidden' : ''}`}
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={onKeyDown}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="swipeable-card-overlay swipeable-card-overlay--nope" style={{ opacity: nopeOpacity }} aria-hidden="true">
          Nope
        </div>
        <div className="swipeable-card-overlay swipeable-card-overlay--like" style={{ opacity: likeOpacity }} aria-hidden="true">
          Like
        </div>
        {children}
      </div>
    </div>
  );
}

function stopCardAction(e) {
  e.preventDefault();
  e.stopPropagation();
}

function AggregatorDeedCardBody({
  deal,
  isHidden,
  dealSaved,
  isGuest,
  entitlements,
  requireSignup,
  savingDealId,
  saveTargetLabel,
  showSavedHighlightInFeed,
  onToggleSave,
  onToggleHidden,
  onOpen,
}) {
  const color = aggregatorDeedColor(deal);
  const status = aggregatorCardStatus(deal);
  const descCard = cardViewDescriptionPreview(deal.description, 3);
  const cardLoc = cardMetricLocation(deal);
  const multipleOk = deal.profitMultiple != null && Number.isFinite(Number(deal.profitMultiple));

  return (
    <div
      className="deal-card__inner"
      style={{ '--deed-color': color.hex, '--deed-ink': color.ink }}
    >
      <header className="deal-card__header">
        <h3 className="deal-card__name">{deal.name || 'Unnamed Business'}</h3>
      </header>

      <div className="deal-card__status">{status}</div>

      <div className="deal-card__rows">
        <div className="deal-card__row">
          <span>{cardLoc?.label || 'Location'}</span>
          <span title={cardLoc?.value || undefined}>{cardLoc?.value || '—'}</span>
        </div>
      </div>

      <div className="deal-card__blurb">
        <span className="deal-card__blurb-label">Description</span>
        {isGuest ? (
          <GatedPreviewText
            text={deal.description}
            limit={entitlements?.previewCharLimit ?? 120}
            entitlements={entitlements}
            serverTruncated={deal.descriptionTruncated}
            reason="description_click"
            onRequireSignup={(reason) => requireSignup?.(reason, { dealDbId: deal.dbId })}
            className="deal-card-description"
          />
        ) : (
          <span className={`deal-card__blurb-text${descCard.full ? '' : ' deal-card__blurb-text--empty'}`}>
            {descCard.full || 'No description available.'}
          </span>
        )}
      </div>

      <div className="deal-card__rows">
        <div
          className="deal-card__row"
          title={listingAgeTitle(deal.discoveredAt)}
        >
          <span>Date added</span>
          <span className={`deal-date-age ${getListingAgeClass(deal.discoveredAt)}`}>
            {formatDealDate(deal.discoveredAt)}
          </span>
        </div>
      </div>

      <div className="deal-card__metrics">
        <div className="deal-card__metric">
          <span className="deal-card__metric-value" title={formatMoney(deal.askingPrice)}>{formatMoneyShort(deal.askingPrice)}</span>
          <span className="deal-card__metric-label">Purchase Price</span>
        </div>
        <div className="deal-card__metric">
          <span className="deal-card__metric-value" title={formatMoney(deal.revenue)}>{formatMoneyShort(deal.revenue)}</span>
          <span className="deal-card__metric-label">Revenue</span>
        </div>
        <div className="deal-card__metric">
          <span className="deal-card__metric-value" title={formatMoney(deal.ebitda)}>{formatMoneyShort(deal.ebitda)}</span>
          <span className="deal-card__metric-label">EBITDA</span>
        </div>
        <div className="deal-card__metric">
          <span
            className="deal-card__metric-value deal-card__multiple"
            data-tier={multipleOk ? profitMultipleTier(deal.profitMultiple) : 'neutral'}
            title={multipleOk ? `${formatRatio(deal.profitMultiple)}X multiple` : 'Multiple'}
          >
            {multipleOk ? `${formatRatio(deal.profitMultiple)}X` : '—'}
          </span>
          <span className="deal-card__metric-label">Multiple</span>
        </div>
      </div>

      <div className="deal-card__shortcuts" onClick={stopCardAction}>
        <button
          type="button"
          className={`deal-card__btn-save${dealSaved ? (showSavedHighlightInFeed ? ' deal-card__btn-save--saved' : ' deal-card__btn-save--saved-muted') : ''}`}
          onClick={() => onToggleSave(deal)}
          disabled={savingDealId === deal.id}
          title={dealSaved ? `Click to remove from ${saveTargetLabel}` : `Save to ${saveTargetLabel}`}
          aria-label={dealSaved ? `Saved — click to remove from ${saveTargetLabel}` : `Save to ${saveTargetLabel}`}
        >
          {dealSaved ? 'Saved' : 'Save'}
        </button>
        <button
          type="button"
          onClick={() => onToggleHidden(deal)}
          title={isHidden ? 'Unhide' : 'Hide'}
          aria-label={isHidden ? 'Unhide' : 'Hide'}
        >
          {isHidden ? 'Unhide' : 'Hide'}
        </button>
        <button type="button" onClick={() => {
          console.log('[AggregatorDeedCard] open', { id: deal?.id, dbId: deal?.dbId });
          onOpen(deal);
        }}>
          Open
        </button>
      </div>
    </div>
  );
}


function guestBrokerCell(label, onRequireSignup) {
  return (
    <button type="button" className="gated-preview-text__hint" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => onRequireSignup?.('broker_click')}>
      {label}
    </button>
  );
}

export default function DealAggregator({
  settings,
  manualRefreshToken,
  matchCount = 0,
  onMatchCountUpdate,
  onDealsStatsUpdate,
  onSaveDeal,
  onOpenVettrCrm = null,
  onSettingsUpdate,
  onConfigureBuyBox,
  feedSource = 'airtable',
  savedDealIds = [],
  savedRowIdByMarketDealId = {},
  saveScopeSavedDealIds = null,
  saveScopeRowIdByMarketDealId = null,
  saveScopeCrmByMarketDealId = {},
  poolNewDealsFilter = null,
  onClearPoolNewDealsFilter,
  filterNewToday = false,
  filterMatchDealIds = [],
  onClearNewToday = null,
  isGuest = false,
  entitlements = null,
  persistSettings: persistSettingsProp = null,
  requireSignup = null,
  initialOpenDealDbId = null,
  tourPrepareStepId = null,
  isFeedVisible = true,
  onMobileDeckChange = null,
}) {
  const navigate = useNavigate();
  const { saveTeamId, activeTeam } = useTeam();
  const saveTargetLabel = saveTeamId && activeTeam?.name ? `${activeTeam.name} CRM` : 'Vettr CRM';
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const saveSettings = useCallback(
    (patch) => {
      if (typeof persistSettingsProp === 'function') {
        return persistSettingsProp(patch);
      }
      return userAPI.updateSettings(patch);
    },
    [persistSettingsProp]
  );
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [searchKeywords, setSearchKeywords] = useState([]);
  const [savedSearchLists, setSavedSearchLists] = useState(() =>
    settings ? getSearchListLibrary(settings) : {}
  );
  const [currentSelectedSearchList, setCurrentSelectedSearchList] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [searchListNameInput, setSearchListNameInput] = useState('');
  const [searchListSaving, setSearchListSaving] = useState(false);
  const [showSearchSection, setShowSearchSection] = useState(false);
  const [excludeKeywords, setExcludeKeywords] = useState(settings?.excludeKeywords || []);
  const [savedExcludeLists, setSavedExcludeLists] = useState(() =>
    settings ? getExcludeListLibrary(settings) : {}
  );
  const [currentSelectedList, setCurrentSelectedList] = useState(settings?.currentExcludeList || '');
  const [hiddenDealIds, setHiddenDealIds] = useState(settings?.hiddenDealIds || []);
  const hiddenDealIdsRef = useRef(hiddenDealIds);
  hiddenDealIdsRef.current = hiddenDealIds;
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [dealPanelPosition, setDealPanelPosition] = useState(settings?.preferences?.dealPanelPosition || 'center');
  const [showHiddenDeals, setShowHiddenDeals] = useState(false);
  const [viewMode, setViewMode] = useState('matches');
  const [excludeInput, setExcludeInput] = useState('');
  const [excludeListNameInput, setExcludeListNameInput] = useState('');
  const [excludeListSaving, setExcludeListSaving] = useState(false);
  const [sortConfig, setSortConfig] = useState(() => loadSavedSortConfig());
  const [visibleColumns, setVisibleColumns] = useState(() => loadVisibleColumns());
  const [columnOrder, setColumnOrder] = useState(() => loadColumnOrder());
  const [dropTargetCol, setDropTargetCol] = useState(null);
  const [showColumnsPanel, setShowColumnsPanel] = useState(false);
  const [showExcludeSection, setShowExcludeSection] = useState(false);
  const [dealViewStyle, setDealViewStyle] = useState(() => resolveDealViewStyle(settings?.dealViewStyle));
  const viewStyleHydratedRef = useRef(false);
  const hiddenHydratedRef = useRef(false);
  const [customFlexibilityInput, setCustomFlexibilityInput] = useState('');
  /** @type {[{ message: string, showCrmCta?: boolean } | null, Function]} */
  const [saveToast, setSaveToast] = useState(null);
  const hidingIdsRef = useRef(new Set());
  const [savingDealId, setSavingDealId] = useState(null);
  const [workspaceSaveOverride, setWorkspaceSaveOverride] = useState({});
  const [buyBoxSwitching, setBuyBoxSwitching] = useState(false);
  const [feedError, setFeedError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalFromAPI, setTotalFromAPI] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [cardColumnsPerRow, setCardColumnsPerRow] = useState(() => {
    const v = settings?.preferences?.cardColumnsPerRow;
    return CARD_COLUMNS_OPTIONS.includes(v) ? v : DEFAULT_CARD_COLUMNS;
  });
  const [showCardColsPopup, setShowCardColsPopup] = useState(false);
  const cardColsPopupRef = useRef(null);
  const fetchAbortRef = useRef(null);
  /** Same query + manual refresh → send If-None-Match for list 304. */
  const listEtagCacheRef = useRef({ key: '', etag: '' });
  /** Avoid resetting in-progress search/exclude when guest settings persist (async). */
  const syncedFeedSlotRef = useRef(null);
  const feedFieldsInitializedRef = useRef(false);

  useEffect(() => {
    if (tourPrepareStepId !== 'exclude-keywords') return;
    setShowMobileFeedFilters(true);
    setShowExcludeSection(true);
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('[data-tour="exclude-keywords"]');
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [tourPrepareStepId]);

  useEffect(() => {
    if (tourPrepareStepId !== 'search-bar') return;
    setShowMobileFeedFilters(true);
    setShowSearchSection(true);
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('[data-tour="search-bar"]');
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [tourPrepareStepId]);
  /** After account/local column prefs are applied, allow debounced API writes. */
  const columnsPrefsReadyRef = useRef(false);
  const columnOrderReadyRef = useRef(false);
  const columnLayoutDirtyRef = useRef(false);
  const dragColRef = useRef(null);
  const didColumnDragRef = useRef(false);
  const isMobileViewport = useIsMobile();
  const { isPortrait } = useOrientation();
  /** Mobile feed layout: swipe deck, card grid, or table. Focus is parked (SHOW_MOBILE_FOCUS). */
  const [mobileFeedMode, setMobileFeedMode] = useState(() =>
    mobileModeFromViewStyle(resolveDealViewStyle(settings?.dealViewStyle))
  );
  const [showMobileFeedFilters, setShowMobileFeedFilters] = useState(false);
  // Default to all buy-box matches so the feed is not empty on load when nothing
  // was updated today. Users can still switch to "Today's New" in the toolbar.
  const [deckScope, setDeckScope] = useState('all');
  const prefetchRequestedRef = useRef(false);
  const orientationKey = isPortrait ? 'portrait' : 'landscape';

  // List API returns truncated description; merge full row when a deal is opened (logged-in only).
  useEffect(() => {
    if (isGuest) return;
    const dbId = selectedDeal?.dbId;
    if (dbId == null) return;

    const ac = new AbortController();
    (async () => {
      try {
        const full = await fetchMarketDealByDbId(dbId, ac.signal);
        if (ac.signal.aborted) return;
        setSelectedDeal((prev) => {
          if (!prev || prev.dbId !== dbId) return prev;
          return { ...prev, ...full };
        });
      } catch (err) {
        if (err?.name === 'AbortError' || ac.signal.aborted) return;
        console.warn('[DealAggregator] Full deal fetch failed:', err?.message || err);
      }
    })();

    return () => ac.abort();
  }, [selectedDeal?.dbId, isGuest]);

  const excludeKeywordsFingerprint = useMemo(
    () => `${settings?.activeBuyBoxIndex ?? settings?.preferences?.activeBuyBoxIndex ?? 0}:${JSON.stringify(excludeKeywords)}`,
    [settings?.activeBuyBoxIndex, settings?.preferences?.activeBuyBoxIndex, excludeKeywords]
  );

  const poolNewFinger = useMemo(() => {
    if (!poolNewDealsFilter) return '';
    const ids = poolNewDealsFilter.dbIds || [];
    return `${ids.join(',')}|${poolNewDealsFilter.lastScrapeAt || ''}`;
  }, [poolNewDealsFilter]);

  const poolNewMode = Boolean(
    poolNewDealsFilter &&
      ((poolNewDealsFilter.dbIds && poolNewDealsFilter.dbIds.length > 0) ||
        poolNewDealsFilter.lastScrapeAt)
  );
  const matchFilterIds = useMemo(
    () => (Array.isArray(filterMatchDealIds) ? filterMatchDealIds.map(String).filter(Boolean) : []),
    [filterMatchDealIds]
  );
  const matchFilterMode = matchFilterIds.length > 0;
  const matchFilterFinger = matchFilterIds.join(',');

  const initialOpenAppliedRef = useRef(false);
  const lastOpenDealDbIdRef = useRef(initialOpenDealDbId);
  useEffect(() => {
    if (String(lastOpenDealDbIdRef.current ?? '') === String(initialOpenDealDbId ?? '')) return;
    initialOpenAppliedRef.current = false;
    lastOpenDealDbIdRef.current = initialOpenDealDbId;
  }, [initialOpenDealDbId]);
  useEffect(() => {
    if (!isFeedVisible) return;
    if (initialOpenAppliedRef.current || initialOpenDealDbId == null) return;
    const match = deals.find((d) => String(d.dbId) === String(initialOpenDealDbId));
    if (match) {
      initialOpenAppliedRef.current = true;
      setSelectedDeal(match);
      return;
    }
    if (loading) return;
    initialOpenAppliedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const full = await fetchMarketDealByDbId(initialOpenDealDbId);
        if (!cancelled && full) {
          console.log('[DealAggregator] opened deal from return id', initialOpenDealDbId);
          setSelectedDeal(full);
        }
      } catch (err) {
        console.warn('[DealAggregator] initial open fetch failed', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, [initialOpenDealDbId, deals, loading, isFeedVisible]);

  const savedDealIdSet = useMemo(
    () => new Set((savedDealIds || []).filter(Boolean).map((id) => String(id))),
    [savedDealIds]
  );

  const saveScopeDealIdSet = useMemo(
    () => new Set((saveScopeSavedDealIds ?? savedDealIds ?? []).filter(Boolean).map((id) => String(id))),
    [saveScopeSavedDealIds, savedDealIds]
  );

  const isDealSavedInWorkspace = useCallback((deal) => {
    if (!deal) return false;
    const keys = marketDealMatchKeys(deal);
    for (const k of keys) {
      if (Object.prototype.hasOwnProperty.call(workspaceSaveOverride, k)) {
        return Boolean(workspaceSaveOverride[k]);
      }
    }
    return isDealInSavedList(deal, saveScopeDealIdSet);
  }, [saveScopeDealIdSet, workspaceSaveOverride]);

  const setWorkspaceSaved = useCallback((deal, saved) => {
    setWorkspaceSaveOverride((prev) => {
      const next = { ...prev };
      for (const k of marketDealMatchKeys(deal)) next[k] = saved;
      return next;
    });
  }, []);

  useEffect(() => {
    setWorkspaceSaveOverride((prev) => {
      const keys = Object.keys(prev);
      if (!keys.length) return prev;
      let changed = false;
      const next = { ...prev };
      for (const k of keys) {
        if (Boolean(prev[k]) === saveScopeDealIdSet.has(k)) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [saveScopeDealIdSet]);

  const saveScopeRowIdMap = saveScopeRowIdByMarketDealId ?? savedRowIdByMarketDealId;

  const hideSavedDealsInFeed = Boolean(settings?.preferences?.hideSavedDealsInFeed);
  const showSavedHighlightInFeed = settings?.preferences?.showSavedHighlightInFeed !== false;

  const showMobileDeck = SHOW_MOBILE_FOCUS
    && isMobileViewport
    && !showHiddenDeals
    && viewMode === 'matches'
    && mobileFeedMode === 'deck'
    && !poolNewMode;

  const showMobileToolbar = isMobileViewport
    && !showHiddenDeals
    && viewMode === 'matches'
    && !poolNewMode;

  const hideMobileCardFilters = showMobileToolbar && mobileFeedMode === 'card' && !showMobileFeedFilters;
  const mobileFilterCount = searchKeywords.length + excludeKeywords.length;

  const mobileDailyFilter = showMobileToolbar && deckScope === 'daily';

  useEffect(() => {
    if (typeof onMobileDeckChange !== 'function') return;
    onMobileDeckChange(Boolean(isFeedVisible && showMobileDeck));
  }, [showMobileDeck, onMobileDeckChange, isFeedVisible]);

  // Do not reset mobileFeedMode when width crosses 767px — landscape phones
  // look like "desktop" and that was sending Cards back to Focus on rotate.
  useEffect(() => {
    console.log('[DealAggregator] viewport', { isMobileViewport, isPortrait, mobileFeedMode });
  }, [isMobileViewport, isPortrait, mobileFeedMode]);

  useEffect(() => {
    if (SHOW_MOBILE_FOCUS || mobileFeedMode !== 'deck') return;
    console.log('[DealAggregator] mobile Focus parked — switching to table');
    setMobileFeedMode('table');
    setDealViewStyle('table');
  }, [mobileFeedMode]);

  const handleMobileFeedModeChange = useCallback((mode) => {
    if (mode === 'deck' && !SHOW_MOBILE_FOCUS) {
      console.log('[DealAggregator] ignoring Focus — parked on mobile');
      return;
    }
    setMobileFeedMode(mode);
    const nextView = mode === 'inbox' ? 'inbox' : mode === 'card' ? 'card' : 'table';
    if (mode === 'card') {
      setDealViewStyle('card');
      setCardColumnsPerRow(1);
    } else if (mode === 'table') {
      setDealViewStyle('table');
    } else if (mode === 'inbox') {
      setDealViewStyle('inbox');
    }
    persistStoredDealViewStyle(nextView);
    saveSettings({ dealViewStyle: nextView }).then(() => {
      console.log('[DealAggregator] mobile dealViewStyle →', nextView);
      if (typeof onSettingsUpdate === 'function') return onSettingsUpdate();
      return undefined;
    }).catch((err) => {
      console.warn('[DealAggregator] mobile view persist failed', err?.message || err);
    });
    setCurrentPage(1);
  }, [saveSettings, onSettingsUpdate]);

  const handleDeckScopeChange = useCallback((scope) => {
    setDeckScope(scope);
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    if (!settings) return;
    setSavedExcludeLists(getExcludeListLibrary(settings));
    setSavedSearchLists(getSearchListLibrary(settings));
    const { buyBoxes, activeBuyBoxIndex } = normalizeBuyBoxesState(settings);
    const slot = buyBoxes[activeBuyBoxIndex] || {};
    const slotKey = `${activeBuyBoxIndex}`;
    const slotChanged = syncedFeedSlotRef.current !== slotKey;
    const shouldSyncFeedFields = !feedFieldsInitializedRef.current || slotChanged;
    if (shouldSyncFeedFields) {
      feedFieldsInitializedRef.current = true;
      syncedFeedSlotRef.current = slotKey;
      setExcludeKeywords(Array.isArray(slot.excludeKeywords) ? slot.excludeKeywords : []);
      const activeListName = slot.currentExcludeList != null ? String(slot.currentExcludeList) : '';
      setCurrentSelectedList(activeListName);
      setExcludeListNameInput(activeListName);
      const nextSearch = parseSearchKeywords(slot.feedSearch);
      setSearchKeywords(nextSearch);
      const activeSearchList = slot.currentSearchList != null ? String(slot.currentSearchList) : '';
      setCurrentSelectedSearchList(activeSearchList);
      setSearchListNameInput(activeSearchList);
    }
    setHiddenDealIds((prev) => {
      if (hidingIdsRef.current.size > 0) return prev;
      const incoming = Array.isArray(settings?.hiddenDealIds) ? settings.hiddenDealIds : [];
      if (!hiddenHydratedRef.current) {
        hiddenHydratedRef.current = true;
        console.log('[DealAggregator] hydrate hiddenDealIds', incoming.length);
        return incoming;
      }
      return prev;
    });
    setDealPanelPosition(settings?.preferences?.dealPanelPosition || 'center');
    if (!viewStyleHydratedRef.current) {
      viewStyleHydratedRef.current = true;
      const nextView = resolveDealViewStyle(settings?.dealViewStyle);
      setDealViewStyle(nextView);
      setMobileFeedMode(mobileModeFromViewStyle(nextView));
      persistStoredDealViewStyle(nextView);
      console.log('[DealAggregator] hydrate dealViewStyle', nextView, {
        account: settings?.dealViewStyle || null,
        stored: loadStoredDealViewStyle()
      });
    }
    const cols = settings?.preferences?.cardColumnsPerRow;
    setCardColumnsPerRow(CARD_COLUMNS_OPTIONS.includes(cols) ? cols : DEFAULT_CARD_COLUMNS);

    const accountCols = parseVisibleColumnsFromAccount(settings.visibleColumns);
    if (!columnLayoutDirtyRef.current) {
      if (accountCols) {
        setVisibleColumns((prev) => (visibleColumnsEqual(prev, accountCols) ? prev : accountCols));
        columnsPrefsReadyRef.current = true;
      } else if (isEmptyVisibleColumnsOnAccount(settings.visibleColumns)) {
        const localCols = loadVisibleColumns();
        setVisibleColumns((prev) => (visibleColumnsEqual(prev, localCols) ? prev : localCols));
        columnsPrefsReadyRef.current = true;
        if (!visibleColumnsEqual(localCols, DEFAULT_VISIBLE_COLUMNS)) {
          columnLayoutDirtyRef.current = true;
        }
      } else {
        columnsPrefsReadyRef.current = true;
      }

      const rawOrder = settings?.preferences?.columnOrder;
      if (Array.isArray(rawOrder) && rawOrder.length > 0) {
        const nextOrder = normalizeColumnOrder(rawOrder);
        setColumnOrder((prev) => (columnOrderEqual(prev, nextOrder) ? prev : nextOrder));
        columnOrderReadyRef.current = true;
      } else if (!columnOrderReadyRef.current) {
        columnOrderReadyRef.current = true;
        const localOrder = loadColumnOrder();
        if (!columnOrderEqual(localOrder, DEFAULT_COLUMN_ORDER)) {
          columnLayoutDirtyRef.current = true;
        }
      }
    } else {
      columnsPrefsReadyRef.current = true;
      columnOrderReadyRef.current = true;
    }
  }, [settings, saveSettings]);

  const feedSearchString = useMemo(() => joinSearchKeywords(searchKeywords), [searchKeywords]);
  const searchKeywordsFingerprint = useMemo(
    () => `${settings?.activeBuyBoxIndex ?? settings?.preferences?.activeBuyBoxIndex ?? 0}:${feedSearchString}`,
    [settings?.activeBuyBoxIndex, settings?.preferences?.activeBuyBoxIndex, feedSearchString]
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchKeywordsFingerprint, sortConfig, showHiddenDeals, viewMode, excludeKeywordsFingerprint, hideSavedDealsInFeed, poolNewFinger, deckScope, mobileDailyFilter, filterNewToday, matchFilterFinger]);

  // Reset prefetch flag when filters change
  useEffect(() => {
    prefetchRequestedRef.current = false;
  }, [searchKeywordsFingerprint, sortConfig, showHiddenDeals, viewMode, excludeKeywordsFingerprint, hideSavedDealsInFeed, poolNewFinger, deckScope, currentPage]);

  // New search/exclude params must not reuse a prior list ETag
  useEffect(() => {
    listEtagCacheRef.current = { key: '', etag: '' };
  }, [searchKeywordsFingerprint, excludeKeywordsFingerprint]);

  // Persist column visibility + order locally and to the user account (one write)
  useEffect(() => {
    try {
      localStorage.setItem('vettr_visible_columns', JSON.stringify(visibleColumns));
      localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
    } catch (err) {
      console.warn('[DealAggregator] local column layout save failed', err);
    }
  }, [visibleColumns, columnOrder]);
  useEffect(() => {
    if (!settings || !columnsPrefsReadyRef.current || !columnOrderReadyRef.current) return;
    const accountCols = parseVisibleColumnsFromAccount(settings.visibleColumns);
    const savedOrder = settings?.preferences?.columnOrder;
    const normalizedSaved = Array.isArray(savedOrder) && savedOrder.length > 0
      ? normalizeColumnOrder(savedOrder)
      : null;
    const visMatches = accountCols && visibleColumnsEqual(visibleColumns, accountCols);
    const orderMatches = normalizedSaved && columnOrderEqual(columnOrder, normalizedSaved);
    if (!columnLayoutDirtyRef.current && visMatches && orderMatches) return;

    const t = setTimeout(() => {
      const visibleOn = Object.keys(COLUMN_CONFIG).filter((id) => visibleColumns[id] !== false);
      console.log('[DealAggregator] persist column layout to account', {
        visible: visibleOn.join(','),
        order: columnOrder.join(','),
      });
      saveSettings({
        visibleColumns,
        preferences: { columnOrder },
      })
        .then(() => {
          columnLayoutDirtyRef.current = false;
          if (typeof onSettingsUpdate === 'function') {
            return onSettingsUpdate();
          }
          return undefined;
        })
        .catch((err) => {
          console.error('[DealAggregator] persist column layout failed:', err);
        });
    }, 400);
    return () => clearTimeout(t);
  }, [visibleColumns, columnOrder, settings, onSettingsUpdate, saveSettings]);
  useEffect(() => {
    localStorage.setItem('vettr_aggregator_sort', JSON.stringify(sortConfig));
  }, [sortConfig]);

  const buyBoxFeedKey = JSON.stringify(settings?.buyBox || {});

  // ---------------------------------------------------------------------------
  // Server-side fetch: single API call per page/filter change
  // ---------------------------------------------------------------------------
  const fetchServerDeals = useCallback(async (pageOverride) => {
    if (fetchAbortRef.current) fetchAbortRef.current.abort();
    fetchAbortRef.current = new AbortController();
    const signal = fetchAbortRef.current.signal;

    setIsFetching(true);
    setFeedError(null);

    const buyBox = settings?.buyBox || {};
    const flexPct = Math.min(100, Math.max(0, Number(buyBox.includeNearMatchesPercent) || 0));
    const effectiveSort = sortConfig.length > 0 ? sortConfig : [{ field: 'date', direction: 'desc' }];
    const primary = effectiveSort[0];
    const primarySortCol = mapSortField(primary.field);
    const sortSpec = encodeMarketDealsSortSpec(effectiveSort);

    const hiddenDbIds = [...new Set(hiddenDealIds.map(hiddenDealIdToDbId).filter(Boolean))];

    const excludeKw = excludeKeywords;

    const sourceFilter =
      feedSource === 'airtable' ? ['airtable_bizbuysell'] : null;

    let restrictToDbIds = null;
    let firstSeenAfter = null;
    let firstSeenBefore = null;
    if (matchFilterMode) {
      restrictToDbIds = matchFilterIds;
    } else if (poolNewMode && poolNewDealsFilter) {
      if (poolNewDealsFilter.dbIds?.length > 0) {
        restrictToDbIds = poolNewDealsFilter.dbIds;
      } else if (poolNewDealsFilter.lastScrapeAt) {
        const end = new Date(poolNewDealsFilter.lastScrapeAt);
        if (!Number.isNaN(end.getTime())) {
          firstSeenBefore = end.toISOString();
          firstSeenAfter = new Date(end.getTime() - 12 * 60 * 60 * 1000).toISOString();
        }
      }
    } else if (filterNewToday) {
      firstSeenAfter = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }

    const params = buildMarketDealsParams({
      page: pageOverride ?? ((matchFilterMode || filterNewToday) ? 1 : currentPage),
      perPage: PER_PAGE,
      search: matchFilterMode ? '' : feedSearchString,
      buyBox: (poolNewMode || matchFilterMode) ? null : (showHiddenDeals ? null : buyBox),
      flexibilityPct: flexPct,
      sortSpec,
      sort: primarySortCol,
      order: primary.direction,
      hiddenDealDbIds: showHiddenDeals ? [] : hiddenDbIds,
      showHidden: showHiddenDeals,
      excludeKeywords: matchFilterMode ? [] : excludeKw,
      sources: matchFilterMode ? null : sourceFilter,
      restrictToDbIds,
      firstSeenAfter,
      firstSeenBefore,
      updatedAfter: matchFilterMode ? null : (mobileDailyFilter && !filterNewToday ? startOfLocalDayISO() : null),
    });

    if (matchFilterMode) {
      console.log('[DealAggregator] match alert filter', { count: matchFilterIds.length, keepView: true });
    } else if (filterNewToday) {
      console.log('[DealAggregator] newToday filter', { firstSeenAfter, windowHours: 24 });
    }

    if (
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
      effectiveSort.length > 1 &&
      sortSpec
    ) {
      console.debug('[DealAggregator] market-deals sort_spec:', sortSpec);
    }

    const paramsKey = `${params.toString()}|${String(manualRefreshToken ?? 0)}`;
    const ifNoneMatch =
      listEtagCacheRef.current.key === paramsKey ? listEtagCacheRef.current.etag : undefined;

    try {
      const result = await fetchMarketDeals(params, signal, { ifNoneMatch });
      if (signal.aborted) return;

      if (result.notModified) {
        return;
      }

      listEtagCacheRef.current = {
        key: paramsKey,
        etag: result.etag || '',
      };

      setDeals(result.deals);
      setTotalFromAPI(result.pagination.total);
      setTotalPages(result.pagination.total_pages);

      onMatchCountUpdate(result.pagination.total);

      if (typeof onDealsStatsUpdate === 'function') {
        fetchMarketDealsStats(signal).then((stats) => {
          if (stats && !signal.aborted) {
            onDealsStatsUpdate({
              total: stats.total_deals,
              newToday: stats.new_today,
              showing: result.pagination.total,
              sources: (stats.by_source || []).length || 1,
            });
          }
        }).catch(() => {});
      }
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) return;
      console.error('Failed to fetch deals:', error);
      setDeals([]);
      const msg = error?.message || 'Failed to load deals';
      setFeedError(
        msg === 'Failed to fetch'
          ? 'Failed to reach the API. Check that the backend is running.'
          : msg
      );
    } finally {
      if (!signal.aborted) {
        setLoading(false);
        setIsFetching(false);
      }
    }
  }, [settings, feedSearchString, sortConfig, hiddenDealIds, showHiddenDeals, currentPage, manualRefreshToken, onMatchCountUpdate, onDealsStatsUpdate, feedSource, poolNewFinger, poolNewMode, poolNewDealsFilter, excludeKeywords, mobileDailyFilter, deckScope, filterNewToday, matchFilterMode, matchFilterIds, matchFilterFinger]);

  // Fetch on mount, filter/sort/page/search change, and manual refresh.
  // Do not refetch on each Hide — client-side filter advances the list without a jump.
  useEffect(() => {
    if (settings) fetchServerDeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run when inputs to fetchServerDeals change; avoid tying to unstable parent callbacks
  }, [feedSearchString, sortConfig, currentPage, showHiddenDeals, buyBoxFeedKey, manualRefreshToken, poolNewFinger, excludeKeywordsFingerprint, deckScope, mobileDailyFilter, filterNewToday, matchFilterFinger]);

  // Manual refresh for the installed PWA (no browser reload / pull-to-refresh in
  // standalone mode). Clear the ETag cache so we always request a fresh 200.
  const handleManualRefresh = useCallback(() => {
    listEtagCacheRef.current = { key: '', etag: '' };
    fetchServerDeals();
  }, [fetchServerDeals]);

  const updateUserFilterSettings = async (nextValues) => {
    try {
      await saveSettings(nextValues);
      if (typeof onSettingsUpdate === 'function') {
        await onSettingsUpdate();
      }
    } catch (error) {
      alert(`Failed to save filter settings: ${error.message}`);
    }
  };

  const persistActiveSlotFeed = async (patch) => {
    const currentSettings = settingsRef.current;
    if (!currentSettings) {
      console.error('[DealAggregator] persistActiveSlotFeed: settings not loaded');
      alert('Settings are still loading. Please try again in a moment.');
      return false;
    }
    try {
      const payload = mergeActiveSlotFeedPatch(currentSettings, patch);
      await saveSettings(payload);
      if (typeof onSettingsUpdate === 'function') {
        await onSettingsUpdate();
      }
      return true;
    } catch (error) {
      console.error('[DealAggregator] persistActiveSlotFeed failed:', error);
      alert(`Failed to save filter settings: ${error.message}`);
      return false;
    }
  };

  const resolveExcludeKeywordsForSave = useCallback(() => {
    const pending = excludeInput
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return Array.from(new Set([...excludeKeywords, ...pending]));
  }, [excludeInput, excludeKeywords]);

  const getSavedRowIdForMarketDeal = useCallback(
    (deal) => {
      if (!deal) return null;
      for (const key of marketDealMatchKeys(deal)) {
        const rowId = saveScopeRowIdMap[key];
        if (rowId != null) return rowId;
      }
      return null;
    },
    [saveScopeRowIdMap]
  );

  const handleUnsaveDeal = async (deal) => {
    const rowId = getSavedRowIdForMarketDeal(deal);
    if (rowId == null) {
      console.warn('[DealAggregator] No saved row id for market deal', deal?.id, deal?.dbId);
      alert('Could not remove this listing from Vettr CRM. Try refreshing the page.');
      return;
    }
    setSavingDealId(deal.id);
    setWorkspaceSaved(deal, false);
    try {
      await dealsAPI.deleteDeal(rowId);
      console.log('[DealAggregator] unsaved', { dealId: deal?.id, dbId: deal?.dbId, rowId, saveTargetLabel });
      setSaveToast({
        message: saveTeamId ? `Removed from ${saveTargetLabel}` : 'Removed from Vettr CRM'
      });
      if (typeof onSaveDeal === 'function') {
        await onSaveDeal();
      }
    } catch (error) {
      setWorkspaceSaved(deal, true);
      alert('Failed to remove deal: ' + error.message);
    } finally {
      setSavingDealId(null);
    }
  };

  const handleToggleSaveDeal = async (deal) => {
    if (isDealSavedInWorkspace(deal)) {
      await handleUnsaveDeal(deal);
    } else {
      await handleSaveDeal(deal);
    }
  };

  const persistNewSavedDeal = useCallback(async (deal) => {
    const teamIdForSave = saveTeamId != null ? Number(saveTeamId) : null;
    const payloadTeamId = Number.isFinite(teamIdForSave) && teamIdForSave > 0 ? teamIdForSave : null;
    console.log('[DealAggregator] saving deal', {
      dealId: deal?.id,
      dbId: deal?.dbId,
      teamId: payloadTeamId,
      saveTargetLabel
    });
    const calculatorState = loadCalculatorState(deal.id);
    const data = await dealsAPI.saveDeal({
      dealId: deal.id,
      name: deal.name,
      url: deal.url,
      description: deal.description,
      askingPrice: deal.askingPrice,
      ebitda: deal.ebitda,
      revenue: deal.revenue,
      location: deal.location,
      city: deal.city,
      state: deal.state,
      county: deal.county,
      country: deal.country,
      industry: deal.industry,
      yearsEstablished: deal.yearsEstablished,
      franchise: deal.franchise,
      remote: deal.remote,
      listingId: deal.listingId,
      source: deal.source,
      sourceType: deal.sourceType,
      discoveredAt: deal.discoveredAt,
      broker: deal.broker,
      brokerName: deal.brokerName,
      brokerCompany: deal.brokerCompany,
      brokerEmail: deal.brokerEmail,
      brokerPhone: deal.brokerPhone,
      marketDealId: deal.dbId,
      ...(calculatorState ? { calculatorState } : {}),
      ...(payloadTeamId ? { teamId: payloadTeamId } : {})
    });
    if (calculatorState && data?.dealId != null) {
      saveCalculatorState(data.dealId, calculatorState);
    }
    if (typeof onSaveDeal === 'function') {
      await onSaveDeal();
    }
    return data?.dealId ?? data?.vettrId ?? null;
  }, [onSaveDeal, saveTargetLabel, saveTeamId]);

  const handleSaveDeal = async (deal) => {
    if (isGuest) {
      if (typeof requireSignup === 'function') {
        requireSignup('save', { dealDbId: deal?.dbId });
      }
      return null;
    }
    if (isDealSavedInWorkspace(deal)) {
      const alreadyMsg = saveTeamId
        ? `Already saved to ${saveTargetLabel}`
        : 'Already saved to Vettr CRM';
      console.log('[DealAggregator] save skipped — already in workspace', {
        dealId: deal?.id,
        dbId: deal?.dbId,
        saveTeamId,
        toast: alreadyMsg
      });
      const existingId = getSavedRowIdForMarketDeal(deal);
      setSaveToast({ message: alreadyMsg, showCrmCta: true, dealId: existingId });
      return existingId;
    }
    const teamIdForSave = saveTeamId != null ? Number(saveTeamId) : null;
    const payloadTeamId = Number.isFinite(teamIdForSave) && teamIdForSave > 0 ? teamIdForSave : null;
    setSavingDealId(deal.id);
    try {
      const savedId = await persistNewSavedDeal(deal);
      setWorkspaceSaved(deal, true);
      const toastMsg = payloadTeamId
        ? `Saved to ${saveTargetLabel}`
        : 'Saved to Vettr CRM';
      console.log('[DealAggregator] save succeeded — setting toast', {
        toast: toastMsg,
        vettrId: savedId,
        responseTeamId: payloadTeamId
      });
      setSaveToast({ message: toastMsg, showCrmCta: true, dealId: savedId });
      return savedId;
    } catch (error) {
      console.error('[DealAggregator] save failed', {
        dealId: deal?.id,
        teamId: payloadTeamId,
        error: error?.message
      });
      alert('Failed to save deal: ' + error.message);
      return null;
    } finally {
      setSavingDealId(null);
    }
  };

  useEffect(() => {
    if (isGuest) return;
    const pendingId = claimPendingSaveDealDbId();
    if (!pendingId) return;
    (async () => {
      try {
        const deal = await fetchMarketDealByDbId(pendingId);
        if (!deal) return;
        console.log('[DealAggregator] pending save after signup', pendingId);
        setSelectedDeal(deal);
        await handleSaveDeal(deal);
      } catch (err) {
        console.warn('[DealAggregator] pending save failed', err?.message || err);
      }
    })();
    // handleSaveDeal is recreated each render; claimPendingSaveDealDbId runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest]);

  const ensureDealSavedForCrm = useCallback(async (deal) => {
    if (!deal) return null;
    const existing = getSavedRowIdForMarketDeal(deal);
    if (existing != null) return existing;
    setSavingDealId(deal.id);
    try {
      const savedId = await persistNewSavedDeal(deal);
      setWorkspaceSaved(deal, true);
      console.log('[DealAggregator] auto-saved for status', { dealId: deal.id, savedDealId: savedId });
      return savedId;
    } catch (error) {
      console.error('[DealAggregator] auto-save for status failed', error?.message);
      throw error;
    } finally {
      setSavingDealId(null);
    }
  }, [getSavedRowIdForMarketDeal, persistNewSavedDeal]);

  const selectedCrmMeta = useMemo(
    () => crmMetaForDeal(selectedDeal, saveScopeCrmByMarketDealId),
    [selectedDeal, saveScopeCrmByMarketDealId]
  );
  const lookupCrmMeta = useCallback(
    (deal) => crmMetaForDeal(deal, saveScopeCrmByMarketDealId),
    [saveScopeCrmByMarketDealId]
  );
  const handleCrmStageSynced = useCallback(async () => {
    if (typeof onSaveDeal === 'function') await onSaveDeal();
  }, [onSaveDeal]);
  const headerProgressControl = useCrmStageControl({
    deal: selectedDeal,
    crmMeta: selectedCrmMeta,
    ensureSaved: ensureDealSavedForCrm,
    isGuest,
    requireSignup,
    onSynced: handleCrmStageSynced
  });

  useEffect(() => {
    if (!saveToast) return;
    const ms = saveToast.showCrmCta ? 6000 : 3000;
    const t = setTimeout(() => setSaveToast(null), ms);
    return () => clearTimeout(t);
  }, [saveToast]);

  useEffect(() => {
    if (!showCardColsPopup) return;
    const handleClickOutside = (e) => {
      if (cardColsPopupRef.current && !cardColsPopupRef.current.contains(e.target)) {
        setShowCardColsPopup(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setShowCardColsPopup(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showCardColsPopup]);

  const dealsToShow = useMemo(() => {
    let list;
    if (showHiddenDeals) {
      list = deals.filter((d) => isDealHidden(d, hiddenDealIds));
    } else {
      list = deals.filter((d) => !isDealHidden(d, hiddenDealIds));
      const leaked = deals.filter((d) => isDealHidden(d, hiddenDealIds));
      if (leaked.length > 0) {
        console.warn('[DealAggregator] dropped hidden deals from feed', leaked.length, {
          matchFilterMode
        });
      }
    }
    if (!matchFilterMode && hideSavedDealsInFeed && !showHiddenDeals) {
      list = list.filter((d) => !isDealInSavedList(d, savedDealIdSet));
    }
    return list;
  }, [deals, hiddenDealIds, showHiddenDeals, hideSavedDealsInFeed, savedDealIdSet, matchFilterMode]);

  /** Inbox triage: if this Matches page is empty after dismisses, advance. */
  useEffect(() => {
    if (dealViewStyle !== 'inbox' || showHiddenDeals) return;
    if (dealsToShow.length > 0 || isFetching) return;
    if (currentPage < totalPages) {
      console.log('[DealAggregator] Inbox page empty — advancing to', currentPage + 1);
      setCurrentPage((p) => p + 1);
    }
  }, [dealViewStyle, showHiddenDeals, dealsToShow.length, isFetching, currentPage, totalPages]);

  const emptyFeedMessage = useMemo(() => {
    if (showHiddenDeals) {
      return 'No hidden listings on this page. Try another page or clear search.';
    }
    const visibleNotHidden = deals.filter((d) => !isDealHidden(d, hiddenDealIds));
    if (visibleNotHidden.length === 0) {
      return 'All listings on this page are hidden. Open Hidden or use Show hidden to review them.';
    }
    if (
      hideSavedDealsInFeed &&
      visibleNotHidden.length > 0 &&
      visibleNotHidden.every((d) => isDealInSavedList(d, savedDealIdSet))
    ) {
      return 'Every listing on this page is saved and hidden from the feed. Open Vettr CRM, or turn off “Hide saved deals” in Settings.';
    }
    return 'All listings on this page are hidden. Open Hidden or use Show hidden to review them.';
  }, [deals, hiddenDealIds, showHiddenDeals, hideSavedDealsInFeed, savedDealIdSet]);

  const buyBoxesUiState = useMemo(() => normalizeBuyBoxesState(settings), [settings]);
  const visibleOrderedColumns = useMemo(
    () => columnOrder.filter((id) => visibleColumns[id] !== false && COLUMN_CONFIG[id]),
    [columnOrder, visibleColumns]
  );

  const handleDeckNeedMore = useCallback(() => {
    if (prefetchRequestedRef.current || currentPage >= totalPages || isFetching) return;
    prefetchRequestedRef.current = true;
    setCurrentPage((p) => p + 1);
  }, [currentPage, totalPages, isFetching]);

  useEffect(() => {
    if (!isFetching) prefetchRequestedRef.current = false;
  }, [isFetching]);

  if (loading) {
    return <div className="loading">Loading deals...</div>;
  }

  const handleAddExcludeKeyword = async () => {
    const nextKeywords = Array.from(new Set(
      excludeInput
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .concat(excludeKeywords)
    ));

    if (nextKeywords.length === excludeKeywords.length) return;
    setExcludeKeywords(nextKeywords);
    setExcludeInput('');
    await persistActiveSlotFeed({ excludeKeywords: nextKeywords });
  };

  const persistSearchKeywords = async (nextKeywords, extra = {}) => {
    const sliced = nextKeywords.slice(0, MAX_SEARCH_KEYWORDS);
    setSearchKeywords(sliced);
    console.log('[DealAggregator] persist search keywords', { count: sliced.length, extra });
    await persistActiveSlotFeed({
      feedSearch: joinSearchKeywords(sliced),
      ...extra
    });
  };

  const handleAddSearchKeyword = async () => {
    const pending = searchInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    if (pending.length === 0) return;
    const nextKeywords = Array.from(new Set([...searchKeywords, ...pending]));
    if (nextKeywords.length === searchKeywords.length) {
      setSearchInput('');
      return;
    }
    if (nextKeywords.length > MAX_SEARCH_KEYWORDS) {
      alert(`Search allows up to ${MAX_SEARCH_KEYWORDS} keywords (AND). Remove one to add another.`);
      return;
    }
    setSearchInput('');
    await persistSearchKeywords(nextKeywords);
  };

  const handleRemoveSearchKeyword = async (keyword) => {
    const nextKeywords = searchKeywords.filter((item) => item !== keyword);
    await persistSearchKeywords(nextKeywords);
  };

  const handleClearSearchKeywords = async () => {
    setCurrentSelectedSearchList('');
    setSearchListNameInput('');
    await persistSearchKeywords([], { currentSearchList: '' });
  };

  const resolveSearchKeywordsForSave = () => {
    const pending = searchInput
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return Array.from(new Set([...searchKeywords, ...pending])).slice(0, MAX_SEARCH_KEYWORDS);
  };

  const handleSaveSearchList = async () => {
    if (searchListSaving) return;
    const keywords = resolveSearchKeywordsForSave();
    if (keywords.length === 0) {
      alert('Add at least one keyword before saving (type below and click Add, or press Enter).');
      return;
    }
    const trimmed = searchListNameInput.trim();
    if (!trimmed) {
      alert('Enter a list name in the field next to the dropdown.');
      return;
    }
    setSearchListSaving(true);
    try {
      const nextLists = { ...savedSearchLists, [trimmed]: keywords };
      setSearchKeywords(keywords);
      setSearchInput('');
      setSavedSearchLists(nextLists);
      setCurrentSelectedSearchList(trimmed);
      setSearchListNameInput(trimmed);
      const ok = await persistActiveSlotFeed({
        feedSearch: joinSearchKeywords(keywords),
        searchLists: nextLists,
        currentSearchList: trimmed
      });
      if (ok) {
        console.log('[DealAggregator] Saved search list', { name: trimmed, count: keywords.length });
      }
    } finally {
      setSearchListSaving(false);
    }
  };

  const handleDeleteSearchList = async () => {
    if (!currentSelectedSearchList) {
      alert('Select a list to delete');
      return;
    }
    if (!window.confirm(`Delete search list "${currentSelectedSearchList}"?`)) return;
    const nextLists = { ...savedSearchLists };
    delete nextLists[currentSelectedSearchList];
    setSavedSearchLists(nextLists);
    setCurrentSelectedSearchList('');
    setSearchListNameInput('');
    await persistActiveSlotFeed({ searchLists: nextLists, currentSearchList: '' });
  };

  const handleUpdateSearchList = async () => {
    if (!currentSelectedSearchList) {
      alert('Select a list to update first');
      return;
    }
    const nextLists = { ...savedSearchLists, [currentSelectedSearchList]: [...searchKeywords] };
    setSavedSearchLists(nextLists);
    await persistActiveSlotFeed({
      feedSearch: joinSearchKeywords(searchKeywords),
      searchLists: nextLists,
      currentSearchList: currentSelectedSearchList
    });
  };

  const handleRenameSearchList = async () => {
    if (searchListSaving) return;
    if (!currentSelectedSearchList) {
      alert('Select a list to rename');
      return;
    }
    const trimmed = searchListNameInput.trim();
    if (!trimmed) {
      alert('Enter a new name in the List name field.');
      return;
    }
    if (trimmed === currentSelectedSearchList) {
      alert('Change the list name before renaming.');
      return;
    }
    if (savedSearchLists[trimmed]) {
      alert(`A list named "${trimmed}" already exists. Choose a different name.`);
      return;
    }
    setSearchListSaving(true);
    try {
      const nextLists = { ...savedSearchLists };
      nextLists[trimmed] = nextLists[currentSelectedSearchList];
      delete nextLists[currentSelectedSearchList];
      setSavedSearchLists(nextLists);
      setCurrentSelectedSearchList(trimmed);
      const ok = await persistActiveSlotFeed({ searchLists: nextLists, currentSearchList: trimmed });
      if (ok) {
        console.log('[DealAggregator] Renamed search list', { from: currentSelectedSearchList, to: trimmed });
      }
    } finally {
      setSearchListSaving(false);
    }
  };

  const handleLoadSearchList = async (listName) => {
    const nextKeywords = (savedSearchLists[listName] || []).slice(0, MAX_SEARCH_KEYWORDS);
    setCurrentSelectedSearchList(listName);
    setSearchListNameInput(listName);
    setSearchKeywords(nextKeywords);
    await persistActiveSlotFeed({
      feedSearch: joinSearchKeywords(nextKeywords),
      currentSearchList: listName
    });
  };

  const flexibilityPercent = Math.min(100, Math.max(0, Number(settings?.buyBox?.includeNearMatchesPercent) || 0));
  const flexibilityIsPreset = FLEXIBILITY_PRESETS.includes(flexibilityPercent);
  const flexibilitySelectValue = flexibilityIsPreset ? flexibilityPercent : 'custom';

  const handleBuyBoxSlotClick = async (index) => {
    const activeIdx = buyBoxesUiState.activeBuyBoxIndex;
    if (index === activeIdx || buyBoxSwitching) return;
    setBuyBoxSwitching(true);
    try {
      const { buyBoxes, activeBuyBoxIndex } = normalizeBuyBoxesState(settings);
      const next = buyBoxes.map((b, i) => {
        if (i !== activeBuyBoxIndex) return b;
        return {
          ...b,
          feedSearch: joinSearchKeywords(searchKeywords),
          excludeKeywords: [...excludeKeywords],
          currentExcludeList: currentSelectedList || '',
          currentSearchList: currentSelectedSearchList || ''
        };
      });
      const newIdx = index;
      const activeSlot = next[newIdx];
      const crit = criteriaFromSlot(activeSlot);
      const library = getExcludeListLibrary(settings);
      console.log('[DealAggregator] switch buy box', {
        from: activeBuyBoxIndex,
        to: newIdx,
        savedFeedSearch: joinSearchKeywords(searchKeywords),
        savedExcludeCount: excludeKeywords.length,
        sharedExcludeLists: Object.keys(library).length
      });
      await saveSettings({
        preferences: { buyBoxes: next, activeBuyBoxIndex: newIdx },
        buyBox: crit,
        activeBuyBoxIndex: newIdx,
        excludeKeywords: Array.isArray(activeSlot.excludeKeywords) ? activeSlot.excludeKeywords : [],
        excludeLists: library,
        currentExcludeList: activeSlot.currentExcludeList || null
      });
      if (typeof onSettingsUpdate === 'function') await onSettingsUpdate();
    } catch (error) {
      alert(`Failed to switch buy box: ${error.message}`);
    } finally {
      setBuyBoxSwitching(false);
    }
  };

  const handleFlexibilityChange = async (percent) => {
    const num = Math.min(100, Math.max(0, Number(percent) || 0));
    try {
      await saveSettings(patchActiveBuyBoxFlexibility(settings, num));
      if (typeof onSettingsUpdate === 'function') await onSettingsUpdate();
      setCustomFlexibilityInput('');
    } catch (error) {
      alert('Failed to save flexibility: ' + error.message);
    }
  };

  const handleFlexibilitySelectChange = (e) => {
    const v = e.target.value;
    if (v === 'custom') return;
    handleFlexibilityChange(Number(v));
  };

  const handleCustomFlexibilityBlur = () => {
    const num = Math.min(100, Math.max(0, parseInt(customFlexibilityInput, 10) || 0));
    handleFlexibilityChange(num);
    setCustomFlexibilityInput('');
  };

  const handleRemoveExcludeKeyword = async (keyword) => {
    const nextKeywords = excludeKeywords.filter((item) => item !== keyword);
    setExcludeKeywords(nextKeywords);
    await persistActiveSlotFeed({ excludeKeywords: nextKeywords });
  };

  const handleClearExcludeKeywords = async () => {
    setExcludeKeywords([]);
    setCurrentSelectedList('');
    await persistActiveSlotFeed({ excludeKeywords: [], currentExcludeList: '' });
  };

  const handleSaveExcludeList = async () => {
    if (excludeListSaving) return;

    const keywords = resolveExcludeKeywordsForSave();
    if (keywords.length === 0) {
      alert('Add at least one keyword before saving (type below and click Add, or press Enter).');
      return;
    }

    const trimmed = excludeListNameInput.trim();
    if (!trimmed) {
      alert('Enter a list name in the field next to the dropdown.');
      return;
    }

    setExcludeListSaving(true);
    try {
      const nextLists = { ...savedExcludeLists, [trimmed]: keywords };
      setExcludeKeywords(keywords);
      setExcludeInput('');
      setSavedExcludeLists(nextLists);
      setCurrentSelectedList(trimmed);
      setExcludeListNameInput(trimmed);
      const ok = await persistActiveSlotFeed({
        excludeKeywords: keywords,
        excludeLists: nextLists,
        currentExcludeList: trimmed
      });
      if (ok) {
        console.log('[DealAggregator] Saved exclude list', { name: trimmed, count: keywords.length });
      }
    } finally {
      setExcludeListSaving(false);
    }
  };

  const handleDeleteExcludeList = async () => {
    if (!currentSelectedList) {
      alert('Select a list to delete');
      return;
    }
    if (!window.confirm(`Delete exclude list "${currentSelectedList}"?`)) return;

    const nextLists = { ...savedExcludeLists };
    delete nextLists[currentSelectedList];
    setSavedExcludeLists(nextLists);
    setCurrentSelectedList('');
    setExcludeListNameInput('');
    await persistActiveSlotFeed({ excludeLists: nextLists, currentExcludeList: '' });
  };

  const handleUpdateExcludeList = async () => {
    if (!currentSelectedList) {
      alert('Select a list to update first');
      return;
    }
    const nextLists = { ...savedExcludeLists, [currentSelectedList]: [...excludeKeywords] };
    setSavedExcludeLists(nextLists);
    await persistActiveSlotFeed({ excludeLists: nextLists, currentExcludeList: currentSelectedList });
  };

  const handleRenameExcludeList = async () => {
    if (excludeListSaving) return;
    if (!currentSelectedList) {
      alert('Select a list to rename');
      return;
    }

    const trimmed = excludeListNameInput.trim();
    if (!trimmed) {
      alert('Enter a new name in the List name field.');
      return;
    }
    if (trimmed === currentSelectedList) {
      alert('Change the list name before renaming.');
      return;
    }
    if (savedExcludeLists[trimmed]) {
      alert(`A list named "${trimmed}" already exists. Choose a different name.`);
      return;
    }

    setExcludeListSaving(true);
    try {
      const nextLists = { ...savedExcludeLists };
      nextLists[trimmed] = nextLists[currentSelectedList];
      delete nextLists[currentSelectedList];
      setSavedExcludeLists(nextLists);
      setCurrentSelectedList(trimmed);
      const ok = await persistActiveSlotFeed({ excludeLists: nextLists, currentExcludeList: trimmed });
      if (ok) {
        console.log('[DealAggregator] Renamed exclude list', { from: currentSelectedList, to: trimmed });
      }
    } finally {
      setExcludeListSaving(false);
    }
  };

  const handleLoadExcludeList = async (listName) => {
    const nextKeywords = savedExcludeLists[listName] || [];
    setCurrentSelectedList(listName);
    setExcludeListNameInput(listName);
    setExcludeKeywords(nextKeywords);
    await persistActiveSlotFeed({ excludeKeywords: nextKeywords, currentExcludeList: listName });
  };

  const handleToggleHidden = async (deal, opts = {}) => {
    const animate = opts.animate !== false;
    const hideKey = deal?.id != null ? String(deal.id) : '';
    const tokenSet = hiddenStorageTokensForDeal(deal);
    const currentHiddenIds = hiddenDealIdsRef.current;
    const currentlyHidden = isDealHidden(deal, currentHiddenIds)
      || [...tokenSet].some((t) => currentHiddenIds.includes(t));
    if (!currentlyHidden && hideKey && hidingIdsRef.current.has(hideKey)) {
      console.log('[DealAggregator] hide ignored — already collapsing', hideKey);
      return;
    }
    if (!currentlyHidden && hideKey) hidingIdsRef.current.add(hideKey);
    const nextHiddenIds = currentlyHidden
      ? currentHiddenIds.filter((id) => !tokenSet.has(String(id)))
      : [...new Set([
        ...currentHiddenIds,
        ...[...tokenSet].filter((t) => t.startsWith('md:') || t.startsWith('fp:') || t.startsWith('fs:') || t.startsWith('url:'))
      ])];
    hiddenDealIdsRef.current = nextHiddenIds;
    const previousHiddenIds = currentHiddenIds;
    const previousSelectedDeal = selectedDeal;
    const applyLocal = () => {
      const latest = hiddenDealIdsRef.current;
      setHiddenDealIds(latest);
      if (selectedDeal && isDealHidden(selectedDeal, latest) && !showHiddenDeals) {
        setSelectedDeal(null);
      }
    };
    const shouldAnimate = Boolean(
      animate
      && !currentlyHidden
      && !showHiddenDeals
      && !showMobileDeck
      && !prefersReducedMotion()
    );
    console.log('[DealAggregator] hide listing', {
      dealId: deal?.id,
      dbId: deal?.dbId,
      currentlyHidden,
      tokenCount: nextHiddenIds.length,
      shouldAnimate,
      view: dealViewStyle
    });
    try {
      if (shouldAnimate && dealViewStyle === 'card' && typeof document.startViewTransition === 'function') {
        try {
          await document.startViewTransition(() => {
            flushSync(applyLocal);
          }).finished;
        } catch (err) {
          console.warn('[DealAggregator] card hide transition skipped', err?.message);
          applyLocal();
        }
      } else if (shouldAnimate) {
        await collapseListingEl(deal);
        applyLocal();
      } else {
        applyLocal();
      }
      try {
        await saveSettings({ hiddenDealIds: hiddenDealIdsRef.current });
        if (typeof onSettingsUpdate === 'function') {
          await onSettingsUpdate();
        }
      } catch (error) {
        setHiddenDealIds(previousHiddenIds);
        setSelectedDeal(previousSelectedDeal);
        console.error('[DealAggregator] persist hiddenDealIds failed:', error);
        alert(`Failed to save hidden listings: ${error.message}`);
      }
    } finally {
      if (hideKey) hidingIdsRef.current.delete(hideKey);
    }
  };

  const handleDealPanelPositionChange = async (position) => {
    setDealPanelPosition(position);
    try {
      await saveSettings({ preferences: { dealPanelPosition: position } });
      if (typeof onSettingsUpdate === 'function') {
        await onSettingsUpdate();
      }
    } catch (error) {
      alert(`Failed to save panel position: ${error.message}`);
    }
  };

  const handleSaveCalculatorDefaults = async (calculatorDefaults) => {
    try {
      await saveSettings({ preferences: { calculatorDefaults } });
      if (typeof onSettingsUpdate === 'function') {
        await onSettingsUpdate();
      }
    } catch (error) {
      console.error('Failed to save calculator defaults:', error);
    }
  };

  const handleCardColumnsPerRowChange = async (value) => {
    const num = CARD_COLUMNS_OPTIONS.includes(value) ? value : DEFAULT_CARD_COLUMNS;
    setCardColumnsPerRow(num);
    setShowCardColsPopup(false);
    try {
      await saveSettings({ preferences: { cardColumnsPerRow: num } });
      if (typeof onSettingsUpdate === 'function') {
        await onSettingsUpdate();
      }
    } catch (error) {
      console.error('Failed to save card columns preference:', error);
    }
  };

  const handleViewStyleChange = async (style) => {
    if (style !== 'table' && style !== 'card' && style !== 'inbox') return;
    if (style === dealViewStyle) return;
    const previous = dealViewStyle;
    setDealViewStyle(style);
    persistStoredDealViewStyle(style);
    if (isMobileViewport) {
      setMobileFeedMode(style === 'inbox' ? 'inbox' : style);
    }
    if (style === 'card') {
      setSortConfig([{ field: 'date', direction: 'desc' }]);
    }
    try {
      await updateUserFilterSettings({ dealViewStyle: style });
      console.log('[DealAggregator] dealViewStyle →', style);
    } catch (error) {
      setDealViewStyle(previous);
      persistStoredDealViewStyle(previous);
      alert('Failed to save view preference: ' + error.message);
    }
  };

  const handleShowMatches = () => {
    setViewMode('matches');
    setShowHiddenDeals(false);
  };

  const handleShowHidden = () => {
    setViewMode('hidden');
    setShowHiddenDeals(true);
  };

  const handleSort = (field, isShiftKey) => {
    setSortConfig((current) => {
      if (isShiftKey) {
        const existingIndex = current.findIndex((sort) => sort.field === field);
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = {
            ...next[existingIndex],
            direction: next[existingIndex].direction === 'asc' ? 'desc' : 'asc'
          };
          return next;
        }
        return [...current, { field, direction: defaultDirectionForNewSortField(field) }];
      }

      const isSingleSort = current.length === 1 && current[0].field === field;
      if (isSingleSort) {
        return [{ field, direction: current[0].direction === 'asc' ? 'desc' : 'asc' }];
      }
      return [{ field, direction: 'asc' }];
    });
  };

  const handleColumnDragStart = (event, columnId) => {
    if (columnId === 'name') {
      event.preventDefault();
      return;
    }
    didColumnDragRef.current = false;
    dragColRef.current = columnId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);
    event.currentTarget.classList.add('col-dragging');
    console.log('[DealAggregator] column drag start', columnId);
  };

  const handleColumnDrag = () => {
    if (dragColRef.current) didColumnDragRef.current = true;
  };

  const handleColumnDragOver = (event, columnId) => {
    if (!dragColRef.current || dragColRef.current === columnId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const rect = event.currentTarget.getBoundingClientRect();
    const placeAfter = columnId === 'name' ? true : event.clientX > rect.left + rect.width / 2;
    setDropTargetCol((prev) => (
      prev && prev.id === columnId && prev.placeAfter === placeAfter
        ? prev
        : { id: columnId, placeAfter }
    ));
  };

  const handleColumnDrop = (event, columnId) => {
    event.preventDefault();
    const fromId = dragColRef.current || event.dataTransfer.getData('text/plain');
    const rect = event.currentTarget.getBoundingClientRect();
    const placeAfter = columnId === 'name' ? true : event.clientX > rect.left + rect.width / 2;
    setDropTargetCol(null);
    dragColRef.current = null;
    if (!fromId || fromId === 'name') return;
    setColumnOrder((prev) => {
      const next = moveColumn(prev, fromId, columnId, placeAfter);
      if (!columnOrderEqual(prev, next)) {
        columnLayoutDirtyRef.current = true;
        console.log('[DealAggregator] column order', fromId, '→', columnId, placeAfter ? 'after' : 'before', next.join(','));
      }
      return next;
    });
  };

  const handleColumnDragEnd = (event) => {
    event.currentTarget.classList.remove('col-dragging');
    setDropTargetCol(null);
    dragColRef.current = null;
    window.setTimeout(() => {
      didColumnDragRef.current = false;
    }, 0);
  };

  const handleHeaderClick = (columnId, sortable, event) => {
    if (didColumnDragRef.current) {
      event.preventDefault();
      didColumnDragRef.current = false;
      return;
    }
    if (sortable) handleSort(columnId, event.shiftKey);
  };

  const toggleColumn = (columnId) => {
    if (COLUMN_CONFIG[columnId]?.required) return;
    columnLayoutDirtyRef.current = true;
    setVisibleColumns((current) => ({
      ...current,
      [columnId]: !current[columnId]
    }));
  };

  const handleCardSortChange = (e) => {
    const value = e.target.value;
    const option = CARD_SORT_OPTIONS.find((opt) => opt.value === value) || CARD_SORT_OPTIONS[0];
    setSortConfig([{ field: option.field, direction: option.direction }]);
  };

  const buyBox = settings?.buyBox || {};
  const flexPct = Math.min(100, Math.max(0, Number(buyBox.includeNearMatchesPercent) || 0));
  const hasTargetStates = Array.isArray(buyBox.targetStates) && buyBox.targetStates.length > 0;
  const hasAnyCriteria =
    [
      buyBox.minPrice,
      buyBox.maxPrice,
      buyBox.minEbitda,
      buyBox.maxEbitda,
      buyBox.minRevenue,
      buyBox.maxRevenue,
      buyBox.revenueMultiple
    ].some((v) => v != null && v !== '') || hasTargetStates;
  const showBuyBoxConfigureHint = Boolean(settings) && !hasAnyCriteria;
  const effectiveMax = (limit) => (limit != null && flexPct > 0 ? limit * (1 + flexPct / 100) : limit);
  const effectiveMin = (limit) => (limit != null && flexPct > 0 ? limit * (1 - flexPct / 100) : limit);
  const fmt = (n) => (n != null ? `$${Number(n).toLocaleString()}` : null);
  const fmtMult = (n) => (n != null ? `${Number(n)}×` : null);

  const hasMultiplePages = totalPages > 1;

  const handleDeckHide = async (deal) => {
    if (!isDealHidden(deal, hiddenDealIds)) {
      await handleToggleHidden(deal, { animate: false });
    }
  };

  const handleDeckPass = () => {
    console.debug('[DealAggregator] deck pass (no persist)');
  };

  // Keep sticky filter chrome stacked under the mobile toolbar (not over cards).
  useEffect(() => {
    if (!showMobileToolbar) {
      document.documentElement.style.removeProperty('--mobile-toolbar-h');
      return undefined;
    }
    const toolbar = document.querySelector('.mobile-feed-toolbar');
    if (!toolbar || typeof ResizeObserver === 'undefined') return undefined;
    const sync = () => {
      const h = Math.ceil(toolbar.getBoundingClientRect().height || 0);
      document.documentElement.style.setProperty('--mobile-toolbar-h', `${h}px`);
      console.debug('[DealAggregator] mobile sticky toolbar height', h);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(toolbar);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty('--mobile-toolbar-h');
    };
  }, [showMobileToolbar, isPortrait, showMobileFeedFilters, buyBoxesUiState?.buyBoxes?.length]);

  return (
    <div
      className={[
        'deal-aggregator',
        showMobileDeck ? ' deal-aggregator--deck-mode' : '',
        isMobileViewport ? ' deal-aggregator--mobile' : '',
        isMobileViewport ? (isPortrait ? ' deal-aggregator--mobile-portrait' : ' deal-aggregator--mobile-landscape') : '',
        isMobileViewport && !showMobileDeck ? ' deal-aggregator--mobile-browse' : '',
        showMobileToolbar && !hideMobileCardFilters ? ' deal-aggregator--mobile-filters-open' : '',
      ].join('')}
    >
      {feedError && (
        <div className="aggregator-feed-error" role="alert">
          {feedError}
        </div>
      )}
      {poolNewMode && (
        <div className="pool-new-deals-banner" role="region" aria-label="New pool listings filter">
          <p>
            Showing deals added to the pool in the latest scrape
            {totalFromAPI > 0 ? ` (${totalFromAPI.toLocaleString()} listing${totalFromAPI !== 1 ? 's' : ''})` : ''}.
          </p>
          {typeof onClearPoolNewDealsFilter === 'function' ? (
            <button type="button" className="pool-new-deals-banner__clear" onClick={onClearPoolNewDealsFilter}>
              Back to Buy Box feed
            </button>
          ) : null}
        </div>
      )}
      {matchFilterMode && (
        <div className="pool-new-deals-banner" role="region" aria-label="Buy box alert matches">
          <p>
            Showing the buy-box matches from this alert
            {totalFromAPI > 0 ? ` (${totalFromAPI.toLocaleString()} listing${totalFromAPI !== 1 ? 's' : ''})` : ''}.
          </p>
          {typeof onClearNewToday === 'function' ? (
            <button type="button" className="pool-new-deals-banner__clear" onClick={onClearNewToday}>
              Back to Buy Box feed
            </button>
          ) : null}
        </div>
      )}
      {filterNewToday && !poolNewMode && !matchFilterMode && (
        <div className="pool-new-deals-banner" role="region" aria-label="New matches today">
          <p>
            Showing new buy-box matches from the last 24 hours
            {totalFromAPI > 0 ? ` (${totalFromAPI.toLocaleString()})` : ''}.
          </p>
          {typeof onClearNewToday === 'function' ? (
            <button type="button" className="pool-new-deals-banner__clear" onClick={onClearNewToday}>
              Back to Buy Box feed
            </button>
          ) : null}
        </div>
      )}
      {isFetching && <div className="aggregator-loading-bar" aria-live="polite" />}

      {showMobileToolbar && (
        <MobileFeedToolbar
          feedMode={mobileFeedMode}
          onFeedModeChange={handleMobileFeedModeChange}
          showFocus={SHOW_MOBILE_FOCUS}
          deckScope={deckScope}
          onScopeChange={handleDeckScopeChange}
          onConfigureBuyBox={onConfigureBuyBox}
          onRefresh={handleManualRefresh}
          isRefreshing={isFetching}
          isPortrait={isPortrait}
          showFiltersToggle={mobileFeedMode === 'card'}
          filtersOpen={showMobileFeedFilters}
          onToggleFilters={() => {
            setShowMobileFeedFilters((open) => {
              const next = !open;
              console.log('[DealAggregator] mobile card filters', { open: next });
              return next;
            });
          }}
          filterCount={mobileFilterCount}
          buyBoxes={buyBoxesUiState.buyBoxes}
          activeBuyBoxIndex={buyBoxesUiState.activeBuyBoxIndex}
          onSelectBuyBox={handleBuyBoxSlotClick}
          buyBoxSwitching={buyBoxSwitching}
        />
      )}

      {showMobileDeck ? (
        <DealSwipeDeck
          deals={dealsToShow}
          deckScope={deckScope}
          isPortrait={isPortrait}
          orientationKey={orientationKey}
          totalFromAPI={totalFromAPI}
          isFetching={isFetching}
          isGuest={isGuest}
          entitlements={entitlements}
          requireSignup={requireSignup}
          onHide={handleDeckHide}
          onSave={handleSaveDeal}
          onPass={handleDeckPass}
          onOpenDetails={setSelectedDeal}
          onNeedMore={handleDeckNeedMore}
          onShowAllMatches={() => handleDeckScopeChange('all')}
        />
      ) : (
      <>
      <div className={`aggregator-welcome${isMobileViewport ? ' aggregator-welcome--mobile-collapsed' : ''}`}>
        <div className="aggregator-welcome__main">
          <h2>Discover Business Deals</h2>
          <p>
            {poolNewMode ? (
              <>
                {totalFromAPI > 0
                  ? `${totalFromAPI.toLocaleString()} new pool listing${totalFromAPI !== 1 ? 's' : ''} in this scrape view.`
                  : 'No listings match this scrape filter (they may be hidden or excluded).'}
              </>
            ) : totalFromAPI > 0 ? (
              <>
                {totalFromAPI.toLocaleString()} deal{totalFromAPI !== 1 ? 's' : ''} match your{' '}
                {onConfigureBuyBox ? (
                  <button
                    type="button"
                    className="aggregator-welcome__buybox-text-link"
                    onClick={onConfigureBuyBox}
                  >
                    buy box
                  </button>
                ) : (
                  'buy box'
                )}
                {' '}criteria.
              </>
            ) : (
              'Configure your Buy Box to see matching deals.'
            )}
          </p>
          <div className="aggregator-stats">
            <button type="button" className={`aggregator-stat aggregator-stat-btn ${viewMode === 'matches' ? 'active' : ''}`} onClick={handleShowMatches}>Matches: {totalFromAPI.toLocaleString()}</button>
            <div className="aggregator-stat">
              Showing: {dealsToShow.length.toLocaleString()} of {totalFromAPI.toLocaleString()}
              {hideSavedDealsInFeed && !showHiddenDeals ? (
                <span className="aggregator-stat__note" title="Saved listings are omitted from this list while the option is on in Settings.">
                  {' '}
                  · saved hidden
                </span>
              ) : null}
            </div>
            <div className="aggregator-stat">Page {currentPage} of {totalPages || 1}</div>
            <button type="button" className={`aggregator-stat aggregator-stat-btn ${viewMode === 'hidden' ? 'active' : ''}`} onClick={handleShowHidden}>Hidden: {hiddenListingCount(hiddenDealIds).toLocaleString()}</button>
          </div>
        </div>
        <div className="aggregator-welcome__actions" role="toolbar" aria-label="Deal list actions">
          {onConfigureBuyBox ? (
            <div className="aggregator-welcome__buybox-toolbar">
              <button
                type="button"
                className={`aggregator-filter-btn${showBuyBoxConfigureHint ? ' aggregator-filter-btn--buybox-unset' : ''}`}
                data-tour="buy-box"
                onClick={onConfigureBuyBox}
              >
                Configure Buy Box
              </button>
              <div className="aggregator-buybox-slots" role="tablist" aria-label="Buy box slots">
                {buyBoxesUiState.buyBoxes.map((slot, i) => {
                  const isActive = i === buyBoxesUiState.activeBuyBoxIndex;
                  return (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      className={`aggregator-buybox-slot-btn${isActive ? ' active' : ''}`}
                      disabled={buyBoxSwitching}
                      onClick={() => handleBuyBoxSlotClick(i)}
                      title={slot?.name || defaultBuyBoxSlotName(i)}
                    >
                      {slot?.name || defaultBuyBoxSlotName(i)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <button type="button" className="aggregator-filter-btn" onClick={() => (isGuest ? requireSignup?.('default') : navigate('/settings'))}>
            Settings
          </button>
        </div>
        {(() => {
          const activeSlot = buyBoxesUiState.buyBoxes[buyBoxesUiState.activeBuyBoxIndex];
          const buyBoxTitle = activeSlot?.name?.trim() || 'Buy box';
          const buyBoxSummaryProps = onConfigureBuyBox
            ? {
                type: 'button',
                onClick: onConfigureBuyBox,
                'aria-label': `Configure ${buyBoxTitle} buy box`,
                className: 'aggregator-welcome__buybox aggregator-welcome__buybox--clickable'
              }
            : { className: 'aggregator-welcome__buybox' };
          const BuyBoxSummaryTag = onConfigureBuyBox ? 'button' : 'div';

          return (
            <BuyBoxSummaryTag {...buyBoxSummaryProps}>
              <h3 className="aggregator-welcome__buybox-title">{buyBoxTitle}</h3>
              {!hasAnyCriteria ? (
                <p className="aggregator-welcome__buybox-empty">No criteria set. Configure in Buy Box.</p>
              ) : (
                <dl className="aggregator-welcome__buybox-list">
                  {(buyBox.minPrice != null || buyBox.maxPrice != null) && (
                    <>
                      <dt>Price</dt>
                      <dd>{fmt(effectiveMin(buyBox.minPrice)) ?? '—'} – {fmt(effectiveMax(buyBox.maxPrice)) ?? '—'}</dd>
                    </>
                  )}
                  {(buyBox.minEbitda != null || buyBox.maxEbitda != null) && (
                    <>
                      <dt>EBITDA</dt>
                      <dd>{fmt(effectiveMin(buyBox.minEbitda)) ?? '—'} – {fmt(effectiveMax(buyBox.maxEbitda)) ?? '—'}</dd>
                    </>
                  )}
                  {(buyBox.minRevenue != null || buyBox.maxRevenue != null) && (
                    <>
                      <dt>Revenue</dt>
                      <dd>{fmt(effectiveMin(buyBox.minRevenue)) ?? '—'} – {fmt(effectiveMax(buyBox.maxRevenue)) ?? '—'}</dd>
                    </>
                  )}
                  {buyBox.revenueMultiple != null && (
                    <>
                      <dt>Rev multiple</dt>
                      <dd>≤ {fmtMult(effectiveMax(buyBox.revenueMultiple))}</dd>
                    </>
                  )}
                  {hasTargetStates && (
                    <>
                      <dt>States</dt>
                      <dd>{buyBox.targetStates.join(', ')}</dd>
                    </>
                  )}
                  {flexPct > 0 && hasAnyCriteria && (
                    <>
                      <dt>Flexibility</dt>
                      <dd>{flexPct}% (near matches included)</dd>
                    </>
                  )}
                </dl>
              )}
            </BuyBoxSummaryTag>
          );
        })()}
      </div>

      <div className="aggregator-table-container active" data-tour="deal-feed">
        <div
          id="aggregator-controls"
          className={`aggregator-controls${hideMobileCardFilters ? ' aggregator-controls--mobile-hidden' : ''}`}
        >
          <div className="controls-row">
            <div className={`view-style-toggle${showMobileToolbar ? ' view-style-toggle--desktop-only' : ''}`} role="group" aria-label="View style">
              <button type="button" className={`toolbar-btn ${dealViewStyle === 'table' ? 'active' : ''}`} onClick={() => handleViewStyleChange('table')}>Table</button>
              <button type="button" className={`toolbar-btn ${dealViewStyle === 'card' ? 'active' : ''}`} onClick={() => handleViewStyleChange('card')}>Card</button>
              <button type="button" className={`toolbar-btn ${dealViewStyle === 'inbox' ? 'active' : ''}`} onClick={() => handleViewStyleChange('inbox')}>Inbox</button>
              {dealViewStyle === 'card' && (
                <div className="card-cols-wrapper" ref={cardColsPopupRef}>
                  <button
                    type="button"
                    className="toolbar-btn card-cols-trigger"
                    onClick={() => setShowCardColsPopup((v) => !v)}
                    aria-expanded={showCardColsPopup}
                    aria-label="Cards per row"
                  >
                    ⊞ {cardColumnsPerRow} cols
                  </button>
                  {showCardColsPopup && (
                    <div className="card-cols-popup card-cols-popup--viewport" role="listbox" aria-label="Cards per row">
                      {CARD_COLUMNS_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          role="option"
                          aria-selected={cardColumnsPerRow === n}
                          className={`card-cols-option${cardColumnsPerRow === n ? ' active' : ''}`}
                          onClick={() => handleCardColumnsPerRowChange(n)}
                        >
                          <span className="card-cols-option-blocks" aria-hidden="true">
                            {Array.from({ length: n }, (_, i) => <span key={i} className="card-cols-block" />)}
                          </span>
                          <span className="card-cols-option-label">{n}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {dealViewStyle === 'card' && (
              <label className="card-sort-label">
                <span className="card-sort-label-text">Sort:</span>
                <select
                  className="card-sort-select"
                  value={getCardSortValue(sortConfig)}
                  onChange={handleCardSortChange}
                  aria-label="Sort cards by"
                >
                  {CARD_SORT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            )}
            <button type="button" className="toolbar-btn" onClick={() => setShowColumnsPanel((current) => !current)}>
              Columns
            </button>
            <label className="show-hidden-toggle">
              <input
                type="checkbox"
                checked={showHiddenDeals}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowHiddenDeals(checked);
                  setViewMode(checked ? 'hidden' : 'matches');
                }}
              />
              <span>{showHiddenDeals ? 'Showing Hidden Deals' : `Show Hidden (${hiddenListingCount(hiddenDealIds)})`}</span>
            </label>
            <label className="flexibility-label" data-tour="flexibility">
              <span className="flexibility-label-text">Flexibility</span>
              <select
                className="flexibility-select"
                value={flexibilitySelectValue}
                onChange={handleFlexibilitySelectChange}
                aria-label="Match flexibility (include near matches)"
              >
                {FLEXIBILITY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {flexibilitySelectValue === 'custom' && (
                <input
                  type="number"
                  className="flexibility-custom-input"
                  min={0}
                  max={100}
                  value={customFlexibilityInput !== '' ? customFlexibilityInput : String(flexibilityPercent)}
                  onChange={(e) => setCustomFlexibilityInput(e.target.value)}
                  onBlur={handleCustomFlexibilityBlur}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCustomFlexibilityBlur(); }}
                  aria-label="Custom flexibility percent"
                />
              )}
            </label>
            <DealAgeLegend title="Listing age by date added" />
          </div>

          {showColumnsPanel && (
            <div className="column-visibility-panel">
              <div className="column-visibility-header">
                <span>Show/Hide Columns:</span>
                <button type="button" className="column-close-btn" onClick={() => setShowColumnsPanel(false)}>
                  ×
                </button>
              </div>
              <p className="column-layout-hint">
                Layout saves to your account. Drag table headers to reorder. Name stays first.
              </p>
              <div className="column-checkboxes">
                {columnOrder.map((columnId) => {
                  const config = COLUMN_CONFIG[columnId];
                  if (!config) return null;
                  return (
                    <label key={columnId}>
                      <input
                        type="checkbox"
                        checked={visibleColumns[columnId] !== false}
                        disabled={config.required}
                        onChange={() => toggleColumn(columnId)}
                      />
                      {config.label}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="keyword-filters-row">
          <div
            className={`exclude-keywords-section search-keywords-section${!showSearchSection ? ' exclude-keywords-section--collapsed' : ''}`}
            data-tour="search-bar"
          >
            <div className="exclude-header">
              <button
                type="button"
                className="exclude-label exclude-label-toggle"
                onClick={() => setShowSearchSection((v) => !v)}
                aria-expanded={showSearchSection}
              >
                {showSearchSection ? '▼' : '▶'} Search Keywords
                {searchKeywords.length > 0 && (
                  <span className="exclude-header-preview">
                    {': '}
                    {searchKeywords.slice(0, 3).join(', ')}
                    {searchKeywords.length > 3 ? '…' : ''}
                    {` (${searchKeywords.length})`}
                  </span>
                )}
              </button>
            </div>
            {showSearchSection && (
            <>
            <div className="exclude-list-controls">
              <select
                value={currentSelectedSearchList}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    setCurrentSelectedSearchList('');
                    setSearchListNameInput('');
                    persistActiveSlotFeed({ currentSearchList: '' });
                    return;
                  }
                  handleLoadSearchList(value);
                }}
                aria-label="Saved search lists"
              >
                <option value="">-- Select List --</option>
                {Object.keys(savedSearchLists).sort().map((name) => (
                  <option key={name} value={name}>
                    {name} ({savedSearchLists[name].length})
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="exclude-list-name-input"
                value={searchListNameInput}
                onChange={(e) => setSearchListNameInput(e.target.value)}
                placeholder="List name"
                aria-label="Search list name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveSearchList();
                  }
                }}
              />
              <button
                type="button"
                className="exclude-btn"
                onClick={handleSaveSearchList}
                disabled={searchListSaving}
              >
                {searchListSaving ? 'Saving…' : 'Save List'}
              </button>
              <button
                type="button"
                className="exclude-btn"
                onClick={handleRenameSearchList}
                disabled={!currentSelectedSearchList || searchListSaving}
              >
                Rename
              </button>
              <button type="button" className="exclude-btn" onClick={handleUpdateSearchList} disabled={!currentSelectedSearchList || searchListSaving}>
                Update
              </button>
              <button type="button" className="exclude-btn" onClick={handleDeleteSearchList} disabled={!currentSelectedSearchList || searchListSaving}>
                Delete
              </button>
              <button type="button" className="exclude-btn" onClick={handleClearSearchKeywords} disabled={searchListSaving}>
                Clear All
              </button>
            </div>
            <div className="exclude-content">
              <div className="exclude-input-row">
                <input
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSearchKeyword();
                    }
                  }}
                  placeholder="Type keyword and press Enter… commas for AND"
                  aria-label="Add search keyword"
                />
                <button type="button" className="exclude-add-btn" onClick={handleAddSearchKeyword}>
                  Add
                </button>
              </div>
              <div className="exclude-tags">
                {searchKeywords.length === 0 ? (
                  <span className="exclude-empty-text">No search keywords. Add terms to filter the pool.</span>
                ) : (
                  searchKeywords.map((keyword) => (
                    <span key={keyword} className="exclude-tag">
                      {keyword}
                      <button
                        type="button"
                        className="exclude-tag-remove"
                        onClick={() => handleRemoveSearchKeyword(keyword)}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
            </>
            )}
          </div>

          <div
            className={`exclude-keywords-section${!showExcludeSection ? ' exclude-keywords-section--collapsed' : ''}`}
            data-tour="exclude-keywords"
          >
            <div className="exclude-header">
              <button
                type="button"
                className="exclude-label exclude-label-toggle"
                onClick={() => setShowExcludeSection((v) => !v)}
                aria-expanded={showExcludeSection}
              >
                {showExcludeSection ? '▼' : '▶'} Exclude Keywords:
              </button>
            </div>
            {showExcludeSection && (
            <>
            <div className="exclude-list-controls">
              <select
                value={currentSelectedList}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    setCurrentSelectedList('');
                    setExcludeListNameInput('');
                    persistActiveSlotFeed({ currentExcludeList: '' });
                    return;
                  }
                  handleLoadExcludeList(value);
                }}
              >
                <option value="">-- Select List --</option>
                {Object.keys(savedExcludeLists).sort().map((name) => (
                  <option key={name} value={name}>
                    {name} ({savedExcludeLists[name].length})
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="exclude-list-name-input"
                value={excludeListNameInput}
                onChange={(e) => setExcludeListNameInput(e.target.value)}
                placeholder="List name"
                aria-label="Exclude list name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveExcludeList();
                  }
                }}
              />
              <button
                type="button"
                className="exclude-btn"
                onClick={handleSaveExcludeList}
                disabled={excludeListSaving}
              >
                {excludeListSaving ? 'Saving…' : 'Save List'}
              </button>
              <button
                type="button"
                className="exclude-btn"
                onClick={handleRenameExcludeList}
                disabled={!currentSelectedList || excludeListSaving}
              >
                Rename
              </button>
              <button type="button" className="exclude-btn" onClick={handleUpdateExcludeList} disabled={!currentSelectedList || excludeListSaving}>
                Update
              </button>
              <button type="button" className="exclude-btn" onClick={handleDeleteExcludeList} disabled={!currentSelectedList || excludeListSaving}>
                Delete
              </button>
              <button type="button" className="exclude-btn" onClick={handleClearExcludeKeywords} disabled={excludeListSaving}>
                Clear All
              </button>
            </div>
            <div className="exclude-content">
              <div className="exclude-input-row">
                <input
                  type="text"
                  value={excludeInput}
                  onChange={(e) => setExcludeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddExcludeKeyword();
                    }
                  }}
                  placeholder="Type keyword and press Enter..."
                />
                <button type="button" className="exclude-add-btn" onClick={handleAddExcludeKeyword}>
                  Add
                </button>
              </div>
              <div className="exclude-tags">
                {excludeKeywords.length === 0 ? (
                  <span className="exclude-empty-text">No keywords excluded.</span>
                ) : (
                  excludeKeywords.map((keyword) => (
                    <span key={keyword} className="exclude-tag">
                      {keyword}
                      <button
                        type="button"
                        className="exclude-tag-remove"
                        onClick={() => handleRemoveExcludeKeyword(keyword)}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
            </>
            )}
          </div>
          </div>
        </div>

        {dealViewStyle === 'table' && SHOW_SORT_TIP && (
          <div className="sort-tip">
            <strong>Sorting tip:</strong> Click a column to sort. Hold <kbd>Shift</kbd> and click another column to add a tiebreaker (header numbers: 1 = first key, 2 = second key).
            {sortConfig.length >= 2 ? (
              <span className="sort-tip__multi">
                {' '}
                <strong>Important:</strong> column (2) only changes order when two rows <strong>tie</strong> on column (1) (exact same value). If every row has a different annual profit, dates will <strong>not</strong> look chronological—that is expected. For newest listings overall, sort <strong>Date Added</strong> first (click it without Shift to make it #1), then Shift+click <strong>Annual Profit</strong> as #2.
              </span>
            ) : (
              <span> Example: <strong>Annual Profit</strong> #1 (high → low), then Shift+ <strong>Date Added</strong> #2 (newest first only when profit matches).</span>
            )}
          </div>
        )}

        {dealViewStyle === 'table' && (
        <div className="aggregator-table-scroll">
          <table className="aggregator-table">
            <thead>
              <tr>
                {visibleOrderedColumns.map((columnId) => {
                  const config = COLUMN_CONFIG[columnId];
                  return renderHeaderCell({
                    columnId,
                    label: config.headerLabel || config.label.toUpperCase(),
                    sortConfig,
                    sortable: config.sortable !== false,
                    pinned: columnId === 'name',
                    dropTarget: dropTargetCol,
                    onHeaderClick: handleHeaderClick,
                    onDragStart: handleColumnDragStart,
                    onDrag: handleColumnDrag,
                    onDragOver: handleColumnDragOver,
                    onDrop: handleColumnDrop,
                    onDragEnd: handleColumnDragEnd,
                  });
                })}
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {deals.length === 0 ? (
                <tr>
                  <td colSpan={Object.keys(COLUMN_CONFIG).filter((columnId) => visibleColumns[columnId] !== false).length + 1} className="table-empty-cell">No deals found. Try adjusting your filters or search.</td>
                </tr>
              ) : dealsToShow.length === 0 ? (
                <tr>
                  <td colSpan={Object.keys(COLUMN_CONFIG).filter((columnId) => visibleColumns[columnId] !== false).length + 1} className="table-empty-cell">
                    {emptyFeedMessage}
                  </td>
                </tr>
              ) : (
                dealsToShow.map((deal) => {
                  const isHidden = isDealHidden(deal, hiddenDealIds);
                  const dealSaved = isDealSavedInWorkspace(deal);
                  return (
                  <tr
                    key={deal.id}
                    data-deal-id={String(deal.id)}
                    className={isHidden ? 'deal-row-hidden' : ''}
                    onClick={() => setSelectedDeal(deal)}
                  >
                    {visibleOrderedColumns.map((columnId) => renderDealCell(columnId, deal, {
                      isGuest,
                      entitlements,
                      requireSignup,
                    }))}
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); handleToggleSaveDeal(deal); }}
                          className={
                            dealSaved
                              ? `btn-save ${showSavedHighlightInFeed ? 'btn-save--saved' : 'btn-save--saved-muted'}`
                              : 'btn-save'
                          }
                          disabled={savingDealId === deal.id}
                          title={dealSaved ? `Click to remove from ${saveTargetLabel}` : `Save to ${saveTargetLabel}`}
                        >
                          {dealSaved
                            ? savingDealId === deal.id
                              ? '…'
                              : 'Saved'
                            : savingDealId === deal.id
                              ? 'Saving…'
                              : 'Save'}
                        </button>
                        <button onClick={(event) => { event.stopPropagation(); handleToggleHidden(deal); }} className="btn-save btn-hide">{isHidden ? 'Unhide' : 'Hide'}</button>
                      </div>
                    </td>
                  </tr>
                );})
              )}
            </tbody>
          </table>
          {hasMultiplePages && (
            <div className="aggregator-pagination">
              <button type="button" className="aggregator-pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)} aria-label="Previous page">
                Previous
              </button>
              <div className="aggregator-pagination-pages" role="navigation" aria-label="Page navigation">
                {getPaginationPages(currentPage, totalPages).map((page, i) =>
                  page === '…' ? (
                    <span key={`ellipsis-${i}`} className="aggregator-pagination-ellipsis">…</span>
                  ) : (
                    <button
                      key={page}
                      type="button"
                      className={`aggregator-pagination-num ${currentPage === page ? 'active' : ''}`}
                      onClick={() => setCurrentPage(page)}
                      aria-label={`Page ${page}`}
                      aria-current={currentPage === page ? 'page' : undefined}
                    >
                      {page}
                    </button>
                  )
                )}
              </div>
              <button type="button" className="aggregator-pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)} aria-label="Next page">
                Next
              </button>
              <span className="aggregator-pagination-label">Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}</span>
            </div>
          )}
        </div>
        )}

        {dealViewStyle === 'inbox' && (
          <div className="aggregator-inbox-scroll">
            {deals.length === 0 ? (
              <div className="aggregator-cards-empty">No deals found. Try adjusting your filters or search.</div>
            ) : (
              <DealInboxView
                deals={dealsToShow}
                emptyMessage={emptyFeedMessage}
                isDealSaved={(d) => isDealSavedInWorkspace(d)}
                isDealHidden={(d) => isDealHidden(d, hiddenDealIds)}
                savingDealId={savingDealId}
                onHide={handleToggleHidden}
                onToggleSave={handleToggleSaveDeal}
                saveTargetLabel={saveTargetLabel}
                showHiddenMode={showHiddenDeals}
                isGuest={isGuest}
                entitlements={entitlements}
                requireSignup={requireSignup}
                settings={settings}
                onSaveCalculatorDefaults={handleSaveCalculatorDefaults}
                onIOIPrefsSaved={onSettingsUpdate}
                dealPanelPosition={dealPanelPosition}
                onDealPanelPositionChange={handleDealPanelPositionChange}
                onSaveDeal={handleSaveDeal}
                onUnsaveDeal={handleUnsaveDeal}
                isMobile={isMobileViewport}
                onConfigureBuyBox={onConfigureBuyBox}
                onOpenCrm={typeof onOpenVettrCrm === 'function' ? onOpenVettrCrm : null}
                lookupCrmMeta={lookupCrmMeta}
                ensureDealSaved={ensureDealSavedForCrm}
                onCrmStageSynced={handleCrmStageSynced}
                buyBoxes={buyBoxesUiState.buyBoxes}
                activeBuyBoxIndex={buyBoxesUiState.activeBuyBoxIndex}
                onSelectBuyBox={handleBuyBoxSlotClick}
                buyBoxSwitching={buyBoxSwitching}
              />
            )}
            {hasMultiplePages && (
              <div className="aggregator-pagination">
                <button type="button" className="aggregator-pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)} aria-label="Previous page">
                  Previous
                </button>
                <div className="aggregator-pagination-pages" role="navigation" aria-label="Page navigation">
                  {getPaginationPages(currentPage, totalPages).map((page, i) =>
                    page === '…' ? (
                      <span key={`ellipsis-${i}`} className="aggregator-pagination-ellipsis">…</span>
                    ) : (
                      <button
                        key={page}
                        type="button"
                        className={`aggregator-pagination-num ${currentPage === page ? 'active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                        aria-label={`Page ${page}`}
                        aria-current={currentPage === page ? 'page' : undefined}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>
                <button type="button" className="aggregator-pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)} aria-label="Next page">
                  Next
                </button>
                <span className="aggregator-pagination-label">Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}

        {dealViewStyle === 'card' && (
          <div className="aggregator-cards-scroll">
            <div className="aggregator-cards-grid" data-cols={isMobileViewport ? 1 : cardColumnsPerRow}>
              {deals.length === 0 ? (
                <div className="aggregator-cards-empty">No deals found. Try adjusting your filters or search.</div>
              ) : dealsToShow.length === 0 ? (
                <div className="aggregator-cards-empty">
                  {emptyFeedMessage}
                </div>
              ) : (
                dealsToShow.map((deal) => {
                  const isHidden = isDealHidden(deal, hiddenDealIds);
                  const dealSaved = isDealSavedInWorkspace(deal);
                  return (
                    <SwipeableDealCard
                      key={deal.id}
                      deal={deal}
                      isHidden={isHidden}
                      onHide={handleToggleHidden}
                      onLike={handleSaveDeal}
                      onTap={setSelectedDeal}
                      enableSwipe={false}
                    >
                      <AggregatorDeedCardBody
                        deal={deal}
                        isHidden={isHidden}
                        dealSaved={dealSaved}
                        isGuest={isGuest}
                        entitlements={entitlements}
                        requireSignup={requireSignup}
                        savingDealId={savingDealId}
                        saveTargetLabel={saveTargetLabel}
                        showSavedHighlightInFeed={showSavedHighlightInFeed}
                        onToggleSave={handleToggleSaveDeal}
                        onToggleHidden={handleToggleHidden}
                        onOpen={setSelectedDeal}
                      />
                    </SwipeableDealCard>
                  );
                })
              )}
            </div>
            {hasMultiplePages && (
              <div className="aggregator-pagination">
                <button type="button" className="aggregator-pagination-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => p - 1)} aria-label="Previous page">
                  Previous
                </button>
                <div className="aggregator-pagination-pages" role="navigation" aria-label="Page navigation">
                  {getPaginationPages(currentPage, totalPages).map((page, i) =>
                    page === '…' ? (
                      <span key={`ellipsis-${i}`} className="aggregator-pagination-ellipsis">…</span>
                    ) : (
                      <button
                        key={page}
                        type="button"
                        className={`aggregator-pagination-num ${currentPage === page ? 'active' : ''}`}
                        onClick={() => setCurrentPage(page)}
                        aria-label={`Page ${page}`}
                        aria-current={currentPage === page ? 'page' : undefined}
                      >
                        {page}
                      </button>
                    )
                  )}
                </div>
                <button type="button" className="aggregator-pagination-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => p + 1)} aria-label="Next page">
                  Next
                </button>
                <span className="aggregator-pagination-label">Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
      </div>
      </>
      )}

      <DealDetailsPanel
        isOpen={Boolean(selectedDeal)}
        deal={selectedDeal}
        position={dealPanelPosition}
        onClose={() => setSelectedDeal(null)}
        onSaveDeal={handleSaveDeal}
        onUnsaveDeal={handleUnsaveDeal}
        isSavingDeal={savingDealId != null && selectedDeal?.id === savingDealId}
        dealSavedInMyDeals={selectedDeal ? isDealSavedInWorkspace(selectedDeal) : false}
        saveButtonLabel={`Save to ${saveTargetLabel}`}
        unsaveButtonTitle={`Click to remove from ${saveTargetLabel}`}
        savedHighlightStyle={showSavedHighlightInFeed}
        onPositionChange={handleDealPanelPositionChange}
        settings={settings}
        onSaveCalculatorDefaults={handleSaveCalculatorDefaults}
        onIOIPrefsSaved={onSettingsUpdate}
        isGuest={isGuest}
        entitlements={entitlements}
        requireSignup={requireSignup}
        headerProgressControl={headerProgressControl}
      />
      {saveToast && createPortal(
        <div className="save-toast save-toast--with-action" role="status" aria-live="polite">
          <span>{saveToast.message}</span>
          {saveToast.showCrmCta && typeof onOpenVettrCrm === 'function' ? (
            <button
              type="button"
              className="save-toast__cta"
              onClick={() => {
                const dealId = saveToast.dealId;
                console.log('[DealAggregator] Open CRM from save toast', {
                  dealId,
                  crmLabel: saveTargetLabel
                });
                setSaveToast(null);
                onOpenVettrCrm(dealId != null ? { dealId } : undefined);
              }}
            >
              Open {saveTargetLabel}
            </button>
          ) : null}
        </div>,
        document.body
      )}
    </div>
  );
}

function formatMoney(value) {
  if (!value) return '—';
  return `$${value.toLocaleString()}`;
}

function isEmptyVisibleColumnsOnAccount(raw) {
  if (raw == null) return true;
  if (Array.isArray(raw)) return raw.length === 0;
  return Object.keys(raw).length === 0;
}

/** Normalize `user_settings.visible_columns` into a column-id → boolean map. */
function parseVisibleColumnsFromAccount(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (Object.keys(raw).length === 0) return null;
  const merged = { ...DEFAULT_VISIBLE_COLUMNS };
  for (const columnId of Object.keys(COLUMN_CONFIG)) {
    if (raw[columnId] === false) merged[columnId] = false;
    else if (raw[columnId] === true) merged[columnId] = true;
    if (COLUMN_CONFIG[columnId]?.required) merged[columnId] = true;
  }
  return merged;
}

function visibleColumnsEqual(a, b) {
  return Object.keys(COLUMN_CONFIG).every((columnId) => (a[columnId] !== false) === (b[columnId] !== false));
}

function loadVisibleColumns() {
  try {
    const saved = localStorage.getItem('vettr_visible_columns');
    const parsed = saved ? JSON.parse(saved) : null;
    const fromLocal = parseVisibleColumnsFromAccount(parsed);
    return fromLocal || DEFAULT_VISIBLE_COLUMNS;
  } catch {
    return DEFAULT_VISIBLE_COLUMNS;
  }
}

function loadSavedSortConfig() {
  try {
    const saved = localStorage.getItem('vettr_aggregator_sort');
    return saved ? JSON.parse(saved) : DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

function pinNameFirst(order) {
  return ['name', ...order.filter((id) => id !== 'name')];
}

function normalizeColumnOrder(raw) {
  const known = new Set(Object.keys(COLUMN_CONFIG));
  const seen = new Set();
  const next = [];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
  }
  for (const id of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(id)) next.push(id);
  }
  return pinNameFirst(next);
}

function columnOrderEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

function loadColumnOrder() {
  try {
    const saved = localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    return normalizeColumnOrder(parsed);
  } catch {
    return [...DEFAULT_COLUMN_ORDER];
  }
}

/** Move a column before/after `toId`. Name always stays index 0. */
function moveColumn(order, fromId, toId, placeAfter) {
  if (!fromId || fromId === 'name') return order;
  const from = order.indexOf(fromId);
  if (from < 0) return order;

  let insertAt;
  if (toId === 'name') {
    insertAt = 1;
  } else {
    const to = order.indexOf(toId);
    if (to < 0) return order;
    insertAt = placeAfter ? to + 1 : to;
  }

  const next = [...order];
  next.splice(from, 1);
  if (from < insertAt) insertAt -= 1;
  insertAt = Math.max(insertAt, 1);
  next.splice(insertAt, 0, fromId);
  return pinNameFirst(next);
}

function renderDealCell(columnId, deal, ctx) {
  const { isGuest, entitlements, requireSignup } = ctx;
  switch (columnId) {
    case 'name':
      return (
        <td key={columnId} className="deal-name-cell" data-col="name">
          <div className="deal-name-primary">{deal.name || 'Unnamed Business'}</div>
        </td>
      );
    case 'date':
      return (
        <td key={columnId} data-col="date">
          <span className={`deal-date-age ${getListingAgeClass(deal.discoveredAt)}`} title={listingAgeTitle(deal.discoveredAt)}>
            {formatDealDate(deal.discoveredAt)}
          </span>
        </td>
      );
    case 'industry':
      return <td key={columnId} data-col="industry">{deal.industry || '—'}</td>;
    case 'description':
      return (
        <td key={columnId} data-col="description" className="description-col">
          {isGuest ? (
            <GatedPreviewText
              text={deal.description}
              limit={entitlements?.previewCharLimit ?? 120}
              entitlements={entitlements}
              serverTruncated={deal.descriptionTruncated}
              reason="description_click"
              onRequireSignup={(reason) => requireSignup?.(reason, { dealDbId: deal.dbId })}
            />
          ) : (
            deal.description ? `${deal.description.substring(0, 120)}${deal.description.length > 120 ? '...' : ''}` : '—'
          )}
        </td>
      );
    case 'city':
      return <td key={columnId} data-col="city">{deal.city || '—'}</td>;
    case 'county':
      return <td key={columnId} data-col="county">{deal.county || '—'}</td>;
    case 'state':
      return <td key={columnId} data-col="state">{deal.state || '—'}</td>;
    case 'country':
      return <td key={columnId} data-col="country">{deal.country || '—'}</td>;
    case 'yearsEstablished':
      return <td key={columnId} data-col="yearsEstablished">{deal.yearsEstablished || '—'}</td>;
    case 'ebitda':
      return <td key={columnId} className="money-cell" data-col="ebitda">{formatMoney(deal.ebitda)}</td>;
    case 'revenue':
      return <td key={columnId} data-col="revenue">{formatMoney(deal.revenue)}</td>;
    case 'price':
      return <td key={columnId} data-col="price">{formatMoney(deal.askingPrice)}</td>;
    case 'profitMultiple':
      return <td key={columnId} data-col="profitMultiple">{formatRatio(deal.profitMultiple)}</td>;
    case 'revenueMultiple':
      return <td key={columnId} data-col="revenueMultiple">{formatRatio(deal.revenueMultiple)}</td>;
    case 'remote':
      return <td key={columnId} data-col="remote">{deal.remote || '—'}</td>;
    case 'franchise':
      return <td key={columnId} data-col="franchise">{deal.franchise || '—'}</td>;
    case 'fiveYearsInBusiness':
      return <td key={columnId} data-col="fiveYearsInBusiness">{deal.fiveYearsInBusiness || '—'}</td>;
    case 'broker':
      return (
        <td key={columnId} data-col="broker">
          {isGuest ? guestBrokerCell('Sign up to view', requireSignup) : (deal.broker || '—')}
        </td>
      );
    case 'brokerCompany':
      return (
        <td key={columnId} data-col="brokerCompany">
          {isGuest ? guestBrokerCell('Sign up to view', requireSignup) : (deal.brokerCompany || '—')}
        </td>
      );
    case 'brokerPhone':
      return (
        <td key={columnId} data-col="brokerPhone">
          {isGuest ? guestBrokerCell('Sign up to view', requireSignup) : (deal.brokerPhone || '—')}
        </td>
      );
    case 'brokerEmail':
      return (
        <td key={columnId} data-col="brokerEmail">
          {isGuest ? guestBrokerCell('Sign up to view', requireSignup) : (deal.brokerEmail || '—')}
        </td>
      );
    case 'location':
      return <td key={columnId} data-col="location">{deal.location || '—'}</td>;
    case 'source':
      return <td key={columnId} data-col="source">{deal.source || '—'}</td>;
    case 'url':
      return (
        <td key={columnId} data-col="url" className="url-col">
          {deal.url ? (
            <a href={deal.url} target="_blank" rel="noopener noreferrer" className="table-link">
              Open
            </a>
          ) : '—'}
        </td>
      );
    default:
      return null;
  }
}

function renderHeaderCell({
  columnId,
  label,
  sortConfig,
  sortable = true,
  pinned = false,
  dropTarget = null,
  onHeaderClick,
  onDragStart,
  onDrag,
  onDragOver,
  onDrop,
  onDragEnd,
}) {
  const sortIndex = sortConfig.findIndex((sort) => sort.field === columnId);
  const sortMeta = sortIndex >= 0 ? sortConfig[sortIndex] : null;
  const isDropTarget = dropTarget?.id === columnId;
  const classes = [
    sortable ? 'sortable' : '',
    sortMeta ? `sorted-${sortMeta.direction}` : '',
    pinned ? 'col-pinned' : 'col-reorder',
    isDropTarget && dropTarget.placeAfter ? 'col-drop-after' : '',
    isDropTarget && !dropTarget.placeAfter ? 'col-drop-before' : '',
  ].filter(Boolean).join(' ');

  const sortTitle = sortable ? 'Click to sort. Shift+Click for multi-sort (e.g. profit, then date).' : '';
  const dragTitle = pinned
    ? 'Name stays on the left.'
    : 'Drag left or right to reorder.';

  return (
    <th
      key={columnId}
      data-col={columnId}
      data-sort={columnId}
      className={classes}
      draggable={!pinned}
      onClick={(event) => onHeaderClick(columnId, sortable, event)}
      onDragStart={(event) => onDragStart(event, columnId)}
      onDrag={onDrag}
      onDragEnter={(event) => event.preventDefault()}
      onDragOver={(event) => onDragOver(event, columnId)}
      onDrop={(event) => onDrop(event, columnId)}
      onDragEnd={onDragEnd}
      title={[sortTitle, dragTitle].filter(Boolean).join(' ')}
    >
      <span>{label}</span>
      {sortMeta ? <span className="sort-priority"> {sortIndex + 1}</span> : null}
    </th>
  );
}



