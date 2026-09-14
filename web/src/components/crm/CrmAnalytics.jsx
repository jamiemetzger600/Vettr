import { useState, useEffect, useCallback } from 'react';
import { crmAPI } from '../../utils/api';

export default function CrmAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await crmAPI.getAnalytics());
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="crm-panel">Loading analytics…</div>;
  if (error) {
    return (
      <div className="crm-panel crm-panel--error">
        <p>{error}</p>
        <button type="button" className="btn-secondary" onClick={load}>Retry</button>
      </div>
    );
  }

  return (
    <div className="crm-analytics">
      <div className="crm-today-strip">
        <div className="crm-today-stat">
          <span className="crm-today-stat__value">{data.totalDeals}</span>
          <span className="crm-today-stat__label">Saved deals</span>
        </div>
        <div className="crm-today-stat">
          <span className="crm-today-stat__value">{data.openTasks}</span>
          <span className="crm-today-stat__label">Open tasks</span>
        </div>
        <div className="crm-today-stat">
          <span className="crm-today-stat__value">{data.activeDdChecklists}</span>
          <span className="crm-today-stat__label">Active DD</span>
        </div>
        <div className="crm-today-stat">
          <span className="crm-today-stat__value">{data.stalled ?? 0}</span>
          <span className="crm-today-stat__label">Quiet 14d+</span>
        </div>
      </div>

      <h3 className="crm-analytics__heading">Pipeline funnel</h3>
      <ul className="crm-analytics-funnel">
        {(data.byColumn || []).map((col) => (
          <li key={col.id} className="crm-analytics-funnel__row">
            <span className="crm-analytics-funnel__label">{col.label}</span>
            <span className="crm-analytics-funnel__bar-wrap">
              <span
                className="crm-analytics-funnel__bar"
                style={{ width: data.totalDeals ? `${Math.max(4, (col.count / data.totalDeals) * 100)}%` : '0%' }}
              />
            </span>
            <span className="crm-analytics-funnel__count">{col.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
