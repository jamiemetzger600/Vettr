import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import GatedPreviewText from './GatedPreviewText';
import { useSwipeGesture, FLY_MS, SNAP_MS } from '../hooks/useSwipeGesture';
import {
  cardMetricLocation,
  cardViewDescriptionPreview,
  formatMoneyShort,
  formatRatio,
  formatDealDate,
  getListingAgeClass,
  listingAgeTitle,
} from '../utils/dealCardDisplay';

const PREFETCH_THRESHOLD = 5;

function DealSwipeCard({
  deal,
  isPortrait,
  isGuest,
  entitlements,
  requireSignup,
  onOpenDetails,
  isTop,
  stackIndex,
  swipe = null,
}) {
  const descCard = cardViewDescriptionPreview(deal.description, isPortrait ? 4 : 3);
  const cardLoc = cardMetricLocation(deal);
  const peekBoost = isTop ? 0 : (swipe?.dragProgress || 0) * 0.04;
  const scale = isTop ? 1 : 1 - stackIndex * 0.04 + peekBoost;
  const translateY = isTop ? 0 : stackIndex * 8 - (swipe?.dragProgress || 0) * 4;
  const zIndex = 10 - stackIndex;
  const opacity = isTop ? 1 : 0.85 - stackIndex * 0.15;

  const stackTransform = `scale(${scale}) translateY(${translateY}px)`;
  const dragTransform = isTop && swipe
    ? `translate(${swipe.dragX}px, ${swipe.dragY}px) rotate(${swipe.rotate}deg)`
    : stackTransform;

  const transition = isTop && swipe
    ? (swipe.animating ? `transform ${swipe.flyOff ? FLY_MS : SNAP_MS}ms ease-out` : 'none')
    : 'transform 0.28s ease-out';

  return (
    <div
      ref={isTop ? swipe?.cardRef : undefined}
      className={`deal-swipe-card-outer${isTop ? ' deal-swipe-card-outer--active' : ''}${!isPortrait ? ' deal-swipe-card-outer--landscape' : ''}`}
      style={{
        transform: dragTransform,
        transition,
        zIndex,
        opacity: isTop ? 1 : opacity,
        pointerEvents: isTop ? 'auto' : 'none',
      }}
    >
      <div
        className={`deal-swipe-card${!isPortrait ? ' deal-swipe-card--landscape' : ''}`}
        role={isTop ? 'button' : undefined}
        tabIndex={isTop ? 0 : -1}
        onKeyDown={isTop ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpenDetails(deal);
          }
        } : undefined}
      >
        {isTop && swipe ? (
          <>
            <div className="deal-swipe-card-overlay deal-swipe-card-overlay--nope" style={{ opacity: swipe.nopeOpacity }} aria-hidden="true">
              Nope
            </div>
            <div className="deal-swipe-card-overlay deal-swipe-card-overlay--like" style={{ opacity: swipe.likeOpacity }} aria-hidden="true">
              Like
            </div>
          </>
        ) : null}
        <div className="deal-swipe-card__body">
          <div className="deal-swipe-card__main">
            <h3 className="deal-swipe-card__name">{deal.name || 'Unnamed Business'}</h3>
            <div className="deal-swipe-card__date">
              <span className={`deal-date-age ${getListingAgeClass(deal.discoveredAt)}`} title={listingAgeTitle(deal.discoveredAt, { source: deal.source, sourceUpdatedAt: deal.sourceUpdatedAt })}>
                {formatDealDate(deal.discoveredAt)}
              </span>
            </div>
            <div className="deal-swipe-card__metrics">
              <div className="deal-swipe-card__metric">
                <span className="deal-swipe-card__metric-value">{formatMoneyShort(deal.askingPrice)}</span>
                <span className="deal-swipe-card__metric-label">Asking</span>
              </div>
              <div className="deal-swipe-card__metric">
                <span className="deal-swipe-card__metric-value">{formatMoneyShort(deal.ebitda)}</span>
                <span className="deal-swipe-card__metric-label">Cash Flow</span>
              </div>
              <div className="deal-swipe-card__metric">
                <span className="deal-swipe-card__metric-value">{formatMoneyShort(deal.revenue)}</span>
                <span className="deal-swipe-card__metric-label">Revenue</span>
              </div>
              <div className="deal-swipe-card__metric">
                <span className="deal-swipe-card__metric-value">
                  {deal.profitMultiple != null ? `${formatRatio(deal.profitMultiple)}×` : '—'}
                </span>
                <span className="deal-swipe-card__metric-label">Multiple</span>
              </div>
              {cardLoc && (
                <div className="deal-swipe-card__metric">
                  <span className="deal-swipe-card__metric-value" title={cardLoc.value}>{cardLoc.value}</span>
                  <span className="deal-swipe-card__metric-label">{cardLoc.label}</span>
                </div>
              )}
            </div>
          </div>
          <div className="deal-swipe-card__desc-col">
            <p className="deal-swipe-card__subtitle" title={descCard.full || undefined}>
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
                descCard.preview || 'No description available.'
              )}
            </p>
            {deal.industry ? (
              <p className="deal-swipe-card__industry">{deal.industry}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DealSwipeDeck({
  deals,
  deckScope = 'all',
  isPortrait = true,
  orientationKey = 'portrait',
  totalFromAPI = 0,
  isFetching = false,
  isGuest = false,
  entitlements = null,
  requireSignup = null,
  onHide,
  onSave,
  onPass,
  onOpenDetails,
  onNeedMore,
  onShowAllMatches,
}) {
  const [queue, setQueue] = useState(deals);
  const dealsKeyRef = useRef('');
  const topDealRef = useRef(null);
  const pendingDealRef = useRef(null);
  const actionLockRef = useRef(false);
  const actionLockTimerRef = useRef(null);
  const [actionLock, setActionLock] = useState(false);

  useEffect(() => {
    const key = deals.map((d) => d.id).join('|');
    if (key === dealsKeyRef.current) {
      if (deals.length > queue.length) {
        const queueIds = new Set(queue.map((d) => d.id));
        const appended = deals.filter((d) => !queueIds.has(d.id));
        if (appended.length > 0) {
          setQueue((prev) => [...prev, ...appended]);
        }
      }
      return;
    }
    dealsKeyRef.current = key;
    setQueue((prev) => {
      const incomingIds = new Set(deals.map((d) => d.id));
      const kept = prev.filter((d) => incomingIds.has(d.id));
      if (kept.length === 0) return deals;
      const keptIds = new Set(kept.map((d) => d.id));
      const appended = deals.filter((d) => !keptIds.has(d.id));
      return appended.length > 0 ? [...kept, ...appended] : kept;
    });
  }, [deals, queue.length]);

  const remaining = queue.length;
  const visibleStack = useMemo(() => queue.slice(0, 3), [queue]);
  const topDeal = queue[0] || null;
  topDealRef.current = topDeal;

  useEffect(() => {
    if (remaining > 0 && remaining <= PREFETCH_THRESHOLD && typeof onNeedMore === 'function') {
      onNeedMore();
    }
  }, [remaining, onNeedMore]);

  const lockActions = useCallback(() => {
    if (actionLockRef.current) {
      console.log('[DealSwipeDeck] duplicate action ignored');
      return false;
    }
    actionLockRef.current = true;
    setActionLock(true);
    if (actionLockTimerRef.current) window.clearTimeout(actionLockTimerRef.current);
    actionLockTimerRef.current = window.setTimeout(() => {
      actionLockRef.current = false;
      setActionLock(false);
      actionLockTimerRef.current = null;
    }, FLY_MS + 200);
    return true;
  }, []);

  useEffect(() => () => {
    if (actionLockTimerRef.current) window.clearTimeout(actionLockTimerRef.current);
  }, []);

  const advanceQueue = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const handleHide = useCallback((deal) => {
    if (!actionLockRef.current) lockActions();
    console.log('[DealSwipeDeck] hide', deal?.id || deal?.name);
    onHide?.(deal);
    advanceQueue();
  }, [onHide, advanceQueue, lockActions]);

  const handleSave = useCallback((deal) => {
    if (!actionLockRef.current) lockActions();
    console.log('[DealSwipeDeck] save', deal?.id || deal?.name);
    onSave?.(deal);
    advanceQueue();
  }, [onSave, advanceQueue, lockActions]);

  const handlePass = useCallback((deal) => {
    if (!actionLockRef.current) lockActions();
    console.log('[DealSwipeDeck] pass', deal?.id || deal?.name);
    onPass?.(deal);
    advanceQueue();
  }, [onPass, advanceQueue, lockActions]);

  const resolvePendingDeal = useCallback(() => {
    const deal = pendingDealRef.current || topDealRef.current;
    pendingDealRef.current = null;
    return deal;
  }, []);

  const swipe = useSwipeGesture({
    enabled: Boolean(topDeal),
    cardKey: topDeal?.id ?? null,
    onHide: () => {
      const deal = resolvePendingDeal();
      if (deal) handleHide(deal);
    },
    onSave: () => {
      const deal = resolvePendingDeal();
      if (deal) handleSave(deal);
    },
    onTap: () => {
      if (topDeal) onOpenDetails?.(topDeal);
    }
  });

  const busy = Boolean(swipe.flyOff) || actionLock;

  const onActionPointerDown = useCallback((e) => {
    e.stopPropagation();
  }, []);

  const runButtonAction = useCallback((kind) => {
    const deal = topDealRef.current;
    if (!deal || !lockActions()) return;
    pendingDealRef.current = deal;
    console.log('[DealSwipeDeck] button', kind, deal.id || deal.name);
    if (kind === 'pass') {
      handlePass(deal);
      return;
    }
    swipe.commitAction(kind);
  }, [handlePass, lockActions, swipe]);

  const scopeLabel = deckScope === 'daily' ? "Today's New" : 'All Matches';
  const hideHot = swipe.dragX < 0 ? 1 + swipe.dragProgress * 0.15 : 1;
  const saveHot = swipe.dragX > 0 ? 1 + swipe.dragProgress * 0.15 : 1;

  return (
    <div className={`deal-swipe-deck${isPortrait ? ' deal-swipe-deck--portrait' : ' deal-swipe-deck--landscape'}`}>
      <header className="deal-swipe-deck__header">
        <div className="deal-swipe-deck__header-main">
          <h2 className="deal-swipe-deck__title">{scopeLabel}</h2>
          <span className="deal-swipe-deck__count">
            {remaining > 0 ? `${remaining} left` : isFetching ? 'Loading…' : 'Done for now'}
            {totalFromAPI > 0 && remaining === 0 ? ` · ${totalFromAPI.toLocaleString()} total` : ''}
          </span>
        </div>
      </header>

      <div className="deal-swipe-deck__stack" aria-live="polite">
        {remaining === 0 ? (
          <div className="deal-swipe-deck__empty">
            <p>
              {deckScope === 'daily'
                ? "No new deals matched your buy box today."
                : 'No more deals in this view.'}
            </p>
            {deckScope === 'daily' && typeof onShowAllMatches === 'function' ? (
              <>
                <p className="deal-swipe-deck__empty-hint">
                  Focus, Cards, and Table all use the same filter. Switch to All Matches to browse your full buy box.
                </p>
                <button
                  type="button"
                  className="btn-primary deal-swipe-deck__empty-cta"
                  onClick={onShowAllMatches}
                >
                  Show All Matches
                </button>
              </>
            ) : (
              <p className="deal-swipe-deck__empty-hint">
                Try Cards or Table above, or adjust your buy box filters.
              </p>
            )}
          </div>
        ) : (
          visibleStack.map((deal, i) => (
            <DealSwipeCard
              key={`${deal.id}-${orientationKey}`}
              deal={deal}
              isPortrait={isPortrait}
              isGuest={isGuest}
              entitlements={entitlements}
              requireSignup={requireSignup}
              onOpenDetails={onOpenDetails}
              isTop={i === 0}
              stackIndex={i}
              swipe={swipe}
            />
          ))
        )}
      </div>

      {remaining > 0 && (
        <div className={`deal-swipe-actions${isPortrait ? '' : ' deal-swipe-actions--landscape'}`} role="toolbar" aria-label="Deal actions">
          <button
            type="button"
            className="deal-swipe-actions__btn deal-swipe-actions__btn--hide"
            aria-label="Hide deal"
            disabled={busy}
            style={{ transform: `scale(${hideHot})` }}
            onPointerDown={onActionPointerDown}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); runButtonAction('hide'); }}
          >
            ✕
          </button>
          <button
            type="button"
            className="deal-swipe-actions__btn deal-swipe-actions__btn--pass"
            aria-label="Pass on deal"
            disabled={busy}
            onPointerDown={onActionPointerDown}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); runButtonAction('pass'); }}
          >
            Pass
          </button>
          <button
            type="button"
            className="deal-swipe-actions__btn deal-swipe-actions__btn--save"
            aria-label="Save deal"
            disabled={busy}
            style={{ transform: `scale(${saveHot})` }}
            onPointerDown={onActionPointerDown}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); runButtonAction('save'); }}
          >
            ♥
          </button>
        </div>
      )}
    </div>
  );
}
