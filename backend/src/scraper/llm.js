/**
 * LLM assist via any OpenAI-compatible endpoint. Defaults to local Ollama.
 *   LLM_BASE_URL=http://localhost:11434/v1   LLM_MODEL=hermes3:8b   LLM_API_KEY=(optional)
 *
 * Used for: suggesting recipe rules from a page (trainer), validating a sample of
 * extracted listings per run (drift detection), and proposing repairs for pages the
 * recipe could not extract. Never on every listing.
 */
import pool from '../db/pool.js';
import { parseMoney } from './normalize.js';

const BASE = (process.env.LLM_BASE_URL || 'http://127.0.0.1:11434/v1').replace(/\/+$/, '');
const MODEL = process.env.LLM_MODEL || 'hermes3:8b';
const API_KEY = process.env.LLM_API_KEY || 'ollama';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 120000;
export const LLM_SAMPLE_RATE = Number(process.env.LLM_SAMPLE_RATE ?? 0.05);
export const LLM_SAMPLE_CAP = Number(process.env.LLM_SAMPLE_CAP ?? 20);
export const LLM_DRIFT_RATIO = 0.2;
const ENABLED = String(process.env.LLM_ENABLED ?? 'true') !== 'false';

export function llmConfig() {
  return { enabled: ENABLED, baseUrl: BASE, model: MODEL };
}

export async function llmStatus() {
  if (!ENABLED) return { ok: false, enabled: false, model: MODEL, baseUrl: BASE, reason: 'LLM_ENABLED=false' };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`${BASE}/models`, { headers: { authorization: `Bearer ${API_KEY}` }, signal: ctrl.signal });
    const body = await res.json().catch(() => ({}));
    const models = (body?.data || []).map((m) => m.id);
    return { ok: res.ok, enabled: true, model: MODEL, baseUrl: BASE, modelAvailable: models.length ? models.includes(MODEL) : null, models: models.slice(0, 20) };
  } catch (err) {
    return { ok: false, enabled: true, model: MODEL, baseUrl: BASE, reason: err.message };
  } finally {
    clearTimeout(t);
  }
}

function extractJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* fallthrough */ }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { return null; } }
  return null;
}

export async function chatJson({ system, user, maxTokens = 800, temperature = 0 }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const started = Date.now();
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: MODEL, temperature, max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`LLM ${res.status}: ${body?.error?.message || JSON.stringify(body).slice(0, 200)}`);
    const content = body?.choices?.[0]?.message?.content || '';
    const json = extractJson(content);
    console.log(`[llm] ${MODEL} ${Date.now() - started}ms tokens=${body?.usage?.total_tokens ?? '?'} parsed=${json ? 'ok' : 'FAIL'}`);
    if (!json) throw new Error('LLM returned non-JSON: ' + content.slice(0, 200));
    return json;
  } finally {
    clearTimeout(t);
  }
}

const FIELD_HINTS = {
  name: 'the listing title / business name',
  asking_price: 'asking price in USD',
  annual_profit: 'cash flow or owner benefit (not SDE/EBITDA if listed separately)',
  sde: 'SDE or seller discretionary earnings',
  ebitda: 'EBITDA',
  annual_revenue: 'gross revenue / annual sales / total sales',
  location: 'city and state',
  industries: 'industry / category',
  years_established: 'year established or years in business',
  description: 'the first sentence of the business description',
  broker_name: 'the listing broker or agent name',
  source_id: 'listing ID / reference number',
};

function trimText(text, max = 12000) {
  if (!text) return '';
  const t = String(text).replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n');
  if (t.length <= max) return t;
  // Prefer the region around money values
  const idx = t.search(/\$\s?\d/);
  const start = Math.max(0, Math.min(idx - 2000, t.length - max));
  return t.slice(start, start + max);
}

/**
 * Ask the model to find each field in page text and report the label that sits next to it.
 * @returns {{[field]: {value:string|null, label:string|null}}}
 */
export async function suggestFields(pageText, fields = Object.keys(FIELD_HINTS)) {
  const spec = fields.map((f) => `  "${f}": {"value": string|null, "label": string|null}  // ${FIELD_HINTS[f] || f}`).join('\n');
  const system = 'You extract structured facts from business-for-sale listing pages. Respond with JSON only. For each field return the exact value text as it appears on the page and the exact label text that appears immediately before or beside it (e.g. "Cash Flow:", "Asking Price"). Use null when absent. Never invent values.';
  const user = `Return JSON of this shape:\n{\n${spec}\n}\n\nPAGE TEXT:\n${trimText(pageText)}`;
  const out = await chatJson({ system, user, maxTokens: 700 });
  const clean = {};
  for (const f of fields) {
    const v = out?.[f];
    clean[f] = { value: v?.value == null ? null : String(v.value).trim() || null, label: v?.label == null ? null : String(v.label).replace(/[:\s]+$/, '').trim() || null };
  }
  return clean;
}

/** Turn LLM suggestions into recipe strategies. */
export function suggestionsToStrategies(sugg) {
  const rules = {};
  for (const [field, s] of Object.entries(sugg || {})) {
    if (!s?.value) continue;
    const list = [];
    if (s.label) list.push({ type: 'label', labels: [s.label] });
    if (field === 'name') list.push({ type: 'css', sel: 'h1' });
    if (!list.length && s.value && field !== 'description') {
      const escaped = s.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 60);
      list.push({ type: 'regex', pattern: `(${escaped})`, note: 'value-anchored; replace with a label rule' });
    }
    if (list.length) rules[field] = list;
  }
  return rules;
}

function moneyAgrees(a, b) {
  const x = parseMoney(a), y = parseMoney(b);
  if (x == null && y == null) return true;
  if (x == null || y == null) return false;
  return Math.abs(x - y) / Math.max(x, y) < 0.02;
}

/**
 * Compare recipe output with the model's read of the same page for a few sampled items.
 * @param {Array<{url, text, normalized}>} samples
 */
export async function validateSamples(samples) {
  const results = [];
  for (const s of samples) {
    try {
      const sugg = await suggestFields(s.text, ['asking_price', 'annual_profit', 'annual_revenue']);
      const disagreements = [];
      for (const f of ['asking_price', 'annual_profit', 'annual_revenue']) {
        const recipeVal = s.normalized?.[f];
        const llmVal = sugg[f]?.value;
        if (llmVal && recipeVal != null && !moneyAgrees(recipeVal, llmVal)) disagreements.push({ field: f, recipe: recipeVal, llm: llmVal, label: sugg[f]?.label });
        if (llmVal && recipeVal == null && parseMoney(llmVal) != null) disagreements.push({ field: f, recipe: null, llm: llmVal, label: sugg[f]?.label, missed: true });
      }
      results.push({ url: s.url, disagreements });
    } catch (err) {
      results.push({ url: s.url, error: err.message });
    }
  }
  const checked = results.filter((r) => !r.error).length;
  const disagreeing = results.filter((r) => r.disagreements?.length).length;
  return { checked, disagreeing, ratio: checked ? disagreeing / checked : 0, results };
}

/**
 * For pages the recipe could not extract, ask the model where the values are and file a proposal.
 * @param {Array<{url, text}>} failures
 */
export async function proposeRepairs({ sourceKey, runId, recipe, failures }) {
  const proposals = [];
  const fields = ['name', 'asking_price', 'annual_profit', 'annual_revenue', 'location'];
  const labelVotes = {}; // field -> label -> count
  const evidence = [];
  for (const f of failures.slice(0, 5)) {
    try {
      const sugg = await suggestFields(f.text, fields);
      evidence.push({ url: f.url, suggestion: sugg });
      for (const [field, s] of Object.entries(sugg)) {
        if (s.value && s.label) { labelVotes[field] ||= {}; labelVotes[field][s.label] = (labelVotes[field][s.label] || 0) + 1; }
      }
    } catch (err) {
      evidence.push({ url: f.url, error: err.message });
    }
  }
  for (const [field, votes] of Object.entries(labelVotes)) {
    const [label, n] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
    if (n < 1) continue;
    const current = recipe?.fields?.[field] || [];
    const already = current.some((r) => r.type === 'label' && (r.labels || []).some((l) => l.toLowerCase() === label.toLowerCase()));
    if (already) continue;
    const proposed = [{ type: 'label', labels: [label] }, ...current];
    const r = await pool.query(
      `INSERT INTO recipe_proposals (source_key, run_id, field, kind, current_rules, proposed_rules, evidence)
       SELECT $1,$2,$3,'repair',$4,$5,$6
       WHERE NOT EXISTS (SELECT 1 FROM recipe_proposals WHERE source_key = $1 AND field = $3 AND status = 'pending')
       RETURNING id`,
      [sourceKey, runId, field, JSON.stringify(current), JSON.stringify(proposed), JSON.stringify({ label, votes: n, samples: evidence.slice(0, 3) })]
    );
    if (r.rows[0]) proposals.push({ id: r.rows[0].id, field, label, votes: n });
  }
  if (proposals.length) console.log(`[llm] filed ${proposals.length} repair proposals for ${sourceKey}`, proposals);
  return proposals;
}

/**
 * Post-run hook: drift check on samples, repair proposals for failures.
 * Returns summary or null when the LLM is unavailable.
 */
export async function postRunLlm({ run, recipe, samples, failures }) {
  if (!ENABLED) return null;
  const st = await llmStatus();
  if (!st.ok) { console.log('[llm] unavailable; skipping post-run checks:', st.reason || st); return null; }
  const summary = { validated: null, proposals: [] };
  if (samples.length) {
    summary.validated = await validateSamples(samples);
    if (summary.validated.checked >= 3 && summary.validated.ratio > LLM_DRIFT_RATIO) {
      await pool.query(
        `INSERT INTO scrape_alerts (source_key, run_id, kind, severity, message, details) VALUES ($1,$2,'drift','warn',$3,$4)`,
        [run.source_key, run.id, `LLM disagrees with recipe on ${summary.validated.disagreeing}/${summary.validated.checked} sampled listings`, JSON.stringify(summary.validated.results.filter((r) => r.disagreements?.length).slice(0, 5))]
      );
    }
  }
  if (failures.length) summary.proposals = await proposeRepairs({ sourceKey: run.source_key, runId: run.id, recipe, failures });
  return summary;
}
