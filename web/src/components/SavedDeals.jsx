import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { dealsAPI, crmAPI } from '../utils/api';
import { getCalculatorDefaultsFromSettings } from '../utils/calculatorDefaultsFromSettings';
import { getQualityPresentation } from '../utils/dealCalculatorMath';
import { formatDate, formatMoney, getDealProgressLabel } from '../utils/normalizeDeal';
import { PIPELINE_STAGE_OPTIONS } from '../utils/pipelineStages';
import {
  getSavedDealCalculatorSummary,
  patchCalculatorStateListingFinancials
} from '../utils/savedDealCalculatorSummary';
import { saveCalculatorState } from '../utils/dealCalculatorStorage';
import DealDetailsPanel from './DealDetailsPanel';
import { recordIoiSent } from '../utils/recordIoiSent';
import DealShareMenu from './DealShareMenu';
import { useIsMobile } from '../hooks/useMediaQuery';
import {
  listingEditsFromDeal,
  buildSavedDealListingPayload,
  mergeListingEditsIntoDeal
} from '../utils/savedDealListingEdits';

const PROGRESS_STAGE_OPTIONS = PIPELINE_STAGE_OPTIONS;

function cocReturnTier(coc) {
  if (coc >= 100) return 'excellent';
  if (coc >= 50) return 'very-good';
  if (coc >= 25) return 'good';
  if (coc >= 0) return 'fair';
  return 'bad';
}

export default function SavedDeals({
  deals,
  settings = null,
  onUpdate,
  onSaveCalculatorDefaults = null,
  onAddDeal = null,
  onOpenInCrm = null,
  /** When true (Vettr CRM List), open deal in CRM workspace instead of the legacy modal. */
  workspaceMode = false
}) {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('savedAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [showModal, setShowModal] = useState(false);

  // Filter and sort deals
  const filteredDeals = useMemo(() => {
    let filtered = [...deals];

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(deal => {
        const name = (deal.name || '').toLowerCase();
        const url = (deal.url || '').toLowerCase();
        const notes = (deal.notes || '').toLowerCase();
        const description = (deal.description || '').toLowerCase();
        const industry = (deal.industry || '').toLowerCase();
        const brokerName = (deal.brokerName || '').toLowerCase();
        return (
          name.includes(query) ||
          url.includes(query) ||
          notes.includes(query) ||
          description.includes(query) ||
          industry.includes(query) ||
          brokerName.includes(query)
        );
      });
    }

    // Sort
    filtered.sort((a, b) => {
      let valA, valB;

      switch (sortField) {
        case 'savedAt':
          valA = new Date(a.savedAt || 0).getTime();
          valB = new Date(b.savedAt || 0).getTime();
          break;
        case 'name':
          valA = (a.name || '').toLowerCase();
          valB = (b.name || '').toLowerCase();
          break;
        case 'askingPrice':
          valA = a.askingPrice || 0;
          valB = b.askingPrice || 0;
          break;
        case 'ebitda':
          valA = a.ebitda || 0;
          valB = b.ebitda || 0;
          break;
        default:
          return 0;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [deals, searchQuery, sortField, sortDirection]);

  // Calculate stats
  const stats = useMemo(() => ({
    total: deals.length,
    withProgress: deals.filter((d) => getDealProgressLabel(d)).length
  }), [deals]);

  const calculatorDefaults = useMemo(() => getCalculatorDefaultsFromSettings(settings), [settings]);

  const calculatorSummaryByDealId = useMemo(() => {
    const m = new Map();
    for (const d of filteredDeals) {
      m.set(d.id, getSavedDealCalculatorSummary(d, calculatorDefaults));
    }
    return m;
  }, [filteredDeals, calculatorDefaults]);

  // Handle sort
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  // Handle select all
  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(filteredDeals.map(d => d.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  // Handle select one
  const handleSelectOne = (id, checked) => {
    const newSelected = new Set(selectedIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedIds(newSelected);
  };

  // Handle view deal — in Vettr CRM List, open the shared workspace drawer
  const handleViewDeal = (deal) => {
    if (workspaceMode && typeof onOpenInCrm === 'function') {
      console.log('[SavedDeals] workspaceMode open deal', deal.id);
      onOpenInCrm(deal.id);
      return;
    }
    setSelectedDeal(deal);
    setShowModal(true);
  };

  // Handle export CSV
  const handleExportCSV = (dealsToExport = null) => {
    const exportDeals = dealsToExport || filteredDeals;
    if (exportDeals.length === 0) return;

    const headers = ['Name', 'Saved Date', 'Progress', 'Asking Price', 'EBITDA', 'Quality', 'COC Return', 'URL', 'Notes'];
    const rows = exportDeals.map((deal) => {
      const summary = getSavedDealCalculatorSummary(deal, calculatorDefaults);
      const { qualityScore: q, cocReturn: c, askingPrice, ebitda } = summary;
      const qDisp = q != null && Number.isFinite(q) ? q : '—';
      const cDisp = c != null && Number.isFinite(c) ? `${c.toFixed(1)}%` : '—';
      const displayAsking = askingPrice ?? deal.askingPrice;
      const displayEbitda = ebitda ?? deal.ebitda;
      return [
        deal.name || '',
        formatDate(deal.savedAt),
        getDealProgressLabel(deal) || '',
        displayAsking || '',
        displayEbitda || '',
        qDisp,
        cDisp,
        deal.url || '',
        (deal.notes || '').replace(/\n/g, ' ')
      ];
    });

    const csv = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `my-deals-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle delete
  const handleDelete = async (dealId) => {
    if (!confirm('Delete this deal?')) return;

    try {
      await dealsAPI.deleteDeal(dealId);
      if (selectedDeal?.id === dealId) {
        setSelectedDeal(null);
        setShowModal(false);
      }
      onUpdate();
    } catch (error) {
      alert('Failed to delete deal: ' + error.message);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected deals?`)) return;

    try {
      await Promise.all(Array.from(selectedIds).map(id => dealsAPI.deleteDeal(id)));
      setSelectedIds(new Set());
      onUpdate();
    } catch (error) {
      alert('Failed to delete deals: ' + error.message);
    }
  };

  // Handle bulk export
  const handleBulkExport = () => {
    const selected = filteredDeals.filter(d => selectedIds.has(d.id));
    handleExportCSV(selected);
  };

  // Handle update notes from modal
  const handleUpdateNotes = async (dealId, notes) => {
    try {
      await dealsAPI.updateDeal(dealId, { notes });
      onUpdate();
    } catch (error) {
      alert('Failed to update notes: ' + error.message);
    }
  };

  const allSelected = filteredDeals.length > 0 && selectedIds.size === filteredDeals.length;
  const someSelected = selectedIds.size > 0;

  return (
    <div className="saved-deals-new">
      {/* Stats Row */}
      <div className="my-deals-stats">
        <div className="stat-card">
          <div className="stat-label">Total Deals</div>
          <div className="stat-value">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pipeline milestone</div>
          <div className="stat-value">{stats.withProgress}</div>
          <div className="stat-sublabel">Deals with a progress stage</div>
        </div>
      </div>

      {/* Controls Row */}
      <div className="my-deals-controls">
        <div className="controls-row">
          <div className="search-box">
            <input
              type="text"
              placeholder="Search deals by name, URL, or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-group">
            <select 
              value={`${sortField}-${sortDirection}`} 
              onChange={(e) => {
                const [field, dir] = e.target.value.split('-');
                setSortField(field);
                setSortDirection(dir);
              }}
            >
              <option value="savedAt-desc">Newest First</option>
              <option value="savedAt-asc">Oldest First</option>
              <option value="name-asc">Name (A-Z)</option>
              <option value="name-desc">Name (Z-A)</option>
              <option value="askingPrice-desc">Highest Price</option>
              <option value="askingPrice-asc">Lowest Price</option>
              <option value="ebitda-desc">Highest EBITDA</option>
              <option value="ebitda-asc">Lowest EBITDA</option>
            </select>

            {typeof onAddDeal === 'function' ? (
              <button type="button" className="btn-primary" onClick={onAddDeal}>
                Add Deal
              </button>
            ) : null}
            <button className="btn-secondary" onClick={() => handleExportCSV()}>
              Export CSV
            </button>
            <button className="btn-secondary" onClick={onUpdate}>
              Refresh
            </button>
          </div>
        </div>

        {/* Bulk Actions */}
        {someSelected && (
          <div className="bulk-actions">
            <span className="bulk-actions-text">
              {selectedIds.size} deal{selectedIds.size !== 1 ? 's' : ''} selected
            </span>
            <button className="btn-secondary" onClick={handleBulkExport}>
              Export Selected
            </button>
            <button className="btn-danger" onClick={handleBulkDelete}>
              Delete Selected
            </button>
            <button className="btn-secondary" onClick={() => setSelectedIds(new Set())}>
              Deselect All
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {deals.length === 0 ? (
        <div className="empty-state">
          <h3>No deals saved yet</h3>
          <p>Save deals from the Deal Aggregator to get started!</p>
        </div>
      ) : filteredDeals.length === 0 ? (
        <div className="empty-state">
          <h3>No deals match your filters</h3>
          <p>Try adjusting your search or filters.</p>
        </div>
      ) : isMobile ? (
        <div className="saved-deals-mobile-list">
          {filteredDeals.map((deal) => {
            const summary = calculatorSummaryByDealId.get(deal.id) || {};
            const { qualityScore, cocReturn } = summary;
            const displayAsking = summary.askingPrice ?? deal.askingPrice;
            const displayEbitda = summary.ebitda ?? deal.ebitda;
            const qp =
              qualityScore != null && Number.isFinite(qualityScore)
                ? getQualityPresentation(qualityScore)
                : null;
            const cocOk = cocReturn != null && Number.isFinite(cocReturn);
            return (
              <button
                key={deal.id}
                type="button"
                className="saved-deal-mobile-card"
                onClick={() => handleViewDeal(deal)}
              >
                <div className="saved-deal-mobile-card__header">
                  <strong className="saved-deal-mobile-card__name">{deal.name || 'Unnamed Deal'}</strong>
                  <span className="saved-deal-mobile-card__date">{formatDate(deal.savedAt)}</span>
                </div>
                <div className="saved-deal-mobile-card__metrics">
                  <span>{formatMoney(displayAsking)}</span>
                  <span>{formatMoney(displayEbitda)} CF</span>
                  {qp ? <span style={{ color: qp.scoreColor }}>Q{qualityScore}</span> : null}
                  {cocOk ? <span data-tier={cocReturnTier(cocReturn)}>{cocReturn.toFixed(0)}% CoC</span> : null}
                </div>
                <div className="saved-deal-mobile-card__progress">
                  {getDealProgressLabel(deal) || 'No progress set'}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="my-deals-table-container">
          <table className="my-deals-table">
            <thead>
              <tr>
                <th style={{ width: '40px' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="sortable" onClick={() => handleSort('name')}>
                  Deal Name
                  {sortField === 'name' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                  )}
                </th>
                <th className="sortable" onClick={() => handleSort('savedAt')}>
                  Saved Date
                  {sortField === 'savedAt' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                  )}
                </th>
                <th>Progress</th>
                <th className="sortable" onClick={() => handleSort('askingPrice')}>
                  Asking Price
                  {sortField === 'askingPrice' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                  )}
                </th>
                <th className="sortable" onClick={() => handleSort('ebitda')}>
                  EBITDA
                  {sortField === 'ebitda' && (
                    <span className="sort-indicator">{sortDirection === 'asc' ? ' ↑' : ' ↓'}</span>
                  )}
                </th>
                <th>Quality</th>
                <th>COC Return</th>
                <th style={{ width: '200px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => {
                const summary = calculatorSummaryByDealId.get(deal.id) || {};
                const { qualityScore, cocReturn } = summary;
                const displayAsking = summary.askingPrice ?? deal.askingPrice;
                const displayEbitda = summary.ebitda ?? deal.ebitda;
                const qp =
                  qualityScore != null && Number.isFinite(qualityScore)
                    ? getQualityPresentation(qualityScore)
                    : null;
                const cocOk = cocReturn != null && Number.isFinite(cocReturn);
                return (
                <tr
                  key={deal.id}
                  className={selectedIds.has(deal.id) ? 'selected' : ''}
                  onClick={() => handleViewDeal(deal)}
                  style={{ cursor: 'pointer' }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(deal.id)}
                      onChange={(e) => handleSelectOne(deal.id, e.target.checked)}
                    />
                  </td>
                  <td>
                    <strong>{deal.name || 'Unnamed Deal'}</strong>
                  </td>
                  <td>{formatDate(deal.savedAt)}</td>
                  <td>
                    <span className="my-deals-progress-cell">
                      {getDealProgressLabel(deal) || '—'}
                    </span>
                  </td>
                  <td>{formatMoney(displayAsking)}</td>
                  <td>{formatMoney(displayEbitda)}</td>
                  <td>
                    {qp ? (
                      <span className="my-deals-quality-score" style={{ color: qp.scoreColor }} title={qp.text}>
                        {qp.badge ? <span aria-hidden>{qp.badge}</span> : null}
                        {qp.badge ? ' ' : ''}{qualityScore}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    {cocOk ? (
                      <span
                        className="my-deals-coc-value"
                        data-tier={cocReturnTier(cocReturn)}
                      >
                        {cocReturn.toFixed(1)}%
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="actions">
                      {!workspaceMode && typeof onOpenInCrm === 'function' ? (
                        <button
                          type="button"
                          className="action-btn"
                          title="Open in Vettr CRM"
                          onClick={() => onOpenInCrm(deal.id)}
                        >
                          CRM
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="action-btn"
                        title={workspaceMode ? 'Open workspace' : 'View details'}
                        onClick={() => handleViewDeal(deal)}
                      >
                        {workspaceMode ? 'Open' : 'View'}
                      </button>
                      <button
                        type="button"
                        className="action-btn"
                        title="Export"
                        onClick={() => handleExportCSV([deal])}
                      >
                        Export
                      </button>
                      <button
                        type="button"
                        className="action-btn danger"
                        title="Delete"
                        onClick={() => handleDelete(deal.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Deal Details Modal - rendered via portal so it sits on top with correct title and footer */}
      {showModal && selectedDeal && createPortal(
        <SavedDealModal
          deal={selectedDeal}
          settings={settings}
          onClose={() => {
            setShowModal(false);
            setSelectedDeal(null);
          }}
          onUpdateNotes={handleUpdateNotes}
          onDelete={handleDelete}
          onExport={() => handleExportCSV([selectedDeal])}
          onUpdate={onUpdate}
          onSaveCalculatorDefaults={onSaveCalculatorDefaults}
        />,
        document.body
      )}
    </div>
  );
}

// Modal component for saved deal details - uses DealDetailsPanel so layout matches aggregator panel exactly
function SavedDealModal({ deal, settings = null, onClose, onUpdateNotes, onDelete, onExport, onUpdate, onSaveCalculatorDefaults = null }) {
  const [notes, setNotes] = useState(deal.notes || '');
  const [notesTimeout, setNotesTimeout] = useState(null);
  const [brokerInfo, setBrokerInfo] = useState({
    name: deal.brokerName || '',
    company: deal.brokerCompany || '',
    phone: deal.brokerPhone || '',
    email: deal.brokerEmail || ''
  });
  const [progressStage, setProgressStage] = useState(deal.progressStage || '');
  const [progressHistory, setProgressHistory] = useState(deal.progressHistory || []);
  const [progressSaving, setProgressSaving] = useState(false);
  const [descriptionEditMode, setDescriptionEditMode] = useState(false);
  const [overviewEditMode, setOverviewEditMode] = useState(false);
  const [listingEdits, setListingEdits] = useState(() => listingEditsFromDeal(deal));
  const persistListingTimerRef = useRef(null);
  const listingEditsRef = useRef(listingEdits);
  const brokerInfoRef = useRef(brokerInfo);
  const dealRef = useRef(deal);
  const descriptionEditModeRef = useRef(descriptionEditMode);
  const overviewEditModeRef = useRef(overviewEditMode);
  listingEditsRef.current = listingEdits;
  brokerInfoRef.current = brokerInfo;
  dealRef.current = deal;
  descriptionEditModeRef.current = descriptionEditMode;
  overviewEditModeRef.current = overviewEditMode;

  const calculatorDefaults = useMemo(() => getCalculatorDefaultsFromSettings(settings), [settings]);

  const persistListingPayload = useCallback(
    async (payload) => {
      const dealRow = dealRef.current;
      const calculatorState = patchCalculatorStateListingFinancials(
        dealRow,
        { askingPrice: payload.askingPrice, ebitda: payload.ebitda },
        calculatorDefaults
      );
      await dealsAPI.updateDeal(dealRow.id, { ...payload, calculatorState });
      saveCalculatorState(dealRow.id, calculatorState);
      onUpdate();
    },
    [calculatorDefaults, onUpdate]
  );

  useEffect(() => {
    setNotes(deal.notes || '');
    setBrokerInfo({
      name: deal.brokerName || '',
      company: deal.brokerCompany || '',
      phone: deal.brokerPhone || '',
      email: deal.brokerEmail || ''
    });
    setProgressStage(deal.progressStage || '');
    setProgressHistory(deal.progressHistory || []);
    setDescriptionEditMode(false);
    setOverviewEditMode(false);
    setListingEdits(listingEditsFromDeal(deal));
  }, [deal]);

  useEffect(() => () => {
    if (persistListingTimerRef.current) clearTimeout(persistListingTimerRef.current);
  }, []);

  const flushListingPersistNow = useCallback(async () => {
    if (persistListingTimerRef.current) {
      clearTimeout(persistListingTimerRef.current);
      persistListingTimerRef.current = null;
    }
    try {
      const payload = buildSavedDealListingPayload(
        listingEditsRef.current,
        brokerInfoRef.current,
        dealRef.current
      );
      await persistListingPayload(payload);
    } catch (e) {
      console.error('Saved deal listing persist failed:', e);
      alert('Failed to save deal details: ' + e.message);
    }
  }, [persistListingPayload]);

  const schedulePersistListing = useCallback(() => {
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
        console.error('Saved deal listing persist failed:', e);
        alert('Failed to save deal details: ' + e.message);
      }
    }, 1000);
  }, [persistListingPayload]);

  const handleListingEditChange = (key, value) => {
    setListingEdits((prev) => ({ ...prev, [key]: value }));
    const desc = key === 'description';
    if (desc && !descriptionEditModeRef.current) return;
    if (!desc && !overviewEditModeRef.current) return;
    schedulePersistListing();
  };

  const toggleDescriptionEdit = useCallback(() => {
    setDescriptionEditMode((wasOn) => {
      if (wasOn) {
        queueMicrotask(() => flushListingPersistNow());
      }
      return !wasOn;
    });
  }, [flushListingPersistNow]);

  const toggleOverviewEdit = useCallback(() => {
    setOverviewEditMode((wasOn) => {
      if (wasOn) {
        queueMicrotask(() => flushListingPersistNow());
      }
      return !wasOn;
    });
  }, [flushListingPersistNow]);

  const handleBrokerChange = (key, value) => {
    setBrokerInfo((prev) => ({ ...prev, [key]: value }));
    if (!overviewEditModeRef.current) return;
    schedulePersistListing();
  };

  const mergedDeal = useMemo(
    () => mergeListingEditsIntoDeal(deal, listingEdits, brokerInfo),
    [deal, listingEdits, brokerInfo]
  );

  const headerProgressLabel = useMemo(() => {
    if (progressStage === 'Custom Status') {
      const label = (deal?.customStageLabel || '').trim();
      return label || 'Custom Status';
    }
    if (progressStage?.trim()) return progressStage.trim();
    return getDealProgressLabel({ ...deal, progressHistory, progressStage }) || '';
  }, [progressStage, progressHistory, deal]);

  const handleNotesChange = (newNotes) => {
    setNotes(newNotes);
    
    // Auto-save after 1 second of no typing
    if (notesTimeout) clearTimeout(notesTimeout);
    const timeout = setTimeout(() => {
      onUpdateNotes(deal.id, newNotes);
    }, 1000);
    setNotesTimeout(timeout);
  };

  const handleSaveDealDetailsNow = () => flushListingPersistNow();

  const handleProgressSelectChange = async (e) => {
    const newStage = e.target.value;
    if (progressSaving) return;

    // Placeholder option — keep controlled value unchanged (no API call).
    if (!newStage.trim()) {
      return;
    }

    const previousStage = progressStage;
    const previousHistory = progressHistory;

    setProgressStage(newStage);

    const newHistory = [
      ...previousHistory,
      { stage: newStage, timestamp: new Date().toISOString() }
    ];
    setProgressHistory(newHistory);
    setProgressSaving(true);
    try {
      const result = await crmAPI.updateStage(deal.id, newStage);
      if (result.progressHistory) setProgressHistory(result.progressHistory);
      console.log('[SavedDeals] pipeline stage synced', { dealId: deal.id, stage: newStage });
      onUpdate();
    } catch (error) {
      setProgressStage(previousStage);
      setProgressHistory(previousHistory);
      alert('Failed to update progress: ' + error.message);
    } finally {
      setProgressSaving(false);
    }
  };

  const handleRemoveProgressHistoryItem = async (index) => {
    const newHistory = progressHistory.filter((_, i) => i !== index);
    const nextStage =
      newHistory.length > 0 ? newHistory[newHistory.length - 1].stage : '';

    try {
      await dealsAPI.updateDeal(deal.id, {
        progressStage: nextStage,
        progressHistory: newHistory
      });
      setProgressHistory(newHistory);
      setProgressStage(nextStage);
      onUpdate();
    } catch (error) {
      alert('Failed to remove progress entry: ' + error.message);
    }
  };

  const handleIOISent = async (ioiText) => {
    try {
      const { notes: updatedNotes, progressHistory: nextHistory } = await recordIoiSent(deal.id, {
        ioiText,
        existingNotes: notes
      });
      setNotes(updatedNotes);
      setProgressStage('Send IOI');
      if (nextHistory) setProgressHistory(nextHistory);
      onUpdate();
    } catch (error) {
      console.error('Failed to save IOI record:', error);
      alert('IOI sent but failed to save record: ' + error.message);
    }
  };

  const extraSections = useMemo(() => [
    {
      id: 'broker-progress',
      label: 'Edit Broker & Progress',
      icon: 'broker-progress',
      render: () => (
        <>
          <div className="broker-form-grid">
            <div className="input-group">
              <label>Broker Name</label>
              <input type="text" value={brokerInfo.name} onChange={(e) => setBrokerInfo({ ...brokerInfo, name: e.target.value })} placeholder="John Smith" className="modal-input" />
            </div>
            <div className="input-group">
              <label>Company</label>
              <input type="text" value={brokerInfo.company} onChange={(e) => setBrokerInfo({ ...brokerInfo, company: e.target.value })} placeholder="ABC Brokers Inc." className="modal-input" />
            </div>
            <div className="input-group">
              <label>Phone</label>
              <input type="tel" value={brokerInfo.phone} onChange={(e) => setBrokerInfo({ ...brokerInfo, phone: e.target.value })} placeholder="(555) 123-4567" className="modal-input" />
            </div>
            <div className="input-group">
              <label>Email</label>
              <input type="email" value={brokerInfo.email} onChange={(e) => setBrokerInfo({ ...brokerInfo, email: e.target.value })} placeholder="broker@example.com" className="modal-input" />
            </div>
          </div>
          <button type="button" className="btn-secondary" onClick={handleSaveDealDetailsNow}>Save deal details now</button>
          <div className="progress-tracking">
            <div className="progress-tracking-columns">
              <div className="progress-tracking-col progress-tracking-status-col">
                <div className="input-group">
                  <label>Current Progress Status</label>
                  <select
                    value={progressStage}
                    onChange={handleProgressSelectChange}
                    className="modal-input"
                    disabled={progressSaving}
                    aria-busy={progressSaving}
                    aria-label="Current progress status"
                  >
                    <option value="">Select Progress Status</option>
                    {PROGRESS_STAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                    {progressStage && !PROGRESS_STAGE_OPTIONS.includes(progressStage) ? (
                      <option value={progressStage}>{progressStage} (saved)</option>
                    ) : null}
                  </select>
                </div>
              </div>
              <div className="progress-tracking-col progress-tracking-history-col">
                <div className="section-title">Progress History</div>
                {progressHistory.length > 0 ? (
                  <div className="progress-list">
                    {progressHistory.map((item, index) => (
                      <div key={`${item.timestamp}-${index}`} className="progress-item">
                        <div className="progress-item-body">
                          <div className="progress-stage">{item.stage}</div>
                          <div className="progress-timestamp">
                            {new Date(item.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="progress-item-remove"
                          aria-label={`Remove progress entry: ${item.stage}`}
                          title="Remove this update"
                          onClick={() => handleRemoveProgressHistoryItem(index)}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="progress-history-empty">No progress updates yet.</p>
                )}
              </div>
            </div>
          </div>
        </>
      ),
    },
    {
      id: 'notes',
      label: 'Notes',
      icon: 'notes',
      render: () => (
        <div className="deal-notes-content">
          <textarea value={notes} onChange={(e) => handleNotesChange(e.target.value)} placeholder="Add notes about this deal..." rows={6} className="modal-notes" />
          <p className="notes-hint">Notes are auto-saved as you type</p>
        </div>
      ),
    },
  ], [brokerInfo, progressStage, progressSaving, progressHistory, notes, handleSaveDealDetailsNow, handleProgressSelectChange, handleRemoveProgressHistoryItem, handleNotesChange]);

  const savedFooter = (
    <>
      {mergedDeal.url ? (
        <a href={mergedDeal.url} target="_blank" rel="noopener noreferrer" className="btn-secondary">View Original Listing</a>
      ) : (
        <button type="button" className="btn-secondary" disabled aria-label="No listing URL">No Listing URL Available</button>
      )}
      <DealShareMenu
        deal={mergedDeal}
        onShared={({ action } = {}) => {
          onUpdate?.();
          // Keep personal modal open after share so the deal remains visible in My Deals
          if (action === 'unshare') onClose?.();
        }}
      />
      <button type="button" className="btn-secondary" onClick={onExport}>Export CSV</button>
      <button type="button" className="btn-danger" onClick={() => onDelete(deal.id)}>Delete</button>
      <button type="button" className="btn-primary" onClick={onClose}>Close</button>
    </>
  );

  return (
    <div className="modal-overlay saved-deal-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content saved-deal-modal saved-deal-modal-content" onClick={(e) => e.stopPropagation()}>
        <DealDetailsPanel
          isOpen
          deal={mergedDeal}
          position="center"
          onClose={onClose}
          settings={settings}
          onSaveCalculatorDefaults={onSaveCalculatorDefaults}
          onCalculatorPersisted={onUpdate}
          panelOnly
          showPositionToggle={false}
          showSaveButton={false}
          extraSections={extraSections}
          renderFooter={savedFooter}
          onIOISent={handleIOISent}
          onIOIPrefsSaved={onUpdate}
          headerProgressLabel={headerProgressLabel}
          headerProgressControl={{
            value: progressStage,
            onChange: handleProgressSelectChange,
            options: PROGRESS_STAGE_OPTIONS,
            saving: progressSaving
          }}
          listingEdit={{
            savedAtDisplay: formatDate(deal.savedAt),
            values: listingEdits,
            onChange: handleListingEditChange,
            descriptionEditMode,
            onToggleDescriptionEdit: toggleDescriptionEdit,
            overviewEditMode,
            onToggleOverviewEdit: toggleOverviewEdit,
            broker: brokerInfo,
            onBrokerChange: handleBrokerChange
          }}
        />
      </div>
    </div>
  );
}
