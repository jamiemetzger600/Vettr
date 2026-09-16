import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminScrapeLayout, { Chip, Score } from './AdminScrapeLayout';
import { adminScrapeAPI, fmtAgo } from '../../utils/adminScrapeApi';

const FILTERS = ['all', 'active', 'paused', 'draft', 'broken'];

export default function SourcesPage() {
  const navigate = useNavigate();
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ display_name: '', listings_url: '', fetch_mode: 'http' });

  const load = async () => {
    try {
      const d = await adminScrapeAPI.sources();
      setSources(d.sources || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);

  const rows = useMemo(() => sources.filter((s) => (filter === 'all' || s.status === filter) && (!q || `${s.display_name} ${s.source_key} ${s.base_url}`.toLowerCase().includes(q.toLowerCase()))), [sources, filter, q]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, f === 'all' ? sources.length : sources.filter((s) => s.status === f).length])), [sources]);

  const submitAdd = async (e) => {
    e.preventDefault();
    try {
      const d = await adminScrapeAPI.createSource(form);
      setAdding(false);
      setForm({ display_name: '', listings_url: '', fetch_mode: 'http' });
      navigate(`/admin/sources/${encodeURIComponent(d.source.source_key)}/train`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <AdminScrapeLayout title="Sources" subtitle={`${counts.active || 0} active · ${counts.paused || 0} paused · ${counts.draft || 0} to configure`}>
      <div className="scrape-panel">
        <div className="scrape-toolbar">
          {FILTERS.map((f) => (
            <button key={f} type="button" className={`btn btn-secondary btn-sm ${filter === f ? 'active' : ''}`} style={filter === f ? { borderColor: 'var(--primary)', color: 'var(--text-primary)' } : undefined} onClick={() => setFilter(f)}>
              {f} <span className="muted">{counts[f]}</span>
            </button>
          ))}
          <input className="modal-input" type="search" placeholder="Search sites" value={q} onChange={(e) => setQ(e.target.value)} />
          <span className="spacer" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Refresh</button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAdding((v) => !v)}>{adding ? 'Cancel' : '+ Add site'}</button>
        </div>
        {adding ? (
          <form onSubmit={submitAdd} className="scrape-toolbar" style={{ marginTop: 10 }}>
            <input className="modal-input" required placeholder="Display name (e.g. Murphy Business)" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} style={{ minWidth: 220 }} />
            <input className="modal-input" required type="url" placeholder="Listings URL (https://…/businesses-for-sale/)" value={form.listings_url} onChange={(e) => setForm({ ...form, listings_url: e.target.value })} style={{ flex: 1, minWidth: 280 }} />
            <select className="modal-input" value={form.fetch_mode} onChange={(e) => setForm({ ...form, fetch_mode: e.target.value })}>
              <option value="http">http (fast)</option>
              <option value="browser">browser (JS sites)</option>
              <option value="stealth">stealth (anti-bot)</option>
            </select>
            <button type="submit" className="btn btn-primary btn-sm">Create &amp; train</button>
          </form>
        ) : null}
        {error ? <p className="scrape-error" style={{ marginTop: 8 }}>{error}</p> : null}
      </div>

      <div className="scrape-panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="scrape-table">
          <thead>
            <tr>
              <th>Site</th><th>Status</th><th>Health</th><th>Last run</th><th className="num">Found</th><th className="num">Valid</th><th className="num">Staged</th><th className="num">Live</th><th>Anti-bot</th><th>Next</th><th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={11} className="muted">Loading…</td></tr> : null}
            {!loading && !rows.length ? <tr><td colSpan={11} className="muted">No sources match.</td></tr> : null}
            {rows.map((s) => {
              const lr = s.last_run;
              const cov = lr?.field_coverage || {};
              return (
                <tr key={s.source_key} className="clickable" onClick={() => navigate(`/admin/sources/${encodeURIComponent(s.source_key)}`)}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.display_name || s.source_key}</div>
                    <div className="muted mono">{s.source_key}{s.recipe ? '' : ' · no recipe'}{s.published ? ' · published' : ''}</div>
                  </td>
                  <td>
                    <Chip kind={s.status}>{s.status}</Chip>{' '}
                    {s.active_runs ? <Chip kind="running">running</Chip> : null}{' '}
                    {s.open_alerts ? <Chip kind="warn">{s.open_alerts} alert{s.open_alerts > 1 ? 's' : ''}</Chip> : null}{' '}
                    {s.pending_proposals ? <Chip kind="warn">{s.pending_proposals} fix</Chip> : null}
                  </td>
                  <td><Score value={s.health?.score} /></td>
                  <td>
                    {lr ? <><Chip kind={lr.status}>{lr.status}</Chip> <span className="muted">{fmtAgo(lr.finished_at || lr.started_at)}</span></> : <span className="muted">—</span>}
                    {lr && (cov.asking_price != null) ? <div className="muted">price {cov.asking_price}% · cash flow {cov.annual_profit ?? '—'}%</div> : null}
                  </td>
                  <td className="num">{lr?.discovered ?? '—'}</td>
                  <td className="num">{lr?.valid ?? '—'}</td>
                  <td className="num">{s.staged_count}</td>
                  <td className="num">{s.live_count}</td>
                  <td><span className="muted">{s.anti_bot_estimate || '—'}</span> <span className="muted mono">{s.fetch_mode}</span></td>
                  <td className="muted mono">{s.status === 'active' && s.scrape_enabled ? s.scrape_cron : '—'}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(`/admin/sources/${encodeURIComponent(s.source_key)}/train`)}>{s.recipe ? 'Edit recipe' : 'Train'}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminScrapeLayout>
  );
}
