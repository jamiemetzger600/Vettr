import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { offMarketAPI, crmAPI } from '../../utils/api';
import { useIsMobile } from '../../hooks/useMediaQuery';
import OffMarketNav from './OffMarketNav';

const VIEWS = new Set(['campaigns', 'research', 'prospects', 'sequences', 'stats']);
const CAMPAIGN_KEY = 'vettr.off-market.campaignId';

function readStoredCampaignId() {
  try {
    const raw = localStorage.getItem(CAMPAIGN_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export default function OffMarketDashboard({
  initialView = 'campaigns',
  onViewChange = null,
  teamId = null,
  onOpenCrmDeal = null
}) {
  const isMobile = useIsMobile();
  const [view, setView] = useState(() => (VIEWS.has(initialView) ? initialView : 'campaigns'));
  const [campaigns, setCampaigns] = useState([]);
  const [campaignId, setCampaignId] = useState(() => readStoredCampaignId());
  const [prospects, setProspects] = useState([]);
  const [sequence, setSequence] = useState(null);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState('');
  const [flash, setFlash] = useState(null);
  const [form, setForm] = useState({ name: '', vertical: '', geography: '', brief: '' });
  const [csvText, setCsvText] = useState('');
  const [manualRow, setManualRow] = useState({ companyName: '', ownerName: '', email: '' });
  const [steps, setSteps] = useState([{ delayDays: 0, subject: '', bodyText: '' }]);

  const campaign = useMemo(
    () => campaigns.find((c) => Number(c.id) === Number(campaignId)) || null,
    [campaigns, campaignId]
  );

  const setViewAndNotify = (next) => {
    setView(next);
    onViewChange?.(next);
  };

  const loadCampaigns = useCallback(async () => {
    const data = await offMarketAPI.listCampaigns();
    const list = data.campaigns || [];
    setCampaigns(list);
    setCampaignId((prev) => {
      if (prev && list.some((c) => Number(c.id) === Number(prev))) return prev;
      return list[0]?.id || null;
    });
    return list;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [st, list] = await Promise.all([
        offMarketAPI.getStatus().catch((err) => {
          console.warn('[OffMarket] status failed', err.message);
          return null;
        }),
        loadCampaigns()
      ]);
      setStatus(st);
      console.log('[OffMarket] loaded', {
        campaigns: list.length,
        gmail: st?.gmail,
        gmailReadonly: st?.gmailReadonly,
        llm: st?.llm?.provider || null
      });
    } catch (err) {
      setError(err.message || 'Failed to load Off Market');
    } finally {
      setLoading(false);
    }
  }, [loadCampaigns]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!campaignId) {
      setProspects([]);
      setSequence(null);
      setStats(null);
      return;
    }
    try {
      localStorage.setItem(CAMPAIGN_KEY, String(campaignId));
    } catch { /* ignore */ }

    let cancelled = false;
    (async () => {
      try {
        const [p, seq, st] = await Promise.all([
          offMarketAPI.listProspects(campaignId),
          offMarketAPI.getSequence(campaignId),
          offMarketAPI.getStats(campaignId)
        ]);
        if (cancelled) return;
        setProspects(p.prospects || []);
        setSequence(seq.sequence || null);
        setStats(st.stats || null);
        const nextSteps = seq.sequence?.steps;
        if (Array.isArray(nextSteps) && nextSteps.length) setSteps(nextSteps);
      } catch (err) {
        if (!cancelled) console.warn('[OffMarket] campaign detail failed', err.message);
      }
    })();
    return () => { cancelled = true; };
  }, [campaignId]);

  const run = async (label, fn) => {
    setBusy(label);
    setFlash(null);
    try {
      const result = await fn();
      return result;
    } catch (err) {
      console.error('[OffMarket]', label, err);
      setFlash({ type: 'error', text: err.message || `${label} failed` });
      throw err;
    } finally {
      setBusy('');
    }
  };

  const handleCreate = async (event) => {
    event.preventDefault();
    const created = await run('create', () => offMarketAPI.createCampaign({ ...form, teamId }));
    setForm({ name: '', vertical: '', geography: '', brief: '' });
    await loadCampaigns();
    setCampaignId(created.campaign.id);
    setFlash({ type: 'success', text: 'Campaign created.' });
    setViewAndNotify('research');
  };

  const refreshProspects = async () => {
    if (!campaignId) return;
    const [p, st] = await Promise.all([
      offMarketAPI.listProspects(campaignId),
      offMarketAPI.getStats(campaignId)
    ]);
    setProspects(p.prospects || []);
    setStats(st.stats || null);
    await loadCampaigns();
  };

  const handleCsv = async (event) => {
    event.preventDefault();
    if (!campaignId) return;
    await run('csv', () => offMarketAPI.addProspects(campaignId, { csv: csvText }));
    setCsvText('');
    await refreshProspects();
    setFlash({ type: 'success', text: 'CSV imported. Confirm emails before sending.' });
    setViewAndNotify('prospects');
  };

  const handleManualAdd = async (event) => {
    event.preventDefault();
    if (!campaignId) return;
    await run('add', () => offMarketAPI.addProspects(campaignId, {
      prospects: [manualRow]
    }));
    setManualRow({ companyName: '', ownerName: '', email: '' });
    await refreshProspects();
  };

  const handleResearch = async () => {
    if (!campaignId) return;
    await run('research', () => offMarketAPI.research(campaignId, { brief: form.brief }));
    await refreshProspects();
    setFlash({ type: 'success', text: 'Research list added. Confirm emails before sending.' });
    setViewAndNotify('prospects');
  };

  const handleSaveSequence = async (event) => {
    event.preventDefault();
    if (!campaignId) return;
    await run('sequence', () => offMarketAPI.saveSequence(campaignId, steps));
    setFlash({ type: 'success', text: 'Sequence saved.' });
  };

  const handleEnqueueSend = async () => {
    if (!campaignId) return;
    await run('enqueue', () => offMarketAPI.enqueue(campaignId, { stepIndex: 0 }));
    const tick = await run('send', () => offMarketAPI.sendTick(campaignId, { limit: 5 }));
    await refreshProspects();
    setFlash({
      type: 'success',
      text: `Queued and sent ${tick.sent || 0} from Gmail${tick.reason === 'daily_cap' ? ' (daily cap reached)' : ''}.`
    });
  };

  const handlePause = async (status) => {
    if (!campaignId) return;
    await run('pause', () => offMarketAPI.updateCampaign(campaignId, { status }));
    await loadCampaigns();
  };

  const handleSync = async () => {
    const result = await run('sync', () => offMarketAPI.syncInbox());
    await refreshProspects();
    setFlash({
      type: 'success',
      text: result.reason === 'no_readonly'
        ? 'Inbox tracking needs Gmail read access — enable it in Settings.'
        : `Synced ${result.synced || 0} thread${result.synced === 1 ? '' : 's'}.`
    });
  };

  const handlePromote = async (prospect) => {
    const result = await run('promote', () => offMarketAPI.promote(prospect.id, { teamId }));
    await refreshProspects();
    setFlash({ type: 'success', text: 'Promoted to Vettr CRM Inbox.' });
    if (result?.savedDealId && typeof onOpenCrmDeal === 'function') {
      onOpenCrmDeal(result.savedDealId);
    }
  };

  const gmailReady = Boolean(status?.gmail);
  const llmReady = Boolean(status?.llm?.hasKey);

  const main = (
    <>
      {flash ? (
        <p className={`om-flash om-flash--${flash.type}`} role="status">{flash.text}</p>
      ) : null}

      {!campaigns.length && view !== 'campaigns' ? (
        <div className="crm-empty">
          <h2>Create a campaign first</h2>
          <p>Off Market campaigns hold your vertical list, sequence, and send stats.</p>
          <button type="button" className="btn-primary" onClick={() => setViewAndNotify('campaigns')}>
            New campaign
          </button>
        </div>
      ) : null}

      {view === 'campaigns' ? (
        <div className="om-section">
          <div className="crm-today-strip om-toolbar">
            <p className="om-lead">
              Research a vertical, send from your Gmail, then promote willing sellers into CRM.
              Cold lists never enter Deal Aggregator.
            </p>
          </div>
          <form className="om-panel" onSubmit={handleCreate}>
            <h3>New campaign</h3>
            <label className="om-field">
              <span>Name</span>
              <input className="modal-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="HVAC owners — Ohio" />
            </label>
            <div className="om-grid">
              <label className="om-field">
                <span>Vertical</span>
                <input className="modal-input" value={form.vertical} onChange={(e) => setForm({ ...form, vertical: e.target.value })} placeholder="HVAC" />
              </label>
              <label className="om-field">
                <span>Geography</span>
                <input className="modal-input" value={form.geography} onChange={(e) => setForm({ ...form, geography: e.target.value })} placeholder="Ohio" />
              </label>
            </div>
            <label className="om-field">
              <span>Brief</span>
              <textarea className="modal-input" rows={3} value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} placeholder="Owner-operated shops, $1–5M revenue, no PE-backed." />
            </label>
            <button type="submit" className="btn-primary" disabled={Boolean(busy)}>Create campaign</button>
          </form>
          <ul className="om-campaign-list">
            {campaigns.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`om-campaign-card${Number(c.id) === Number(campaignId) ? ' om-campaign-card--active' : ''}`}
                  onClick={() => {
                    setCampaignId(c.id);
                    setViewAndNotify('prospects');
                  }}
                >
                  <strong>{c.name}</strong>
                  <span className="om-muted">{c.vertical || 'No vertical'} · {c.status} · {c.prospect_count || 0} prospects</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {view === 'research' && campaign ? (
        <div className="om-section">
          <div className="om-panel">
            <h3>Research {campaign.name}</h3>
            <p className="om-muted">
              Generate a first-pass list with your LLM, paste CSV, or POST to the agent ingest URL.
              Confirm emails before sending.
            </p>
            {!llmReady ? (
              <p>
                No LLM connected.{' '}
                <Link to="/settings">Add a key in Settings → AI / Agent</Link>
              </p>
            ) : (
              <button type="button" className="btn-primary" onClick={handleResearch} disabled={Boolean(busy)}>
                {busy === 'research' ? 'Generating…' : 'Generate list (max 25)'}
              </button>
            )}
          </div>
          <form className="om-panel" onSubmit={handleCsv}>
            <h3>Import CSV</h3>
            <p className="om-muted">Headers: company_name, owner_name, email, title, location, notes, source_url</p>
            <textarea
              className="modal-input"
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={'company_name,owner_name,email\nAcme HVAC,Jane Doe,jane@acme.test'}
            />
            <button type="submit" className="btn-secondary" disabled={Boolean(busy) || !csvText.trim()}>
              Import CSV
            </button>
          </form>
        </div>
      ) : null}

      {view === 'prospects' && campaign ? (
        <div className="om-section">
          <div className="om-toolbar om-panel">
            <div>
              <strong>{campaign.name}</strong>
              <span className="om-muted"> · {prospects.length} prospects · {campaign.status}</span>
            </div>
            <div className="om-actions">
              {!gmailReady ? (
                <Link to="/settings" className="btn-secondary">Connect Gmail</Link>
              ) : (
                <button type="button" className="btn-primary" onClick={handleEnqueueSend} disabled={Boolean(busy)}>
                  {busy === 'send' || busy === 'enqueue' ? 'Sending…' : 'Queue & send (5)'}
                </button>
              )}
              {campaign.status === 'active' ? (
                <button type="button" className="btn-secondary" onClick={() => handlePause('paused')}>Pause</button>
              ) : (
                <button type="button" className="btn-secondary" onClick={() => handlePause('active')}>Resume</button>
              )}
              <button type="button" className="btn-secondary" onClick={handleSync} disabled={Boolean(busy)}>
                Sync inbox
              </button>
            </div>
          </div>
          <form className="om-panel om-inline-form" onSubmit={handleManualAdd}>
            <input className="modal-input" required placeholder="Company" value={manualRow.companyName} onChange={(e) => setManualRow({ ...manualRow, companyName: e.target.value })} />
            <input className="modal-input" placeholder="Owner" value={manualRow.ownerName} onChange={(e) => setManualRow({ ...manualRow, ownerName: e.target.value })} />
            <input className="modal-input" type="email" placeholder="Email" value={manualRow.email} onChange={(e) => setManualRow({ ...manualRow, email: e.target.value })} />
            <button type="submit" className="btn-secondary" disabled={Boolean(busy)}>Add</button>
          </form>
          <div className="om-table-wrap">
            <table className="om-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Owner</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {prospects.map((p) => (
                  <tr key={p.id}>
                    <td>{p.company_name}</td>
                    <td>{p.owner_name || '—'}</td>
                    <td>{p.email || '—'}</td>
                    <td><span className="crm-chip">{p.status}</span></td>
                    <td>
                      {p.saved_deal_id ? (
                        <button type="button" className="btn-secondary btn-secondary--sm" onClick={() => onOpenCrmDeal?.(p.saved_deal_id)}>
                          Open CRM
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn-secondary btn-secondary--sm"
                          onClick={() => handlePromote(p)}
                          disabled={Boolean(busy)}
                        >
                          Promote
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!prospects.length ? <p className="om-muted">No prospects yet. Import CSV or run research.</p> : null}
          </div>
        </div>
      ) : null}

      {view === 'sequences' && campaign ? (
        <form className="om-section om-panel" onSubmit={handleSaveSequence}>
          <h3>Sequence · {campaign.name}</h3>
          <p className="om-muted">Merge tags: {'{{first_name}} {{company}} {{vertical}} {{geography}} {{sender_name}}'}. Include an opt-out line.</p>
          {steps.map((step, idx) => (
            <fieldset key={idx} className="om-step">
              <legend>Step {idx + 1}</legend>
              <label className="om-field">
                <span>Delay (days)</span>
                <input
                  className="modal-input"
                  type="number"
                  min={0}
                  value={step.delayDays ?? 0}
                  onChange={(e) => {
                    const next = steps.slice();
                    next[idx] = { ...step, delayDays: Number(e.target.value) };
                    setSteps(next);
                  }}
                />
              </label>
              <label className="om-field">
                <span>Subject</span>
                <input
                  className="modal-input"
                  value={step.subject || ''}
                  onChange={(e) => {
                    const next = steps.slice();
                    next[idx] = { ...step, subject: e.target.value };
                    setSteps(next);
                  }}
                />
              </label>
              <label className="om-field">
                <span>Body</span>
                <textarea
                  className="modal-input"
                  rows={8}
                  value={step.bodyText || ''}
                  onChange={(e) => {
                    const next = steps.slice();
                    next[idx] = { ...step, bodyText: e.target.value };
                    setSteps(next);
                  }}
                />
              </label>
            </fieldset>
          ))}
          {steps.length < 3 ? (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setSteps([...steps, { delayDays: 3, subject: 'Following up — {{company}}', bodyText: 'Hi {{first_name}},\n\nJust bumping this in case it was buried.\n\nReply STOP to opt out.\n\n{{sender_name}}' }])}
            >
              Add follow-up
            </button>
          ) : null}
          <button type="submit" className="btn-primary" disabled={Boolean(busy)}>Save sequence</button>
          {sequence?.campaign && prospects[0] ? (
            <p className="om-muted">Preview company: {prospects[0].company_name}</p>
          ) : null}
        </form>
      ) : null}

      {view === 'stats' && campaign ? (
        <div className="om-section crm-analytics">
          <div className="om-toolbar om-panel">
            <strong>{campaign.name} stats</strong>
            <button type="button" className="btn-secondary" onClick={handleSync} disabled={Boolean(busy)}>
              Sync inbox
            </button>
          </div>
          {!status?.gmailReadonly ? (
            <p className="om-muted">
              Sent counts work without inbox access. Replies and bounces need{' '}
              <Link to="/settings">Gmail inbox tracking</Link>.
            </p>
          ) : null}
          <div className="crm-today-strip">
            {[
              ['Sent', stats?.sent],
              ['Bounced', stats?.bounced],
              ['Replied', stats?.replied],
              ['Unanswered', stats?.unanswered],
              ['Interested', stats?.interested],
              ['Promoted', stats?.promoted]
            ].map(([label, value]) => (
              <div key={label} className="crm-today-stat">
                <span className="crm-today-stat__value">{value || 0}</span>
                <span className="crm-today-stat__label">{label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );

  if (loading) return <div className="crm-panel">Loading Off Market…</div>;
  if (error) {
    return (
      <div className="crm-panel crm-panel--error">
        <p>{error}</p>
        <button type="button" className="btn-secondary" onClick={loadAll}>Retry</button>
      </div>
    );
  }

  return (
    <div className="crm-dashboard om-dashboard">
      {isMobile ? (
        <>
          <OffMarketNav view={view} onViewChange={setViewAndNotify} isMobile />
          {main}
        </>
      ) : (
        <div className="crm-layout crm-layout--shell">
          <OffMarketNav view={view} onViewChange={setViewAndNotify} />
          <div className="crm-layout__main">{main}</div>
        </div>
      )}
    </div>
  );
}
