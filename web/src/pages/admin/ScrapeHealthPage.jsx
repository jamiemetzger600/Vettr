import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminScrapeLayout, { Chip, Score } from './AdminScrapeLayout';
import { adminScrapeAPI, fmtAgo } from '../../utils/adminScrapeApi';

export default function ScrapeHealthPage() {
  const [alerts, setAlerts] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [sources, setSources] = useState([]);
  const [runs, setRuns] = useState([]);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const [a, p, s, r] = await Promise.all([adminScrapeAPI.alerts(!showAll), adminScrapeAPI.proposals('pending'), adminScrapeAPI.sources(), adminScrapeAPI.runs({ limit: 40 })]);
      setAlerts(a.alerts); setProposals(p.proposals); setSources(s.sources); setRuns(r.runs); setErr(null);
    } catch (e) { setErr(e.message); }
  }, [showAll]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);

  const act = async (label, fn) => {
    setMsg(null); setErr(null);
    try { const r = await fn(); setMsg(`${label}: ok${r?.result ? ` (emailed ${r.result.emailed}, pushed ${r.result.pushed})` : ''}`); await load(); }
    catch (e) { setErr(`${label} failed: ${e.message}`); }
  };

  const paused = sources.filter((s) => s.status === 'paused' || s.status === 'broken');
  const withRecipe = sources.filter((s) => s.recipe);

  return (
    <AdminScrapeLayout title="Scrape health" subtitle={`${alerts.filter((a) => !a.acknowledged_at).length} open alerts · ${proposals.length} pending fixes · ${paused.length} paused`}>
      <div className="scrape-kpis">
        <div className="scrape-kpi"><div className="v">{withRecipe.filter((s) => s.status === 'active').length}</div><div className="l">active sources</div></div>
        <div className="scrape-kpi"><div className="v" style={paused.length ? { color: 'var(--error)' } : undefined}>{paused.length}</div><div className="l">paused / broken</div></div>
        <div className="scrape-kpi"><div className="v">{runs.filter((r) => r.finished_at && Date.now() - new Date(r.finished_at) < 86400000).length}</div><div className="l">runs last 24h</div></div>
        <div className="scrape-kpi"><div className="v">{runs.filter((r) => r.status === 'failed' && r.finished_at && Date.now() - new Date(r.finished_at) < 86400000).length}</div><div className="l">failed last 24h</div></div>
        <div className="scrape-kpi"><div className="v">{withRecipe.length ? Math.round(withRecipe.reduce((a, s) => a + (s.health?.score ?? 100), 0) / withRecipe.length) : '—'}</div><div className="l">avg health score</div></div>
      </div>

      {msg ? <p className="scrape-ok">{msg}</p> : null}
      {err ? <p className="scrape-error">{err}</p> : null}

      <div className="scrape-grid-2">
        <div className="scrape-panel">
          <div className="scrape-toolbar">
            <h3 style={{ margin: 0 }}>Alerts</h3>
            <label className="muted"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> include acknowledged</label>
            <span className="spacer" />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => act('Acknowledge all', () => adminScrapeAPI.ackAll())} disabled={!alerts.some((a) => !a.acknowledged_at)}>Ack all</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => act('Send digest now', () => adminScrapeAPI.sendDigest())} title="Email + push the daily scrape-health digest to admins now">Send digest</button>
          </div>
          {!alerts.length ? <p className="muted" style={{ marginTop: 10 }}>No alerts. Alerts fire on run failures, blocks (403/429/captcha), listing-count drops, coverage drops, LLM drift, and stale sources.</p> : null}
          {alerts.map((a) => (
            <div className="scrape-alert" key={a.id}>
              <Chip kind={a.severity === 'error' ? 'error' : 'warn'}>{a.kind}</Chip>
              <div>
                <div><Link to={`/admin/sources/${encodeURIComponent(a.source_key)}`}>{a.display_name || a.source_key}</Link> — {a.message}</div>
                <div className="muted">{fmtAgo(a.created_at)}{a.run_id ? ` · run #${a.run_id}` : ''}{a.notified_at ? ' · notified' : ''}{a.acknowledged_at ? ' · acknowledged' : ''}</div>
              </div>
              {!a.acknowledged_at ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => act('Acknowledge', () => adminScrapeAPI.ackAlert(a.id))}>Ack</button> : <span />}
            </div>
          ))}
        </div>

        <div className="scrape-panel">
          <h3>Repair proposals <span className="muted">(from adaptive relocation + LLM)</span></h3>
          {!proposals.length ? <p className="muted">None pending. When a recipe stops extracting a field, the worker asks the local LLM where the value moved and files a proposal here.</p> : null}
          {proposals.map((p) => (
            <div key={p.id} className="scrape-alert" style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <div><Link to={`/admin/sources/${encodeURIComponent(p.source_key)}`}>{p.display_name || p.source_key}</Link> · field <b>{p.field}</b> · {p.kind} · {fmtAgo(p.created_at)}</div>
                <div className="muted mono" style={{ marginTop: 4 }}>current: {JSON.stringify(p.current_rules)}</div>
                <div className="mono" style={{ marginTop: 2 }}>proposed: {JSON.stringify(p.proposed_rules)}</div>
                {p.evidence?.samples?.length ? <div className="muted" style={{ marginTop: 4 }}>evidence: {p.evidence.samples.slice(0, 2).map((s) => `${(s.url || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)} → ${s.suggestion?.[p.field]?.value ?? '?'}`).join(' · ')}</div> : null}
              </div>
              <div style={{ display: 'flex', gap: 6, flexDirection: 'column' }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => act('Approve', () => adminScrapeAPI.approveProposal(p.id))}>Approve</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => act('Reject', () => adminScrapeAPI.rejectProposal(p.id))}>Reject</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="scrape-panel" style={{ padding: 0, overflow: 'auto' }}>
        <div className="scrape-toolbar" style={{ padding: 12 }}><h3 style={{ margin: 0 }}>Source health</h3></div>
        <table className="scrape-table">
          <thead><tr><th>Source</th><th>Status</th><th>Score</th><th>Last run</th><th className="num">Found</th><th className="num">Baseline</th><th>Breaches</th><th>Reason</th></tr></thead>
          <tbody>
            {withRecipe.map((s) => (
              <tr key={s.source_key}>
                <td><Link to={`/admin/sources/${encodeURIComponent(s.source_key)}`}>{s.display_name || s.source_key}</Link></td>
                <td><Chip kind={s.status}>{s.status}</Chip></td>
                <td><Score value={s.health?.score} /></td>
                <td className="muted">{s.last_run ? <><Chip kind={s.last_run.status}>{s.last_run.status}</Chip> {fmtAgo(s.last_run.finished_at || s.last_run.started_at)}</> : '—'}</td>
                <td className="num">{s.last_run?.discovered ?? '—'}</td>
                <td className="num muted">{s.health?.baseline?.discovered ?? '—'}</td>
                <td className="muted">{(s.health?.breaches || []).join(', ') || '—'}</td>
                <td className="muted">{s.paused_reason || ''}</td>
              </tr>
            ))}
            {!withRecipe.length ? <tr><td colSpan={8} className="muted">No sources with recipes yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </AdminScrapeLayout>
  );
}
