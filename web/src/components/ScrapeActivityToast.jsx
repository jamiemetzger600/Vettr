import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildMarketDealsParams,
  fetchMarketDeals,
  fetchMarketDealsSources,
} from '../utils/normalizeMarketDeal';
import {
  joinSearchKeywords,
  normalizeBuyBoxesState,
  parseSearchKeywords,
} from '../utils/buyBoxes';

const ACK_STORAGE_KEY = 'vettr_scrape_toast_acked';
const MAX_ACK_ENTRIES = 80;
const STALE_MS = 48 * 60 * 60 * 1000;
const AUTO_DISMISS_MS = 14000;

function scrapeToastAckId(sourceKey, lastScrapeAt) {
  return `${sourceKey}|${new Date(lastScrapeAt).toISOString()}`;
}

function loadAckSet() {
  try {
    const raw = localStorage.getItem(ACK_STORAGE_KEY);
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistAck(id) {
  const set = loadAckSet();
  set.add(id);
  localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify([...set].slice(-MAX_ACK_ENTRIES)));
}

function parseScrapeMeta(row) {
  let meta = row?.last_scrape_result;
  if (meta == null) return {};
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      return {};
    }
  }
  return typeof meta === 'object' && meta ? meta : {};
}

function formatScrapeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d >= startToday) return `at ${t} today`;
  if (d >= startYesterday) return `at ${t} yesterday`;
  return `on ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${t}`;
}

/** Same md:<pk> / numeric mapping DealAggregator uses for exclude_ids. */
function hiddenDealIdToDbId(hiddenId) {
  if (hiddenId == null) return null;
  if (typeof hiddenId === 'number' && Number.isFinite(hiddenId) && hiddenId > 0) return hiddenId;
  const s = String(hiddenId);
  if (s.startsWith('md:')) {
    const n = Number(s.slice(3));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/**
 * Buy-box-filtered count for the latest scrape — same filters the Aggregator applies
 * when the user clicks through (buy box + excludes + search + source + new ids/window).
 */
async function countBuyBoxMatchesForScrape({
  settings,
  feedSource,
  newRowIds,
  lastScrapeAt,
  signal,
}) {
  if (!settings) return 0;

  const { buyBoxes, activeBuyBoxIndex, activeCriteria } = normalizeBuyBoxesState(settings);
  const slot = buyBoxes[activeBuyBoxIndex] || {};
  const excludeKeywords = Array.isArray(slot.excludeKeywords) ? slot.excludeKeywords : [];
  const flexPct = Math.min(100, Math.max(0, Number(activeCriteria.includeNearMatchesPercent) || 0));
  const hiddenDbIds = [
    ...new Set((settings.hiddenDealIds || []).map(hiddenDealIdToDbId).filter(Boolean)),
  ];
  const sourceFilter = feedSource === 'airtable' ? ['airtable_bizbuysell'] : null;
  const search = joinSearchKeywords(parseSearchKeywords(slot.feedSearch));

  let restrictToDbIds = null;
  let firstSeenAfter = null;
  let firstSeenBefore = null;
  if (newRowIds.length > 0) {
    restrictToDbIds = newRowIds;
  } else if (lastScrapeAt) {
    const end = new Date(lastScrapeAt);
    if (!Number.isNaN(end.getTime())) {
      firstSeenBefore = end.toISOString();
      firstSeenAfter = new Date(end.getTime() - 12 * 60 * 60 * 1000).toISOString();
    }
  } else {
    return 0;
  }

  const params = buildMarketDealsParams({
    page: 1,
    perPage: 1,
    search,
    buyBox: activeCriteria,
    flexibilityPct: flexPct,
    hiddenDealDbIds: hiddenDbIds,
    excludeKeywords,
    sources: sourceFilter,
    restrictToDbIds,
    firstSeenAfter,
    firstSeenBefore,
  });

  const result = await fetchMarketDeals(params, signal);
  if (!result || result.notModified) return 0;
  return Number(result.pagination?.total) || 0;
}

/**
 * On dashboard load (after login or refresh with a valid session), checks scrape metadata once.
 * Shows a toast when the latest run produced buy-box matches the user has not dismissed yet.
 */
export default function ScrapeActivityToast({
  feedSource = 'airtable',
  settings = null,
  onViewNewDeals,
  enabled = true,
  isGuest = false,
  suppressGuestHint = false,
  onRequireSignup = null,
}) {
  const sourceKey = feedSource === 'airtable' ? 'airtable_bizbuysell' : null;
  const [toast, setToast] = useState(null);
  const toastRef = useRef(null);
  toastRef.current = toast;

  useEffect(() => {
    if (!suppressGuestHint) return;
    setToast((prev) => (prev?.isGuestHint ? null : prev));
  }, [suppressGuestHint]);

  useEffect(() => {
    if (!isGuest || !sourceKey || suppressGuestHint) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchMarketDealsSources();
        if (cancelled || !data?.sources?.length) return;
        const row = data.sources.find((s) => s.source_key === sourceKey);
        if (!row?.last_scrape_at) return;
        setToast({
          isGuestHint: true,
          label: 'New deals are added regularly. Sign up to get alerts when matches hit your buy box.',
        });
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isGuest, sourceKey, suppressGuestHint, onRequireSignup]);

  const evaluate = useCallback(async (signal) => {
    if (!enabled || !sourceKey || !settings) return;
    try {
      const data = await fetchMarketDealsSources(signal);
      if (signal?.aborted || !data?.sources?.length) return;
      const row = data.sources.find((s) => s.source_key === sourceKey);
      if (!row?.last_scrape_at) return;
      const lastScrapeAt = row.last_scrape_at;
      const at = new Date(lastScrapeAt).getTime();
      if (Number.isNaN(at)) return;
      if (Date.now() - at > STALE_MS) return;

      const meta = parseScrapeMeta(row);
      const inserted = Number(meta.inserted) || 0;
      if (inserted <= 0) return;

      const ackId = scrapeToastAckId(sourceKey, lastScrapeAt);
      if (loadAckSet().has(ackId)) return;

      const newRowIds = Array.isArray(meta.new_row_ids)
        ? meta.new_row_ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0)
        : [];

      const matchCount = await countBuyBoxMatchesForScrape({
        settings,
        feedSource,
        newRowIds,
        lastScrapeAt,
        signal,
      });
      if (signal?.aborted) return;

      console.log('[ScrapeActivityToast] scrape match count', {
        inserted,
        newRowIds: newRowIds.length,
        matchCount,
        lastScrapeAt,
      });

      // Signal over noise: only toast when the user would actually see matches.
      if (matchCount <= 0) return;

      const label = `${matchCount.toLocaleString()} new match${matchCount === 1 ? '' : 'es'} ${formatScrapeTime(lastScrapeAt)}`.trim();

      setToast((prev) => {
        if (prev?.ackId === ackId) return prev;
        return {
          ackId,
          sourceKey,
          inserted,
          matchCount,
          lastScrapeAt,
          newRowIds,
          label,
        };
      });
    } catch (e) {
      if (e?.name === 'AbortError' || signal?.aborted) return;
      console.warn('[ScrapeActivityToast] sources check failed:', e?.message || e);
    }
  }, [enabled, sourceKey, settings, feedSource]);

  useEffect(() => {
    if (!enabled || !sourceKey || !settings) return undefined;
    const ac = new AbortController();
    evaluate(ac.signal);
    return () => ac.abort();
  }, [evaluate, enabled, sourceKey, settings]);

  const dismiss = useCallback(() => {
    const t = toastRef.current;
    if (t?.ackId) persistAck(t.ackId);
    setToast(null);
  }, []);

  const handleMainClick = useCallback(() => {
    const t = toastRef.current;
    if (!t) return;
    if (t.isGuestHint) {
      setToast(null);
      onRequireSignup?.();
      return;
    }
    persistAck(t.ackId);
    setToast(null);
    onViewNewDeals?.({
      newRowDbIds: t.newRowIds.length > 0 ? t.newRowIds : null,
      lastScrapeAt: t.lastScrapeAt,
      matchCount: t.matchCount,
      inserted: t.inserted,
    });
  }, [onViewNewDeals, onRequireSignup]);

  useEffect(() => {
    if (!toast || toast.isGuestHint) return undefined;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <div className="scrape-activity-toast" role="status" aria-live="polite">
      <button type="button" className="scrape-activity-toast__main" onClick={handleMainClick}>
        <span className="scrape-activity-toast__title">
          {toast.isGuestHint ? 'Stay in the loop' : 'New matches for your buy box'}
        </span>
        <span className="scrape-activity-toast__msg">{toast.label}</span>
        <span className="scrape-activity-toast__hint">{toast.isGuestHint ? 'Sign up for alerts' : 'Click to view'}</span>
      </button>
      <button
        type="button"
        className="scrape-activity-toast__close"
        aria-label="Dismiss"
        onClick={(e) => {
          e.stopPropagation();
          dismiss();
        }}
      >
        ×
      </button>
    </div>
  );
}
