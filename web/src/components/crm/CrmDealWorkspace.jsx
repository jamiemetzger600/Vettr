import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DealDetailsPanel from '../DealDetailsPanel';
import { crmAPI, dealsAPI, teamsAPI } from '../../utils/api';
import { formatDate, getDealProgressLabel } from '../../utils/normalizeDeal';
import { PIPELINE_STAGE_OPTIONS } from '../../utils/pipelineStages';
import { getCalculatorDefaultsFromSettings } from '../../utils/calculatorDefaultsFromSettings';
import { patchCalculatorStateListingFinancials } from '../../utils/savedDealCalculatorSummary';
import { saveCalculatorState } from '../../utils/dealCalculatorStorage';
import {
  listingEditsFromDeal,
  buildSavedDealListingPayload,
  mergeListingEditsIntoDeal
} from '../../utils/savedDealListingEdits';
import CrmDealTasks from './CrmDealTasks';
import DdChecklist from './dd/DdChecklist';
import UnderwritingCrmLaunch from './underwriting/UnderwritingCrmLaunch';
import DealThread from './DealThread';
import CrmDealContacts from './CrmDealContacts';
import { useAuth } from '../../context/AuthContext';
import { useTeam } from '../../context/TeamContext';

const RECORD_TABS = [
  {
    id: 'overview',
    label: 'Overview',
    sections: ['description', 'overview', 'ioi']
  },
  { id: 'calculator', label: 'Calculator', sections: ['calculator'] },
  { id: 'people', label: 'People', sections: ['broker-contact'] },
  { id: 'tasks', label: 'Tasks', sections: ['crm-followup'] },
  { id: 'timeline', label: 'Timeline', sections: ['crm-timeline'] },
  { id: 'dd', label: 'DD', sections: ['crm-dd'] },
  { id: 'uw', label: 'UW', sections: ['crm-underwriting'] },
  { id: 'talk', label: 'Talk', sections: ['crm-talk'] }
];

const SECTION_TO_TAB = {
  description: 'overview',
  overview: 'overview',
  calculator: 'calculator',
  ioi: 'overview',
  'crm-organize': 'overview',
  'crm-progress': 'overview',
  'broker-contact': 'people',
  'crm-followup': 'tasks',
  'crm-timeline': 'timeline',
  'crm-dd': 'dd',
  'crm-underwriting': 'uw',
  'crm-talk': 'talk'
};

function activityLabel(type) {
  const labels = {
    deal_saved: 'Saved to CRM',
    listing_hydrated: 'Listing synced',
    note: 'Note',
    stage_change: 'Stage change',
    dd_portal_comment: 'DD portal comment',
    dd_started: 'DD started',
    task_created: 'Task created'
  };
  return labels[type] || type;
}

function tabFromFocusSection(focusSectionId) {
  if (!focusSectionId) return 'overview';
  return SECTION_TO_TAB[focusSectionId] || 'overview';
}

export default function CrmDealWorkspace({
  deal,
  dealId,
  settings = null,
  onRefresh,
  onSaveCalculatorDefaults = null,
  onClose = null,
  onStageChanged = null,
  focusSectionId = null,
  dealIds = null,
  onNavigateDeal = null
}) {
  const { user } = useAuth();
  const { teams, activeTeamId } = useTeam();
  const [progressStage, setProgressStage] = useState(deal?.progressStage || '');
  const [progressHistory, setProgressHistory] = useState(deal?.progressHistory || []);
  const [progressSaving, setProgressSaving] = useState(false);
  const [detail, setDetail] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteChecklist, setNoteChecklist] = useState(false);
  const [pinNote, setPinNote] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [localFocusSection, setLocalFocusSection] = useState(focusSectionId);
  const [activeTab, setActiveTab] = useState(() => tabFromFocusSection(focusSectionId));
  const [customStageLabel, setCustomStageLabel] = useState(deal?.customStageLabel || '');
  const [savingMeta, setSavingMeta] = useState(false);
  const [listingEdits, setListingEdits] = useState(() => listingEditsFromDeal(deal));
  const [brokerInfo, setBrokerInfo] = useState({
    name: deal?.brokerName || '',
    company: deal?.brokerCompany || '',
    phone: deal?.brokerPhone || '',
    email: deal?.brokerEmail || ''
  });
  const persistListingTimerRef = useRef(null);
  const listingEditsRef = useRef(listingEdits);
  const brokerInfoRef = useRef(brokerInfo);
  const dealRef = useRef(deal);
  const seededListingDealIdRef = useRef(null);
  listingEditsRef.current = listingEdits;
  brokerInfoRef.current = brokerInfo;
  dealRef.current = deal;

  useEffect(() => {
    setLocalFocusSection(focusSectionId);
    setActiveTab(tabFromFocusSection(focusSectionId));
  }, [focusSectionId, dealId]);

  const writeEnabled = detail?.access ? Boolean(detail.access.canWrite) : true;
  const writeEnabledRef = useRef(writeEnabled);
  writeEnabledRef.current = writeEnabled;

  useEffect(() => {
    if (!deal) return;
    setProgressStage(deal.progressStage || '');
    setProgressHistory(deal.progressHistory || []);
    setCustomStageLabel(deal.customStageLabel || '');
  }, [deal]);

  useEffect(() => {
    if (!deal || !dealId) return;
    if (seededListingDealIdRef.current === String(dealId)) return;
    seededListingDealIdRef.current = String(dealId);
    setListingEdits(listingEditsFromDeal(deal));
    setBrokerInfo({
      name: deal.brokerName || '',
      company: deal.brokerCompany || '',
      phone: deal.brokerPhone || '',
      email: deal.brokerEmail || ''
    });
  }, [dealId, deal]);

  const loadDetail = useCallback(async () => {
    if (!dealId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    try {
      const data = await crmAPI.getDealActivities(dealId);
      setDetail(data);
    } catch (err) {
      console.warn('[CrmDealWorkspace] activities failed', err.message);
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const navIndex = useMemo(() => {
    if (!Array.isArray(dealIds) || !dealId) return -1;
    const id = String(dealId);
    return dealIds.findIndex((d) => String(d) === id);
  }, [dealIds, dealId]);

  const canPrev = navIndex > 0;
  const canNext = navIndex >= 0 && navIndex < (dealIds?.length || 0) - 1;

  const visibleSectionIds = useMemo(() => {
    const tab = RECORD_TABS.find((t) => t.id === activeTab) || RECORD_TABS[0];
    return tab.sections;
  }, [activeTab]);

  const panelFocusSectionId = useMemo(() => {
    if (localFocusSection && visibleSectionIds.includes(localFocusSection)) {
      return localFocusSection;
    }
    return visibleSectionIds[0] || null;
  }, [localFocusSection, visibleSectionIds]);

  const brokerOtherDeals = useMemo(() => {
    const broker = detail?.contacts?.find((c) => c.role === 'broker') || detail?.contacts?.[0];
    if (!broker) return null;
    const count = Math.max(0, (Number(broker.deal_count) || 0) - 1);
    return { name: broker.name, company: broker.company_name, otherCount: count };
  }, [detail]);

  const handleTabChange = (tabId) => {
    console.log('[CrmDealWorkspace] tab', tabId);
    setActiveTab(tabId);
    const tab = RECORD_TABS.find((t) => t.id === tabId);
    setLocalFocusSection(tab?.sections?.[0] || null);
  };

  const handleRefresh = async () => {
    await onRefresh?.();
    await loadDetail();
  };

  const handleAddCrmNote = async () => {
    if (!dealId || !noteText.trim()) return;
    setSavingNote(true);
    try {
      let body = noteText.trim();
      let checklist = undefined;
      if (noteChecklist) {
        checklist = body
          .split('\n')
          .map((line) => line.replace(/^\s*[-*\[\]\sxX]+\s*/, '').trim())
          .filter(Boolean)
          .map((text) => ({ text, done: false }));
        body = checklist.map((c) => `☐ ${c.text}`).join('\n');
      }
      await crmAPI.addActivity(dealId, {
        body,
        activityType: 'note',
        title: noteTitle.trim() || null,
        pinned: pinNote,
        checklist
      });
      setNoteText('');
      setNoteTitle('');
      setPinNote(false);
      setNoteChecklist(false);
      await loadDetail();
      onRefresh?.();
    } catch (err) {
      alert('Failed to add note: ' + err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const handleTogglePin = async (activity) => {
    try {
      await crmAPI.updateNote(activity.id, { pinned: !activity.pinned });
      await loadDetail();
    } catch (err) {
      alert(err.message || 'Failed to pin note');
    }
  };

  const handleShareToTeam = async () => {
    const teamId = activeTeamId || teams[0]?.id;
    if (!teamId || !dealId) {
      alert('Create or select a team in Settings first, then share.');
      return;
    }
    setSharing(true);
    try {
      const data = await teamsAPI.shareDeal(teamId, dealId);
      await handleRefresh();
      if (data?.pending) {
        alert('Share requested. An admin must approve before the deal joins the team. Your personal copy stays in My Deals.');
      } else {
        alert('Deal shared with the team. Your personal copy stays in My Deals; the team has its own copy.');
      }
    } catch (err) {
      alert(err.message || 'Failed to share');
    } finally {
      setSharing(false);
    }
  };

  const handleUnshare = async () => {
    if (!dealId) return;
    if (!window.confirm('Remove this deal from the team? Personal copies in My Deals are kept.')) return;
    setSharing(true);
    try {
      await teamsAPI.unshareDeal(dealId);
      await handleRefresh();
    } catch (err) {
      alert(err.message || 'Failed to unshare');
    } finally {
      setSharing(false);
    }
  };

  const handleProgressSelectChange = async (e) => {
    const newStage = e.target.value;
    if (progressSaving || !deal?.id) return;
    if (!newStage.trim()) return;

    const previousStage = progressStage;
    const previousHistory = progressHistory;
    const newHistory = [
      ...previousHistory,
      { stage: newStage, timestamp: new Date().toISOString() }
    ];

    setProgressStage(newStage);
    setProgressHistory(newHistory);
    setProgressSaving(true);
    try {
      const result = await crmAPI.updateStage(deal.id, newStage);
      if (result.progressHistory) setProgressHistory(result.progressHistory);
      onStageChanged?.(result, deal.name);
      onRefresh?.();
      await loadDetail();
      if (newStage === 'Custom Status') {
        setLocalFocusSection('overview');
        console.log('[CrmDealWorkspace] Custom Status selected — prompt for label');
      }
    } catch (error) {
      setProgressStage(previousStage);
      setProgressHistory(previousHistory);
      alert('Failed to update progress: ' + error.message);
    } finally {
      setProgressSaving(false);
    }
  };

  const handleSaveCustomStageLabel = async () => {
    if (!dealId || !writeEnabled) return;
    const label = customStageLabel.trim();
    if (!label) {
      alert('Enter a custom status label (e.g. “Waiting on seller P&Ls”).');
      return;
    }
    setSavingMeta(true);
    try {
      await dealsAPI.updateDeal(dealId, { customStageLabel: label });
      console.log('[CrmDealWorkspace] custom stage label saved', label);
      onRefresh?.();
    } catch (err) {
      alert(err.message || 'Failed to save custom status');
    } finally {
      setSavingMeta(false);
    }
  };

  const handleIOISent = async (ioiText) => {
    if (!deal?.id) return;
    const timestamp = new Date().toISOString();
    const dateLabel = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const separator = `\n\n--- IOI Sent ${dateLabel} ---\n`;
    const currentNotes = deal?.notes || '';
    const updatedNotes = (currentNotes ? currentNotes + separator : `--- IOI Sent ${dateLabel} ---\n`) + ioiText;
    const newHistory = [...progressHistory, { stage: 'Send IOI', timestamp }];

    try {
      await dealsAPI.updateDeal(deal.id, {
        notes: updatedNotes,
        progressStage: 'Send IOI',
        progressHistory: newHistory
      });
      setProgressStage('Send IOI');
      setProgressHistory(newHistory);
      onRefresh?.();
      await loadDetail();
    } catch (error) {
      console.error('[CrmDealWorkspace] IOI save failed:', error);
      alert('IOI sent but failed to save record: ' + error.message);
    }
  };

  const headerProgressLabel = useMemo(() => {
    if (progressStage === 'Custom Status') {
      const label = (customStageLabel || '').trim();
      return label || 'Custom Status';
    }
    if (progressStage?.trim()) return progressStage.trim();
    return getDealProgressLabel({ ...deal, progressHistory, progressStage }) || '';
  }, [progressStage, progressHistory, deal, customStageLabel]);

  const lastTouchedLabel = useMemo(() => {
    const last = detail?.lastActivity || detail?.activities?.[0];
    if (!last) return null;
    const at = last.at || last.occurred_at;
    if (!at) return null;
    const who = (last.actorEmail || last.actor_email || '').split('@')[0];
    const when = formatDate(at);
    return who ? `Last touched ${when} · ${who}` : `Last touched ${when}`;
  }, [detail]);

  const dealWithBroker = useMemo(() => {
    if (!deal) return deal;
    const brokerContact = detail?.contacts?.find((c) => c.role === 'broker')
      || detail?.contacts?.[0];
    if (!brokerContact) return deal;
    return {
      ...deal,
      brokerName: deal.brokerName || brokerContact.name || deal.broker,
      brokerCompany: deal.brokerCompany || brokerContact.company_name || deal.source,
      brokerEmail: deal.brokerEmail || brokerContact.email,
      brokerPhone: deal.brokerPhone || brokerContact.phone
    };
  }, [deal, detail]);

  const calculatorDefaults = useMemo(
    () => getCalculatorDefaultsFromSettings(settings),
    [settings]
  );

  const persistListingPayload = useCallback(
    async (payload) => {
      const dealRow = dealRef.current;
      if (!dealRow?.id || !writeEnabledRef.current) return;
      const calculatorState = patchCalculatorStateListingFinancials(
        dealRow,
        { askingPrice: payload.askingPrice, ebitda: payload.ebitda },
        calculatorDefaults
      );
      console.log('[CrmDealWorkspace] listing persist', dealRow.id, payload.name);
      await dealsAPI.updateDeal(dealRow.id, { ...payload, calculatorState });
      saveCalculatorState(dealRow.id, calculatorState);
      onRefresh?.();
    },
    [calculatorDefaults, onRefresh]
  );

  useEffect(() => () => {
    if (persistListingTimerRef.current) clearTimeout(persistListingTimerRef.current);
  }, []);

  const schedulePersistListing = useCallback(() => {
    if (!writeEnabledRef.current) return;
    if (persistListingTimerRef.current) clearTimeout(persistListingTimerRef.current);
    persistListingTimerRef.current = setTimeout(async () => {
      persistListingTimerRef.current = null;
      try {
        const payload = buildSavedDealListingPayload(
          listingEditsRef.current,
          brokerInfoRef.current,
          dealRef.current
        );
        await persistListingPayload(payload);
      } catch (e) {
        console.error('[CrmDealWorkspace] listing persist failed:', e);
        alert('Failed to save deal details: ' + e.message);
      }
    }, 1000);
  }, [persistListingPayload]);

  const handleListingEditChange = (key, value) => {
    setListingEdits((prev) => ({ ...prev, [key]: value }));
    schedulePersistListing();
  };

  const handleBrokerChange = (key, value) => {
    setBrokerInfo((prev) => ({ ...prev, [key]: value }));
    schedulePersistListing();
  };

  const mergedDeal = useMemo(
    () => mergeListingEditsIntoDeal(dealWithBroker || deal, listingEdits, brokerInfo),
    [deal, dealWithBroker, listingEdits, brokerInfo]
  );

  useEffect(() => {
    if (!dealWithBroker) return;
    setBrokerInfo((prev) => {
      const empty = !prev.name && !prev.company && !prev.phone && !prev.email;
      if (!empty) return prev;
      const next = {
        name: dealWithBroker.brokerName || '',
        company: dealWithBroker.brokerCompany || '',
        phone: dealWithBroker.brokerPhone || '',
        email: dealWithBroker.brokerEmail || ''
      };
      if (!next.name && !next.company && !next.phone && !next.email) return prev;
      return next;
    });
  }, [dealWithBroker]);

  const extraSections = [
    {
      id: 'broker-contact',
      label: 'People on this deal',
      icon: 'broker',
      render: () => (
        <div className="crm-people-tab">
          {brokerOtherDeals?.otherCount > 0 ? (
            <p className="crm-people-tab__broker-hint">
              <span className="crm-chip">
                {brokerOtherDeals.name || 'Broker'}
                {brokerOtherDeals.company ? ` · ${brokerOtherDeals.company}` : ''}
              </span>
              {' '}
              also on {brokerOtherDeals.otherCount} other deal
              {brokerOtherDeals.otherCount === 1 ? '' : 's'}
            </p>
          ) : null}
          <CrmDealContacts dealId={dealId} canWrite={writeEnabled} onChanged={loadDetail} />
        </div>
      )
    },
    {
      id: 'crm-followup',
      label: 'Follow up',
      icon: 'followup',
      render: () => (
        <CrmDealTasks
          dealId={dealId}
          dealName={deal?.name}
          contacts={detail?.contacts || []}
          userEmail={user?.email || ''}
          onCreated={handleRefresh}
          disabled={!writeEnabled}
          onSelectDeal={null}
        />
      )
    },
    {
      id: 'crm-dd',
      label: 'Due Diligence',
      icon: 'checklist',
      render: () => (
        <DdChecklist dealId={dealId} onRefresh={onRefresh} canWrite={writeEnabled} />
      )
    },
    {
      id: 'crm-underwriting',
      label: 'Underwriting',
      icon: 'calculator',
      render: () => (
        <UnderwritingCrmLaunch dealId={dealId} canWrite={writeEnabled} />
      )
    },
    {
      id: 'crm-talk',
      label: 'Talk',
      icon: 'talk',
      render: () => (
        <DealThread
          dealId={dealId}
          onThreadRead={onRefresh}
          onOpenSection={(sectionId) => {
            console.log('[CrmDealWorkspace] open section from Talk', sectionId);
            setLocalFocusSection(sectionId);
          }}
        />
      )
    },
    {
      id: 'crm-timeline',
      label: 'Notes & history',
      icon: 'timeline',
      render: () => (
        <div className="crm-timeline-inline">
          <div className="crm-note-form">
            <input
              className="modal-input"
              placeholder="Note title (optional)"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              disabled={!writeEnabled}
            />
            <textarea
              className="crm-note-input"
              rows={3}
              placeholder={writeEnabled ? (noteChecklist ? 'One checklist item per line…' : 'Add a catch-up note…') : 'Viewer — notes are read-only'}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              disabled={!writeEnabled}
            />
            <div className="crm-note-form__opts">
              <label>
                <input type="checkbox" checked={pinNote} onChange={(e) => setPinNote(e.target.checked)} disabled={!writeEnabled} />
                {' '}Pin
              </label>
              <label>
                <input type="checkbox" checked={noteChecklist} onChange={(e) => setNoteChecklist(e.target.checked)} disabled={!writeEnabled} />
                {' '}Checklist
              </label>
              <button
                type="button"
                className="btn-primary"
                disabled={!writeEnabled || savingNote || !noteText.trim()}
                onClick={handleAddCrmNote}
              >
                {savingNote ? 'Saving…' : 'Add note'}
              </button>
            </div>
          </div>
          {detailLoading ? (
            <p>Loading timeline…</p>
          ) : detail?.activities?.length ? (
            <ul className="crm-activity-list">
              {detail.activities.map((a) => (
                <li key={a.id} className={`crm-activity-item${a.pinned ? ' crm-activity-item--pinned' : ''}`}>
                  <div className="crm-activity-item__head">
                    <span className="crm-activity-type">{activityLabel(a.activity_type)}</span>
                    {a.title ? <strong>{a.title}</strong> : null}
                    {a.activity_type === 'note' && writeEnabled ? (
                      <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => handleTogglePin(a)}>
                        {a.pinned ? 'Unpin' : 'Pin'}
                      </button>
                    ) : null}
                  </div>
                  <div className="crm-activity-body" style={{ whiteSpace: 'pre-wrap' }}>{a.body}</div>
                  <div className="crm-activity-meta">
                    {(a.actor_email || '').split('@')[0]} · {formatDate(a.occurred_at)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="crm-muted">No notes or history yet.</p>
          )}
        </div>
      )
    }
  ];

  const teamIdOnDeal = deal?.team_id || deal?.teamId || detail?.access?.teamId;
  const canShare = writeEnabled && !teamIdOnDeal && teams.length > 0;
  const canUnshare = writeEnabled && Boolean(teamIdOnDeal) && detail?.access?.canUnshare !== false;

  const footer = (
    <>
      {canShare ? (
        <button type="button" className="btn-secondary" disabled={sharing} onClick={handleShareToTeam}>
          {sharing ? 'Sharing…' : 'Share to team'}
        </button>
      ) : null}
      {canUnshare ? (
        <button type="button" className="btn-secondary" disabled={sharing} onClick={handleUnshare}>
          Remove from team
        </button>
      ) : null}
      {mergedDeal?.url || deal?.url ? (
        <a
          href={mergedDeal?.url || deal.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
        >
          View Original Listing
        </a>
      ) : (
        <button type="button" className="btn-secondary" disabled>
          No Listing URL Available
        </button>
      )}
      {onClose ? (
        <button type="button" className="btn-primary" onClick={onClose}>
          Close
        </button>
      ) : null}
    </>
  );

  if (!deal) {
    return <p className="crm-workspace__placeholder">Select a deal to open the calculator, IOI tool, and timeline.</p>;
  }

  return (
    <div className="crm-deal-panel">
      <div className="crm-record-chrome">
        <div className="crm-record-chrome__row">
          {onClose ? (
            <button type="button" className="btn-secondary btn-secondary--sm" onClick={onClose}>
              ← Back
            </button>
          ) : null}
          {typeof onNavigateDeal === 'function' && Array.isArray(dealIds) && dealIds.length > 1 ? (
            <div className="crm-record-chrome__nav">
              <button
                type="button"
                className="btn-secondary btn-secondary--sm"
                disabled={!canPrev}
                onClick={() => onNavigateDeal(dealIds[navIndex - 1])}
                aria-label="Previous deal"
              >
                ←
              </button>
              <span className="crm-record-chrome__pos">
                {navIndex + 1} of {dealIds.length}
              </span>
              <button
                type="button"
                className="btn-secondary btn-secondary--sm"
                disabled={!canNext}
                onClick={() => onNavigateDeal(dealIds[navIndex + 1])}
                aria-label="Next deal"
              >
                →
              </button>
            </div>
          ) : null}
        </div>
        {lastTouchedLabel ? (
          <p className="crm-workspace-last-touch" title="Most recent CRM activity on this deal">
            {lastTouchedLabel}
          </p>
        ) : null}
        <nav className="crm-record-tabs" aria-label="Deal record sections">
          {RECORD_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`crm-record-tabs__btn${activeTab === tab.id ? ' crm-record-tabs__btn--active' : ''}`}
              onClick={() => handleTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <DealDetailsPanel
        isOpen
        deal={mergedDeal || deal}
        position="center"
        onClose={onClose || (() => {})}
        settings={settings}
        onSaveCalculatorDefaults={onSaveCalculatorDefaults}
        panelOnly
        showPositionToggle={false}
        showSaveButton={false}
        extraSections={extraSections}
        focusSectionId={panelFocusSectionId}
        visibleSectionIds={visibleSectionIds}
        renderFooter={footer}
        onIOISent={handleIOISent}
        onIOIPrefsSaved={onRefresh}
        headerProgressLabel={headerProgressLabel}
        headerProgressControl={{
          value: progressStage,
          onChange: handleProgressSelectChange,
          options: PIPELINE_STAGE_OPTIONS,
          saving: progressSaving,
          disabled: !writeEnabled,
          customLabel: customStageLabel,
          onCustomLabelChange: (e) => setCustomStageLabel(e.target.value),
          onCustomLabelSave: handleSaveCustomStageLabel,
          customLabelSaving: savingMeta
        }}
        listingEdit={
          writeEnabled
            ? {
                savedAtDisplay: deal.savedAt ? formatDate(deal.savedAt) : undefined,
                values: listingEdits,
                onChange: handleListingEditChange,
                alwaysEditOverview: true,
                descriptionEditMode: true,
                broker: brokerInfo,
                onBrokerChange: handleBrokerChange
              }
            : {
                savedAtDisplay: deal.savedAt ? formatDate(deal.savedAt) : undefined
              }
        }
      />
    </div>
  );
}
