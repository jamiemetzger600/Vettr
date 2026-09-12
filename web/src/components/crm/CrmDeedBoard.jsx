import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { crmAPI, dealsAPI, teamsAPI } from '../../utils/api';
import { normalizeDeal, getDealProgressLabel, isPassedOnDeal } from '../../utils/normalizeDeal';
import { getCalculatorDefaultsFromSettings } from '../../utils/calculatorDefaultsFromSettings';
import { getSavedDealCalculatorSummary } from '../../utils/savedDealCalculatorSummary';
import { useTeam } from '../../context/TeamContext';
import DealAgeLegend from '../DealAgeLegend';
import CrmCardContextMenu from './CrmCardContextMenu';
import CrmDeedCard from './CrmDeedCard';
import CrmDeedModals from './CrmDeedModals';
import {
  WAITING_DEFAULTS,
  getWaitingOn,
  isEmptyDeedCardPrefs,
  loadDeedCardPrefs,
  normalizeDeedCardPrefs,
  deedCardPrefsFingerprint,
  partitionDeedDeals,
  placeDealInOrder,
  saveDeedCardPrefs,
  waitingOnLabels
} from '../../utils/deedCardPrefs';
import { pollWhenVisible } from '../../utils/pollWhenVisible';

function closestCard(target) {
  const el = target instanceof Element ? target : target?.parentElement;
  return el?.closest('.crm-deed-card') || null;
}

function dealSearchHaystack(deal, waiting, nextAction) {
  const stage = getDealProgressLabel(deal) || 'unstaged';
  const wait = waitingOnLabels(waiting).join(' ');
  return [
    deal.name,
    stage,
    deal.city,
    deal.state,
    deal.industry,
    wait,
    nextAction?.title,
    ...(Array.isArray(deal.tags) ? deal.tags : [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export default function CrmDeedBoard({
  deals = [],
  settings = null,
  selectedDealId = null,
  onSelectDeal,
  onRefresh,
  onStageChanged = null,
  nextActionByDealId = null,
  overdueDealIds = null,
  locallySeenDealIds = null,
  onAddDeal = null,
  onLiveDealsRefresh = null
}) {
  const { isTeamMode, activeTeam, activeTeamId } = useTeam();
  const writeEnabled = !isTeamMode || activeTeam?.role !== 'viewer';
  const teamBoardId = isTeamMode ? activeTeamId : null;
  const [prefs, setPrefs] = useState(() => loadDeedCardPrefs(teamBoardId));
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const teamSaveTimerRef = useRef(null);
  const dirtyRef = useRef(false);
  const [dragDealId, setDragDealId] = useState(null);
  const dragDealIdRef = useRef(null);
  const [dropAt, setDropAtState] = useState(null);
  const dropAtRef = useRef(null);
  const setDropAt = (value) => {
    const next = typeof value === 'function' ? value(dropAtRef.current) : value;
    dropAtRef.current = next;
    setDropAtState(next);
  };
  const [cardMenu, setCardMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [stageSaving, setStageSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [waitingFilter, setWaitingFilter] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const calculatorDefaults = useMemo(
    () => getCalculatorDefaultsFromSettings(settings),
    [settings]
  );

  const normalized = useMemo(
    () => (Array.isArray(deals) ? deals.map(normalizeDeal).filter((d) => d?.id) : []),
    [deals]
  );

  const archivedCount = useMemo(
    () => normalized.filter(isPassedOnDeal).length,
    [normalized]
  );
  const activeCount = normalized.length - archivedCount;

  const orderedDeals = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = normalized.filter((deal) => {
      const passed = isPassedOnDeal(deal);
      if (showArchived ? !passed : passed) return false;
      const waiting = getWaitingOn(prefs, deal.id);
      const nextAction =
        nextActionByDealId instanceof Map
          ? nextActionByDealId.get(Number(deal.id)) || null
          : null;
      if (q && !dealSearchHaystack(deal, waiting, nextAction).includes(q)) return false;
      if (stageFilter === '__unstaged__') {
        if (getDealProgressLabel(deal)) return false;
      } else if (stageFilter && getDealProgressLabel(deal) !== stageFilter) {
        return false;
      }
      if (waitingFilter) {
        const labels = waitingOnLabels(waiting).map((l) => l.toLowerCase());
        const defaults = WAITING_DEFAULTS.find((d) => d.id === waitingFilter);
        const needle = (defaults?.label || waitingFilter).toLowerCase();
        if (!labels.includes(needle)) return false;
      }
      return true;
    });
    const partitioned = partitionDeedDeals(matched, prefs);
    console.log('[CrmDeedBoard] saved deals newest-first', {
      newest: partitioned.rest[0]?.name || null,
      savedAt: partitioned.rest[0]?.savedAt || null,
      count: partitioned.rest.length
    });
    return partitioned;
  }, [normalized, prefs, query, stageFilter, waitingFilter, nextActionByDealId, showArchived]);

  const allIds = useMemo(() => normalized.map((d) => d.id), [normalized]);

  const stageOptions = useMemo(() => {
    const set = new Set();
    for (const deal of normalized) {
      if (!showArchived && isPassedOnDeal(deal)) continue;
      if (showArchived && !isPassedOnDeal(deal)) continue;
      const label = getDealProgressLabel(deal);
      if (label) set.add(label);
    }
    return [...set].sort();
  }, [normalized, showArchived]);

  const persist = useCallback((next) => {
    prefsRef.current = next;
    setPrefs(next);
    saveDeedCardPrefs(next, teamBoardId);
    if (!teamBoardId || !writeEnabled) return;
    dirtyRef.current = true;
    if (teamSaveTimerRef.current) clearTimeout(teamSaveTimerRef.current);
    teamSaveTimerRef.current = setTimeout(async () => {
      teamSaveTimerRef.current = null;
      try {
        await teamsAPI.putDeedBoard(teamBoardId, prefsRef.current);
        dirtyRef.current = false;
        console.log('[CrmDeedBoard] team board synced', teamBoardId);
      } catch (err) {
        console.error('[CrmDeedBoard] team board save failed', err);
        alert('Failed to share the team board: ' + (err.message || 'error'));
      }
    }, 450);
  }, [teamBoardId, writeEnabled]);

  useEffect(() => {
    setPrefs(loadDeedCardPrefs(teamBoardId));
  }, [teamBoardId]);

  useEffect(() => {
    if (!teamBoardId) return undefined;
    let cancelled = false;

    const pull = async ({ seedIfEmpty = false } = {}) => {
      try {
        if (dirtyRef.current) {
          if (writeEnabled && !dragDealIdRef.current) {
            await teamsAPI.putDeedBoard(teamBoardId, prefsRef.current);
            dirtyRef.current = false;
            console.log('[CrmDeedBoard] team board retry synced', teamBoardId);
          }
          return;
        }
        if (dragDealIdRef.current) return;
        const data = await teamsAPI.getDeedBoard(teamBoardId);
        if (cancelled) return;
        let next = normalizeDeedCardPrefs(data.prefs);
        const incomingColors = data.prefs?.colors && typeof data.prefs.colors === 'object'
          ? data.prefs.colors
          : {};
        const droppedLegacy = Object.keys(incomingColors).length !== Object.keys(next.colors).length;
        if (seedIfEmpty && isEmptyDeedCardPrefs(next) && writeEnabled) {
          const teamCache = loadDeedCardPrefs(teamBoardId);
          const personal = loadDeedCardPrefs(null);
          const seed = !isEmptyDeedCardPrefs(teamCache) ? teamCache : personal;
          if (!isEmptyDeedCardPrefs(seed)) {
            next = seed;
            await teamsAPI.putDeedBoard(teamBoardId, seed);
            console.log('[CrmDeedBoard] seeded team board from this browser');
          }
        }
        if (cancelled || dirtyRef.current || dragDealIdRef.current) return;
        if (deedCardPrefsFingerprint(next) !== deedCardPrefsFingerprint(prefsRef.current)) {
          console.log('[CrmDeedBoard] team board live update', teamBoardId, {
            pins: Object.keys(next.pins).length,
            order: next.order.length
          });
          prefsRef.current = next;
          setPrefs(next);
          saveDeedCardPrefs(next, teamBoardId);
        }
        if (droppedLegacy && writeEnabled) {
          console.log('[CrmDeedBoard] drop non-aging header colors', incomingColors);
          prefsRef.current = next;
          setPrefs(next);
          saveDeedCardPrefs(next, teamBoardId);
          try {
            await teamsAPI.putDeedBoard(teamBoardId, next);
            dirtyRef.current = false;
            console.log('[CrmDeedBoard] team board colors now age-only');
          } catch (err) {
            console.warn('[CrmDeedBoard] failed to persist age-only colors', err.message);
          }
        }
      } catch (err) {
        console.warn('[CrmDeedBoard] team board load failed', err.message);
      }
    };

    pull({ seedIfEmpty: true });
    const liveTick = () => {
      pull();
      if (!dirtyRef.current && !dragDealIdRef.current) {
        onLiveDealsRefresh?.();
      }
    };
    const onFocus = () => {
      liveTick();
      onRefresh?.();
    };
    window.addEventListener('focus', onFocus);
    const LIVE_SYNC_MS = 30000;
    console.log('[CrmDeedBoard] live sync every', LIVE_SYNC_MS / 1000, 's, paused when tab hidden');
    const stopPoll = pollWhenVisible(liveTick, LIVE_SYNC_MS);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      stopPoll();
      if (teamSaveTimerRef.current) {
        clearTimeout(teamSaveTimerRef.current);
        teamSaveTimerRef.current = null;
        if (dirtyRef.current && writeEnabled) {
          teamsAPI.putDeedBoard(teamBoardId, prefsRef.current).catch((err) => {
            console.warn('[CrmDeedBoard] flush team board failed', err.message);
          });
        }
      }
    };
  }, [onLiveDealsRefresh, onRefresh, teamBoardId, writeEnabled]);

  const ensureOrder = useCallback((list, extraIds = []) => {
    const seen = new Set();
    const next = [];
    for (const id of [...(list || []), ...extraIds]) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      next.push(key);
    }
    return next;
  }, []);

  const summaryFor = useCallback(
    (deal) => getSavedDealCalculatorSummary(deal, calculatorDefaults),
    [calculatorDefaults]
  );

  const openRecord = useCallback((dealId, opts = {}) => {
    onSelectDeal?.(dealId, { openRecord: true, ...opts });
  }, [onSelectDeal]);

  const handleContextMenu = useCallback((e, deal) => {
    if (!deal?.id) return;
    console.log('[CrmDeedBoard] context menu', deal.id, deal.name);
    setCardMenu({ deal, x: e.clientX, y: e.clientY });
  }, []);

  const closeCardMenu = useCallback(() => setCardMenu(null), []);

  const openField = useCallback((deal, type) => {
    setCardMenu(null);
    setModal({ type, dealId: deal.id });
    console.log('[CrmDeedBoard] field modal', type, deal.id);
  }, []);

  const modalDeal = useMemo(() => {
    if (!modal?.dealId) return null;
    return (
      normalized.find((d) => String(d.id) === String(modal.dealId))
      || null
    );
  }, [modal, normalized]);

  const handlePin = useCallback((deal) => {
    if (!writeEnabled) return;
    const key = String(deal.id);
    const nextPins = { ...prefs.pins };
    let nextOrder = ensureOrder(prefs.order, allIds);
    if (nextPins[key]) {
      delete nextPins[key];
    } else {
      nextPins[key] = true;
      nextOrder = ensureOrder([key, ...nextOrder], allIds);
    }
    console.log('[CrmDeedBoard] pin', key, Boolean(nextPins[key]));
    persist({
      ...prefs,
      pins: nextPins,
      order: nextOrder
    });
  }, [allIds, ensureOrder, persist, prefs, writeEnabled]);

  const handlePickColor = useCallback((colorId) => {
    if (!modalDeal || !writeEnabled) return;
    const key = String(modalDeal.id);
    const nextColors = { ...prefs.colors };
    if (!colorId) {
      delete nextColors[key];
      console.log('[CrmDeedBoard] color → age', key);
    } else {
      nextColors[key] = colorId;
      console.log('[CrmDeedBoard] color override', key, colorId);
    }
    persist({
      ...prefs,
      colors: nextColors
    });
    setModal(null);
  }, [modalDeal, persist, prefs, writeEnabled]);

  const handleSaveWaiting = useCallback((waiting) => {
    if (!modalDeal || !writeEnabled) return;
    persist({
      ...prefs,
      waitingOn: { ...prefs.waitingOn, [String(modalDeal.id)]: waiting }
    });
    setModal(null);
  }, [modalDeal, persist, prefs, writeEnabled]);

  const handleStageChange = useCallback(async (e) => {
    const newStage = e.target.value;
    if (!modalDeal?.id || !newStage.trim() || stageSaving) return;
    if (newStage === 'Custom Status') return;
    setStageSaving(true);
    try {
      const result = await crmAPI.updateStage(modalDeal.id, newStage);
      console.log('[CrmDeedBoard] stage', modalDeal.id, newStage);
      onStageChanged?.(result, modalDeal.name);
      onRefresh?.();
      setModal(null);
    } catch (err) {
      alert('Failed to update status: ' + (err.message || 'error'));
    } finally {
      setStageSaving(false);
    }
  }, [modalDeal, onRefresh, onStageChanged, stageSaving]);

  const handleSaveCustomStage = useCallback(async (label) => {
    if (!modalDeal?.id || !writeEnabled || stageSaving) return;
    const trimmed = String(label || '').trim();
    if (!trimmed) {
      alert('Enter a custom status label (e.g. “Waiting on seller P&Ls”).');
      return;
    }
    setStageSaving(true);
    try {
      const result = await crmAPI.updateStage(modalDeal.id, 'Custom Status');
      await dealsAPI.updateDeal(modalDeal.id, { customStageLabel: trimmed });
      console.log('[CrmDeedBoard] custom stage', modalDeal.id, trimmed);
      onStageChanged?.(result, modalDeal.name);
      onRefresh?.();
      setModal(null);
    } catch (err) {
      alert('Failed to save custom status: ' + (err.message || 'error'));
    } finally {
      setStageSaving(false);
    }
  }, [modalDeal, onRefresh, onStageChanged, stageSaving, writeEnabled]);

  const handleCreateTask = useCallback(async (title) => {
    if (!modalDeal?.id) return;
    await crmAPI.createTask(modalDeal.id, {
      title,
      source: 'manual',
      notifyRecipients: [{ type: 'self' }]
    });
    console.log('[CrmDeedBoard] next-step task', modalDeal.id, title);
    onRefresh?.();
    setModal(null);
  }, [modalDeal, onRefresh]);

  const handleArchiveDeal = useCallback(async (deal) => {
    if (!deal?.id || !writeEnabled) return;
    if (isPassedOnDeal(deal)) return;
    if (!window.confirm(`Archive “${deal.name || 'this deal'}”? It will move to Archived (Passed On).`)) return;
    try {
      const result = await crmAPI.updateStage(deal.id, 'Passed On Deal');
      console.log('[CrmDeedBoard] archive', deal.id, deal.name);
      onStageChanged?.(result, deal.name);
      setCardMenu(null);
      onRefresh?.();
    } catch (err) {
      alert('Failed to archive deal: ' + (err.message || 'error'));
    }
  }, [onRefresh, onStageChanged, writeEnabled]);

  const handleDeleteDeal = useCallback(async (deal) => {
    if (!deal?.id || !writeEnabled) return;
    if (!window.confirm(`Delete “${deal.name || 'this deal'}” from Vettr CRM?`)) return;
    try {
      await dealsAPI.deleteDeal(deal.id);
      console.log('[CrmDeedBoard] deleted', deal.id);
      setCardMenu(null);
      onRefresh?.();
    } catch (err) {
      alert('Failed to delete deal: ' + (err.message || 'error'));
    }
  }, [onRefresh, writeEnabled]);

  const cardMenuItems = useMemo(() => {
    const deal = cardMenu?.deal;
    if (!deal) return [];
    const items = [
      { id: 'open', label: 'Open', onSelect: () => openRecord(deal.id) },
      { id: 'status', label: 'Status', onSelect: () => openField(deal, 'status') },
      { id: 'next', label: 'Next step', onSelect: () => openField(deal, 'next') },
      { id: 'metrics', label: 'Metrics', onSelect: () => openField(deal, 'metrics') },
      { id: 'waiting', label: 'Waiting on', onSelect: () => openField(deal, 'waiting') },
      { id: 'color', label: 'Color', onSelect: () => openField(deal, 'color') }
    ];
    if (writeEnabled) {
      items.push({
        id: 'pin',
        label: prefs.pins?.[String(deal.id)] ? 'Unpin' : 'Pin',
        onSelect: () => handlePin(deal)
      });
    }
    if (writeEnabled && !isPassedOnDeal(deal)) {
      items.push({
        id: 'archive',
        label: 'Archive',
        onSelect: () => handleArchiveDeal(deal)
      });
    }
    items.push(
      { id: 'sep-more', separator: true },
      {
        id: 'dd',
        label: 'Due diligence',
        onSelect: () => openRecord(deal.id, { focusSection: 'crm-dd' })
      },
      {
        id: 'calculator',
        label: 'Calculator',
        onSelect: () => openRecord(deal.id, { focusSection: 'calculator' })
      }
    );
    if (deal.url) {
      items.push({
        id: 'listing',
        label: 'Open listing',
        onSelect: () => window.open(deal.url, '_blank', 'noopener,noreferrer')
      });
    }
    if (writeEnabled) {
      items.push({ id: 'sep-del', separator: true });
      items.push({
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: () => handleDeleteDeal(deal)
      });
    }
    return items;
  }, [cardMenu, handleArchiveDeal, handleDeleteDeal, handlePin, openField, openRecord, prefs.pins, writeEnabled]);

  const handleDragStart = (e, dealId) => {
    dragDealIdRef.current = dealId;
    setDragDealId(dealId);
    setDropAt(null);
    e.dataTransfer.setData('text/plain', String(dealId));
    e.dataTransfer.effectAllowed = 'move';
    console.log('[CrmDeedBoard] drag start', dealId);
  };

  const handleDragEnd = () => {
    dragDealIdRef.current = null;
    setDragDealId(null);
    setDropAt(null);
  };

  const commitDrop = useCallback((target) => {
    const fromId = dragDealIdRef.current;
    dragDealIdRef.current = null;
    setDropAt(null);
    setDragDealId(null);
    if (!fromId || !target?.zone || !writeEnabled) return;
    const fromKey = String(fromId);
    const pin = target.zone === 'pinned';
    const alreadyPinned = Boolean(prefs.pins?.[fromKey]);
    const sameSpot = target.anchorId && String(target.anchorId) === fromKey && pin === alreadyPinned;
    if (sameSpot) return;

    const nextPins = { ...prefs.pins };
    if (pin) nextPins[fromKey] = true;
    else delete nextPins[fromKey];

    let nextOrder = prefs.order;
    if (pin) {
      const currentOrder = ensureOrder(
        prefs.order.length ? prefs.order : allIds,
        allIds
      );
      nextOrder = placeDealInOrder(currentOrder, fromKey, {
        beforeId: target.edge === 'before' ? target.anchorId : null,
        afterId: target.edge === 'after' ? target.anchorId : null
      });
    }
    persist({ ...prefs, order: nextOrder, pins: nextPins });
    console.log('[CrmDeedBoard] drop', fromKey, { pin, edge: target.edge, anchor: target.anchorId });
  }, [allIds, ensureOrder, persist, prefs, writeEnabled]);

  const handleSectionDragOver = (e, zone) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!dragDealIdRef.current) return;
    if (closestCard(e.target)) return;
    setDropAt((prev) => {
      if (prev?.zone === zone && prev.edge === 'end' && !prev.anchorId) return prev;
      return { zone, anchorId: null, edge: 'end' };
    });
  };

  const handleSectionDrop = (e, zone) => {
    e.preventDefault();
    if (closestCard(e.target)) return;
    commitDrop(dropAtRef.current?.zone === zone ? dropAtRef.current : { zone, anchorId: null, edge: 'end' });
  };

  const handleCardDragOver = (e, dealId, zone) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (!dragDealIdRef.current || String(dragDealIdRef.current) === String(dealId)) return;
    if (zone === 'rest') {
      setDropAt((prev) => {
        if (prev?.zone === 'rest' && prev.edge === 'end' && !prev.anchorId) return prev;
        return { zone: 'rest', anchorId: null, edge: 'end' };
      });
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const edge = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
    setDropAt((prev) => {
      if (prev?.zone === zone && String(prev.anchorId) === String(dealId) && prev.edge === edge) return prev;
      return { zone, anchorId: String(dealId), edge };
    });
  };

  const handleCardDrop = (e, zone) => {
    e.preventDefault();
    e.stopPropagation();
    commitDrop(dropAtRef.current?.zone === zone ? dropAtRef.current : { zone, anchorId: null, edge: 'end' });
  };

  const renderCard = (deal, zone) => {
    const id = deal.id;
    const nextAction =
      nextActionByDealId instanceof Map
        ? nextActionByDealId.get(Number(id)) || null
        : null;
    const colorId = prefs.colors?.[String(id)] || null;
    const hovering = dropAt?.zone === zone && String(dropAt.anchorId) === String(id);
    return (
      <CrmDeedCard
        key={id}
        deal={deal}
        summary={summaryFor(deal)}
        nextAction={nextAction}
        waiting={getWaitingOn(prefs, id)}
        overdueDealIds={overdueDealIds}
        colorId={colorId}
        pinned={Boolean(prefs.pins?.[String(id)])}
        unseen={Boolean(deal.unseenFromTeam) && !locallySeenDealIds?.has(String(id))}
        selected={selectedDealId != null && String(selectedDealId) === String(id)}
        dragging={String(dragDealId) === String(id)}
        dropTarget={hovering}
        writeEnabled={writeEnabled}
        onOpen={openRecord}
        onContextMenu={handleContextMenu}
        onOpenField={(type) => openField(deal, type)}
        onPin={() => handlePin(deal)}
        onArchive={() => handleArchiveDeal(deal)}
        onDragStart={(e) => handleDragStart(e, id)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleCardDragOver(e, id, zone)}
        onDrop={(e) => handleCardDrop(e, zone)}
      />
    );
  };

  const renderPlaceholder = (_zone, key, label) => (
    <div key={key} className="crm-deed-board__placeholder" aria-hidden="true">
      {label}
    </div>
  );

  const renderGrid = (deals, zone) => {
    const nodes = [];
    const pinLabel = zone === 'pinned' ? 'Pin here' : 'Unpin here';
    for (const deal of deals) {
      const isAnchor = dropAt?.zone === zone && String(dropAt.anchorId) === String(deal.id);
      const showBefore = Boolean(dragDealId) && isAnchor && dropAt.edge === 'before';
      const showAfter = Boolean(dragDealId) && isAnchor && dropAt.edge === 'after';
      if (showBefore) nodes.push(renderPlaceholder(zone, `ph-b-${deal.id}`, pinLabel));
      nodes.push(renderCard(deal, zone));
      if (showAfter) nodes.push(renderPlaceholder(zone, `ph-a-${deal.id}`, pinLabel));
    }
    const showEnd = Boolean(dragDealId) && dropAt?.zone === zone && dropAt.edge === 'end';
    if (showEnd) nodes.push(renderPlaceholder(zone, `ph-end-${zone}`, pinLabel));
    return nodes;
  };

  const pinnedDeals = orderedDeals.pinned;
  const restDeals = orderedDeals.rest;
  const visibleCount = pinnedDeals.length + restDeals.length;
  const hasFilters = Boolean(query.trim() || stageFilter || waitingFilter);
  const boardEmpty = normalized.length === 0;
  const matchEmpty = !boardEmpty && visibleCount === 0;
  const dragging = Boolean(dragDealId);

  const bannerFull = isTeamMode ? (
    <>
      <strong>Team board.</strong> Pins, order, color, and waiting-on are shared with{' '}
      {activeTeam?.name || 'the team'}. Saved deals are newest first. Drop a card into{' '}
      <strong>Pinned</strong> to keep it up front — teammates see the same pins.
    </>
  ) : (
    <>
      <strong>Personal board.</strong> Saved deals are newest first. Drag a card into{' '}
      <strong>Pinned</strong> to keep it up front. Drop it on Saved deals to unpin.
      Passed-on deals are archived.
    </>
  );
  const bannerViewer = writeEnabled ? '' : ' Viewer role — cards are read-only.';
  const bannerSummary = isTeamMode
    ? (
      <>
        <strong>Team board.</strong>
        {' '}
        Shared with
        {' '}
        {activeTeam?.name || 'the team'}
        .
        {bannerViewer}
      </>
    )
    : (
      <>
        <strong>Personal board.</strong>
        {' '}
        Pins stay up front; passed-on deals are archived.
        {bannerViewer}
      </>
    );

  return (
    <div className={`crm-deed-board${dragging ? ' crm-deed-board--dragging' : ''}`}>
      {/* Desktop: full blurb. Mobile: one-line summary + disclose (CSS toggles). */}
      <div className="crm-deed-board__banner crm-deed-board__banner--desktop" role="note">
        {bannerFull}
        {bannerViewer}
      </div>
      <details className="crm-deed-board__banner crm-deed-board__banner--mobile">
        <summary className="crm-deed-board__banner-summary">
          <span className="crm-deed-board__banner-summary-text">{bannerSummary}</span>
          <span className="crm-deed-board__banner-more-label" aria-hidden="true">More</span>
        </summary>
        <p className="crm-deed-board__banner-details">
          {bannerFull}
          {bannerViewer}
        </p>
      </details>

      <div className="crm-deed-board__toolbar">
        <label className="crm-deed-board__search">
          <input
            type="search"
            className="modal-input"
            placeholder="Search deals…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              console.log('[CrmDeedBoard] search', e.target.value);
            }}
            aria-label="Search deal cards"
          />
        </label>
        <div className="crm-deed-board__filters">
          <select
            className="modal-input"
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="__unstaged__">Unstaged</option>
            {stageOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <select
            className="modal-input"
            value={waitingFilter}
            onChange={(e) => setWaitingFilter(e.target.value)}
            aria-label="Filter by waiting on"
          >
            <option value="">Waiting on: all</option>
            {WAITING_DEFAULTS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          {hasFilters ? (
            <button
              type="button"
              className="btn-secondary crm-deed-board__clear"
              onClick={() => {
                setQuery('');
                setStageFilter('');
                setWaitingFilter('');
                console.log('[CrmDeedBoard] clear filters');
              }}
            >
              Clear
            </button>
          ) : null}
        </div>
        {archivedCount > 0 ? (
          <button
            type="button"
            className={`btn-secondary crm-deed-board__archive-btn${showArchived ? ' crm-deed-board__archive-btn--on' : ''}`}
            aria-pressed={showArchived}
            onClick={() => {
              const next = !showArchived;
              setShowArchived(next);
              setStageFilter('');
              console.log('[CrmDeedBoard] archive', next, archivedCount);
            }}
          >
            {showArchived ? 'Back to active' : `Archived (${archivedCount})`}
          </button>
        ) : null}
        <span className="crm-kanban-count crm-deed-board__count">
          {showArchived
            ? `${visibleCount}${hasFilters ? ` of ${archivedCount}` : ''} archived`
            : `${visibleCount}${hasFilters ? ` of ${activeCount}` : ''} deals`}
          {!showArchived && pinnedDeals.length > 0 ? ` · ${pinnedDeals.length} pinned` : ''}
        </span>
        {typeof onAddDeal === 'function' ? (
          <button type="button" className="btn-primary crm-deed-board__add-deal" onClick={onAddDeal}>
            Add deal
          </button>
        ) : null}
        <DealAgeLegend title="Listing age by date added" />
      </div>

      {boardEmpty ? (
        <div className="crm-empty">
          <h2>No deals for Cards yet</h2>
          <p>Save a listing from Deal Aggregator, then come back to this test view.</p>
        </div>
      ) : matchEmpty ? (
        <div className="crm-empty">
          <h2>No matching cards</h2>
          <p>
            {showArchived
              ? 'No archived (passed on) deals match.'
              : 'Try a different search, or open Archived for passed-on deals.'}
          </p>
        </div>
      ) : (
        <>
          <section
            className={`crm-deed-board__section${dropAt?.zone === 'pinned' ? ' crm-deed-board__section--drop' : ''}`}
            aria-label="Pinned deals"
            onDragOver={(e) => handleSectionDragOver(e, 'pinned')}
            onDrop={(e) => handleSectionDrop(e, 'pinned')}
          >
            <h2 className="crm-deed-board__section-title">
              Pinned <span>{pinnedDeals.length}</span>
            </h2>
            <div className="crm-deed-board__grid">
              {renderGrid(pinnedDeals, 'pinned')}
              {pinnedDeals.length === 0 && !dragging ? (
                <p className="crm-deed-board__pin-hint">Drag a card here to pin it.</p>
              ) : null}
            </div>
          </section>
          {restDeals.length > 0 ? (
            <section
              className={`crm-deed-board__section${dropAt?.zone === 'rest' ? ' crm-deed-board__section--drop' : ''}`}
              aria-label={showArchived ? 'Archived deals' : 'Saved deals'}
              onDragOver={(e) => handleSectionDragOver(e, 'rest')}
              onDrop={(e) => handleSectionDrop(e, 'rest')}
            >
              <h2 className="crm-deed-board__section-title">
                {showArchived
                  ? (pinnedDeals.length > 0 ? 'Other archived' : 'Archived')
                  : 'Saved deals'}{' '}
                <span>{restDeals.length}</span>
                {!showArchived ? (
                  <>
                    {' '}
                    <span className="crm-deed-board__section-hint">Newest first</span>
                  </>
                ) : null}
              </h2>
              <div className="crm-deed-board__grid">
                {renderGrid(restDeals, 'rest')}
              </div>
            </section>
          ) : null}
        </>
      )}

      {cardMenu ? (
        <CrmCardContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          items={cardMenuItems}
          onClose={closeCardMenu}
        />
      ) : null}

      <CrmDeedModals
        modal={modal?.type || null}
        deal={modalDeal}
        summary={modalDeal ? summaryFor(modalDeal) : null}
        nextAction={
          modalDeal && nextActionByDealId instanceof Map
            ? nextActionByDealId.get(Number(modalDeal.id)) || null
            : null
        }
        waiting={modalDeal ? getWaitingOn(prefs, modalDeal.id) : null}
        colorId={modalDeal ? (prefs.colors?.[String(modalDeal.id)] || null) : null}
        writeEnabled={writeEnabled}
        stageSaving={stageSaving}
        onClose={() => setModal(null)}
        onStageChange={handleStageChange}
        onSaveCustomStage={handleSaveCustomStage}
        onCreateTask={handleCreateTask}
        onOpenTasks={() => {
          if (!modalDeal) return;
          setModal(null);
          openRecord(modalDeal.id, { focusSection: 'crm-followup' });
        }}
        onOpenCalculator={() => {
          if (!modalDeal) return;
          setModal(null);
          openRecord(modalDeal.id, { focusSection: 'calculator' });
        }}
        onSaveWaiting={handleSaveWaiting}
        onPickColor={handlePickColor}
      />
    </div>
  );
}
