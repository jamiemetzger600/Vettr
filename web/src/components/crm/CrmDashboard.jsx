import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { crmAPI, dealsAPI } from '../../utils/api';
import { normalizeDeal, isPassedOnDeal } from '../../utils/normalizeDeal';
import { useIsMobile } from '../../hooks/useMediaQuery';
import CrmKanban from './CrmKanban';
import CrmDeedBoard from './CrmDeedBoard';
import CrmDealWorkspace from './CrmDealWorkspace';
import CrmDealPeek from './CrmDealPeek';
import CrmObjectNav from './CrmObjectNav';
import CrmCommandMenu from './CrmCommandMenu';
import CrmTaskList from './CrmTaskList';
import CrmContactList from './CrmContactList';
import CrmAnalytics from './CrmAnalytics';
import CrmCalendar from './CrmCalendar';
import SuggestedTaskPrompt from './SuggestedTaskPrompt';
import CrmActionStrip, {
  buildNextActionByDealId,
  getActionFilterDealIds
} from './CrmActionStrip';
import CrmViewBar, { filterDealsByView } from './CrmViewBar';
import CrmQuickAdd from './CrmQuickAdd';
import CrmCsvImportModal from './CrmCsvImportModal';
import SavedDeals from '../SavedDeals';
import { useAuth } from '../../context/AuthContext';

const VALID_VIEWS = new Set(['home', 'cards', 'list', 'tasks', 'contacts', 'calendar', 'analytics']);

function normalizeCrmView(view) {
  if (!view) return 'cards';
  if (view === 'today' || view === 'pipeline') return 'home';
  if (VALID_VIEWS.has(view)) return view;
  return 'cards';
}

function isEditableTarget(el) {
  if (!el || typeof el !== 'object') return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

export default function CrmDashboard({
  deals = [],
  settings = null,
  onRefresh,
  onSaveCalculatorDefaults = null,
  onTodayLoaded = null,
  onAddDeal = null,
  initialDealId = null,
  initialCrmView = null,
  initialFocusSection = null,
  initialActionFilter = null,
  tasksListSignal = 0,
  onBackToInbox = null,
  onCrmViewChange = null,
  onLiveDealsRefresh = null
}) {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [crmView, setCrmView] = useState(() => normalizeCrmView(initialCrmView));
  const [today, setToday] = useState(null);
  const [peekDealId, setPeekDealId] = useState(null);
  const [recordDealId, setRecordDealId] = useState(null);
  const [workspaceFocusSection, setWorkspaceFocusSection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stagePrompt, setStagePrompt] = useState(null);
  const [actionFilter, setActionFilter] = useState(initialActionFilter || null);
  const [activeView, setActiveView] = useState(null);
  const [tagFilter, setTagFilter] = useState('');
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [highlightContactId, setHighlightContactId] = useState(null);
  /** Deals fetched by id when parent list is stale (e.g. just saved from extension). */
  const [fetchedDealsById, setFetchedDealsById] = useState(() => new Map());
  const [fetchingDealId, setFetchingDealId] = useState(null);
  const [fetchDealError, setFetchDealError] = useState(null);
  const [locallySeenDealIds, setLocallySeenDealIds] = useState(() => new Set());

  const loadToday = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmAPI.getToday();
      setToday(data);
      onTodayLoaded?.(data?.badgeCount ?? 0);
    } catch (err) {
      setError(err.message || 'Failed to load CRM');
    } finally {
      setLoading(false);
    }
  }, [onTodayLoaded]);

  useEffect(() => {
    loadToday();
  }, [loadToday, deals.length]);

  useEffect(() => {
    if (initialCrmView) {
      setCrmView(normalizeCrmView(initialCrmView));
    }
  }, [initialCrmView]);

  useEffect(() => {
    onCrmViewChange?.(crmView);
  }, [crmView, onCrmViewChange]);

  useEffect(() => {
    if (initialActionFilter) {
      console.log('[CrmDashboard] deep link → action filter', initialActionFilter);
      setActionFilter(initialActionFilter);
      setCrmView('home');
    }
  }, [initialActionFilter]);

  useEffect(() => {
    if (!tasksListSignal) return;
    console.log('[CrmDashboard] alert → tasks list', tasksListSignal);
    setCrmView('tasks');
    setRecordDealId(null);
    setPeekDealId(null);
    setWorkspaceFocusSection(null);
  }, [tasksListSignal]);

  // Deep link: section → full record; deal-only → peek
  useEffect(() => {
    if (!initialDealId) return;
    if (initialFocusSection) {
      console.log('[CrmDashboard] deep link → record', initialDealId, initialFocusSection);
      setRecordDealId(initialDealId);
      setWorkspaceFocusSection(initialFocusSection);
      setPeekDealId(null);
    } else {
      console.log('[CrmDashboard] deep link → peek', initialDealId);
      setPeekDealId(initialDealId);
      setRecordDealId(null);
      setWorkspaceFocusSection(null);
    }
  }, [initialDealId, initialFocusSection]);

  useEffect(() => {
    if (initialFocusSection && recordDealId) {
      setWorkspaceFocusSection(initialFocusSection);
    }
  }, [initialFocusSection, recordDealId]);

  const dealList = Array.isArray(deals) ? deals : [];

  const findDeal = useCallback((id) => {
    if (id == null) return null;
    const sid = String(id);
    const raw = dealList.find(
      (d) => String(d.vettrId ?? '') === sid || String(d.id ?? '') === sid
    );
    if (raw) return normalizeDeal(raw);
    const fetched = fetchedDealsById.get(sid);
    return fetched ? normalizeDeal(fetched) : null;
  }, [dealList, fetchedDealsById]);

  /** When search/kanban has a deal the parent list doesn't, load it so peek/workspace can open. */
  const ensureDealLoaded = useCallback(async (id) => {
    if (id == null) return null;
    const sid = String(id);
    const existing = dealList.find(
      (d) => String(d.vettrId ?? '') === sid || String(d.id ?? '') === sid
    );
    if (existing) return normalizeDeal(existing);
    if (fetchedDealsById.has(sid)) return normalizeDeal(fetchedDealsById.get(sid));

    setFetchingDealId(sid);
    setFetchDealError(null);
    try {
      const data = await dealsAPI.getDeal(sid);
      const deal = data?.deal;
      if (!deal) throw new Error('Deal not found');
      const normalized = normalizeDeal(deal);
      setFetchedDealsById((prev) => {
        const next = new Map(prev);
        next.set(sid, normalized);
        return next;
      });
      console.log('[CrmDashboard] fetched missing deal', sid, normalized?.name);
      onRefresh?.();
      return normalized;
    } catch (err) {
      console.warn('[CrmDashboard] fetch deal failed', sid, err.message);
      setFetchDealError(err.message || 'Failed to load deal');
      return null;
    } finally {
      setFetchingDealId((cur) => (cur === sid ? null : cur));
    }
  }, [dealList, fetchedDealsById, onRefresh]);

  const peekDeal = useMemo(() => findDeal(peekDealId), [findDeal, peekDealId]);
  const recordDeal = useMemo(() => findDeal(recordDealId), [findDeal, recordDealId]);
  const selectedDealId = recordDealId || peekDealId;

  useEffect(() => {
    const id = recordDealId || peekDealId;
    if (id == null) return;
    if (findDeal(id)) return;
    ensureDealLoaded(id);
  }, [recordDealId, peekDealId, findDeal, ensureDealLoaded]);

  const nextActionByDealId = useMemo(() => buildNextActionByDealId(today), [today]);

  const ddOverdueDealIds = useMemo(() => {
    const set = new Set();
    for (const row of today?.ddOverdue || []) {
      const id = Number(row.saved_deal_id);
      if (Number.isFinite(id)) set.add(id);
    }
    return set;
  }, [today]);

  const highlightDealIds = useMemo(
    () => getActionFilterDealIds(today, actionFilter),
    [today, actionFilter]
  );

  const taskSummary = today?.tasks || {};
  const openTaskCount = taskSummary.openCount ?? 0;

  const filteredDeals = useMemo(() => {
    let list = filterDealsByView(dealList, activeView, user?.userId || user?.id);
    if (tagFilter) {
      list = list.filter((d) => {
        const tags = d.tags || [];
        return tags.some((t) => String(t).toLowerCase() === tagFilter);
      });
    }
    return list;
  }, [dealList, activeView, tagFilter, user]);

  const filteredDealIds = useMemo(
    () => filteredDeals.map((d) => d.vettrId ?? d.id).filter((id) => id != null),
    [filteredDeals]
  );

  const markDealSeenLocally = useCallback((id) => {
    if (id == null) return;
    const sid = String(id);
    setLocallySeenDealIds((prev) => {
      if (prev.has(sid)) return prev;
      const next = new Set(prev);
      next.add(sid);
      return next;
    });
    dealsAPI.markDealSeen(sid).catch((err) => {
      console.warn('[CrmDashboard] markDealSeen failed', sid, err.message);
    });
  }, []);

  const openPeek = useCallback((id) => {
    console.log('[CrmDashboard] peek', id);
    setFetchDealError(null);
    setPeekDealId(id);
    setRecordDealId(null);
    setWorkspaceFocusSection(null);
    markDealSeenLocally(id);
    ensureDealLoaded(id);
  }, [ensureDealLoaded, markDealSeenLocally]);

  const openRecord = useCallback((id, opts = {}) => {
    console.log('[CrmDashboard] open record', id, opts.focusSection || null);
    setFetchDealError(null);
    setRecordDealId(id);
    setPeekDealId(null);
    setWorkspaceFocusSection(opts.focusSection || null);
    markDealSeenLocally(id);
    ensureDealLoaded(id);
  }, [ensureDealLoaded, markDealSeenLocally]);

  const handleSelectDeal = useCallback((id, opts = {}) => {
    if (opts.openRecord || opts.focusSection) {
      openRecord(id, opts);
    } else {
      openPeek(id);
    }
  }, [openPeek, openRecord]);

  const handleClosePeek = useCallback(() => {
    setPeekDealId(null);
  }, []);

  const handleCloseRecord = useCallback(() => {
    setRecordDealId(null);
    setWorkspaceFocusSection(null);
  }, []);

  // Escape: record first, then peek. Body scroll lock only for full record.
  useEffect(() => {
    if (!recordDealId && !peekDealId) return undefined;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (cmdkOpen) return;
      if (recordDealId) {
        handleCloseRecord();
      } else if (peekDealId) {
        handleClosePeek();
      }
    };
    window.addEventListener('keydown', onKey);
    let prevOverflow;
    if (recordDealId) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      if (recordDealId && prevOverflow !== undefined) {
        document.body.style.overflow = prevOverflow;
      }
    };
  }, [recordDealId, peekDealId, cmdkOpen, handleCloseRecord, handleClosePeek]);

  // Cmd+K and / for search when CRM is mounted
  useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        setCmdkOpen(true);
        return;
      }
      if (e.key === '/' && !meta && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault();
        setCmdkOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleRefresh = async () => {
    await loadToday();
    onRefresh?.();
  };

  const handleStageChanged = (result, dealName) => {
    if (!result || result.unchanged) return;
    const stage = result.progressStage;
    if (stage === 'Starting Due Diligence') {
      setStagePrompt({
        dealId: result.savedDealId,
        dealName: dealName || recordDeal?.name || peekDeal?.name,
        stage,
        suggestedTask: null,
        queued: false
      });
    }
  };

  const handleAddSuggestedTask = async () => {
    if (!stagePrompt?.dealId || !stagePrompt.suggestedTask) return;
    try {
      await crmAPI.createTask(stagePrompt.dealId, {
        title: stagePrompt.suggestedTask,
        source: 'stage_suggestion'
      });
      setStagePrompt(null);
      await handleRefresh();
    } catch (err) {
      alert('Failed to add task: ' + err.message);
    }
  };

  const handleStartDdFromPrompt = async () => {
    if (!stagePrompt?.dealId) return;
    try {
      await crmAPI.startDealDd(stagePrompt.dealId);
      setStagePrompt(null);
      openRecord(stagePrompt.dealId, { focusSection: 'crm-dd' });
      await handleRefresh();
    } catch (err) {
      alert('Failed to start DD: ' + err.message);
    }
  };

  const handleBlankUnderwriting =
    typeof crmAPI.createBlankUnderwriting === 'function'
      ? async () => {
          const name = window.prompt('Deal name for blank underwriting', 'Off-market deal');
          if (name === null) return;
          try {
            const res = await crmAPI.createBlankUnderwriting({
              name: name.trim() || 'Off-market deal'
            });
            console.log('[crm] blank underwriting created', res.savedDealId);
            await handleRefresh();
            window.location.assign(`/app/underwriting/${res.savedDealId}`);
          } catch (err) {
            alert('Failed to create underwriting: ' + (err.message || 'error'));
          }
        }
      : null;

  const handleCmdkAction = (item) => {
    if (item.action === 'addDeal' && typeof onAddDeal === 'function') {
      onAddDeal();
    } else if (item.action === 'importCsv') {
      setShowCsvImport(true);
    } else if (item.action === 'view' && item.view) {
      setCrmView(item.view);
    }
  };

  const handleCmdkContact = (contact) => {
    setCrmView('contacts');
    setHighlightContactId(contact?.id || null);
    const firstDeal = contact?.first_deal_id
      || (Array.isArray(contact?.linked_deals) && contact.linked_deals[0]?.id);
    if (firstDeal) {
      openPeek(firstDeal);
    }
  };

  if (loading && !today) {
    return <div className="crm-panel crm-panel--loading">Loading Vettr CRM…</div>;
  }

  if (error && !today) {
    return (
      <div className="crm-panel crm-panel--error">
        <p>{error}</p>
        <button type="button" className="btn-secondary" onClick={loadToday}>Retry</button>
      </div>
    );
  }

  const recordDrawer =
    recordDeal && typeof document !== 'undefined'
      ? createPortal(
          <div className="crm-drawer-root" role="presentation">
            <button
              type="button"
              className="crm-drawer-backdrop"
              aria-label="Close deal workspace"
              onClick={handleCloseRecord}
            />
            <aside
              className="crm-drawer crm-drawer--record"
              role="dialog"
              aria-modal="true"
              aria-label="Deal workspace"
            >
              <CrmDealWorkspace
                deal={recordDeal}
                dealId={recordDealId}
                settings={settings}
                onRefresh={handleRefresh}
                onSaveCalculatorDefaults={onSaveCalculatorDefaults}
                onClose={handleCloseRecord}
                onStageChanged={(result) => handleStageChanged(result, recordDeal.name)}
                focusSectionId={workspaceFocusSection}
                dealIds={filteredDealIds}
                onNavigateDeal={(id) => openRecord(id)}
              />
            </aside>
          </div>,
          document.body
        )
      : null;

  const navBadges = {
    badge: today?.badgeCount ?? 0,
    deals: dealList.length,
    cards: dealList.filter((d) => !isPassedOnDeal(normalizeDeal(d))).length,
    tasks: openTaskCount
  };

  const peekNextAction =
    nextActionByDealId instanceof Map && peekDealId != null
      ? nextActionByDealId.get(Number(peekDealId)) || null
      : null;

  const peekPanel =
    peekDeal && !recordDeal && typeof document !== 'undefined'
      ? createPortal(
          <div className="crm-peek-overlay" role="presentation">
            <button
              type="button"
              className="crm-peek-overlay__backdrop"
              aria-label="Close deal peek"
              onClick={handleClosePeek}
            />
            <aside className="crm-peek-overlay__panel" role="dialog" aria-modal="true" aria-label="Deal peek">
              <CrmDealPeek
                deal={peekDeal}
                dealId={peekDealId}
                nextAction={peekNextAction}
                onOpen={openRecord}
                onClose={handleClosePeek}
                onStageChanged={handleStageChanged}
                onRefresh={handleRefresh}
              />
            </aside>
          </div>,
          document.body
        )
      : selectedDealId
        && !peekDeal
        && !recordDeal
        && typeof document !== 'undefined'
        ? createPortal(
          <div className="crm-peek-overlay" role="presentation">
            <button
              type="button"
              className="crm-peek-overlay__backdrop"
              aria-label="Close"
              onClick={() => {
                handleClosePeek();
                handleCloseRecord();
              }}
            />
            <aside className="crm-peek-overlay__panel" role="dialog" aria-modal="true" aria-label="Loading deal">
              <div className="crm-panel" style={{ padding: 16 }}>
                {fetchingDealId ? (
                  <p className="crm-muted">Loading deal…</p>
                ) : (
                  <>
                    <p>{fetchDealError || 'This deal could not be opened.'}</p>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => ensureDealLoaded(selectedDealId)}
                    >
                      Retry
                    </button>
                  </>
                )}
              </div>
            </aside>
          </div>,
          document.body
        )
        : null;

  const mainContent = (
    <>
      {stagePrompt ? (
        <SuggestedTaskPrompt
          dealName={stagePrompt.dealName}
          stage={stagePrompt.stage}
          suggestedTask={stagePrompt.suggestedTask}
          queued={Boolean(stagePrompt.queued)}
          onAddTask={handleAddSuggestedTask}
          onStartDd={stagePrompt.stage === 'Starting Due Diligence' ? handleStartDdFromPrompt : null}
          onDismiss={() => setStagePrompt(null)}
        />
      ) : null}

      {crmView === 'home' && (
        <>
          <CrmQuickAdd
            deals={dealList}
            onCreated={() => handleRefresh()}
          />
          <CrmViewBar
            deals={dealList}
            activeViewId={activeView?.id}
            onViewChange={setActiveView}
            tagFilter={tagFilter}
            onTagFilterChange={setTagFilter}
          />
          <CrmActionStrip
            today={today}
            activeFilter={actionFilter}
            onFilterChange={setActionFilter}
            onSelectDeal={handleSelectDeal}
            onRefresh={handleRefresh}
          />

          {filteredDeals.length === 0 ? (
            <div className="crm-empty">
              <h2>No deals in Vettr CRM yet</h2>
              <p>Save a listing from Deal Aggregator, add one manually, or import a CSV of off-market deals.</p>
              <div className="crm-empty__actions">
                {typeof onBackToInbox === 'function' ? (
                  <button type="button" className="btn-primary" onClick={onBackToInbox}>
                    Browse Deal Aggregator
                  </button>
                ) : null}
                {typeof onAddDeal === 'function' ? (
                  <button type="button" className="btn-secondary" onClick={onAddDeal}>
                    Add deal manually
                  </button>
                ) : null}
                <button type="button" className="btn-secondary" onClick={() => setShowCsvImport(true)}>
                  Import CSV
                </button>
              </div>
            </div>
          ) : (
            <CrmKanban
              deals={filteredDeals}
              settings={settings}
              selectedDealId={selectedDealId}
              onSelectDeal={handleSelectDeal}
              onRefresh={handleRefresh}
              onStageChanged={handleStageChanged}
              onBlankUnderwriting={handleBlankUnderwriting}
              highlightDealIds={highlightDealIds}
              nextActionByDealId={nextActionByDealId}
              onAddDeal={onAddDeal}
              onImportCsv={() => setShowCsvImport(true)}
            />
          )}
        </>
      )}

      {crmView === 'cards' && (
        <CrmDeedBoard
          deals={filteredDeals}
          settings={settings}
          selectedDealId={selectedDealId}
          onSelectDeal={handleSelectDeal}
          onRefresh={handleRefresh}
          onStageChanged={handleStageChanged}
          nextActionByDealId={nextActionByDealId}
          overdueDealIds={ddOverdueDealIds}
          locallySeenDealIds={locallySeenDealIds}
          onAddDeal={onAddDeal}
          onLiveDealsRefresh={onLiveDealsRefresh}
        />
      )}

      {crmView === 'list' && (
        <SavedDeals
          deals={filteredDeals}
          settings={settings}
          onUpdate={onRefresh}
          onSaveCalculatorDefaults={onSaveCalculatorDefaults}
          onAddDeal={onAddDeal}
          workspaceMode
          onOpenInCrm={(dealId) => handleSelectDeal(dealId)}
        />
      )}

      {crmView === 'tasks' && (
        <CrmTaskList
          deals={dealList}
          onSelectDeal={handleSelectDeal}
          onRefresh={handleRefresh}
        />
      )}

      {crmView === 'contacts' && (
        <CrmContactList
          deals={dealList}
          onSelectDeal={handleSelectDeal}
          highlightContactId={highlightContactId}
        />
      )}

      {crmView === 'calendar' && <CrmCalendar />}

      {crmView === 'analytics' && <CrmAnalytics />}
    </>
  );

  return (
    <div className="crm-dashboard">
      {isMobile && typeof onBackToInbox === 'function' ? (
        <div className="crm-mobile-return">
          <button
            type="button"
            className="crm-mobile-return__btn"
            onClick={() => {
              console.log('[CrmDashboard] ← Inbox');
              onBackToInbox();
            }}
          >
            ← Inbox
          </button>
          <span className="crm-mobile-return__label">Vettr CRM</span>
        </div>
      ) : null}

      {isMobile ? (
        <>
          <CrmObjectNav
            crmView={crmView}
            onViewChange={setCrmView}
            badges={navBadges}
            isMobile
            onSearchFocus={() => setCmdkOpen(true)}
          />
          {mainContent}
        </>
      ) : (
        <div className="crm-layout crm-layout--shell">
          <CrmObjectNav
            crmView={crmView}
            onViewChange={(view) => {
              setCrmView(view);
              setPeekDealId(null);
            }}
            badges={navBadges}
            onSearchFocus={() => setCmdkOpen(true)}
            isMobile={false}
          />
          <div className="crm-layout__main">
            {mainContent}
          </div>
        </div>
      )}

      {recordDrawer}
      {peekPanel}

      <CrmCommandMenu
        isOpen={cmdkOpen}
        onClose={() => setCmdkOpen(false)}
        onSelectDeal={(id) => openPeek(id)}
        onSelectContact={handleCmdkContact}
        onAction={handleCmdkAction}
      />

      <CrmCsvImportModal
        isOpen={showCsvImport}
        onClose={() => setShowCsvImport(false)}
        onImported={() => {
          handleRefresh();
          setShowCsvImport(false);
        }}
      />
    </div>
  );
}
