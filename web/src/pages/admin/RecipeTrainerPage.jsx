import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
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
  var boxEl=null, boxEls=null, captionText='';
  function ensureBox(){
    var box=document.getElementById('vettr-confirm-box');
    if(box) return box;
    var style=document.createElement('style');
    style.textContent='#vettr-confirm-box{position:absolute;pointer-events:none;z-index:2147483646;border:3px solid #16a34a;border-radius:4px;box-shadow:0 0 0 4px rgba(22,163,74,.28);display:none;box-sizing:border-box}#vettr-confirm-label{position:absolute;left:-3px;bottom:100%;margin-bottom:4px;background:#166534;color:#fff;font:600 12px/1.35 ui-sans-serif,system-ui,sans-serif;padding:3px 8px;border-radius:4px;white-space:nowrap;max-width:460px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 4px rgba(0,0,0,.25)}';
    document.documentElement.appendChild(style);
    box=document.createElement('div');
    box.id='vettr-confirm-box';
    var lab=document.createElement('div');
    lab.id='vettr-confirm-label';
    box.appendChild(lab);
    document.documentElement.appendChild(box);
    window.addEventListener('scroll', function(){ reposition(false); }, true);
    window.addEventListener('resize', function(){ reposition(false); });
    return box;
  }
  function place(el, caption, scroll){
    var box=ensureBox();
    var lab=document.getElementById('vettr-confirm-label');
    if(!el){ box.style.display='none'; boxEl=null; boxEls=null; return; }
    boxEl=el; boxEls=null; captionText=caption||'';
    var r=el.getBoundingClientRect();
    box.style.display='block';
    box.style.top=(r.top+window.scrollY)+'px';
    box.style.left=(r.left+window.scrollX)+'px';
    box.style.width=Math.max(r.width, 12)+'px';
    box.style.height=Math.max(r.height, 12)+'px';
    box.style.borderColor='#16a34a';
    box.style.boxShadow='0 0 0 4px rgba(22,163,74,.28)';
    if(lab) lab.textContent=captionText;
    if(scroll){ try{ el.scrollIntoView({block:'center', inline:'nearest'}); }catch(err){} }
  }
  function smallestMatch(q){
    if(!q) return null;
    q=String(q).replace(/\\s+/g,' ').trim();
    if(q.length<2) return null;
    var nodes=document.body.getElementsByTagName('*');
    var best=null, bestLen=1e9;
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i];
      if(el.id==='vettr-confirm-box'||el.id==='vettr-confirm-label') continue;
      var t=((el.innerText||el.textContent||'')+'').replace(/\\s+/g,' ').trim();
      if(!t||t.length>2500) continue;
      if(t===q||t.indexOf(q)===0||(q.length>=4&&t.indexOf(q)!==-1)){
        if(t.length<bestLen){ best=el; bestLen=t.length; }
      }
    }
    return best;
  }
  function isMeta(t){
    return /^(asking price|reading time|revenue|income|multiple|ebitda|cash flow)\b/i.test(t) || (t.length<80 && t.indexOf(':')!==-1 && t.indexOf(':')<40);
  }
  function textOf(el){ return ((el.innerText||'')+'').replace(/\s+/g,' ').trim(); }
  function followingFrom(start){
    var parent=start.parentElement;
    if(!parent) return [start];
    var out=[], seen=false;
    var kids=parent.children;
    for(var i=0;i<kids.length;i++){
      var cur=kids[i];
      if(!seen){
        if(cur===start || cur.contains(start)) seen=true;
        else continue;
      }
      var tag=(cur.tagName||'').toLowerCase();
      if(seen && cur!==start && !cur.contains(start) && /^h[1-6]$/.test(tag)) break;
      var nodes=(tag==='p'||tag==='li')?[cur]:cur.querySelectorAll('p, li');
      if(!nodes.length && tag==='div' && textOf(cur).length>80) nodes=[cur];
      for(var j=0;j<nodes.length;j++){
        var t=textOf(nodes[j]);
        if(!t || isMeta(t) || t.length<40) continue;
        out.push(nodes[j]);
      }
    }
    return out.length?out:[start];
  }
  function reposition(scroll){
    if(boxEls && boxEls.length) placeMany(boxEls, captionText, scroll);
    else if(boxEl) place(boxEl, captionText, scroll);
  }
  function placeMany(els, caption, scroll){
    if(!els || !els.length){ place(null, caption, false); return; }
    var box=ensureBox();
    var lab=document.getElementById('vettr-confirm-label');
    var top=1e9, left=1e9, right=0, bottom=0;
    for(var i=0;i<els.length;i++){
      var r=els[i].getBoundingClientRect();
      top=Math.min(top, r.top+window.scrollY);
      left=Math.min(left, r.left+window.scrollX);
      right=Math.max(right, r.right+window.scrollX);
      bottom=Math.max(bottom, r.bottom+window.scrollY);
    }
    boxEl=els[0]; boxEls=els; captionText=caption||'';
    box.style.display='block';
    box.style.top=top+'px';
    box.style.left=left+'px';
    box.style.width=Math.max(right-left, 12)+'px';
    box.style.height=Math.max(bottom-top, 12)+'px';
    box.style.borderColor='#16a34a';
    box.style.boxShadow='0 0 0 4px rgba(22,163,74,.28)';
    if(lab) lab.textContent=captionText;
    if(scroll!==false){ try{ els[0].scrollIntoView({block:'center', inline:'nearest'}); }catch(err){} }
  }
  document.addEventListener('mouseover',function(e){
    if(!picking) return;
    if(active) active.style.outline='';
    active=e.target;
    active.style.outline='2px solid #86efac';
    active.style.outlineOffset='1px';
  },true);
  document.addEventListener('click',function(e){ e.preventDefault(); e.stopPropagation(); if(!picking) return; var el=e.target;
    var tag=el.tagName.toLowerCase();
    var text=(el.innerText||el.textContent||'').trim().slice(0,200);
    place(el, 'Selected <'+tag+'> — choose Use on the right', true);
    parent.postMessage({type:'vettr-pick', path:cssPath(el), text:text, tag:tag}, '*'); },true);
  document.addEventListener('submit',function(e){ e.preventDefault(); },true);
  window.addEventListener('message',function(e){
    var d=e.data||{};
    if(d.type==='vettr-picking') picking=!!d.on;
    if(d.type==='vettr-highlight'){
      var el=null;
      if(d.xpath){
        try{
          var found=document.evaluate(d.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
          el=found.singleNodeValue;
        }catch(err){}
      }
      if(!el && d.css){ try{ el=document.querySelector(d.css); }catch(err){} }
      if(!el && d.anchor) el=smallestMatch(d.anchor);
      if(!el && d.label) el=smallestMatch(d.label);
      if(!el && d.text && !d.exact) el=smallestMatch(d.text);
      if(d.mode==='following' && el){
        var group=followingFrom(el);
        placeMany(group, (d.option||d.field||'Description')+' · '+group.length+' paragraphs', true);
        return;
      }
      var cap=(d.field||'Field');
      if(d.option) cap=d.option;
      else if(d.text) cap+=' → '+String(d.text).replace(/\\s+/g,' ').trim().slice(0,90);
      else if(d.label) cap+=' → label “'+d.label+'”';
      else if(!el) cap+=' → no match on this page';
      place(el, cap, true);
    }
  });
  parent.postMessage({type:'vettr-ready'}, '*');
})();</script>`;

function defaultDiscover(source) {
  const startUrls = collectStartUrls(null, source, '');
  let host = '';
  try { host = new URL(startUrls[0] || source?.listings_url || source?.base_url || '').hostname.replace(/^www\./i, '').toLowerCase(); } catch { /* ignore */ }
  if (host === 'bizbuysell.com') {
    let origin = 'https://www.bizbuysell.com';
    try { origin = new URL(startUrls[0] || source?.listings_url || source?.base_url).origin; } catch { /* ignore */ }
    return {
      startUrls: [`${origin}/businesses-for-sale/`],
      listingLink: { css: 'a[href*="/business-opportunity/"], a[href*="/business-for-sale/"]' },
      urlPattern: '/(business-opportunity|business-for-sale)/[^/?#]+/[0-9]+',
      pagination: { css: 'a[rel=next], a.next, .next a', maxPages: 20 },
      maxUrls: 1500,
    };
  }
  return {
    startUrls,
    listingLink: { css: 'a[href]' },
    urlPattern: '',
    pagination: { css: 'a[rel=next], a.next, .next a', maxPages: 20 },
    maxUrls: 1500,
  };
}

const DEFAULT_RECIPE = (source) => ({
  fetch: { mode: source?.fetch_mode || 'http' },
  discover: defaultDiscover(source),
  fields: {},
  validate: { anyOf: ['asking_price', 'annual_profit', 'annual_revenue'] },
  politeness: { rateLimitMs: source?.rate_limit_ms || 3000 },
});

function isListingsIndex(url) {
  try {
    const p = new URL(url).pathname.replace(/\/+$/, '') || '/';
    return /\/(businesses-for-sale|buy|search)$/i.test(p) || p === '/';
  } catch { return false; }
}

function collectStartUrls(recipe, source, snapUrl) {
  const d = recipe?.discover || {};
  const raw = d.startUrls;
  const fromRecipe = (Array.isArray(raw) ? raw : raw ? String(raw).split(/\s+/) : [])
    .concat(d.startUrl ? [d.startUrl] : [])
    .map((u) => String(u || '').trim())
    .filter((u) => /^https?:\/\//i.test(u));
  if (fromRecipe.length) return [...new Set(fromRecipe)];
  const listed = String(source?.listings_url || source?.base_url || '').trim();
  if (/^https?:\/\//i.test(listed)) return [listed];
  try {
    const u = new URL(snapUrl || '');
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    if (host === 'bizbuysell.com') return [`${u.origin}/businesses-for-sale/`];
    if (host === 'bizquest.com') return [`${u.origin}/businesses-for-sale/`];
    if (u.origin && u.origin !== 'null') return [`${u.origin}/`];
  } catch { /* ignore */ }
  return [];
}

const PRIMARY_FIELDS = ['name', 'asking_price', 'annual_profit', 'sde', 'ebitda', 'annual_revenue', 'location', 'industries', 'description', 'years_established', 'broker_name', 'source_id'];

function ruleSummary(rules) {
  if (!rules?.length) return null;
  const r = rules[0];
  const extra = rules.length > 1 ? ` (+${rules.length - 1})` : '';
  if (r.type === 'following') return `paragraphs from: ${(r.anchor || r.sel || '').slice(0, 48)}${extra}`;
  if (r.type === 'label') return `label: ${(r.labels || [r.label]).join(' | ')}${extra}`;
  if (r.type === 'css' || r.type === 'xpath') return `${r.type}: ${r.sel}${r.attr ? ` @${r.attr}` : ''}${extra}`;
  if (r.type === 'jsonld') return `jsonld: ${r.path}${extra}`;
  if (r.type === 'regex' || r.type === 'url') return `${r.type}: ${r.pattern}${extra}`;
  return `${r.type}${extra}`;
}

export default function RecipeTrainerPage() {
  const { key } = useParams();
  const location = useLocation();
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
  const [showPaste, setShowPaste] = useState(false);
  const [pasteHtml, setPasteHtml] = useState('');
  const [picking, setPicking] = useState(true);
  const [activeField, setActiveField] = useState('asking_price');
  const [pick, setPick] = useState(null); // { path, text, tag, candidates, labels }
  const [shownOption, setShownOption] = useState(null);
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
        const defDisc = DEFAULT_RECIPE(d.source).discover;
        const disc = { ...defDisc, ...(r.discover || {}) };
        if (!disc.urlPattern) disc.urlPattern = defDisc.urlPattern;
        if (!disc.listingLink?.css || disc.listingLink.css === 'a[href]') disc.listingLink = defDisc.listingLink;
        const hint = location.state?.snapUrl || location.state?.listings_url || '';
        const merged = { ...DEFAULT_RECIPE(d.source), ...r, discover: disc, fields: { ...(r.fields || {}) } };
        setRecipe({ ...merged, discover: { ...merged.discover, startUrls: collectStartUrls(merged, d.source, hint) } });
        setSnapUrl((prev) => {
          if (prev) return prev;
          const listed = hint || d.source.listings_url || d.source.base_url || '';
          return isListingsIndex(listed) ? '' : listed;
        });
      })
      .catch((e) => setErr(e.message));
  }, [key]);

  const mode = recipe?.fetch?.mode || source?.fetch_mode || 'http';
  const setMode = (m) => setRecipe((r) => ({ ...r, fetch: { ...(r.fetch || {}), mode: m } }));

  // ---- Snapshot -------------------------------------------------------------
  const takeSnapshot = async (url = snapUrl, html) => {
    if (!url && !html) return;
    const pageUrl = url || snapUrl;
    if (!pageUrl) { setErr('Paste the listing URL first, then the HTML.'); return; }
    setBusy('snapshot'); setErr(null); setPick(null); setPreview(null); setSuggestions(null);
    try {
      const s = await adminScrapeAPI.snapshot({ url: pageUrl, mode, source_key: key, html });
      setSnap(s);
      setSnapUrl(pageUrl);
      if (html) setShowPaste(false);
      if (s.blocked) {
        const hint = isListingsIndex(pageUrl)
          ? 'That is the search index (Akamai). Open a listing in Chrome and use Paste HTML.'
          : 'Akamai blocked the scraper. Open the listing in Chrome and use Paste HTML.';
        setErr(`Blocked (${s.block_reason}). ${hint}`);
        setShowPaste(true);
      }
    } catch (e) { setErr(e.message); } finally { setBusy(''); }
  };

  const srcdoc = useMemo(() => (snap?.html ? snap.html.replace(/<\/body>/i, `${PICKER_SCRIPT}</body>`) : ''), [snap?.html, PICKER_SCRIPT]);

  const postHighlight = useCallback(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const rules = recipe?.fields?.[activeField] || [];
    const pv = preview?.fields?.[activeField];
    const selRule = rules.find((r) => (r.type === 'css' || r.type === 'xpath' || r.type === 'following') && r.sel);
    const css = selRule?.type === 'css' || selRule?.type === 'following' ? selRule.sel : '';
    const xpath = selRule?.type === 'xpath' ? selRule.sel : '';
    const follow = selRule?.type === 'following';
    const labelRule = rules.find((r) => r.type === 'label');
    const label = (labelRule?.labels && labelRule.labels[0]) || labelRule?.label || '';
    const text = pv?.value ? String(pv.value).replace(/\s+/g, ' ').trim().slice(0, 120) : '';
    if (!css && !xpath && !text && !label) return;
    const field = registry.find((f) => f.key === activeField)?.label || activeField;
    win.postMessage({
      type: 'vettr-highlight', css, xpath, text, label, field,
      exact: Boolean(css || xpath || label),
      mode: follow ? 'following' : '',
      anchor: follow ? (selRule.anchor || '') : '',
    }, '*');
  }, [activeField, preview, recipe?.fields, registry]);

  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: 'vettr-picking', on: picking }, '*');
    postHighlight();
  }, [picking, srcdoc, postHighlight]);

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
      if (d.type === 'vettr-ready') {
        iframeRef.current?.contentWindow?.postMessage({ type: 'vettr-picking', on: picking }, '*');
        postHighlight();
        return;
      }
      if (d.type !== 'vettr-pick' || !snap?.id) return;
      setBusy('selector'); setErr(null);
      try {
        const out = await adminScrapeAPI.selector(snap.id, d.path, d.text);
        setPick({ ...d, ...out });
        setShownOption(null);
        setRightTab('fields');
      } catch (e) { setErr(`Could not resolve element: ${e.message}`); setPick({ ...d, candidates: [], labels: [] }); }
      finally { setBusy(''); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [snap?.id, picking, postHighlight]);

  const setRules = (field, rules) => setRecipe((r) => {
    const fields = { ...(r.fields || {}) };
    if (!rules || !rules.length) delete fields[field]; else fields[field] = rules;
    return { ...r, fields };
  });

  const showOption = (id, spec) => {
    setShownOption(id);
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    const field = registry.find((f) => f.key === activeField)?.label || activeField;
    const previewText = spec.raw_value ? String(spec.raw_value).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
    const option = previewText ? `${spec.kind} → ${previewText}` : spec.kind;
    win.postMessage({
      type: 'vettr-highlight',
      exact: true,
      field,
      option,
      css: spec.type === 'css' || spec.type === 'following' ? spec.sel : '',
      xpath: spec.type === 'xpath' ? spec.sel : '',
      label: spec.type === 'label' ? (spec.labels?.[0] || '') : '',
      mode: spec.type === 'following' ? 'following' : '',
      anchor: spec.anchor || '',
      text: previewText,
    }, '*');
  };

  const applyCandidate = (rule) => {
    if (!activeField) return;
    const existing = (recipe.fields?.[activeField] || []).filter((r) => JSON.stringify(r) !== JSON.stringify(rule));
    setRules(activeField, [rule, ...existing]);
    setPick(null);
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
      const startUrls = collectStartUrls(recipe, source, snapUrl);
      const d = await adminScrapeAPI.discoverTest(key, { recipe: { ...recipe, discover: { ...(recipe.discover || {}), startUrls } }, maxUrls: 40 });
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
      const startUrls = collectStartUrls(recipe, source, snapUrl);
      if (!startUrls.length) {
        setErr('Add a Discover start URL (the listings search page). Open the discover tab or paste a listings URL.');
        setBusy('');
        return;
      }
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
    const fields = recipe?.fields || {};
    if (fieldSort === 'az') {
      list = [...list].sort((a, b) => (a.label || a.key).localeCompare(b.label || b.key));
    } else if (fieldSort === 'mapped') {
      const mapped = (k) => (fields[k]?.length ? 0 : 1);
      list = [...list].sort((a, b) => mapped(a.key) - mapped(b.key) || (a.label || '').localeCompare(b.label || ''));
    }
    return list;
  }, [registry, fieldQuery, fieldSort, recipe?.fields]);

  if (key === 'airtable_bizbuysell') {
    return (
      <AdminScrapeLayout title="Airtable (BizBuySell)">
        <p>This is the Airtable feed, not a site recipe. Train <Link to="/admin/sources/bizbuysell_direct/train">BizBuySell (direct)</Link> instead.</p>
      </AdminScrapeLayout>
    );
  }

  if (!recipe || !source) return <AdminScrapeLayout title={key}><p className={err ? 'scrape-error' : 'muted'}>{err || 'Loading…'}</p></AdminScrapeLayout>;

  const fieldCount = Object.keys(recipe.fields || {}).length;
  const d = recipe.discover || {};
  const setDiscover = (patch) => setRecipe((r) => ({ ...r, discover: { ...(r.discover || {}), ...patch } }));

  return (
    <AdminScrapeLayout title={`Train: ${source.display_name || key}`} subtitle="Click values on the page, confirm the rule, generalize across listings, save.">
      <div className="scrape-panel">
        <div className="scrape-toolbar">
          <span className="muted">Step 1</span>
          <input className="modal-input" style={{ flex: 1, minWidth: 320 }} placeholder="Listing URL (…/business-opportunity/name/1234567/) — not the search page" value={snapUrl} onChange={(e) => setSnapUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') takeSnapshot(); }} />
          <select className="modal-input" value={mode} onChange={(e) => setMode(e.target.value)} title="Fetch mode used for this source">
            <option value="http">http</option><option value="browser">browser</option><option value="stealth">stealth</option>
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={!snapUrl || busy === 'snapshot'} onClick={() => takeSnapshot()}>{busy === 'snapshot' ? 'Loading…' : 'Load page'}</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowPaste((v) => !v)}>{showPaste ? 'Hide paste' : 'Paste HTML'}</button>
          <span className="spacer" />
          <label className="muted"><input type="checkbox" checked={activateOnSave} onChange={(e) => setActivateOnSave(e.target.checked)} /> activate schedule on save</label>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'save' || !fieldCount} onClick={save}>Save recipe ({fieldCount} fields)</button>
          <Link className="btn btn-secondary btn-sm" to={`/admin/sources/${encodeURIComponent(key)}`}>Cancel</Link>
        </div>
        {err ? <p className="scrape-error" style={{ marginTop: 8 }}>{err}</p> : null}
        {showPaste ? (
          <div style={{ marginTop: 8 }}>
            <p className="muted">Chrome: open the listing → DevTools → Elements → right-click <code>&lt;html&gt;</code> → Copy → Copy outerHTML.</p>
            <textarea className="modal-input" rows={6} placeholder="Paste the page HTML here" value={pasteHtml} onChange={(e) => setPasteHtml(e.target.value)} />
            <div className="scrape-toolbar" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'snapshot' || pasteHtml.length < 200} onClick={() => takeSnapshot(snapUrl, pasteHtml)}>Use pasted HTML</button>
            </div>
          </div>
        ) : null}
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
                  {activeField === 'description' || activeField === 'summary' ? (
                    <p className="muted" style={{ marginTop: 0 }}>For several paragraphs, click the option whose text starts with the paragraph in the green box and continues into the next ones. That block keeps whatever number of paragraphs the next listing has.</p>
                  ) : null}
                  <p className="muted" style={{ marginTop: 0 }}>Click an option to outline it in green. Use saves that outline.</p>
                  <div className="trainer-candidates">
                    {(pick.blocks || []).map((b, i) => (
                      <div className={`trainer-candidate${shownOption === `block-${i}` ? ' is-shown' : ''}`} key={`block-${i}`} onClick={() => showOption(`block-${i}`, { type: 'following', sel: b.sel, anchor: b.anchor, kind: b.note, raw_value: b.raw_value })}>
                        <div>
                          <Chip kind="ok">{b.note}</Chip>{' '}
                          <span className="muted">{b.chars} chars · skips asking price and reading time</span>
                          {b.raw_value ? <div className="muted">→ {String(b.raw_value).slice(0, 180)}{b.chars > 180 ? '…' : ''}</div> : null}
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); applyCandidate({ type: 'following', sel: b.sel, anchor: b.anchor }); }}>Use</button>
                      </div>
                    ))}
                    {(pick.labels || []).map((l) => (
                      <div className={`trainer-candidate${shownOption === `l-${l}` ? ' is-shown' : ''}`} key={`l-${l}`} onClick={() => showOption(`l-${l}`, { type: 'label', labels: [l], kind: 'label', raw_value: l })}>
                        <div><Chip kind="ok">label</Chip> <code>{l}</code> <span className="muted">value next to this label{['description','summary','reason_for_sale','training_support','historical_summary','buyer_qualifications','competition','growth_opportunities','financing_notes'].includes(activeField) ? ' (keeps following paragraphs)' : ''}</span></div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); applyCandidate({ type: 'label', labels: [l] }); }}>Use</button>
                      </div>
                    ))}
                    {(pick.containers || []).map((c, i) => (
                      <div className={`trainer-candidate${shownOption === `box-${i}` ? ' is-shown' : ''}`} key={`box-${i}`} onClick={() => showOption(`box-${i}`, { type: c.type || 'css', sel: c.sel, kind: 'container', raw_value: c.raw_value })}>
                        <div>
                          <Chip kind="ok">{c.note || `container · ${c.chars} chars · depth ${c.depth}`}</Chip>{' '}
                          <code>{c.sel}</code>
                          {c.raw_value ? <div className="muted">→ {String(c.raw_value).slice(0, 120)}{c.chars > 120 ? '…' : ''}</div> : null}
                        </div>
                        <button type="button" className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); applyCandidate({ type: c.type, sel: c.sel }); }}>Use container</button>
                      </div>
                    ))}
                    {(pick.candidates || []).filter((c) => c.sel).map((c, i) => (
                      <div className={`trainer-candidate${shownOption === `c-${i}` ? ' is-shown' : ''}`} key={`c-${i}`} onClick={() => showOption(`c-${i}`, { type: c.type, sel: c.sel, kind: c.type, raw_value: c.raw_value })}>
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
              <p className="muted" style={{ margin: '0 0 8px' }}>{snap ? 'Select a field to outline it in green, then click to set or change the rule.' : 'Load a page to start picking.'}</p>

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
                          ? <div className="val">{String(pv.value)}{norm != null && typeof norm !== 'object' && String(norm) !== String(pv.value) ? <b> = {String(norm)}</b> : null}<div className="muted">{String(pv.value).length} characters</div></div>
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
