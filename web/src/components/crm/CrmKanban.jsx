import { useState, useEffect, useCallback, useMemo } from 'react';
import { crmAPI, dealsAPI } from '../../utils/api';
import CrmCardContextMenu from './CrmCardContextMenu';
import { normalizeDeal, formatMoney } from '../../utils/normalizeDeal';
import { getCalculatorDefaultsFromSettings } from '../../utils/calculatorDefaultsFromSettings';
import { getSavedDealCalculatorSummary } from '../../utils/savedDealCalculatorSummary';
import {
  UNSTAGED_KEY,
  daysInCurrentStage,
  cocReturnTier,
  defaultStageForKanbanColumn,
  kanbanColumnForStage,
  resolveDealStage
} from '../../utils/pipelineStages';
import { useTeam } from '../../context/TeamContext';

function KanbanCard({
  deal,
  summary,
  onSelect,
  dragging,
  isSelected,
  onDragStart,
  onDragEnd,
  onContextMenu = null,
  draggable = true,
  dimmed = false,
  highlighted = false,
  nextAction = null
}) {
  const days = daysInCurrentStage(deal);
  const coc = summary?.cocReturn;
  const cocOk = coc != null && Number.isFinite(coc);
  const stageLabel = resolveDealStage(deal);
  const pending = deal.pending_approval || deal.pendingApproval;
  const last = deal.last_activity || deal.lastActivity;
  const lastTouchLabel = (() => {
    if (!last?.at) return null;
    const d = new Date(last.at);
    if (Number.isNaN(d.getTime())) return null;
    const daysAgo = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (daysAgo <= 0) return 'today';
    if (daysAgo === 1) return '1d ago';
    return `${daysAgo}d ago`;
  })();
  const actorShort = last?.actorEmail ? String(last.actorEmail).split('@')[0] : null;

  return (
    <article
      className={[
        'crm-kanban-card',
        dragging ? 'crm-kanban-card--dragging' : '',
        isSelected ? 'crm-kanban-card--selected' : '',
        pending ? 'crm-kanban-card--pending' : '',
        dimmed ? 'crm-kanban-card--dimmed' : '',
        highlighted ? 'crm-kanban-card--highlighted' : '',
        nextAction?.urgent ? 'crm-kanban-card--has-urgent' : ''
      ].filter(Boolean).join(' ')}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={() => onSelect(deal.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e, deal);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(deal.id);
        }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onContextMenu?.({ clientX: r.left + r.width / 2, clientY: r.bottom }, deal);
        }
      }}
    >
      <h4 className="crm-kanban-card__title">{deal.name || 'Untitled deal'}</h4>
      {Array.isArray(deal.tags) && deal.tags.length > 0 ? (
        <div className="crm-kanban-card__tags">
          {deal.tags.slice(0, 3).map((t) => (
            <span key={t} className="crm-tag">{t}</span>
          ))}
        </div>
      ) : null}
      {pending ? <span className="crm-kanban-card__pending">Pending approval</span> : null}
      {deal.unread_messages > 0 ? (
        <span className="crm-kanban-card__unread">{deal.unread_messages} new</span>
      ) : null}
      {nextAction ? (
        <div
          className={`crm-kanban-card__next${nextAction.urgent ? ' crm-kanban-card__next--urgent' : ''}`}
          title={nextAction.title}
        >
          {nextAction.urgent ? 'Overdue: ' : 'Next: '}
          {nextAction.title}
        </div>
      ) : null}
      <div className="crm-kanban-card__meta">
        {deal.askingPrice != null ? <span>{formatMoney(deal.askingPrice)}</span> : null}
        {cocOk ? (
          <span className="crm-kanban-card__coc" data-tier={cocReturnTier(coc)}>
            {coc.toFixed(0)}% CoC
          </span>
        ) : null}
      </div>
      <div className="crm-kanban-card__footer">
        {stageLabel ? <span className="crm-kanban-card__stage">{stageLabel}</span> : null}
        {days != null ? <span>{days}d</span> : null}
      </div>
      {lastTouchLabel ? (
        <div
          className="crm-kanban-card__touched"
          title={actorShort ? `Last touched by ${actorShort}` : 'Last CRM activity'}
        >
          Touched {lastTouchLabel}
          {actorShort ? ` · ${actorShort}` : ''}
        </div>
      ) : null}
    </article>
  );
}

export default function CrmKanban({
  deals = [],
  settings = null,
  selectedDealId = null,
  onSelectDeal,
  onRefresh,
  onStageChanged = null,
  onBlankUnderwriting = null,
  highlightDealIds = null,
  nextActionByDealId = null,
  onAddDeal = null,
  onImportCsv = null,
  boardEpoch = 0
}) {
  const { activeTeamId, activeTeam, isTeamMode } = useTeam();
  const canWriteBoard = !isTeamMode || activeTeam?.role !== 'viewer';
  const [kanban, setKanban] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dragDealId, setDragDealId] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [moving, setMoving] = useState(false);
  const [cardMenu, setCardMenu] = useState(null);

  const calculatorDefaults = useMemo(
    () => getCalculatorDefaultsFromSettings(settings),
    [settings]
  );

  const dealsById = useMemo(() => {
    const map = new Map();
    for (const d of deals) {
      const n = normalizeDeal(d);
      if (n?.id) map.set(n.id, n);
    }
    return map;
  }, [deals]);

  const loadKanban = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmAPI.getKanban(
        isTeamMode && activeTeamId
          ? { scope: 'team', teamId: activeTeamId }
          : { scope: 'personal' }
      );
      setKanban(data);
    } catch (err) {
      setError(err.message || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [activeTeamId, isTeamMode]);

  useEffect(() => {
    loadKanban();
  }, [loadKanban, deals.length, boardEpoch]);

  const normalizeKanbanDeal = useCallback(
    (row) => {
      const fromParent = dealsById.get(row.id);
      const lastActivity = row.last_activity || row.lastActivity || null;
      const stage = row.progress_stage || row.progressStage || fromParent?.progressStage || '';
      const customLabel = row.custom_stage_label || row.customStageLabel || fromParent?.customStageLabel || '';
      if (fromParent) {
        return {
          ...fromParent,
          progressStage: stage,
          progress_stage: stage,
          customStageLabel: customLabel,
          last_activity: lastActivity || fromParent.last_activity,
          lastActivity: lastActivity || fromParent.lastActivity
        };
      }
      const n = normalizeDeal(row);
      return lastActivity ? { ...n, last_activity: lastActivity } : n;
    },
    [dealsById]
  );

  const columns = useMemo(() => {
    if (!kanban) return [];
    return (kanban.columns || []).map((col) => ({
      id: col.id || col.stage,
      label: col.label || col.stage,
      deals: (col.deals || []).map(normalizeKanbanDeal)
    }));
  }, [kanban, normalizeKanbanDeal]);

  const summaryFor = useCallback(
    (deal) => getSavedDealCalculatorSummary(deal, calculatorDefaults),
    [calculatorDefaults]
  );

  const handleDragStart = (e, dealId) => {
    setDragDealId(dealId);
    e.dataTransfer.setData('text/plain', String(dealId));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDragDealId(null);
    setDropTarget(null);
  };

  const handleDragOver = (e, columnId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(columnId);
  };

  const handleContextMenu = useCallback((e, deal) => {
    if (!deal?.id) return;
    console.log('[CrmKanban] context menu', deal.id, deal.name);
    setCardMenu({ deal, x: e.clientX, y: e.clientY });
  }, []);

  const closeCardMenu = useCallback(() => setCardMenu(null), []);

  const handleDeleteDeal = useCallback(async (deal) => {
    if (!deal?.id || !canWriteBoard) return;
    if (!window.confirm(`Delete “${deal.name || 'this deal'}” from Vettr CRM?`)) return;
    try {
      await dealsAPI.deleteDeal(deal.id);
      console.log('[CrmKanban] deleted deal', deal.id);
      setCardMenu(null);
      await loadKanban();
      onRefresh?.();
    } catch (err) {
      alert('Failed to delete deal: ' + (err.message || 'error'));
    }
  }, [canWriteBoard, loadKanban, onRefresh]);

  const cardMenuItems = useMemo(() => {
    const deal = cardMenu?.deal;
    if (!deal) return [];
    const items = [
      {
        id: 'open',
        label: 'Open',
        onSelect: () => onSelectDeal?.(deal.id, { openRecord: true })
      },
      {
        id: 'calculator',
        label: 'Calculator',
        onSelect: () => onSelectDeal?.(deal.id, { focusSection: 'calculator' })
      }
    ];
    if (deal.url) {
      items.push({
        id: 'listing',
        label: 'Open listing',
        onSelect: () => window.open(deal.url, '_blank', 'noopener,noreferrer')
      });
    }
    items.push({
      id: 'copy',
      label: 'Copy name',
      onSelect: () => {
        const name = deal.name || '';
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(name).catch(() => {});
        }
      }
    });
    if (canWriteBoard) {
      items.push({ id: 'sep-del', separator: true });
      items.push({
        id: 'delete',
        label: 'Delete',
        danger: true,
        onSelect: () => handleDeleteDeal(deal)
      });
    }
    return items;
  }, [cardMenu, canWriteBoard, onSelectDeal, handleDeleteDeal]);

  const handleDrop = async (e, columnId) => {
    e.preventDefault();
    setDropTarget(null);
    const dealId = Number(e.dataTransfer.getData('text/plain') || dragDealId);
    if (!dealId || moving) return;

    const deal = dealsById.get(dealId) || normalizeKanbanDeal({ id: dealId });
    const currentCol = kanbanColumnForStage(resolveDealStage(deal));
    if (currentCol.id === columnId) return;

    const targetStage = defaultStageForKanbanColumn(columnId);
    console.log('[CrmKanban] drop', { dealId, from: currentCol.id, to: columnId, targetStage });

    setMoving(true);
    try {
      const result = await crmAPI.updateStage(dealId, targetStage);
      if (result.needsApproval) {
        alert(`Approval requested for "${result.pendingApproval?.to_value || targetStage}". An admin will review.`);
      }
      onStageChanged?.(result, deal.name);
      await loadKanban();
      onRefresh?.();
    } catch (err) {
      alert('Failed to move deal: ' + err.message);
    } finally {
      setMoving(false);
      setDragDealId(null);
    }
  };

  const filtering = highlightDealIds instanceof Set && highlightDealIds.size > 0;

  // Must run before any early return (Rules of Hooks).
  useEffect(() => {
    if (!filtering) return;
    const el = document.querySelector('.crm-kanban-card--highlighted');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [filtering, highlightDealIds]);

  if (loading && !kanban) {
    return <div className="crm-panel">Loading pipeline…</div>;
  }

  if (error) {
    return (
      <div className="crm-panel crm-panel--error">
        <p>{error}</p>
        <button type="button" className="btn-secondary" onClick={loadKanban}>Retry</button>
      </div>
    );
  }

  const boardCount = columns.reduce((n, col) => n + (col.deals?.length || 0), 0);
  const passedCount = kanban?.passedCount ?? 0;
  const totalDeals = kanban?.totalDeals ?? 0;

  return (
    <div className="crm-kanban">
      <div className="crm-kanban-toolbar">
        <p className="crm-kanban-toolbar__hint">
          {canWriteBoard
            ? 'Drag deals between columns to update pipeline stage. Click a card to peek — right-click for Open, Calculator, Delete. Passed deals live in Cards → Archived.'
            : 'Viewer role — pipeline is read-only. Open a deal to use Talk.'}
        </p>
        <div className="crm-kanban-toolbar__actions">
          {typeof onAddDeal === 'function' ? (
            <button type="button" className="btn-primary" onClick={onAddDeal}>
              Add deal
            </button>
          ) : null}
          {typeof onImportCsv === 'function' ? (
            <button type="button" className="btn-secondary" onClick={onImportCsv}>
              Import CSV
            </button>
          ) : null}
          {canWriteBoard && onBlankUnderwriting ? (
            <button type="button" className="btn-secondary" onClick={onBlankUnderwriting}>
              New blank underwriting
            </button>
          ) : null}
          <span className="crm-kanban-count">
            {boardCount} on board
            {passedCount > 0 ? ` · ${passedCount} archived` : ''}
          </span>
        </div>
      </div>

      {totalDeals === 0 ? (
        <div className="crm-empty">
          <h2>Pipeline is empty</h2>
          <p>Save deals from the Aggregator — they appear in Inbox until you move them forward.</p>
        </div>
      ) : (
        <div className="crm-kanban-board" aria-busy={moving}>
          {columns.map((col) => {
            const isDrop = dropTarget === col.id;
            return (
              <section
                key={col.id}
                className={`crm-kanban-column${isDrop ? ' crm-kanban-column--drop' : ''}`}
                onDragOver={canWriteBoard ? (e) => handleDragOver(e, col.id) : undefined}
                onDragLeave={canWriteBoard ? () => setDropTarget((t) => (t === col.id ? null : t)) : undefined}
                onDrop={canWriteBoard ? (e) => handleDrop(e, col.id) : undefined}
              >
                <header className="crm-kanban-column__header">
                  <h3>{col.label}</h3>
                  <span className="crm-kanban-column__count">{col.deals.length}</span>
                </header>
                <div className="crm-kanban-column__body">
                  {col.deals.map((deal) => {
                    const dealId = Number(deal.id);
                    const highlighted = filtering && highlightDealIds.has(dealId);
                    const dimmed = filtering && !highlighted;
                    const nextAction =
                      nextActionByDealId instanceof Map
                        ? nextActionByDealId.get(dealId) || null
                        : null;
                    return (
                      <KanbanCard
                        key={deal.id}
                        deal={deal}
                        summary={summaryFor(deal)}
                        dragging={dragDealId === deal.id}
                        isSelected={
                          selectedDealId != null && String(selectedDealId) === String(deal.id)
                        }
                        onSelect={onSelectDeal}
                        draggable={canWriteBoard}
                        onDragStart={(e) => handleDragStart(e, deal.id)}
                        onDragEnd={handleDragEnd}
                        onContextMenu={handleContextMenu}
                        dimmed={dimmed}
                        highlighted={highlighted}
                        nextAction={nextAction}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {cardMenu ? (
        <CrmCardContextMenu
          x={cardMenu.x}
          y={cardMenu.y}
          items={cardMenuItems}
          onClose={closeCardMenu}
        />
      ) : null}
    </div>
  );
}

export { UNSTAGED_KEY };
