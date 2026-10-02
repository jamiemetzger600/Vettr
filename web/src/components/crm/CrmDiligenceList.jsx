function formatStarted(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function progressLabel(row) {
  const total = Number(row.total_items) || 0;
  const open = Number(row.open_items) || 0;
  if (total === 0) return 'Checklist started';
  const done = Math.max(0, total - open);
  return `${open} open · ${done} done`;
}

/**
 * Deals with an unfinished due diligence checklist.
 */
export default function CrmDiligenceList({ deals = [], onSelectDeal, onDeleteDeal, canDelete = true }) {
  if (!deals.length) {
    return (
      <div className="crm-empty">
        <h2>No active due diligence</h2>
        <p>Start a checklist on a deal and it will show up here until every item is finished.</p>
      </div>
    );
  }

  return (
    <section className="crm-diligence" aria-label="Deals in due diligence">
      <header className="crm-diligence__header">
        <h2>Due diligence</h2>
        <p>{deals.length} {deals.length === 1 ? 'deal' : 'deals'} with an open checklist</p>
      </header>
      <ul className="crm-diligence__list">
        {deals.map((row) => {
          const started = formatStarted(row.started_at);
          const name = row.deal_name || 'Deal';
          return (
            <li key={row.saved_deal_id} className="crm-diligence__row">
              <button
                type="button"
                className="crm-diligence__item"
                onClick={() => {
                  console.log('[CrmDiligenceList] open', row.saved_deal_id, name);
                  onSelectDeal?.(row.saved_deal_id, { focusSection: 'crm-dd', openRecord: true });
                }}
              >
                <span className="crm-diligence__name">{name}</span>
                <span className="crm-diligence__meta">
                  {progressLabel(row)}
                  {started ? ` · started ${started}` : ''}
                </span>
              </button>
              {canDelete && onDeleteDeal ? (
                <button
                  type="button"
                  className="crm-diligence__delete"
                  onClick={() => {
                    console.log('[CrmDiligenceList] delete', row.saved_deal_id, name);
                    onDeleteDeal(row.saved_deal_id, name);
                  }}
                >
                  Delete
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
