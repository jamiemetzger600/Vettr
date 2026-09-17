import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminScrapeLayout, { Chip } from './AdminScrapeLayout';
import { adminScrapeAPI } from '../../utils/adminScrapeApi';

// Injected into the sandboxed snapshot iframe. Highlights on hover, posts a CSS path on click.
const PICKER_SCRIPT = `<script>(function(){
  var active=null, picking=true;
  function cssPath(el){
    var parts=[];
    while(el && el.nodeType===1){
      var tag=el.tagName.toLowerCase();
      if(tag==='html'||tag==='body') break;
      if(tag==='tbody'){ el=el.parentNode; continue; }
      if(el.id && /^[A-Za-z][\\w-]*$/.test(el.id) && document.querySelectorAll('#'+el.id).length===1){ parts.unshift('#'+el.id); break; }
      var seg=tag, p=el.parentNode;
      if(p){ var same=[].filter.call(p.children,function(c){return c.tagName===el.tagName;}); if(same.length>1) seg+=':nth-of-type('+(same.indexOf(el)+1)+')'; }
      parts.unshift(seg); el=p;
    }
    return parts.join(' ');
  }
  document.addEventListener('mouseover',function(e){ if(!picking) return; if(active) active.style.outline=''; active=e.target; active.style.outline='2px solid #27ae60'; active.style.outlineOffset='1px'; },true);
  document.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(!picking) return; var el=e.target;
    parent.postMessage({type:'vettr-pick', path:cssPath(el), text:(el.innerText||el.textContent||'').trim().slice(0,200), tag:el.tagName.toLowerCase()}, '*'); },true);
  document.addEventListener('submit',function(e){ e.preventDefault(); },true);
  window.addEventListener('message',function(e){ if(e.data && e.data.type==='vettr-picking') picking=!!e.data.on; });
  parent.postMessage({type:'vettr-ready'}, '*');
})();</script>`;

const DEFAULT_RECIPE = (source) => ({
  fetch: { mode: source?.fetch_mode || 'http' },
  discover: {
    startUrls: [source?.listings_url || source?.base_url || ''].filter(Boolean),
    listingLink: { css: 'a[href]' },
    urlPattern: '',
    pagination: { css: 'a[rel=next], a.next, .next a', maxPages: 20 },
    maxUrls: 1500,
  },
  fields: {},
  validate: { anyOf: ['asking_price', 'annual_profit', 'annual_revenue'] },
  politeness: { rateLimitMs: source?.rate_limit_ms || 3000 },
});

const PRIMARY_FIELDS = ['name', 'asking_price', 'annual_profit', 'sde', 'ebitda', 'annual_revenue', 'location', 'industries', 'description', 'years_established', 'broker_name', 'source_id'];

function ruleSummary(rules) {
  if (!rules?.length) return null;
  const r = rules[0];
  const extra = rules.length > 1 ? ` (+${rules.length - 1})` : '';
  if (r.type === 'label') return `label: ${(r.labels || [r.label]).join(' | ')}${extra}`;
  if (r.type === 'css' || r.type === 'xpath') return `${r.type}: ${r.sel}${r.attr ? ` @${r.attr}` : ''}${extra}`;
  if (r.type === 'jsonld') return `jsonld: ${r.path}${extra}`;
  if (r.type === 'regex' || r.type === 'url') return `${r.type}: ${r.pattern}${extra}`;
  return `${r.type}${extra}`;
}

export default function RecipeTrainerPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const iframeRef = useRef(null);
  const [source, setSource] = useState(null);
  const [registry, setRegistry] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState('');

  // Snapshot / picking
  const [snapUrl, setSnapUrl] = useState('');
  const [snap, setSnap] = useState(null);
  const [picking, setPicking] = useState(true);
  const [activeField, setActiveField] = useState('asking_price');
  const [pick, setPick] = useState(null); // { path, text, tag, candidates, labels }
  const [preview, setPreview] = useState(null); // { fields, normalized, validation }
  const [suggestions, setSuggestions] = useState(null);

  // Discovery / generalize
  const [discoverResult, setDiscoverResult] = useState(null);
  const [genUrls, setGenUrls] = useState('');
  const [genResult, setGenResult] = useState(null);
  const [activateOnSave, setActivateOnSave] = useState(true);
  const [rightTab, setRightTab] = useState('fields');
  const [fieldQuery, setFieldQuery] = useState('');
  const [fieldSort, setFieldSort] = useState('default');

  useEffect(() => {
    Promise.all([adminScrapeAPI.source(key), adminScrapeAPI.status()])
      .then(([d, st]) => {
        setSource(d.source);
        setRegistry(st.fieldRegistry?.[d.source.entity_type || 'business'] || []);
        const r = d.source.recipe && Object.keys(d.source.recipe).length ? d.source.recipe : DEFAULT_RECIPE(d.source);
        setRecipe({ ...DEFAULT_RECIPE(d.source), ...r, discover: { ...DEFAULT_RECIPE(d.source).discover, ...(r.discover || {}) }, fields: { ...(r.fields || {}) } });
      })
      .catch((e) => setErr(e.message));
  }, [key]);

  const mode = recipe?.fetch?.mode || 'http';
  const setMode = (m) => setRecipe((r) => ({ ...r, fetch: { ...(r.fetch || {}), mode: m } }));

  // ---- Snapshot -------------------------------------------------------------
  const takeSnapshot = async (url = snapUrl) => {
    if (!url) return;
    setBusy('snapshot'); setErr(null); setPick(null); setPreview(null); setSuggestions(null);
    try {
      const s = await adminScrapeAPI.snapshot({ url, mode, source_key: key });
      setSnap(s);
      setSnapUrl(url);
      if (s.blocked) setErr(`Blocked (${s.block_reason}). Try mode "stealth".`);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const srcdoc = useMemo(() => (snap?.html ? snap.html.replace(/<\/body>/i, `${PICKER_SCRIPT}</body>`) : ''), [snap]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'vettr-picking', on: picking }, '*');
  }, [picking, srcdoc]);

  // ---- Preview extraction (runs whenever rules change) -----------------------
  const runPreview = useCallback(async (fields) => {
    if (!snap?.id || !fields || !Object.keys(fields).length) { setPreview(null); return; }
    try {
      const p = await adminScrapeAPI.extractSnapshot(snap.id, { fields, source_key: key, validate: recipe?.validate });
      setPreview(p);
    } catch (e) { setErr(e.message); }
  }, [snap?.id, key, recipe?.validate]);

  useEffect(() => { if (recipe?.fields) runPreview(recipe.fields); }, [recipe?.fields, runPreview]);

  // ---- Picker messages -------------------------------------------------------
  useEffect(() => {
    const onMsg = async (e) => {
      const d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'vettr-ready') { iframeRef.current?.contentWindow?.postMessage({ type: 'vettr-picking', on: picking }, '*'); return; }
      if (d.type !== 'vettr-pick' || !snap?.id) return;
      setBusy('selector'); setErr(null);
      try {
        const out = await adminScrapeAPI.selector(snap.id, d.path);
        setPick({ ...d, ...out });
        setRightTab('fields');
      } catch (e) { setErr(`Could not resolve element: ${e.message}`); setPick({ ...d, candidates: [], labels: [] }); }
      finally { setBusy(''); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [snap?.id, picking]);

  const setRules = (field, rules) => setRecipe((r) => {
    const fields = { ...(r.fields || {}) };
    if (!rules || !rules.length) delete fields[field]; else fields[field] = rules;
    return { ...r, fields };
  });

  const applyCandidate = (rule) => {
    if (!activeField) return;
    const existing = (recipe.fields?.[activeField] || []).filter((r) => JSON.stringify(r) !== JSON.stringify(rule));
    setRules(activeField, [rule, ...existing]);
    setPick(null);
    // advance to the next field without a rule
    const next = PRIMARY_FIELDS.find((f) => f !== activeField && !(recipe.fields?.[f]?.length));
    if (next) setActiveField(next);
  };

  const addManualLabel = (field) => {
    const label = window.prompt(`Label text that appears next to the ${field} value (e.g. "Cash Flow")`);
    if (!label) return;
    const existing = recipe.fields?.[field] || [];
    const idx = existing.findIndex((r) => r.type === 'label');
    if (idx >= 0) {
      const labels = Array.from(new Set([...(existing[idx].labels || []), label]));
      const rules = existing.slice(); rules[idx] = { ...existing[idx], labels };
      setRules(field, rules);
    } else setRules(field, [{ type: 'label', labels: [label] }, ...existing]);
  };

  // ---- LLM suggest -----------------------------------------------------------
  const suggest = async () => {
    if (!snap?.id) return;
    setBusy('suggest'); setErr(null);
    try {
      const s = await adminScrapeAPI.suggest(snap.id, PRIMARY_FIELDS);
      setSuggestions(s);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  // ---- Discovery -------------------------------------------------------------
  const testDiscover = async () => {
    setBusy('discover'); setErr(null); setDiscoverResult(null);
    try {
      const d = await adminScrapeAPI.discoverTest(key, { recipe, maxUrls: 40 });
      setDiscoverResult(d);
      if (d.urls?.length && !genUrls) setGenUrls(d.urls.slice(0, 6).join('\n'));
      if (d.urls?.length && !snapUrl) setSnapUrl(d.urls[0]);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const generalize = async () => {
    const urls = genUrls.split(/\s+/).filter(Boolean).slice(0, 10);
    if (!urls.length) return;
    setBusy('generalize'); setErr(null);
    try { setGenResult(await adminScrapeAPI.generalize({ source_key: key, recipe, urls })); }
    catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  // ---- Save ------------------------------------------------------------------
  const save = async () => {
    setBusy('save'); setErr(null);
    try {
      const startUrls = [...(recipe.discover?.startUrls || [])].map((u) => String(u || '').trim()).filter(Boolean);
      if (!startUrls.length && (source.listings_url || source.base_url)) startUrls.push(source.listings_url || source.base_url);
      const payload = {
        recipe: { ...recipe, discover: { ...(recipe.discover || {}), startUrls } },
        fetch_mode: mode,
        rate_limit_ms: recipe.politeness?.rateLimitMs,
      };
      if (activateOnSave && Object.keys(recipe.fields || {}).length) { payload.status = 'active'; payload.scrape_enabled = true; }
      await adminScrapeAPI.updateSource(key, payload);
      navigate(`/admin/sources/${encodeURIComponent(key)}`);
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  if (!recipe || !source) return <AdminScrapeLayout title={key}><p className={err ? 'scrape-error' : 'muted'}>{err || 'Loading…'}</p></AdminScrapeLayout>;

  const fieldCount = Object.keys(recipe.fields || {}).length;
  const visibleFields = useMemo(() => {
    const hidden = new Set(['listing_url', 'city', 'state']);
    const q = fieldQuery.trim().toLowerCase();
    let list = registry.filter((f) => !hidden.has(f.key));
    if (q) {
      list = list.filter((f) =>
        (f.label || '').toLowerCase().includes(q)
        || (f.key || '').toLowerCase().includes(q)
      );
    }
    if (fieldSort === 'az') {
      list = [...list].sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key));
    } else if (fieldSort === 'mapped') {
      const mapped = (k) => (recipe.fields?.[k]?.length ? 0 : 1);
      list = [...list].sort((a, b) => mapped(a.key) - mapped(b.key) || (a.label || '').localeCompare(b.label || ''));
    }
    return list;
  }, [registry, fieldQuery, fieldSort, recipe.fields]);
  const d = recipe.discover || {};
  const setDiscover = (patch) => setRecipe((r) => ({ ...r, discover: { ...(r.discover || {}), ...patch } }));

  return (
    <AdminScrapeLayout title={`Train: ${source.display_name || key}`} subtitle="Click values on the page, confirm the rule, generalize across listings, save.">
      <div className="scrape-panel">
        <div className="scrape-toolbar">
          <span className="muted">Step 1</span>
          <input className="modal-input" style={{ flex: 1, minWidth: 320 }} placeholder="Paste a listing detail URL (or find one with Discover below)" value={snapUrl} onChange={(e) => setSnapUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') takeSnapshot(); }} />
          <select className="modal-input" value={mode} onChange={(e) => setMode(e.target.value)} title="Fetch mode used for this source">
            <option value="http">http</option><option value="browser">browser</option><option value="stealth">stealth</option>
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={!snapUrl || busy === 'snapshot'} onClick={() => takeSnapshot()}>{busy === 'snapshot' ? 'Loading…' : 'Load page'}</button>
          <span className="spacer" />
          <label className="muted"><input type="checkbox" checked={activateOnSave} onChange={(e) => setActivateOnSave(e.target.checked)} /> activate schedule on save</label>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'save' || !fieldCount} onClick={save}>Save recipe ({fieldCount} fields)</button>
          <Link className="btn btn-secondary btn-sm" to={`/admin/sources/${encodeURIComponent(key)}`}>Cancel</Link>
        </div>
        {err ? <p className="scrape-error" style={{ marginTop: 8 }}>{err}</p> : null}
      </div>

      <div className="trainer">
        <div>
          {snap ? (
            <>
              <div className="scrape-toolbar" style={{ marginBottom: 6 }}>
                <span className="muted">{snap.title || snap.final_url} · HTTP {snap.status}</span>
                <span className="spacer" />
                <button type="button" className={`btn btn-secondary btn-sm`} onClick={() => setPicking((v) => !v)}>{picking ? 'Picking: on' : 'Picking: off (browse)'}</button>
              </div>
              <iframe ref={iframeRef} title="snapshot" className={`trainer-frame ${picking ? 'picking' : ''}`} sandbox="allow-scripts" srcDoc={srcdoc} />
            </>
          ) : (
            <div className="trainer-hint" style={{ minHeight: 240 }}>
              <p><b>How this works</b></p>
              <ol style={{ margin: '6px 0 0 18px', lineHeight: 1.6 }}>
                <li>Load one listing page (paste a URL, or run Discover on the right and pick one).</li>
                <li>Select a field on the right (Asking price is selected), then click the value on the page.</li>
                <li>Choose the rule that matched (label rules survive redesigns best). Repeat for cash flow, revenue, name, location.</li>
                <li>Generalize across 5–10 listings to see coverage, then Save.</li>
              </ol>
            </div>
          )}
        </div>

        <div>
          <div className="scrape-tabs">
            {['fields', 'discover', 'generalize', 'json'].map((t) => <button key={t} type="button" className={rightTab === t ? 'active' : ''} onClick={() => setRightTab(t)}>{t}</button>)}
          </div>

          {rightTab === 'fields' ? (
            <>
              {pick ? (
                <div className="scrape-panel" style={{ marginBottom: 10 }}>
                  <h3>Picked &lt;{pick.tag}&gt; for <b>{activeField}</b> <span className="muted">“{(pick.text || '').slice(0, 60)}”{pick.chars ? ` · ${pick.chars} chars` : ''}</span></h3>
                  {(activeField === 'description' || activeField === 'summary' || ['reason_for_sale','training_support','historical_summary','buyer_qualifications','competition','growth_opportunities','financing_notes'].includes(activeField) || (pick.containers || []).length > 0) ? (
                    <p className="muted" style={{ marginTop: 0 }}>For Description / Summary on VR-style pages: click the <b>section title</b> (Description, Reason For Sale, …) and use the <b>label</b> rule. Reload the page after this update so nested paragraphs stay attached to their labels.</p>
                  ) : null}
                  <div className="trainer-candidates">
                    {(pick.labels || []).map((l) => (
                      <div className="trainer-candidate" key={`l-${l}`}>
                        <div><Chip kind="ok">label</Chip> <code>{l}</code> <span className="muted">value next to this label{['description','summary','reason_for_sale','training_support','historical_summary','buyer_qualifications','competition','growth_opportunities','financing_notes'].includes(activeField) ? ' (keeps following paragraphs)' : ''}</span></div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => applyCandidate({ type: 'label', labels: [l] })}>Use</button>
                      </div>
                    ))}
                    {(pick.containers || []).map((c, i) => (
                      <div className="trainer-candidate" key={`box-${i}`}>
                        <div>
                          <Chip kind="ok">container · {c.chars} chars · depth {c.depth}</Chip>{' '}
                          <code>{c.sel}</code>
                          {c.raw_value ? <div className="muted">→ {String(c.raw_value).slice(0, 120)}{c.chars > 120 ? '…' : ''}</div> : null}
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => applyCandidate({ type: c.type, sel: c.sel })}>Use container</button>
                      </div>
                    ))}
                    {(pick.candidates || []).filter((c) => c.sel).map((c, i) => (
                      <div className="trainer-candidate" key={`c-${i}`}>
                        <div>
                          <Chip kind={c.matches === 1 ? 'ok' : 'warn'}>{c.type} · {c.matches} match{c.matches === 1 ? '' : 'es'}{c.chars ? ` · ${c.chars} chars` : ''}</Chip>{' '}
                          <code>{c.sel}</code>
                          {c.raw_value ? <div className="muted">→ {String(c.raw_value).slice(0, 80)}</div> : <div className="scrape-error">no value on raw page</div>}
                        </div>
                        <div className="scrape-toolbar" style={{ gap: 4 }}>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => applyCandidate({ type: c.type, sel: c.sel })}>Use</button>
                          {c.matches > 1 ? (
                            <button type="button" className="btn btn-secondary btn-sm" title="Join every match (useful for repeated paragraph selectors)" onClick={() => applyCandidate({ type: c.type, sel: c.sel, all: true })}>Use all</button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {!pick.labels?.length && !pick.candidates?.length && !pick.containers?.length ? <p className="muted">No candidates. Try clicking the value text itself.</p> : null}
                  </div>
                  <div className="scrape-toolbar" style={{ marginTop: 8 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => setPick(null)}>Dismiss</button></div>
                </div>
              ) : null}

              <div className="scrape-toolbar" style={{ marginBottom: 8 }}>
                <input
                  className="modal-input"
                  style={{ flex: 1, minWidth: 140 }}
                  type="search"
                  placeholder="Search fields…"
                  value={fieldQuery}
                  onChange={(e) => setFieldQuery(e.target.value)}
                  aria-label="Search fields"
                />
                <select className="modal-input" value={fieldSort} onChange={(e) => setFieldSort(e.target.value)} title="Sort fields" aria-label="Sort fields">
                  <option value="default">Registry order</option>
                  <option value="mapped">Mapped first</option>
                  <option value="az">A–Z</option>
                </select>
                <span className="muted">{visibleFields.length}/{registry.filter((f) => !['listing_url', 'city', 'state'].includes(f.key)).length}</span>
                <span className="spacer" />
                <button type="button" className="btn btn-secondary btn-sm" disabled={!snap || busy === 'suggest'} onClick={suggest} title="Ask the local LLM where each field is on this page">{busy === 'suggest' ? 'Asking LLM…' : 'Suggest with AI'}</button>
              </div>
              <p className="muted" style={{ margin: '0 0 8px' }}>{snap ? 'Select a field, then click its value on the page.' : 'Load a page to start picking.'}</p>

              <div className="trainer-fields">
                {visibleFields.map((f) => {
                  const rules = recipe.fields?.[f.key];
                  const pv = preview?.fields?.[f.key];
                  const norm = preview?.normalized?.[f.key];
                  const sugg = suggestions?.suggestions?.[f.key];
                  return (
                    <div key={f.key} className={`trainer-field ${activeField === f.key ? 'active' : ''}`} onClick={() => setActiveField(f.key)}>
                      <div className="name">{f.label} <span className="muted mono">{f.key}</span>{f.virtual ? <span className="muted"> · extra</span> : null}</div>
                      <div className="scrape-toolbar" style={{ gap: 4 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); addManualLabel(f.key); }} title="Type a label instead of clicking">+label</button>
                        {rules?.length ? <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setRules(f.key, null); }}>clear</button> : null}
                      </div>
                      {rules?.length ? <div className="rule">{ruleSummary(rules)}</div> : <div className="rule muted">no rule yet{activeField === f.key && snap ? ' — click the value on the page' : ''}</div>}
                      {rules?.length && preview ? (
                        pv?.value
                          ? <div className="val">→ {String(pv.value).slice(0, 90)} {norm != null && typeof norm !== 'object' && String(norm) !== String(pv.value) ? <b>= {String(norm)}</b> : null}</div>
                          : <div className="val empty">no value on this page</div>
                      ) : null}
                      {sugg?.value && !rules?.length ? (
                        <div className="val">
                          <span className="muted">AI: “{String(sugg.value).slice(0, 50)}”{sugg.label ? ` next to “${sugg.label}”` : ''}</span>{' '}
                          {sugg.label ? <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); setRules(f.key, [{ type: 'label', labels: [sugg.label] }]); }}>Use label</button> : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {!visibleFields.length ? <p className="muted">No fields match “{fieldQuery}”.</p> : null}
              </div>
              {preview?.validation ? (
                <p className={preview.validation.ok ? 'scrape-ok' : 'scrape-error'} style={{ marginTop: 8 }}>
                  {preview.validation.ok ? 'This page would pass validation.' : `Would fail validation: ${preview.validation.errors.map((e) => e.message).join('; ')}`}
                  {preview.validation.warnings?.length ? <span className="muted"> · warnings: {preview.validation.warnings.map((w) => w.message).join('; ')}</span> : null}
                </p>
              ) : null}
            </>
          ) : null}

          {rightTab === 'discover' ? (
            <div className="scrape-panel">
              <h3>How to find listing URLs</h3>
              <label className="muted">Start URL(s), one per line</label>
              <textarea className="modal-input" rows={2} value={(d.startUrls || []).join('\n')} onChange={(e) => setDiscover({ startUrls: e.target.value.split(/\s+/).filter(Boolean) })} />
              <label className="muted">Listing link selector (CSS) — e.g. <code>a[href*='/listing/']</code></label>
              <input className="modal-input" style={{ width: '100%' }} value={d.listingLink?.css || ''} onChange={(e) => setDiscover({ listingLink: { css: e.target.value } })} />
              <label className="muted">Only keep URLs matching (regex, optional)</label>
              <input className="modal-input" style={{ width: '100%' }} value={d.urlPattern || ''} onChange={(e) => setDiscover({ urlPattern: e.target.value })} placeholder="/listing/|/business-for-sale/\\d+" />
              <div className="scrape-grid-2" style={{ marginTop: 8 }}>
                <div>
                  <label className="muted">Next-page link (CSS)</label>
                  <input className="modal-input" style={{ width: '100%' }} value={d.pagination?.css || ''} onChange={(e) => setDiscover({ pagination: { ...(d.pagination || {}), css: e.target.value } })} placeholder="a[rel=next]" />
                </div>
                <div>
                  <label className="muted">…or page URL template with {'{page}'}</label>
                  <input className="modal-input" style={{ width: '100%' }} value={d.pagination?.urlTemplate || ''} onChange={(e) => setDiscover({ pagination: { ...(d.pagination || {}), urlTemplate: e.target.value } })} placeholder="https://site.com/listings/?page={page}" />
                </div>
              </div>
              <div className="scrape-toolbar" style={{ marginTop: 8 }}>
                <label className="muted">max pages <input className="modal-input" type="number" style={{ width: 70 }} value={d.pagination?.maxPages || 1} onChange={(e) => setDiscover({ pagination: { ...(d.pagination || {}), maxPages: Number(e.target.value) } })} /></label>
                <label className="muted">max URLs <input className="modal-input" type="number" style={{ width: 80 }} value={d.maxUrls || 1500} onChange={(e) => setDiscover({ maxUrls: Number(e.target.value) })} /></label>
                <label className="muted">delay ms <input className="modal-input" type="number" style={{ width: 80 }} value={recipe.politeness?.rateLimitMs || 3000} onChange={(e) => setRecipe((r) => ({ ...r, politeness: { ...(r.politeness || {}), rateLimitMs: Number(e.target.value) } }))} /></label>
                <span className="spacer" />
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'discover'} onClick={testDiscover}>{busy === 'discover' ? 'Discovering…' : 'Test discovery (first pages)'}</button>
              </div>
              {discoverResult ? (
                <div style={{ marginTop: 10 }}>
                  <p className={discoverResult.count ? 'scrape-ok' : 'scrape-error'}>{discoverResult.count} listing URLs from {discoverResult.pages_fetched} page(s){discoverResult.blocked ? ` — BLOCKED: ${discoverResult.block_reason}` : ''}{discoverResult.errors?.length ? ` — ${discoverResult.errors[0]}` : ''}</p>
                  <div style={{ maxHeight: 220, overflow: 'auto' }}>
                    {discoverResult.urls.slice(0, 40).map((u) => (
                      <div key={u} className="scrape-toolbar" style={{ gap: 6 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSnapUrl(u); takeSnapshot(u); }}>Load</button>
                        <span className="muted mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => { setGenUrls(discoverResult.urls.slice(0, 8).join('\n')); setRightTab('generalize'); }}>Use first 8 for Generalize →</button>
                </div>
              ) : null}
            </div>
          ) : null}

          {rightTab === 'generalize' ? (
            <div className="scrape-panel">
              <h3>Generalize across listings</h3>
              <textarea className="modal-input" rows={5} placeholder="Listing URLs, one per line (max 10)" value={genUrls} onChange={(e) => setGenUrls(e.target.value)} />
              <div className="scrape-toolbar" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'generalize' || !fieldCount} onClick={generalize}>{busy === 'generalize' ? 'Running…' : 'Run recipe on these'}</button>
                <span className="muted">No DB writes. Takes ~{Math.max(5, genUrls.split(/\s+/).filter(Boolean).length * 3)}s.</span>
              </div>
              {genResult ? (
                <div className="trainer-grid" style={{ marginTop: 10 }}>
                  <p className={genResult.ok === genResult.total ? 'scrape-ok' : 'scrape-error'}>{genResult.ok}/{genResult.total} pass validation · {Object.entries(genResult.coverage).map(([f, p]) => `${f} ${p}%`).join(' · ')}</p>
                  <table className="scrape-table">
                    <thead><tr><th>Listing</th>{Object.keys(recipe.fields).map((f) => <th key={f}>{f}</th>)}</tr></thead>
                    <tbody>
                      {genResult.items.map((it, i) => (
                        <tr key={i}>
                          <td><Chip kind={it.status === 'ok' ? 'ok' : 'failed'}>{it.status.replace('failed_', '')}</Chip> <a href={it.listing_url} target="_blank" rel="noreferrer">{it.listing_url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 40)}</a></td>
                          {Object.keys(recipe.fields).map((f) => {
                            const v = it.extracted?.[f]?.value;
                            const n = it.normalized?.[f];
                            return <td key={f} className={v ? 'hit' : 'miss'} title={v || ''}>{v ? (n != null && typeof n !== 'object' ? String(n) : String(v)).slice(0, 28) : '—'}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          {rightTab === 'json' ? (
            <div className="scrape-panel">
              <h3>Recipe JSON</h3>
              <JsonEditor value={recipe} onChange={setRecipe} />
            </div>
          ) : null}
        </div>
      </div>
    </AdminScrapeLayout>
  );
}

function JsonEditor({ value, onChange }) {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [err, setErr] = useState(null);
  useEffect(() => { setText(JSON.stringify(value, null, 2)); }, [value]);
  return (
    <>
      <textarea className="modal-input" rows={26} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
      <div className="scrape-toolbar" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { try { onChange(JSON.parse(text)); setErr(null); } catch (e) { setErr(e.message); } }}>Apply JSON</button>
        {err ? <span className="scrape-error">{err}</span> : null}
      </div>
    </>
  );
}
