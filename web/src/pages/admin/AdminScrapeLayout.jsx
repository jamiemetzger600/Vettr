import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import Navigation from '../../components/Navigation';
import { useAuth } from '../../context/AuthContext';
import { adminScrapeAPI } from '../../utils/adminScrapeApi';
import '../../styles/adminScrape.css';

export function useAdminStatus(pollMs = 15000) {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => adminScrapeAPI.status()
      .then((s) => { if (!cancelled) { setStatus(s); setError(null); } })
      .catch((err) => { if (!cancelled) setError(err); });
    load();
    const t = pollMs ? setInterval(load, pollMs) : null;
    return () => { cancelled = true; if (t) clearInterval(t); };
  }, [pollMs]);
  return { status, error };
}

export function Chip({ kind, children }) {
  return <span className={`scrape-chip ${kind || ''}`}>{children}</span>;
}

export function Score({ value }) {
  if (value == null) return <span className="scrape-score">—</span>;
  const cls = value >= 80 ? 'good' : value >= 50 ? 'mid' : 'bad';
  return <span className={`scrape-score ${cls}`}>{value}</span>;
}

export function Bar({ pct }) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  const cls = v >= 80 ? '' : v >= 50 ? 'mid' : 'bad';
  return <div className={`scrape-bar ${cls}`}><span style={{ width: `${v}%` }} /></div>;
}

export default function AdminScrapeLayout({ title, subtitle, children }) {
  const { user, logout, loading: authLoading } = useAuth();
  const { status, error } = useAdminStatus();

  if (authLoading) return <div className="loading-screen">Loading…</div>;
  if (!user) {
    return (
      <div className="loading-screen">
        <p>Sign in required.</p>
        <Link to="/login">Go to login</Link>
      </div>
    );
  }

  const sidecarOk = status?.sidecar?.ok;
  const llmOk = status?.llm?.ok;
  const queue = status?.queue || [];

  return (
    <div className="app-page-shell">
      <Navigation user={user} logout={logout} activeTab="aggregator" setActiveTab={() => {}} showTabs={false} pageTitle={title || 'Sources'} pageSubtitle={subtitle || 'Scrape platform admin'} />
      <div className="dashboard-content scrape-admin">
        <div className="scrape-subnav">
          <NavLink to="/admin/sources" end>Sources</NavLink>
          <NavLink to="/admin/sources/health">Health</NavLink>
          <NavLink to="/admin/sources/coverage">Coverage</NavLink>
          <Link to="/dashboard" style={{ marginLeft: 6 }}>← Dashboard</Link>
          <div className="scrape-status-strip">
            {error ? <span className="scrape-error">{error.status === 404 ? 'Scrape platform disabled on this API (SCRAPE_PLATFORM_ENABLED)' : error.status === 403 ? 'Admin access required' : error.message}</span> : null}
            {status ? (
              <>
                <span title={JSON.stringify(status.sidecar)}><i className={`scrape-dot ${sidecarOk ? 'ok' : 'bad'}`} />sidecar</span>
                <span title={JSON.stringify(status.llm)}><i className={`scrape-dot ${llmOk ? 'ok' : 'bad'}`} />LLM {status.llm?.model || ''}</span>
                <span title={queue.map((q) => `${q.source_key} (${q.status})`).join('\n') || 'idle'}>
                  <i className={`scrape-dot ${queue.some((q) => q.status === 'running') ? 'ok' : ''}`} />
                  worker {queue.length ? `${queue.filter((q) => q.status === 'running').length} running / ${queue.filter((q) => q.status === 'queued').length} queued` : 'idle'}
                </span>
              </>
            ) : null}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
