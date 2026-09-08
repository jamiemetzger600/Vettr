import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTeam } from '../context/TeamContext';
import { userAPI, dealsAPI, paymentsAPI, crmAPI } from '../utils/api';
import { normalizeDeal } from '../utils/normalizeDeal';
import DealAggregator from '../components/DealAggregator';
import CrmDashboard from '../components/crm/CrmDashboard';
import TalkAlertBanner from '../components/crm/TalkAlertBanner';
import Navigation from '../components/Navigation';
import { useIsMobile } from '../hooks/useMediaQuery';
import BuyBoxModal from '../components/BuyBoxModal';
import { BUY_BOX_SLOT_COUNT } from '../utils/buyBoxes';
import SourceManagerModal from '../components/SourceManagerModal';
import ManualDealModal from '../components/ManualDealModal';
import QuickDealCalculatorModal from '../components/QuickDealCalculatorModal';
import ScrapeActivityToast from '../components/ScrapeActivityToast';
import GuestOnboardingTour from '../components/GuestOnboardingTour';
import GuestFirstVisitSheet from '../components/GuestFirstVisitSheet';
import GuestMyDealsEmpty from '../components/GuestMyDealsEmpty';
import { loadGuestSettings, persistGuestSettings } from '../utils/guestSettings';
import { useGuestAccess } from '../hooks/useGuestAccess';
import { logGuestEvent } from '../utils/guestAnalytics';
import {
  persistDashboardLocation,
  patchDashboardSearchParams,
  readStoredDashboardLocation,
  isValidCrmSubview,
  isValidCrmFilter
} from '../utils/dashboardLocation';
import { notificationPath, parseMatchDealIds } from '../utils/notificationLinks';
import { pollWhenVisible } from '../utils/pollWhenVisible';

function isBuyBoxEmpty(buyBox) {
  if (!buyBox || typeof buyBox !== 'object') return true;
  const has = (v) => v != null && v !== '' && (Array.isArray(v) ? v.length > 0 : true);
  return (
    !has(buyBox.minPrice) &&
    !has(buyBox.maxPrice) &&
    !has(buyBox.minEbitda) &&
    !has(buyBox.maxEbitda) &&
    !has(buyBox.minRevenue) &&
    !has(buyBox.revenueMultiple) &&
    !has(buyBox.targetStates) &&
    !has(buyBox.targetIndustries) &&
    !has(buyBox.targetCOC) &&
    !has(buyBox.targetPayback) &&
    !has(buyBox.minBuyerSalary)
  );
}

function shouldSkipGuestOnboardingAfterLogout() {
  try {
    return sessionStorage.getItem('vettr_skip_guest_onboarding') === '1';
  } catch {
    return false;
  }
}

function clearSkipGuestOnboardingAfterLogout() {
  try {
    sessionStorage.removeItem('vettr_skip_guest_onboarding');
  } catch {}
}

export default function DashboardPage({ feedSource = 'airtable' }) {
  const { user, logout, loading: authLoading } = useAuth();
  const { activeTeamId } = useTeam();
  const { isGuest, entitlements, requireSignup } = useGuestAccess(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialDealDbId = searchParams.get('dealDbId') || null;
  const checkoutSessionId = searchParams.get('session_id');
  const crmDealParam = searchParams.get('crmDeal');
  const sectionParam = searchParams.get('section');
  const newTodayParam = searchParams.get('newToday') === '1';
  const matchIdsParam = searchParams.get('matchIds') || '';
  const filterMatchDealIds = useMemo(
    () => parseMatchDealIds(matchIdsParam),
    [matchIdsParam]
  );

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'aggregator';
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    // Legacy My Deals tab → Vettr CRM
    if (tab === 'saved-deals' || tab === 'crm' || params.get('crmDeal')) return 'crm';
    if (tab === 'aggregator') return 'aggregator';
    const stored = readStoredDashboardLocation();
    if (stored?.tab === 'crm' || stored?.tab === 'aggregator') return stored.tab;
    return 'aggregator';
  });
  const [crmSubview, setCrmSubview] = useState(() => {
    if (typeof window === 'undefined') return 'cards';
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'saved-deals') return 'list';
    const fromUrl = params.get('crmSubview');
    if (isValidCrmSubview(fromUrl)) return fromUrl;
    const stored = readStoredDashboardLocation();
    if (isValidCrmSubview(stored?.crmSubview)) return stored.crmSubview;
    return 'cards';
  });
  const [guestTourBlocking, setGuestTourBlocking] = useState(false);
  const [firstVisitClosed, setFirstVisitClosed] = useState(false);
  const [settings, setSettings] = useState(null);
  const [savedDeals, setSavedDeals] = useState([]);
  /** All personal + team saves — used for aggregator “already saved” markers only. */
  const [savedDealIndex, setSavedDealIndex] = useState([]);
  const [crmBadgeCount, setCrmBadgeCount] = useState(0);
  const [crmInitialDealId, setCrmInitialDealId] = useState(() => {
    const n = Number(crmDealParam);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [crmInitialFocusSection, setCrmInitialFocusSection] = useState(
    () => sectionParam || null
  );
  const [crmInitialViewOverride, setCrmInitialViewOverride] = useState(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'saved-deals') return 'list';
    if (isValidCrmFilter(params.get('crmFilter'))) return 'home';
    return null;
  });
  const [crmInitialFilter] = useState(() => {
    if (typeof window === 'undefined') return null;
    const filter = new URLSearchParams(window.location.search).get('crmFilter');
    return isValidCrmFilter(filter) ? filter : null;
  });
  /** One-shot Aggregator layout hint (e.g. return from CRM → Inbox on mobile). */
  const [aggregatorViewHint, setAggregatorViewHint] = useState(null);
  const [tasksListSignal, setTasksListSignal] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const [totalDeals, setTotalDeals] = useState(0);
  const [newTodayCount, setNewTodayCount] = useState(0);
  const [showingCount, setShowingCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showBuyBoxModal, setShowBuyBoxModal] = useState(false);
  const [buyBoxModalMode, setBuyBoxModalMode] = useState('closed');
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showManualDealModal, setShowManualDealModal] = useState(false);
  const [showQuickCalculator, setShowQuickCalculator] = useState(false);
  const [poolNewDealsFilter, setPoolNewDealsFilter] = useState(null);
  const [tourForceOpen, setTourForceOpen] = useState(false);
  const [tourPrepareStepId, setTourPrepareStepId] = useState(null);
  const [mobileDeckActive, setMobileDeckActive] = useState(false);
  const isMobile = useIsMobile();
  /** Skip guest tour + buy box onboarding after logout (user already knows the product). */
  const [suppressGuestOnboarding, setSuppressGuestOnboarding] = useState(() => {
    if (shouldSkipGuestOnboardingAfterLogout()) {
      clearSkipGuestOnboardingAfterLogout();
      return true;
    }
    return false;
  });
  const teamScopeBootstrappedRef = useRef(false);
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const skipPersistFromUrlRef = useRef(false);

  const loadScopedSavedDeals = useCallback(async () => {
    if (authLoading || isGuest) return;
    const dealsOpts = activeTeamId
      ? { scope: 'team', teamId: activeTeamId }
      : { scope: 'personal' };
    const dealsData = await dealsAPI.getSavedDeals(dealsOpts);
    const normalized = (dealsData.deals || []).map(normalizeDeal);
    console.log('[Dashboard] scoped saved deals loaded', {
      scope: dealsOpts.scope,
      teamId: dealsOpts.teamId ?? null,
      count: normalized.length
    });
    setSavedDeals(normalized);
  }, [authLoading, isGuest, activeTeamId]);

  const loadSavedDealIndex = useCallback(async () => {
    if (authLoading || isGuest) return;
    const dealsData = await dealsAPI.getSavedDeals({ scope: 'all' });
    setSavedDealIndex((dealsData.deals || []).map(normalizeDeal));
  }, [authLoading, isGuest]);

  const loadSettings = useCallback(async () => {
    if (authLoading) return;
    if (isGuest) {
      setSettings(loadGuestSettings());
      setSavedDeals([]);
      setSavedDealIndex([]);
      return;
    }
    const settingsData = await userAPI.getSettings();
    setSettings(settingsData);
  }, [authLoading, isGuest]);

  /** Full refresh after save / settings change — does not block the dashboard UI. */
  const loadUserData = useCallback(async () => {
    if (authLoading) return;

    if (isGuest) {
      await loadSettings();
      setLoading(false);
      return;
    }

    try {
      await Promise.all([
        loadSettings(),
        loadScopedSavedDeals(),
        loadSavedDealIndex()
      ]);
    } catch (error) {
      console.error('Failed to load user data:', error);
    } finally {
      setLoading(false);
    }
  }, [authLoading, isGuest, loadSettings, loadScopedSavedDeals, loadSavedDealIndex]);

  const persistSettings = useCallback(
    async (patch) => {
      if (isGuest) {
        const next = await persistGuestSettings(patch);
        setSettings(next);
        return next;
      }
      const updated = await userAPI.updateSettings(patch);
      await loadUserData();
      return updated;
    },
    [isGuest, loadUserData]
  );

  /** Initial dashboard boot only — team switches must not unmount the aggregator. */
  useEffect(() => {
    if (authLoading) return;
    setLoading(true);
    loadUserData();
  }, [authLoading, isGuest]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Prefetch + poll Today badge so Talk mentions keep the red CRM badge fresh. */
  useEffect(() => {
    if (authLoading || isGuest) return;
    let cancelled = false;
    const pull = () => {
      crmAPI.getToday()
        .then((data) => {
          if (!cancelled) {
            setCrmBadgeCount(data?.badgeCount ?? 0);
            console.log('[Dashboard] CRM badgeCount', data?.badgeCount ?? 0);
          }
        })
        .catch((err) => console.warn('[Dashboard] CRM today prefetch failed', err.message));
    };
    pull();
    const stopPoll = pollWhenVisible(pull, 45000);
    return () => {
      cancelled = true;
      stopPoll();
    };
  }, [authLoading, isGuest]);

  /** Deep link: /dashboard?tab=crm&crmDeal=123&section=crm-talk (also legacy tab=saved-deals) */
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'aggregator') {
      if (activeTab !== 'aggregator') skipPersistFromUrlRef.current = true;
      setActiveTab('aggregator');
    } else if (tabParam === 'saved-deals') {
      console.log('[Dashboard] redirecting legacy My Deals tab → Vettr CRM list');
      skipPersistFromUrlRef.current = true;
      setActiveTab('crm');
      setCrmSubview('list');
      setCrmInitialViewOverride((prev) => prev || 'list');
    } else if (tabParam === 'crm' || searchParams.get('crmDeal')) {
      if (activeTab !== 'crm') skipPersistFromUrlRef.current = true;
      setActiveTab('crm');
    }
    const sub = searchParams.get('crmSubview');
    if ((tabParam === 'crm' || searchParams.get('crmDeal')) && isValidCrmSubview(sub)) {
      setCrmSubview(sub);
      setCrmInitialViewOverride(sub);
    }
    if (sub === 'tasks') {
      setCrmInitialDealId(null);
      setCrmInitialFocusSection(null);
      return;
    }
    const n = Number(crmDealParam);
    if (!Number.isFinite(n) || n <= 0) {
      if (sectionParam) setCrmInitialFocusSection(sectionParam);
      return;
    }
    skipPersistFromUrlRef.current = true;
    setActiveTab('crm');
    setCrmInitialDealId(n);
    setCrmInitialFocusSection(sectionParam || 'crm-talk');
    console.log('[Dashboard] deep link CRM deal', n, 'section', sectionParam);
  }, [crmDealParam, sectionParam, searchParams]);

  useEffect(() => {
    persistDashboardLocation({ tab: activeTab, crmSubview });
    if (skipPersistFromUrlRef.current) {
      skipPersistFromUrlRef.current = false;
      return;
    }
    const next = patchDashboardSearchParams(searchParamsRef.current, {
      tab: activeTab,
      crmSubview: activeTab === 'crm' ? crmSubview : null
    });
    if (next.toString() === searchParamsRef.current.toString()) return;
    console.log('[Dashboard] persist location', { tab: activeTab, crmSubview });
    setSearchParams(next, { replace: true });
  }, [activeTab, crmSubview, setSearchParams]);

  /** Team workspace change: refresh My Deals / CRM list silently; market feed stays mounted. */
  useEffect(() => {
    if (authLoading || isGuest) return;
    if (!teamScopeBootstrappedRef.current) {
      teamScopeBootstrappedRef.current = true;
      return;
    }
    setSavedDeals([]);
    loadScopedSavedDeals().catch((err) => {
      console.error('[Dashboard] team saved deals refresh failed:', err);
    });
  }, [activeTeamId, authLoading, isGuest, loadScopedSavedDeals]);

  /** Live refresh when the Chrome extension saves/updates a deal on the web API. */
  useEffect(() => {
    if (isGuest) return;
    const onExtensionDealsChanged = () => {
      console.log('[Dashboard] Extension deals changed — refetching My Deals');
      loadUserData();
    };
    window.addEventListener('vettr-deals-changed', onExtensionDealsChanged);
    return () => window.removeEventListener('vettr-deals-changed', onExtensionDealsChanged);
  }, [isGuest, loadUserData]);

  useEffect(() => {
    if (isGuest) logGuestEvent('guest_dashboard_view', { feedSource });
  }, [isGuest, feedSource]);

  useEffect(() => {
    if (isGuest || !checkoutSessionId) return;

    let cancelled = false;
    (async () => {
      try {
        await paymentsAPI.confirmCheckout(checkoutSessionId);
        if (!cancelled) {
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (error) {
        console.error('Failed to confirm checkout:', error);
      }
    })();

    return () => { cancelled = true; };
  }, [isGuest, checkoutSessionId]);

  useEffect(() => {
    if (user) {
      setSuppressGuestOnboarding(false);
      clearSkipGuestOnboardingAfterLogout();
    }
  }, [user]);

  const handleLogout = useCallback(() => {
    setSuppressGuestOnboarding(true);
    setShowBuyBoxModal(false);
    setBuyBoxModalMode('closed');
    logout();
  }, [logout]);

  useEffect(() => {
    if (authLoading || !isGuest || suppressGuestOnboarding) return;
    if (shouldSkipGuestOnboardingAfterLogout()) {
      clearSkipGuestOnboardingAfterLogout();
      setSuppressGuestOnboarding(true);
    }
  }, [authLoading, isGuest, suppressGuestOnboarding]);

  const handleTourDismiss = useCallback(() => {
    setTourForceOpen(false);
    setGuestTourBlocking(false);
    setTourPrepareStepId(null);
  }, []);

  const handleFirstVisitBrowse = useCallback(async () => {
    setFirstVisitClosed(true);
    logGuestEvent('guest_first_visit_browse');
    console.log('[Dashboard] first-visit browse');
    try {
      await persistSettings({ preferences: { buyBoxOnboardingDismissed: true } });
    } catch (error) {
      console.error('[Dashboard] first-visit dismiss failed:', error);
    }
  }, [persistSettings]);

  const handleFirstVisitSetBuyBox = useCallback(() => {
    logGuestEvent('guest_first_visit_set');
    console.log('[Dashboard] first-visit set buy box');
    setBuyBoxModalMode('onboarding');
    setShowBuyBoxModal(true);
  }, []);

  const showFirstVisitSheet =
    !authLoading &&
    !suppressGuestOnboarding &&
    Boolean(settings) &&
    isBuyBoxEmpty(settings.buyBox) &&
    !settings.preferences?.buyBoxOnboardingDismissed &&
    !showBuyBoxModal &&
    !firstVisitClosed;

  const handleStartTour = useCallback(() => {
    setActiveTab('aggregator');
    setTourForceOpen(true);
    setGuestTourBlocking(true);
    setTourPrepareStepId(null);
  }, []);

  const handleMatchCountUpdate = (count) => setMatchCount(count);

  const handleDealsStatsUpdate = ({ total = 0, newToday = 0, showing = 0 }) => {
    setTotalDeals(total);
    setNewTodayCount(newToday);
    setShowingCount(showing);
  };

  const handleFetchDeals = () => {
    setRefreshKey((current) => current + 1);
    setActiveTab('aggregator');
  };

  const handleSaveCalculatorDefaults = async (calculatorDefaults) => {
    try {
      await persistSettings({ preferences: { calculatorDefaults } });
    } catch (error) {
      console.error('Failed to save calculator defaults:', error);
    }
  };

  const aggregatorSavedEntries = useMemo(() => savedDealIndex, [savedDealIndex]);

  const savedRowIdByMarketDealId = useMemo(() => {
    const map = {};
    for (const d of aggregatorSavedEntries) {
      if (d.dealId != null && d.dealId !== '') {
        map[String(d.dealId)] = d.id;
      }
      if (d.marketDealId != null && d.marketDealId !== '') {
        map[String(d.marketDealId)] = d.id;
      }
    }
    return map;
  }, [aggregatorSavedEntries]);

  const aggregatorSavedDealIds = useMemo(() => {
    const ids = [];
    for (const d of aggregatorSavedEntries) {
      if (d.dealId != null && d.dealId !== '') ids.push(String(d.dealId));
      if (d.marketDealId != null && d.marketDealId !== '') ids.push(String(d.marketDealId));
    }
    return ids;
  }, [aggregatorSavedEntries]);

  const saveScopeSavedDealIds = useMemo(() => {
    const ids = [];
    for (const d of savedDeals) {
      if (d.dealId != null && d.dealId !== '') ids.push(String(d.dealId));
      if (d.marketDealId != null && d.marketDealId !== '') ids.push(String(d.marketDealId));
    }
    return ids;
  }, [savedDeals]);

  const saveScopeRowIdByMarketDealId = useMemo(() => {
    const map = {};
    for (const d of savedDeals) {
      if (d.dealId != null && d.dealId !== '') map[String(d.dealId)] = d.id;
      if (d.marketDealId != null && d.marketDealId !== '') map[String(d.marketDealId)] = d.id;
    }
    return map;
  }, [savedDeals]);

  const saveScopeCrmByMarketDealId = useMemo(() => {
    const map = {};
    const put = (key, d) => {
      if (key == null || key === '') return;
      map[String(key)] = {
        rowId: d.id,
        progressStage: d.progressStage || '',
        customStageLabel: d.customStageLabel || ''
      };
    };
    for (const d of savedDeals) {
      put(d.dealId, d);
      put(d.marketDealId, d);
    }
    return map;
  }, [savedDeals]);

  const safeBuyBoxEditingSlotIndex = useMemo(() => {
    const raw = settings?.activeBuyBoxIndex ?? settings?.preferences?.activeBuyBoxIndex ?? 0;
    const n = Number(raw);
    const idx = Number.isFinite(n) ? Math.trunc(n) : 0;
    return Math.min(BUY_BOX_SLOT_COUNT - 1, Math.max(0, idx));
  }, [settings?.activeBuyBoxIndex, settings?.preferences?.activeBuyBoxIndex]);

  const handleTabChange = (tab) => {
    if (tab === 'saved-deals') {
      console.log('[Dashboard] saved-deals tab remapped to Vettr CRM');
      if (isGuest) logGuestEvent('guest_my_deals_tab');
      setActiveTab('crm');
      setCrmSubview('list');
      setCrmInitialViewOverride('list');
      return;
    }
    if (isGuest && tab === 'crm') {
      logGuestEvent('guest_my_deals_tab');
    }
    setActiveTab(tab);
  };

  const openVettrCrm = useCallback((opts = {}) => {
    setActiveTab('crm');
    if (opts.view) {
      setCrmInitialViewOverride(opts.view);
      setCrmSubview(opts.view);
    }
    if (opts.dealId != null) {
      setCrmInitialDealId(opts.dealId);
      setCrmInitialFocusSection(opts.focusSection ?? 'overview');
      console.log('[Dashboard] open CRM at deal', opts.dealId, opts.focusSection ?? 'overview');
    } else if (opts.focusSection) {
      setCrmInitialFocusSection(opts.focusSection);
    }
  }, []);

  const handleCrmViewChange = useCallback((view) => {
    setCrmSubview(view);
    setCrmInitialViewOverride(null);
  }, []);

  const backToInbox = useCallback(() => {
    console.log('[Dashboard] back to Inbox from CRM');
    setActiveTab('aggregator');
    setAggregatorViewHint('inbox');
  }, []);

  if (loading || authLoading) {
    return (
      <div className="loading-screen">
        {isGuest ? 'Loading deals...' : 'Loading your dashboard...'}
      </div>
    );
  }

  return (
    <div className={`app-page-shell${mobileDeckActive && isMobile ? ' app-page-shell--mobile-deck' : ''}`}>
      {(isGuest || tourForceOpen) && (
        <GuestOnboardingTour
          autoShow={false}
          forceOpen={tourForceOpen}
          onDismiss={handleTourDismiss}
          onEnsureAggregatorTab={() => setActiveTab('aggregator')}
          onPrepareStep={setTourPrepareStepId}
        />
      )}
      <GuestFirstVisitSheet
        isOpen={showFirstVisitSheet}
        onSetBuyBox={handleFirstVisitSetBuyBox}
        onBrowse={handleFirstVisitBrowse}
      />
      <ScrapeActivityToast
        feedSource={feedSource}
        enabled={Boolean(user)}
        isGuest={isGuest}
        suppressGuestHint={guestTourBlocking || showFirstVisitSheet}
        onRequireSignup={requireSignup}
        onViewNewDeals={({ newRowDbIds, lastScrapeAt }) => {
          setPoolNewDealsFilter({
            dbIds: newRowDbIds?.length > 0 ? newRowDbIds : null,
            lastScrapeAt,
          });
          setActiveTab('aggregator');
        }}
      />
      <Navigation
        user={user}
        logout={handleLogout}
        isGuest={isGuest}
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        aggregatorCount={totalDeals}
        crmCount={savedDeals.length}
        crmBadgeCount={crmBadgeCount}
        compact={mobileDeckActive && isMobile && activeTab === 'aggregator'}
        onOpenQuickCalculator={() => {
          if (isGuest) {
            requireSignup('default');
            return;
          }
          setShowQuickCalculator(true);
        }}
        onStartTour={handleStartTour}
      />

      <div className="dashboard-content">
        {activeTab === 'aggregator' && (
          <div className="dashboard-tab-pane dashboard-tab-pane--active">
          <DealAggregator
            tourPrepareStepId={tourPrepareStepId}
            settings={settings}
            manualRefreshToken={refreshKey}
            matchCount={matchCount}
            onMatchCountUpdate={handleMatchCountUpdate}
            onDealsStatsUpdate={handleDealsStatsUpdate}
            onSaveDeal={loadUserData}
            onOpenVettrCrm={(opts) => openVettrCrm({ view: 'home', ...(opts || {}) })}
            onSettingsUpdate={loadUserData}
            onConfigureBuyBox={() => {
              setBuyBoxModalMode('edit');
              setShowBuyBoxModal(true);
            }}
            preferredViewStyle={aggregatorViewHint}
            onPreferredViewStyleConsumed={() => setAggregatorViewHint(null)}
            feedSource={feedSource}
            savedDealIds={aggregatorSavedDealIds}
            savedRowIdByMarketDealId={savedRowIdByMarketDealId}
            saveScopeSavedDealIds={saveScopeSavedDealIds}
            saveScopeRowIdByMarketDealId={saveScopeRowIdByMarketDealId}
            saveScopeCrmByMarketDealId={saveScopeCrmByMarketDealId}
            poolNewDealsFilter={poolNewDealsFilter}
            onClearPoolNewDealsFilter={() => setPoolNewDealsFilter(null)}
            filterNewToday={newTodayParam}
            filterMatchDealIds={filterMatchDealIds}
            onClearNewToday={() => {
              const next = new URLSearchParams(searchParams);
              next.delete('newToday');
              next.delete('matchIds');
              next.delete('dealDbId');
              console.log('[Dashboard] clear match / newToday filter');
              setSearchParams(next, { replace: true });
            }}
            isGuest={isGuest}
            entitlements={entitlements}
            persistSettings={persistSettings}
            requireSignup={requireSignup}
            initialOpenDealDbId={initialDealDbId}
            onMobileDeckChange={setMobileDeckActive}
          />
          </div>
        )}

        {activeTab === 'crm' && isGuest && (
          <div className="dashboard-tab-pane dashboard-tab-pane--active">
          <GuestMyDealsEmpty
            onRequireSignup={requireSignup}
            onBackToAggregator={() => setActiveTab('aggregator')}
          />
          </div>
        )}

        {activeTab === 'crm' && !isGuest && (
          <div className="dashboard-tab-pane dashboard-tab-pane--active">
          <CrmDashboard
            deals={savedDeals}
            settings={settings}
            onRefresh={loadUserData}
            onSaveCalculatorDefaults={handleSaveCalculatorDefaults}
            onTodayLoaded={setCrmBadgeCount}
            onAddDeal={() => setShowManualDealModal(true)}
            initialDealId={crmInitialDealId}
            initialCrmView={crmInitialViewOverride || crmSubview}
            initialFocusSection={crmInitialFocusSection}
            initialActionFilter={crmInitialFilter}
            tasksListSignal={tasksListSignal}
            onBackToInbox={backToInbox}
            onCrmViewChange={handleCrmViewChange}
            onLiveDealsRefresh={loadScopedSavedDeals}
          />
          </div>
        )}
      </div>

      {!isGuest && (
        <TalkAlertBanner
          enabled={!authLoading}
          onUnreadChange={() => {
            crmAPI.getToday()
              .then((data) => setCrmBadgeCount(data?.badgeCount ?? 0))
              .catch(() => {});
          }}
          onOpenAlert={(alert) => {
            const meta = alert?.metadata && typeof alert.metadata === 'object' ? alert.metadata : {};
            const dealDbIds = parseMatchDealIds(meta.dealDbIds || meta.deal_db_ids);
            const path = notificationPath({
              alertType: alert?.alert_type,
              savedDealId: alert?.saved_deal_id,
              dealDbId: meta.dealDbId || meta.deal_db_id,
              dealDbIds,
              newToday: meta.newToday || meta.new_today
            });
            const next = new URLSearchParams(path.includes('?') ? path.slice(path.indexOf('?') + 1) : '');
            const tab = next.get('tab') === 'crm' ? 'crm' : 'aggregator';
            console.log('[Dashboard] open alert', alert?.alert_type, path, {
              matchCount: dealDbIds.length
            });
            skipPersistFromUrlRef.current = true;
            setSearchParams(next, { replace: false });
            setActiveTab(tab);
            if (tab === 'crm') {
              const sub = next.get('crmSubview');
              if (isValidCrmSubview(sub)) {
                setCrmSubview(sub);
                setCrmInitialViewOverride(sub);
              }
              if (sub === 'tasks') {
                setCrmInitialDealId(null);
                setCrmInitialFocusSection(null);
                setTasksListSignal(Date.now());
                console.log('[Dashboard] open alert → tasks list');
              } else {
                const n = Number(next.get('crmDeal'));
                if (Number.isFinite(n) && n > 0) {
                  setCrmInitialDealId(n);
                  setCrmInitialFocusSection(next.get('section') || 'overview');
                }
              }
            }
            try {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            } catch {
              /* ignore */
            }
          }}
        />
      )}

      <BuyBoxModal
        isOpen={showBuyBoxModal}
        settings={settings}
        editingSlotIndex={safeBuyBoxEditingSlotIndex}
        onClose={() => {
          setShowBuyBoxModal(false);
          setBuyBoxModalMode('closed');
        }}
        onSaved={loadUserData}
        isOnboarding={buyBoxModalMode === 'onboarding'}
        isGuest={isGuest}
        persistSettings={persistSettings}
      />

      {!isGuest && (
        <>
          <SourceManagerModal
            isOpen={showSourceModal}
            settings={settings}
            onClose={() => setShowSourceModal(false)}
            onSaved={() => {
              loadUserData();
              handleFetchDeals();
            }}
          />
          <ManualDealModal
            isOpen={showManualDealModal}
            onClose={() => setShowManualDealModal(false)}
            onSaved={async () => {
              await loadUserData();
              openVettrCrm({ view: 'list' });
            }}
          />
          <QuickDealCalculatorModal
            isOpen={showQuickCalculator}
            onClose={() => setShowQuickCalculator(false)}
            settings={settings}
            onSaveCalculatorDefaults={handleSaveCalculatorDefaults}
            onDealSaved={async () => {
              await loadUserData();
              openVettrCrm({ view: 'list' });
            }}
          />
        </>
      )}
    </div>
  );
}
