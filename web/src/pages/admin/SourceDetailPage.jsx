import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminScrapeLayout, { Bar, Chip, Score } from './AdminScrapeLayout';
import { adminScrapeAPI, fmtAgo, fmtDuration, fmtMoney } from '../../utils/adminScrapeApi';

const TABS = ['overview', 'runs', 'deals', 'recipe'];

export default function SourceDetailPage() {
  const { key } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await adminScrapeAPI.source(key);
      setData(d);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [key]);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);

  const act = async (label, fn) => {
    setBusy(true); setNotice(null); setError(null);
    try {
      const r = await fn();
      setNotice(`${label}: ok${r?.copied != null ? ` (${r.copied} copied, ${r.inserted} new)` : ''}${r?.run ? ` — run #${r.run.id} ${r.reused ? 'already queued' : 'queued'}` : ''}`);
      await load();
    } catch (err) {
      setError(`${label} failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!data && !error) return <AdminScrapeLayout title={key}><p className="muted">Loading…</p></AdminScrapeLayout>;
  if (error && !data) return <AdminScrapeLayout title={key}><p className="scrape-error">{error}</p></AdminScrapeLayout>;

  const { source, runs, alerts, proposals, staged, baseline } = data;
  const lastRun = runs.find((r) => r.trigger === 'cron' || r.trigger === 'manual');
  const cov = lastRun?.field_coverage || {};

  return (
    <AdminScrapeLayout title={source.display_name || source.source_key} subtitle={source.base_url || source.listings_url || ''}>
      <div className="scrape-panel">
        <div className="scrape-toolbar">
          <Chip kind={source.status}>{source.status}</Chip>
          {source.published ? <Chip kind="published">published to live pool</Chip> : <Chip kind="draft">staging only</Chip>}
          <Score value={source.health?.score} />
          <span className="muted">{source.anti_bot_estimate ? `anti-bot ${source.anti_bot_estimate} · ` : ''}mode {source.fetch_mode} · every {source.rate_limit_ms}ms · cron <span className="mono">{source.scrape_cron || '—'}</span></span>
          <span className="spacer" />
          {source.source_key === 'airtable_bizbuysell'
            ? <span className="muted">Airtable feed — train <Link to="/admin/sources/bizbuysell_direct/train">BizBuySell (direct)</Link></span>
            : (
              <>
                <Link className="btn btn-secondary btn-sm" to={`/admin/sources/${encodeURIComponent(source.source_key)}/train`}>{source.recipe ? 'Edit recipe (trainer)' : 'Train recipe'}</Link>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy || !source.recipe} onClick={() => act('Run now', () => adminScrapeAPI.runSource(source.source_key))}>Run now</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !source.recipe} onClick={() => act('Sample run (25)', () => adminScrapeAPI.runSource(source.source_key, { limit: 25 }))}>Sample 25</button>
              </>
            )}
          {source.status === 'paused' || source.status === 'draft' || source.status === 'broken'
            ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !source.recipe} onClick={() => act('Activate', () => adminScrapeAPI.resume(source.source_key))}>Activate schedule</button>
            : <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => act('Pause', () => adminScrapeAPI.pause(source.source_key, 'Paused by admin'))}>Pause</button>}
          {source.published
            ? <button type="button" className="btn btn-secondary btn-sm" disabled={busy || source.source_key === 'airtable_bizbuysell'} onClick={() => { if (window.confirm('Stop writing to the live pool? Existing live rows stay unless you also remove them.')) act('Unpublish', () => adminScrapeAPI.unpublish(source.source_key, window.confirm('Also deactivate this source\'s listings in the live pool?'))); }}>Unpublish</button>
            : <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !staged?.active} onClick={() => { if (window.confirm(`Publish ${staged.active} staged listings into the live market pool and keep writing there on future runs?`)) act('Publish', () => adminScrapeAPI.publish(source.source_key)); }}>Publish {staged?.active ? `(${staged.active})` : ''}</button>}
        </div>
        {source.paused_reason ? <p className="muted" style={{ marginTop: 8 }}>Paused: {source.paused_reason}</p> : null}
        {notice ? <p className="scrape-ok" style={{ marginTop: 8 }}>{notice}</p> : null}
        {error ? <p className="scrape-error" style={{ marginTop: 8 }}>{error}</p> : null}
      </div>

      <div className="scrape-tabs">
        {TABS.map((t) => <button key={t} type="button" className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </div>

      {tab === 'overview' ? (
        <>
          <div className="scrape-kpis">
            <div className="scrape-kpi"><div className="v">{staged?.active ?? 0}</div><div className="l">staged listings (active)</div></div>
            <div className="scrape-kpi"><div className="v">{staged?.active ? Math.round((staged.with_price / staged.active) * 100) : 0}%</div><div className="l">with asking price</div></div>
            <div className="scrape-kpi"><div className="v">{staged?.active ? Math.round((staged.with_profit / staged.active) * 100) : 0}%</div><div className="l">with cash flow</div></div>
            <div className="scrape-kpi"><div className="v">{staged?.active ? Math.round((staged.with_revenue / staged.active) * 100) : 0}%</div><div className="l">with revenue</div></div>
            <div className="scrape-kpi"><div className="v">{lastRun?.discovered ?? '—'}</div><div className="l">found last run {baseline?.discovered ? `(baseline ${baseline.discovered})` : ''}</div></div>
            <div className="scrape-kpi"><div className="v">{lastRun ? `${lastRun.inserted}/${lastRun.updated}` : '—'}</div><div className="l">new / changed last run</div></div>
          </div>
          <div className="scrape-grid-2">
            <div className="scrape-panel">
              <h3>Field coverage (last run)</h3>
              {Object.keys(cov).length ? (
                <div className="scrape-coverage">
                  {Object.entries(cov).map(([f, pct]) => (
                    <div className="row" key={f}><span>{f}</span><span className="muted">{pct}%{baseline?.coverage?.[f] != null ? ` / ${baseline.coverage[f]}` : ''}</span><Bar pct={pct} /></div>
                  ))}
                </div>
              ) : lastRun ? (
                <p className={lastRun.status === 'failed' ? 'scrape-error' : 'muted'}>
                  Run #{lastRun.id} {lastRun.status}{lastRun.error ? `: ${lastRun.error}` : ''}.
                  {lastRun.blocked ? ` ${lastRun.blocked} blocked.` : ''} Sample 25 needs listing URLs — BizBuySell search pages often return Access Denied.
                </p>
              ) : <p className="muted">No completed runs yet. Use the trainer, then Sample 25.</p>}
            </div>
            <div className="scrape-panel">
              <h3>Alerts {alerts.filter((a) => !a.acknowledged_at).length ? <Chip kind="warn">{alerts.filter((a) => !a.acknowledged_at).length} open</Chip> : null}</h3>
              {alerts.length ? alerts.slice(0, 8).map((a) => (
                <div className="scrape-alert" key={a.id}>
                  <Chip kind={a.severity === 'error' ? 'error' : 'warn'}>{a.kind}</Chip>
                  <div><div>{a.message}</div><div className="muted">{fmtAgo(a.created_at)}{a.run_id ? ` · run #${a.run_id}` : ''}{a.acknowledged_at ? ' · acknowledged' : ''}</div></div>
                  {!a.acknowledged_at ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => act('Acknowledge', () => adminScrapeAPI.ackAlert(a.id))}>Ack</button> : <span />}
                </div>
              )) : <p className="muted">No alerts.</p>}
              {proposals.length ? <p className="muted" style={{ marginTop: 8 }}>{proposals.length} pending repair proposal{proposals.length > 1 ? 's' : ''} — review on <Link to="/admin/sources/health">Health</Link>.</p> : null}
            </div>
          </div>
          {source.notes ? <div className="scrape-panel"><h3>Notes</h3><p className="muted">{source.notes}</p></div> : null}
        </>
      ) : null}

      {tab === 'runs' ? <RunsTab runs={runs} onCancel={(id) => act('Cancel', () => adminScrapeAPI.cancelRun(id))} /> : null}
      {tab === 'deals' ? <DealsTab sourceKey={source.source_key} /> : null}
      {tab === 'recipe' ? <RecipeTab source={source} onSaved={load} /> : null}
    </AdminScrapeLayout>
  );
}

function RunsTab({ runs, onCancel }) {
  const [openId, setOpenId] = useState(null);
  return (
    <>
      <div className="scrape-panel" style={{ padding: 0, overflow: 'auto' }}>
        <table className="scrape-table">
          <thead><tr><th>#</th><th>Status</th><th>Trigger</th><th>When</th><th>Took</th><th className="num">Found</th><th className="num">Fetched</th><th className="num">Valid</th><th className="num">New</th><th className="num">Changed</th><th className="num">Failed</th><th className="num">Blocked</th><th>Health</th><th></th></tr></thead>
          <tbody>
            {!runs.length ? <tr><td colSpan={14} className="muted">No runs yet.</td></tr> : null}
            {runs.map((r) => (
              <tr key={r.id} className="clickable" onClick={() => setOpenId(openId === r.id ? null : r.id)}>
                <td className="mono">{r.id}</td>
                <td><Chip kind={r.status}>{r.status}</Chip></td>
                <td className="muted">{r.trigger}</td>
                <td className="muted">{fmtAgo(r.finished_at || r.started_at || r.queued_at)}</td>
                <td className="muted">{fmtDuration(r.started_at, r.finished_at)}</td>
                <td className="num">{r.discovered}</td><td className="num">{r.fetched}</td><td className="num">{r.valid}</td><td className="num">{r.inserted}</td><td className="num">{r.updated}</td>
                <td className="num" style={r.failed ? { color: 'var(--error)' } : undefined}>{r.failed}</td>
                <td className="num" style={r.blocked ? { color: 'var(--error)' } : undefined}>{r.blocked}</td>
                <td><Score value={r.health?.score} /></td>
                <td onClick={(e) => e.stopPropagation()}>{['queued', 'running'].includes(r.status) ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCancel(r.id)}>Cancel</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId ? <RunDetail runId={openId} /> : null}
    </>
  );
}

function RunDetail({ runId }) {
  const [run, setRun] = useState(null);
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => {
    let cancelled = false;
    Promise.all([adminScrapeAPI.run(runId), adminScrapeAPI.runItems(runId, { limit: 200, ...(status ? { status } : {}) })])
      .then(([r, i]) => { if (!cancelled) { setRun(r); setItems(i.items); } })
      .catch((err) => console.warn('[admin-scrape] run detail', err));
    return () => { cancelled = true; };
  }, [runId, status]);
  if (!run) return <div className="scrape-panel muted">Loading run #{runId}…</div>;
  const st = run.itemStatus || {};
  return (
    <div className="scrape-panel">
      <div className="scrape-toolbar">
        <h3 style={{ margin: 0 }}>Run #{runId}</h3>
        {Object.entries(st).map(([k, n]) => <button key={k} type="button" className="btn btn-secondary btn-sm" style={status === k ? { borderColor: 'var(--primary)' } : undefined} onClick={() => setStatus(status === k ? '' : k)}><Chip kind={k}>{k}</Chip> {n}</button>)}
        {run.run.error ? <span className="scrape-error">{run.run.error}</span> : null}
      </div>
      <div className="scrape-grid-2" style={{ marginTop: 10 }}>
        <div style={{ overflow: 'auto', maxHeight: 420 }}>
          <table className="scrape-table">
            <thead><tr><th>Status</th><th>Listing</th><th>Price</th><th>Cash flow</th><th>Revenue</th><th>Problem</th></tr></thead>
            <tbody>
              {items.map((it) => {
                const n = it.normalized || {};
                const errs = (it.errors || []).filter((e) => !e.warning);
                return (
                  <tr key={it.id} className="clickable" onClick={() => setOpen(open?.id === it.id ? null : it)}>
                    <td><Chip kind={it.status === 'ok' ? 'ok' : it.status === 'blocked' ? 'blocked' : 'failed'}>{it.status.replace('failed_', '')}</Chip>{it.relocated ? <> <Chip kind="warn">relocated</Chip></> : null}</td>
                    <td><a href={it.listing_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{(n.name || it.listing_url || '').slice(0, 60)}</a></td>
                    <td className="num">{fmtMoney(n.asking_price)}</td><td className="num">{fmtMoney(n.annual_profit)}</td><td className="num">{fmtMoney(n.annual_revenue)}</td>
                    <td className="muted">{errs.map((e) => e.message).join('; ').slice(0, 80)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          {open ? (
            <>
              <h3 style={{ marginTop: 0 }}>Extracted fields</h3>
              <table className="scrape-table">
                <tbody>
                  {Object.entries(open.extracted || {}).map(([f, v]) => (
                    <tr key={f}><td className="mono">{f}</td><td>{v?.value ? <span>{String(v.value).slice(0, 120)}</span> : <span className="muted">—</span>}<div className="muted mono">{v?.how}</div></td></tr>
                  ))}
                </tbody>
              </table>
              {(open.errors || []).length ? <ul className="muted">{open.errors.map((e, i) => <li key={i}>{e.warning ? 'warning' : 'error'}: {e.message}</li>)}</ul> : null}
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Log</h3>
              <div className="scrape-log">{run.run.log || '(empty)'}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DealsTab({ sourceKey }) {
  const [table, setTable] = useState('staging');
  const [d, setD] = useState(null);
  useEffect(() => {
    adminScrapeAPI.deals(sourceKey, { table, limit: 100 }).then(setD).catch((err) => console.warn('[admin-scrape] deals', err));
  }, [sourceKey, table]);
  return (
    <div className="scrape-panel" style={{ padding: 0 }}>
      <div className="scrape-toolbar" style={{ padding: 12 }}>
        <button type="button" className="btn btn-secondary btn-sm" style={table === 'staging' ? { borderColor: 'var(--primary)' } : undefined} onClick={() => setTable('staging')}>Staged</button>
        <button type="button" className="btn btn-secondary btn-sm" style={table === 'live' ? { borderColor: 'var(--primary)' } : undefined} onClick={() => setTable('live')}>Live pool</button>
        <span className="muted">{d ? `${d.total} rows` : ''}</span>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table className="scrape-table">
          <thead><tr><th>Name</th><th>Price</th><th>Cash flow</th><th>Revenue</th><th>Location</th><th>Industry</th><th>Active</th><th>Scraped</th></tr></thead>
          <tbody>
            {(d?.deals || []).map((r) => (
              <tr key={r.id}>
                <td><a href={r.listing_url} target="_blank" rel="noreferrer">{(r.name || '').slice(0, 70) || r.listing_url}</a></td>
                <td className="num">{fmtMoney(r.asking_price)}</td><td className="num">{fmtMoney(r.annual_profit)}</td><td className="num">{fmtMoney(r.annual_revenue)}</td>
                <td className="muted">{[r.city, r.state].filter(Boolean).join(', ')}</td>
                <td className="muted">{(r.industries || []).slice(0, 2).join(', ')}</td>
                <td>{r.is_active ? <Chip kind="ok">yes</Chip> : <Chip kind="draft">no</Chip>}</td>
                <td className="muted">{fmtAgo(r.last_scraped_at)}</td>
              </tr>
            ))}
            {d && !d.deals.length ? <tr><td colSpan={8} className="muted">Nothing here yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RecipeTab({ source, onSaved }) {
  const [text, setText] = useState(JSON.stringify(source.recipe || {}, null, 2));
  const [settings, setSettings] = useState({ scrape_cron: source.scrape_cron || '0 5 * * *', rate_limit_ms: source.rate_limit_ms || 3000, fetch_mode: source.fetch_mode || 'http', notes: source.notes || '' });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const parse = () => { try { return JSON.parse(text); } catch (e) { setErr(`Invalid JSON: ${e.message}`); return null; } };

  const save = async () => {
    const recipe = parse(); if (!recipe) return;
    setBusy(true); setErr(null); setMsg(null);
    try {
      await adminScrapeAPI.updateSource(source.source_key, { recipe, ...settings, rate_limit_ms: Number(settings.rate_limit_ms) });
      setMsg('Saved.'); onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const test = async () => {
    const recipe = parse(); if (!recipe || !testUrl) return;
    setBusy(true); setErr(null); setTestResult(null);
    try { setTestResult(await adminScrapeAPI.test(source.source_key, { recipe, urls: testUrl.split(/\s+/).filter(Boolean) })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="scrape-grid-2">
      <div className="scrape-panel">
        <h3>Recipe JSON</h3>
        <textarea className="modal-input" rows={28} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <div className="scrape-toolbar" style={{ marginTop: 10 }}>
          <label className="muted">cron <input className="modal-input" style={{ width: 110 }} value={settings.scrape_cron} onChange={(e) => setSettings({ ...settings, scrape_cron: e.target.value })} /></label>
          <label className="muted">delay ms <input className="modal-input" style={{ width: 80 }} type="number" min={500} step={500} value={settings.rate_limit_ms} onChange={(e) => setSettings({ ...settings, rate_limit_ms: e.target.value })} /></label>
          <label className="muted">mode <select className="modal-input" value={settings.fetch_mode} onChange={(e) => setSettings({ ...settings, fetch_mode: e.target.value })}><option value="http">http</option><option value="browser">browser</option><option value="stealth">stealth</option></select></label>
          <span className="spacer" />
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Save recipe</button>
        </div>
        <textarea className="modal-input" rows={2} style={{ marginTop: 8 }} placeholder="Notes for this source" value={settings.notes} onChange={(e) => setSettings({ ...settings, notes: e.target.value })} />
        {msg ? <p className="scrape-ok">{msg}</p> : null}
        {err ? <p className="scrape-error">{err}</p> : null}
      </div>
      <div className="scrape-panel">
        <h3>Test on listing URL(s)</h3>
        <textarea className="modal-input" rows={3} placeholder="One listing URL per line (max 10)" value={testUrl} onChange={(e) => setTestUrl(e.target.value)} />
        <div className="scrape-toolbar" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !testUrl} onClick={test}>{busy ? 'Testing…' : 'Test extraction'}</button>
          <span className="muted">Uses the JSON on the left, no DB writes.</span>
        </div>
        {testResult ? (
          <div style={{ marginTop: 10 }}>
            <p className="muted">{testResult.ok}/{testResult.total} ok · coverage {Object.entries(testResult.coverage).map(([f, p]) => `${f} ${p}%`).join(' · ')}</p>
            {testResult.items.map((it, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <div><Chip kind={it.status === 'ok' ? 'ok' : 'failed'}>{it.status}</Chip> <a href={it.listing_url} target="_blank" rel="noreferrer">{it.listing_url}</a></div>
                <table className="scrape-table">
                  <tbody>
                    {Object.entries(it.extracted || {}).map(([f, v]) => (
                      <tr key={f}><td className="mono">{f}</td><td>{v?.value ? String(v.value).slice(0, 100) : <span className="muted">—</span>}</td><td className="muted">{it.normalized?.[f] != null && typeof it.normalized[f] !== 'object' ? String(it.normalized[f]) : ''}</td><td className="muted mono">{v?.how}</td></tr>
                    ))}
                  </tbody>
                </table>
                {(it.errors || []).length ? <div className="scrape-error">{it.errors.map((e) => e.message).join('; ')}</div> : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
