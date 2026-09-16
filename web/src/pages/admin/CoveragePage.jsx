import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminScrapeLayout, { Chip } from './AdminScrapeLayout';
import { adminScrapeAPI } from '../../utils/adminScrapeApi';

export default function CoveragePage() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { adminScrapeAPI.coverage().then((d) => setRows(d.rows)).catch((e) => setErr(e.message)); }, []);

  const airtable = rows?.find((r) => r.source_key === 'airtable_bizbuysell');
  const staged = (rows || []).filter((r) => r.source_key !== 'airtable_bizbuysell');
  const totalStaged = staged.reduce((a, r) => a + r.staged_active, 0);

  return (
    <AdminScrapeLayout title="Coverage vs Airtable" subtitle="Staged recipe output compared with the live pool">
      <div className="scrape-kpis">
        <div className="scrape-kpi"><div className="v">{airtable?.live_active ?? '—'}</div><div className="l">Airtable listings live</div></div>
        <div className="scrape-kpi"><div className="v">{totalStaged}</div><div className="l">recipe listings staged (all sources)</div></div>
        <div className="scrape-kpi"><div className="v">{staged.filter((r) => r.published).length}</div><div className="l">recipe sources published</div></div>
        <div className="scrape-kpi"><div className="v">{staged.reduce((a, r) => a + r.overlap_other_sources, 0)}</div><div className="l">staged URLs also present under another source</div></div>
      </div>
      <div className="scrape-panel" style={{ padding: 0, overflow: 'auto' }}>
        {err ? <p className="scrape-error" style={{ padding: 12 }}>{err}</p> : null}
        <table className="scrape-table">
          <thead><tr><th>Source</th><th>Status</th><th className="num">Staged active</th><th className="num">with price</th><th className="num">with cash flow</th><th className="num">Live active</th><th className="num">Overlap</th></tr></thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.source_key}>
                <td><Link to={`/admin/sources/${encodeURIComponent(r.source_key)}`}>{r.display_name || r.source_key}</Link></td>
                <td><Chip kind={r.status}>{r.status}</Chip> {r.published ? <Chip kind="published">published</Chip> : null}</td>
                <td className="num">{r.staged_active}</td>
                <td className="num muted">{r.staged_active ? `${Math.round((r.staged_with_price / r.staged_active) * 100)}%` : '—'}</td>
                <td className="num muted">{r.staged_active ? `${Math.round((r.staged_with_profit / r.staged_active) * 100)}%` : '—'}</td>
                <td className="num">{r.live_active}</td>
                <td className="num muted">{r.overlap_other_sources}</td>
              </tr>
            ))}
            {rows && !rows.length ? <tr><td colSpan={7} className="muted">Nothing staged yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
      <p className="muted">Cutover rule from the plan: when BizBuySell direct reaches ≥ 90% of Airtable&apos;s active count for 14 days, disable the Airtable feed. Until then Airtable stays published.</p>
    </AdminScrapeLayout>
  );
}
