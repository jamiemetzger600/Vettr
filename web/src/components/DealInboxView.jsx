import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import DealDetailsPanel from './DealDetailsPanel';
import {
  cardMetricLocation,
  cardViewDescriptionPreview,
  formatDealDate,
  formatMoneyShort,
  getListingAgeClass,
  listingAgeTitle
} from '../utils/dealCardDisplay';
import { defaultBuyBoxSlotName } from '../utils/buyBoxes';
import { useCrmStageControl } from '../hooks/useCrmStageControl';

function dealKey(deal) {
  return deal?.id != null ? String(deal.id) : '';
}

/**
 * Email-style triage list for Aggregator Matches.
 * Desktop: fixed split pane; list order stays stable (j/k moves highlight only).
 * Mobile: Gmail-style list → full-screen deal; drawer for Settings / Buy Box / CRM.
 */
export default function DealInboxView({
  deals = [],
  emptyMessage = 'No deals to show.',
  isDealSaved,
  isDealHidden,
  savingDealId = null,
  onHide,
  onToggleSave,
  saveTargetLabel = 'Vettr CRM',
  showHiddenMode = false,
  isGuest = false,
  entitlements = null,
  requireSignup = null,
  settings = null,
  onSaveCalculatorDefaults = null,
  onIOIPrefsSaved = null,
  dealPanelPosition = 'center',
  onDealPanelPositionChange = null,
  onSaveDeal = null,
  onUnsaveDeal = null,
  isMobile = false,
  onConfigureBuyBox = null,
  onOpenCrm = null,
  buyBoxes = null,
  activeBuyBoxIndex = 0,
  onSelectBuyBox = null,
  buyBoxSwitching = false,
  lookupCrmMeta = null,
  ensureDealSaved = null,
  onCrmStageSynced = null,
  onIOISent = null
}) {
  const [selectedId, setSelectedId] = useState(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const listRef = useRef(null);
  const savedScrollRef = useRef(0);
  const edgeTouchRef = useRef(null);

  const selectedDeal = useMemo(() => {
    if (!selectedId) return null;
    return deals.find((d) => dealKey(d) === selectedId) || null;
  }, [deals, selectedId]);

  const selectedCrmMeta = useMemo(
    () => (typeof lookupCrmMeta === 'function' ? lookupCrmMeta(selectedDeal) : null),
    [lookupCrmMeta, selectedDeal]
  );
  const [openedIds, setOpenedIds] = useState(() => new Set());

  const markOpened = useCallback((id) => {
    if (!id) return;
    setOpenedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const headerProgressControl = useCrmStageControl({
    deal: selectedDeal,
    crmMeta: selectedCrmMeta,
    ensureSaved: ensureDealSaved,
    isGuest,
    requireSignup,
    onSynced: onCrmStageSynced
  });

  const listDeals = deals;

  // Desktop: keep a selection. Mobile: no auto-select (list-first).
  useEffect(() => {
    if (isMobile) {
      if (selectedId && !deals.some((d) => dealKey(d) === selectedId)) {
        setSelectedId(null);
        setMobileDetailOpen(false);
      }
      return;
    }
    if (deals.length === 0) {
      setSelectedId(null);
      return;
    }
    if (selectedId && deals.some((d) => dealKey(d) === selectedId)) return;
    const firstId = dealKey(deals[0]);
    setSelectedId(firstId);
    markOpened(firstId);
  }, [deals, selectedId, isMobile, markOpened]);

  const selectByOffset = useCallback(
    (delta) => {
      if (isMobile || deals.length === 0) return;
      const idx = deals.findIndex((d) => dealKey(d) === selectedId);
      const base = idx >= 0 ? idx : 0;
      const nextIdx = (base + delta + deals.length) % deals.length;
      const next = deals[nextIdx];
      if (next) {
        const nextId = dealKey(next);
        console.log('[DealInboxView] next deal', nextId);
        setSelectedId(nextId);
        markOpened(nextId);
      }
    },
    [deals, selectedId, isMobile, markOpened]
  );

  const dismissDeal = useCallback(
    (deal) => {
      if (!deal || typeof onHide !== 'function') return;
      const idx = deals.findIndex((d) => dealKey(d) === dealKey(deal));
      const next = deals[idx + 1] || deals[idx - 1] || null;
      console.log('[DealInboxView] dismiss', dealKey(deal), '→ next', next ? dealKey(next) : null);
      if (!showHiddenMode) {
        if (isMobile) {
          if (next) {
            const nextId = dealKey(next);
            setSelectedId(nextId);
            markOpened(nextId);
            // stay in detail on mobile after dismiss
          } else {
            setSelectedId(null);
            setMobileDetailOpen(false);
          }
        } else {
          const nextId = next ? dealKey(next) : null;
          setSelectedId(nextId);
          markOpened(nextId);
        }
      }
      onHide(deal);
    },
    [deals, onHide, showHiddenMode, isMobile, markOpened]
  );

  const openMobileDeal = useCallback((id) => {
    savedScrollRef.current = listRef.current?.scrollTop ?? 0;
    console.log('[DealInboxView] open mobile deal', id, 'scroll', savedScrollRef.current);
    setSelectedId(id);
    markOpened(id);
    setMobileDetailOpen(true);
    setDrawerOpen(false);
  }, [markOpened]);

  const backToList = useCallback(() => {
    setMobileDetailOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (listRef.current) {
          listRef.current.scrollTop = savedScrollRef.current;
          console.log('[DealInboxView] restore scroll', savedScrollRef.current);
        }
      });
    });
  }, []);

  useEffect(() => {
    if (isMobile) return undefined;
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        selectByOffset(1);
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        selectByOffset(-1);
      } else if (e.key === 'e' || e.key === 'Backspace') {
        if (!selectedDeal) return;
        e.preventDefault();
        dismissDeal(selectedDeal);
      } else if (e.key === 's' || e.key === 'S') {
        if (!selectedDeal || typeof onToggleSave !== 'function') return;
        e.preventDefault();
        onToggleSave(selectedDeal);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, selectByOffset, dismissDeal, selectedDeal, onToggleSave]);

  // Keep the highlighted row in view without reshuffling the list.
  useEffect(() => {
    if (isMobile || !selectedId || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-deal-id="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedId, isMobile]);

  // Left-edge swipe to open drawer (mobile).
  useEffect(() => {
    if (!isMobile) return undefined;
    const onStart = (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      if (t.clientX <= 28 && !mobileDetailOpen) {
        edgeTouchRef.current = { x: t.clientX, y: t.clientY };
      } else {
        edgeTouchRef.current = null;
      }
    };
    const onMove = (e) => {
      const start = edgeTouchRef.current;
      const t = e.touches?.[0];
      if (!start || !t) return;
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (dx > 56 && dy < 40) {
        edgeTouchRef.current = null;
        setDrawerOpen(true);
      }
    };
    const onEnd = () => {
      edgeTouchRef.current = null;
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
  }, [isMobile, mobileDetailOpen]);

  const renderRow = (deal) => {
    const id = dealKey(deal);
    const active = !isMobile && id === selectedId;
    const saved = typeof isDealSaved === 'function' ? isDealSaved(deal) : false;
    const hidden = typeof isDealHidden === 'function' ? isDealHidden(deal) : false;
    const loc = cardMetricLocation(deal);
    const desc = cardViewDescriptionPreview(deal.description, 1);
    const unread = !openedIds.has(id);
    const selectDeal = () => {
      setSelectedId(id);
      markOpened(id);
    };

    if (isMobile) {
      return (
        <li key={id}>
          <div
            data-deal-id={id}
            className={`deal-inbox__gmail-row${hidden ? ' deal-inbox__gmail-row--hidden' : ''}${unread ? ' is-unread' : ''}`}
            onClick={() => openMobileDeal(id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openMobileDeal(id);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="deal-inbox__gmail-body">
              <div className="deal-inbox__gmail-top">
                <span className="deal-inbox__gmail-title">{deal.name || 'Unnamed Business'}</span>
                <span
                  className={`deal-inbox__date ${getListingAgeClass(deal.discoveredAt)}`}
                  title={listingAgeTitle(deal.discoveredAt, { source: deal.source, sourceUpdatedAt: deal.sourceUpdatedAt })}
                >
                  {formatDealDate(deal.discoveredAt)}
                </span>
              </div>
              <div className="deal-inbox__gmail-subject">
                {formatMoneyShort(deal.askingPrice)}
                {' · '}
                {formatMoneyShort(deal.ebitda)} CF
                {loc ? ` · ${loc.value}` : ''}
              </div>
              <p className="deal-inbox__gmail-snippet">{desc.preview || 'No description'}</p>
            </div>
            <button
              type="button"
              className={`deal-inbox__star${saved ? ' deal-inbox__star--on' : ''}`}
              aria-label={saved ? `Remove from ${saveTargetLabel}` : `Save to ${saveTargetLabel}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave?.(deal);
              }}
              disabled={savingDealId === deal.id}
            >
              {saved ? '★' : '☆'}
            </button>
          </div>
        </li>
      );
    }

    return (
      <li key={id} role="option" aria-selected={active}>
        <div
          data-deal-id={id}
          className={[
            'deal-inbox__gmail-row',
            'deal-inbox__gmail-row--desktop',
            active ? 'is-active' : '',
            unread ? 'is-unread' : '',
            hidden ? 'deal-inbox__gmail-row--hidden' : ''
          ].filter(Boolean).join(' ')}
          onClick={selectDeal}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectDeal();
            }
          }}
          role="button"
          tabIndex={0}
        >
          <div className="deal-inbox__gmail-body">
            <div className="deal-inbox__gmail-top">
              <span className="deal-inbox__gmail-title">{deal.name || 'Unnamed Business'}</span>
              <span
                className={`deal-inbox__date ${getListingAgeClass(deal.discoveredAt)}`}
                title={listingAgeTitle(deal.discoveredAt, { source: deal.source, sourceUpdatedAt: deal.sourceUpdatedAt })}
              >
                {formatDealDate(deal.discoveredAt)}
              </span>
            </div>
            <div className="deal-inbox__gmail-subject">
              {formatMoneyShort(deal.askingPrice)}
              {' · '}
              {formatMoneyShort(deal.ebitda)} CF
              {loc ? ` · ${loc.value}` : ''}
              {saved ? ' · Saved' : ''}
            </div>
            <p className="deal-inbox__gmail-snippet">{desc.preview || 'No description'}</p>
          </div>
          <div className="deal-inbox__row-side">
            <button
              type="button"
              className={`deal-inbox__star${saved ? ' deal-inbox__star--on' : ''}`}
              aria-label={saved ? `Remove from ${saveTargetLabel}` : `Save to ${saveTargetLabel}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSave?.(deal);
              }}
              disabled={savingDealId === deal.id}
            >
              {saved ? '★' : '☆'}
            </button>
            <button
              type="button"
              className="deal-inbox__hover-archive"
              onClick={(e) => {
                e.stopPropagation();
                dismissDeal(deal);
              }}
              title={hidden && showHiddenMode ? 'Unhide' : 'Hide from Matches (e)'}
            >
              {hidden && showHiddenMode ? 'Unhide' : 'Hide'}
            </button>
          </div>
        </div>
      </li>
    );
  };

  const detailPanel = selectedDeal ? (
    <DealDetailsPanel
      panelOnly
      isOpen
      deal={selectedDeal}
      position={dealPanelPosition}
      onClose={isMobile ? backToList : () => {}}
      onSaveDeal={onSaveDeal}
      onUnsaveDeal={onUnsaveDeal}
      isSavingDeal={savingDealId != null && selectedDeal?.id === savingDealId}
      dealSavedInMyDeals={isDealSaved?.(selectedDeal) || false}
      saveButtonLabel={`Save to ${saveTargetLabel}`}
      unsaveButtonTitle={`Click to remove from ${saveTargetLabel}`}
      onPositionChange={onDealPanelPositionChange}
      showPositionToggle={false}
      settings={settings}
      onSaveCalculatorDefaults={onSaveCalculatorDefaults}
      onIOIPrefsSaved={onIOIPrefsSaved}
      isGuest={isGuest}
      entitlements={entitlements}
      requireSignup={requireSignup}
      headerProgressControl={headerProgressControl}
      onIOISent={(text) => onIOISent?.(text, selectedDeal)}
    />
  ) : null;

  if (isMobile) {
    return (
      <div className={`deal-inbox deal-inbox--mobile${drawerOpen ? ' deal-inbox--drawer-open' : ''}`}>
        <div
          className="deal-inbox__edge-zone"
          aria-hidden="true"
          onClick={() => setDrawerOpen(true)}
        />

        <header className="deal-inbox__mobile-bar">
          <button
            type="button"
            className="deal-inbox__menu-btn"
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            ☰
          </button>
          <h2 className="deal-inbox__mobile-heading">Inbox</h2>
          <span className="deal-inbox__mobile-count">{deals.length}</span>
        </header>

        <div
          className={`deal-inbox__list-pane${mobileDetailOpen ? ' deal-inbox__list-pane--buried' : ''}`}
        >
          {deals.length === 0 ? (
            <div className="deal-inbox__empty">{emptyMessage}</div>
          ) : (
            <ul className="deal-inbox__list deal-inbox__list--gmail" ref={listRef} aria-label="Deal inbox">
              {listDeals.map(renderRow)}
            </ul>
          )}
        </div>

        {mobileDetailOpen && selectedDeal ? (
          <div className="deal-inbox__mobile-detail" role="dialog" aria-label="Deal details">
            <div className="deal-inbox__mobile-detail-bar">
              <button type="button" className="deal-inbox__back-btn" onClick={backToList}>
                ← Inbox
              </button>
              <div className="deal-inbox__mobile-detail-actions">
                <button
                  type="button"
                  className="btn-secondary btn-secondary--sm deal-inbox__action--dismiss"
                  onClick={() => dismissDeal(selectedDeal)}
                >
                  {isDealHidden?.(selectedDeal) && showHiddenMode ? 'Unhide' : 'Dismiss'}
                </button>
                <button
                  type="button"
                  className="btn-primary btn-secondary--sm"
                  onClick={() => onToggleSave?.(selectedDeal)}
                  disabled={savingDealId === selectedDeal.id}
                >
                  {isDealSaved?.(selectedDeal) ? 'Saved' : 'Save'}
                </button>
              </div>
            </div>
            {detailPanel}
          </div>
        ) : null}

        {drawerOpen ? (
          <button
            type="button"
            className="deal-inbox__drawer-backdrop"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
        ) : null}

        <aside
          className={`deal-inbox__drawer${drawerOpen ? ' deal-inbox__drawer--open' : ''}`}
          aria-hidden={!drawerOpen}
        >
          <div className="deal-inbox__drawer-brand">Vettr</div>
          <nav className="deal-inbox__drawer-nav" aria-label="Inbox menu">
            <button
              type="button"
              className="deal-inbox__drawer-item deal-inbox__drawer-item--active"
              onClick={() => setDrawerOpen(false)}
            >
              <span>Inbox</span>
              <span className="deal-inbox__drawer-count">{deals.length}</span>
            </button>
            <div className="deal-inbox__drawer-section">Buy boxes</div>
            {Array.isArray(buyBoxes) && buyBoxes.length > 0
              ? buyBoxes.map((slot, i) => {
                  const label = slot?.name?.trim() || defaultBuyBoxSlotName(i);
                  const isActive = i === activeBuyBoxIndex;
                  return (
                    <button
                      key={`bb-${i}`}
                      type="button"
                      className={`deal-inbox__drawer-item${isActive ? ' deal-inbox__drawer-item--active' : ''}`}
                      disabled={buyBoxSwitching || typeof onSelectBuyBox !== 'function'}
                      onClick={() => {
                        setDrawerOpen(false);
                        onSelectBuyBox?.(i);
                      }}
                    >
                      <span>{label}</span>
                      {isActive ? <span className="deal-inbox__drawer-count">Active</span> : null}
                    </button>
                  );
                })
              : null}
            {typeof onConfigureBuyBox === 'function' ? (
              <button
                type="button"
                className="deal-inbox__drawer-item deal-inbox__drawer-item--muted"
                onClick={() => {
                  setDrawerOpen(false);
                  onConfigureBuyBox();
                }}
              >
                Configure buy box…
              </button>
            ) : null}
            <div className="deal-inbox__drawer-section">Workspace</div>
            {typeof onOpenCrm === 'function' ? (
              <button
                type="button"
                className="deal-inbox__drawer-item"
                onClick={() => {
                  setDrawerOpen(false);
                  console.log('[DealInboxView] open CRM from drawer');
                  onOpenCrm();
                }}
              >
                Vettr CRM
              </button>
            ) : null}
            <Link
              to="/settings"
              className="deal-inbox__drawer-item"
              onClick={() => setDrawerOpen(false)}
            >
              Settings
            </Link>
          </nav>
        </aside>
      </div>
    );
  }

  const unreadCount = deals.filter((d) => !openedIds.has(dealKey(d))).length;

  return (
    <div className="deal-inbox deal-inbox--desktop">
      <div className="deal-inbox__list-pane">
        <div className="deal-inbox__list-hint">
          {deals.length > 0
            ? `${unreadCount} unread · ↑↓ or j/k next · e hide · s save`
            : '↑↓ or j/k next · e hide · s save'}
        </div>
        {deals.length === 0 ? (
          <div className="deal-inbox__empty">{emptyMessage}</div>
        ) : (
          <ul className="deal-inbox__list" ref={listRef} role="listbox" aria-label="Deal inbox">
            {listDeals.map(renderRow)}
          </ul>
        )}
      </div>

      <div className="deal-inbox__read-pane">
        {selectedDeal ? (
          <>
            <div className="deal-inbox__read-toolbar">
              <button
                type="button"
                className="btn-secondary btn-secondary--sm deal-inbox__action--dismiss"
                onClick={() => dismissDeal(selectedDeal)}
              >
                {isDealHidden?.(selectedDeal) && showHiddenMode ? 'Unhide' : 'Dismiss'}
              </button>
              <button
                type="button"
                className="btn-primary btn-secondary--sm"
                onClick={() => onToggleSave?.(selectedDeal)}
                disabled={savingDealId === selectedDeal.id}
              >
                {isDealSaved?.(selectedDeal) ? 'Saved' : `Save to ${saveTargetLabel}`}
              </button>
            </div>
            {detailPanel}
          </>
        ) : (
          <div className="deal-inbox__read-empty">
            <p>Select a deal to review</p>
            <p className="deal-inbox__read-empty-hint">Dismiss removes it from Matches in Table, Card, and Inbox.</p>
          </div>
        )}
      </div>
    </div>
  );
}
