import { KANBAN_COLUMNS, visibleKanbanColumns, kanbanColumnForStage } from '../../utils/pipelineStages';
import { formatMoney } from '../../utils/normalizeDeal';
import { GUEST_CRM_DEMO_DEALS } from '../../data/guestCrmDemoDeals';

function groupDemoDeals() {
  const byCol = new Map(KANBAN_COLUMNS.map((c) => [c.id, []]));
  for (const deal of GUEST_CRM_DEMO_DEALS) {
    const col = kanbanColumnForStage(deal.progressStage);
    const list = byCol.get(col.id) || byCol.get(KANBAN_COLUMNS[0].id);
    list.push(deal);
  }
  return visibleKanbanColumns().map((col) => ({
    ...col,
    deals: byCol.get(col.id) || []
  }));
}

export default function GuestCrmPreview({ onRequireSignup, onBackToAggregator }) {
  const columns = groupDemoDeals();

  const gate = () => {
    console.log('[GuestCrmPreview] write blocked — require signup');
    onRequireSignup?.('save');
  };

  return (
    <div className="crm-dashboard guest-crm-preview">
      <div className="guest-crm-preview__banner" role="status">
        <p>Sample pipeline — sign up to use your own deals.</p>
        <div className="guest-crm-preview__actions">
          <button type="button" className="btn-primary" onClick={() => onRequireSignup?.('save')}>
            Sign up free
          </button>
          <button type="button" className="btn-secondary" onClick={() => onBackToAggregator?.()}>
            Back to Deal Aggregator
          </button>
        </div>
      </div>

      <div className="crm-kanban">
        <div className="crm-kanban-toolbar">
          <p className="crm-kanban-toolbar__hint">
            Preview only. Dragging, stage changes, and IOI require a free account.
          </p>
          <span className="crm-kanban-count">{GUEST_CRM_DEMO_DEALS.length} sample deals</span>
        </div>
        <div className="crm-kanban-board">
          {columns.map((col) => (
            <section key={col.id} className="crm-kanban-column">
              <header className="crm-kanban-column__header">
                <h3>{col.label}</h3>
                <span className="crm-kanban-column__count">{col.deals.length}</span>
              </header>
              <div className="crm-kanban-column__body">
                {col.deals.map((deal) => (
                  <article
                    key={deal.id}
                    className="crm-kanban-card"
                    role="button"
                    tabIndex={0}
                    onClick={gate}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        gate();
                      }
                    }}
                  >
                    <h4 className="crm-kanban-card__title">{deal.name}</h4>
                    <div className="crm-kanban-card__meta">
                      {deal.askingPrice != null ? <span>{formatMoney(deal.askingPrice)}</span> : null}
                    </div>
                    <div className="crm-kanban-card__footer">
                      {deal.progressStage ? (
                        <span className="crm-kanban-card__stage">{deal.progressStage}</span>
                      ) : (
                        <span className="crm-kanban-card__stage">Inbox</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
