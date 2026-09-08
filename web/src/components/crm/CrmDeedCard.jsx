import { useRef } from 'react';
import { formatMoney, getDealProgressLabel, isPassedOnDeal } from '../../utils/normalizeDeal';
import { formatMoneyShort, formatRatio, profitMultipleTier } from '../../utils/dealCardDisplay';
import { DEED_COLORS, waitingOnLabels } from '../../utils/deedCardPrefs';
import { crmDealAgeDate, dealAgeHeaderColor } from '../../utils/dealCardDisplay';

function ddStatusForDeal(deal, overdueDealIds) {
  const id = Number(deal?.id);
  if (overdueDealIds instanceof Set && overdueDealIds.has(id)) {
    return { label: 'Overdue', urgent: true };
  }
  const stage = String(deal?.progressStage || deal?.progress_stage || '').trim();
  if (stage === 'Starting Due Diligence' || /due diligence/i.test(stage)) {
    return { label: 'In progress', urgent: false };
  }
  return { label: 'Not started', urgent: false };
}

function stop(e) {
  e.preventDefault();
  e.stopPropagation();
}

function DeedRow({ label, value, onClick, urgent = false, onBlockDrag }) {
  return (
    <button
      type="button"
      className={`crm-deed-card__row${urgent ? ' crm-deed-card__row--urgent' : ''}`}
      onClick={(e) => {
        stop(e);
        onClick?.();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        onBlockDrag?.();
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </button>
  );
}

export default function CrmDeedCard({
  deal,
  summary,
  nextAction = null,
  waiting,
  overdueDealIds = null,
  colorId,
  pinned = false,
  unseen = false,
  selected = false,
  dragging = false,
  dropTarget = false,
  writeEnabled = true,
  onOpen,
  onContextMenu,
  onOpenField,
  onPin,
  onArchive,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}) {
  const skipClick = useRef(false);
  const blockDrag = useRef(false);
  const picked = DEED_COLORS.find((c) => c.id === colorId);
  const color = picked || dealAgeHeaderColor(crmDealAgeDate(deal));
  if (colorId && !picked) {
    console.log('[CrmDeedCard] skip non-aging color', colorId, '→', color.label, deal?.id);
  }
  const stageLabel = getDealProgressLabel(deal);
  const statusUnset = !stageLabel;
  const status = statusUnset ? 'Status: Tap to set' : stageLabel;
  const nextLabel = nextAction?.title || 'Set next step';
  const asking = summary?.askingPrice ?? deal.askingPrice;
  const revenue = deal.revenue;
  const ebitda = summary?.ebitda ?? deal.ebitda;
  const listedMultiple = Number(deal.profitMultiple);
  const computedMultiple = Number(asking) > 0 && Number(ebitda) > 0
    ? Number(asking) / Number(ebitda)
    : null;
  const multiple = Number.isFinite(listedMultiple) && listedMultiple > 0
    ? listedMultiple
    : computedMultiple;
  const multipleOk = multiple != null && Number.isFinite(multiple);
  const waitingLabels = waitingOnLabels(waiting).slice(0, 4);
  const waitingExtra = Math.max(0, waitingOnLabels(waiting).length - 4);
  const ddStatus = ddStatusForDeal(deal, overdueDealIds);

  return (
    <article
      className={[
        'crm-deed-card',
        selected ? 'crm-deed-card--selected' : '',
        dragging ? 'crm-deed-card--dragging' : '',
        dropTarget ? 'crm-deed-card--drop' : '',
        pinned ? 'crm-deed-card--pinned' : '',
        unseen ? 'crm-deed-card--unseen' : ''
      ].filter(Boolean).join(' ')}
      data-saved-at={deal.savedAt || ''}
      draggable={writeEnabled}
      onDragStart={writeEnabled ? (e) => {
        if (blockDrag.current) {
          e.preventDefault();
          blockDrag.current = false;
          return;
        }
        skipClick.current = true;
        onDragStart?.(e);
      } : undefined}
      onDragEnd={writeEnabled ? (e) => {
        onDragEnd?.(e);
        setTimeout(() => { skipClick.current = false; }, 200);
      } : undefined}
      onDragOver={writeEnabled ? onDragOver : undefined}
      onDrop={writeEnabled ? onDrop : undefined}
      onClick={() => {
        if (skipClick.current) return;
        onOpen?.(deal.id);
      }}
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
          onOpen?.(deal.id);
        }
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          const r = e.currentTarget.getBoundingClientRect();
          onContextMenu?.({ clientX: r.left + r.width / 2, clientY: r.bottom }, deal);
        }
      }}
      style={{ '--deed-color': color.hex, '--deed-ink': color.ink }}
    >
      <div className="crm-deed-card__inner">
        <header className="crm-deed-card__header">
          <h3 className="crm-deed-card__name">{deal.name || 'Untitled deal'}</h3>
        </header>

        <button
          type="button"
          className={`crm-deed-card__status${statusUnset ? ' crm-deed-card__status--empty' : ''}`}
          onClick={(e) => {
            stop(e);
            onOpenField?.('status');
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            blockDrag.current = true;
          }}
        >
          {status}
        </button>

        <div className="crm-deed-card__rows">
          <DeedRow
            label="Next step"
            value={nextLabel}
            urgent={Boolean(nextAction?.urgent)}
            onClick={() => onOpenField?.('next')}
            onBlockDrag={() => { blockDrag.current = true; }}
          />
        </div>

        <button
          type="button"
          className="crm-deed-card__waiting"
          onClick={(e) => {
            stop(e);
            onOpenField?.('waiting');
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            blockDrag.current = true;
          }}
        >
          <span className="crm-deed-card__waiting-label">Waiting on</span>
          {waitingLabels.length === 0 ? (
            <span className="crm-deed-card__waiting-empty">None — tap to set</span>
          ) : (
            <ul>
              {waitingLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
              {waitingExtra > 0 ? <li>+{waitingExtra} more</li> : null}
            </ul>
          )}
        </button>

        <div className="crm-deed-card__rows">
          <DeedRow
            label="Due diligence"
            value={ddStatus.label}
            urgent={ddStatus.urgent}
            onClick={() => {
              console.log('[CrmDeedCard] open DD', deal.id);
              onOpen?.(deal.id, { focusSection: 'crm-dd' });
            }}
            onBlockDrag={() => { blockDrag.current = true; }}
          />
        </div>

        <button
          type="button"
          className="crm-deed-card__metrics"
          title="Purchase price · Revenue · EBITDA · Multiple"
          aria-label="Purchase price, revenue, EBITDA, and multiple"
          onClick={(e) => {
            stop(e);
            onOpenField?.('metrics');
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            blockDrag.current = true;
          }}
        >
          <span className="crm-deed-card__metric">
            <span className="crm-deed-card__metric-value" title={formatMoney(asking)}>
              {formatMoneyShort(asking)}
            </span>
            <span className="crm-deed-card__metric-label">Purchase Price</span>
          </span>
          <span className="crm-deed-card__metric">
            <span className="crm-deed-card__metric-value" title={formatMoney(revenue)}>
              {formatMoneyShort(revenue)}
            </span>
            <span className="crm-deed-card__metric-label">Revenue</span>
          </span>
          <span className="crm-deed-card__metric">
            <span className="crm-deed-card__metric-value" title={formatMoney(ebitda)}>
              {formatMoneyShort(ebitda)}
            </span>
            <span className="crm-deed-card__metric-label">EBITDA</span>
          </span>
          <span className="crm-deed-card__metric">
            <span
              className="crm-deed-card__metric-value crm-deed-card__multiple"
              data-tier={multipleOk ? profitMultipleTier(multiple) : 'neutral'}
              title={multipleOk ? `${formatRatio(multiple)}X multiple` : 'Multiple'}
            >
              {multipleOk ? `${formatRatio(multiple)}X` : '—'}
            </span>
            <span className="crm-deed-card__metric-label">Multiple</span>
          </span>
        </button>

        <div
          className="crm-deed-card__shortcuts"
          onClick={stop}
          onPointerDown={(e) => {
            e.stopPropagation();
            blockDrag.current = true;
          }}
        >
          {writeEnabled ? (
            <button type="button" onClick={() => onPin?.()}>
              {pinned ? 'Unpin' : 'Pin'}
            </button>
          ) : null}
          <button type="button" onClick={() => onOpenField?.('color')}>
            Color
          </button>
          {writeEnabled && !isPassedOnDeal(deal) ? (
            <button type="button" onClick={() => onArchive?.()}>
              Archive
            </button>
          ) : null}
          <button type="button" onClick={() => onOpen?.(deal.id)}>
            Open
          </button>
        </div>
      </div>
    </article>
  );
}
