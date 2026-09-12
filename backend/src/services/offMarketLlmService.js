import pool from '../db/pool.js';
import { encryptSecret, decryptSecret, last4, sha256Hex, randomToken } from '../lib/secretBox.js';
import { httpError } from '../lib/httpError.js';
import { addProspects, requireCampaign } from './offMarketService.js';

const PROVIDERS = new Set(['openai_compat', 'anthropic', 'webhook']);
const RESEARCH_CAP = 25;

function publicApiBase() {
  return (process.env.API_BASE_URL || process.env.WEB_APP_URL || 'http://localhost:3001').replace(/\/+$/, '');
}

function ingestUrlFor(token) {
  return `${publicApiBase()}/api/off-market/ingest/${token}`;
}

function rowToPublic(row, { ingestToken } = {}) {
  if (!row) {
    return { connected: false, provider: null, model: null, last4: '', hasIngestToken: false };
  }
  return {
    connected: Boolean(row.provider),
    provider: row.provider,
    model: row.model || null,
    baseUrl: row.base_url || null,
    last4: row.key_last4 || '',
    hasKey: Boolean(row.api_key_cipher),
    hasIngestToken: Boolean(row.ingest_token_hash),
    ingestUrl: ingestToken ? ingestUrlFor(ingestToken) : null,
    ingestToken: ingestToken || null
  };
}

export async function getLlmConnection(userId) {
  const result = await pool.query(
    `SELECT user_id, provider, model, base_url, key_last4, ingest_token_hash,
            (api_key_cipher IS NOT NULL) AS has_cipher
     FROM user_llm_connections WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return rowToPublic(null);
  return {
    ...rowToPublic({
      provider: row.provider,
      model: row.model,
      base_url: row.base_url,
      key_last4: row.key_last4,
      api_key_cipher: row.has_cipher,
      ingest_token_hash: row.ingest_token_hash
    }),
    userId: row.user_id
  };
}

async function loadFullConnection(userId) {
  const result = await pool.query(
    `SELECT * FROM user_llm_connections WHERE user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function upsertLlmConnection(userId, body = {}) {
  const provider = String(body.provider || 'openai_compat').trim();
  if (!PROVIDERS.has(provider)) throw httpError(400, 'Provider must be openai_compat, anthropic, or webhook');
  const existing = await loadFullConnection(userId);
  let cipher = existing?.api_key_cipher || null;
  let nonce = existing?.api_key_nonce || null;
  let keyLast4 = existing?.key_last4 || '';
  if (body.apiKey) {
    const boxed = encryptSecret(body.apiKey);
    cipher = boxed.cipher;
    nonce = boxed.nonce;
    keyLast4 = last4(body.apiKey);
  }
  if (provider !== 'webhook' && !cipher && !body.apiKey) {
    throw httpError(400, 'API key is required for this provider');
  }
  const model = String(body.model || '').trim() || (provider === 'anthropic' ? 'claude-sonnet-4-5' : 'gpt-4o-mini');
  const baseUrl = String(body.baseUrl || body.base_url || '').trim() || null;
  const result = await pool.query(
    `INSERT INTO user_llm_connections (
       user_id, provider, model, base_url, api_key_cipher, api_key_nonce, key_last4
     ) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id) DO UPDATE SET
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       base_url = EXCLUDED.base_url,
       api_key_cipher = COALESCE(EXCLUDED.api_key_cipher, user_llm_connections.api_key_cipher),
       api_key_nonce = COALESCE(EXCLUDED.api_key_nonce, user_llm_connections.api_key_nonce),
       key_last4 = COALESCE(NULLIF(EXCLUDED.key_last4, ''), user_llm_connections.key_last4),
       updated_at = NOW()
     RETURNING *`,
    [userId, provider, model, baseUrl, cipher, nonce, keyLast4]
  );
  console.log('[off-market] llm connection saved', { userId, provider, model });
  return rowToPublic(result.rows[0]);
}

export async function rotateIngestToken(userId) {
  const token = randomToken(24);
  const hash = sha256Hex(token);
  await pool.query(
    `INSERT INTO user_llm_connections (user_id, provider, ingest_token_hash)
     VALUES ($1, 'webhook', $2)
     ON CONFLICT (user_id) DO UPDATE SET
       ingest_token_hash = EXCLUDED.ingest_token_hash,
       updated_at = NOW()`,
    [userId, hash]
  );
  console.log('[off-market] ingest token rotated', { userId });
  return { ingestToken: token, ingestUrl: ingestUrlFor(token), hasIngestToken: true };
}

export async function deleteLlmConnection(userId) {
  await pool.query('DELETE FROM user_llm_connections WHERE user_id = $1', [userId]);
  return { connected: false };
}

export async function testLlmConnection(userId) {
  const text = await completeJson(userId, 'Reply with JSON only: {"ok":true}');
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: String(text || '').slice(0, 200) };
  }
  return { ok: true, parsed };
}

function extractJson(text) {
  const raw = String(text || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw httpError(502, 'Model did not return JSON');
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw httpError(502, 'Model JSON could not be parsed');
  }
}

async function completeJson(userId, prompt) {
  const row = await loadFullConnection(userId);
  if (!row?.provider) throw httpError(400, 'Connect an LLM in Settings first.');
  if (row.provider === 'webhook') {
    throw httpError(400, 'Webhook agents push prospects to the ingest URL — they are not called by Vettr.');
  }
  const apiKey = decryptSecret(row.api_key_cipher, row.api_key_nonce);
  if (!apiKey) throw httpError(400, 'No API key stored for this connection.');

  if (row.provider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: row.model || 'claude-sonnet-4-5',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[off-market] llm test failed', { userId, status: res.status, message: data.error?.message });
      throw httpError(400, data.error?.message || 'Anthropic request failed');
    }
    return (data.content || []).map((c) => c.text || '').join('\n');
  }

  const base = (row.base_url || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: row.model || 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'Return JSON only. No markdown.' },
        { role: 'user', content: prompt }
      ]
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.warn('[off-market] llm test failed', { userId, status: res.status, message: data.error?.message });
    throw httpError(400, data.error?.message || 'OpenAI-compatible request failed');
  }
  return data.choices?.[0]?.message?.content || '';
}

export async function researchCampaign(userId, campaignId, { extraBrief } = {}) {
  const campaign = await requireCampaign(userId, campaignId);
  const brief = [campaign.brief, extraBrief].filter(Boolean).join('\n');
  const prompt = [
    'You help a business buyer build a first-pass list of privately held companies that might be acquisition targets.',
    'Do not invent personal emails if you are not confident — leave email null.',
    'Never include public-company chains or franchises unless asked.',
    `Vertical: ${campaign.vertical || 'unspecified'}`,
    `Geography: ${campaign.geography || 'unspecified'}`,
    `Buyer brief: ${brief || 'none'}`,
    `Return JSON: {"prospects":[{"company_name":"","owner_name":null,"email":null,"title":null,"location":"","notes":"","source_url":null}]}`,
    `At most ${RESEARCH_CAP} prospects. company_name is required.`
  ].join('\n');

  const raw = await completeJson(userId, prompt);
  const parsed = extractJson(raw);
  const list = Array.isArray(parsed.prospects) ? parsed.prospects : [];
  const capped = list.slice(0, RESEARCH_CAP).filter((p) => String(p.company_name || p.companyName || '').trim());
  if (!capped.length) throw httpError(502, 'Model returned no usable prospects');
  const result = await addProspects(userId, campaignId, capped, { status: 'researched' });
  console.log('[off-market] research', { userId, campaignId, inserted: result.inserted.length });
  return result;
}

export async function ingestByToken(token, body = {}) {
  const hash = sha256Hex(token);
  const owner = await pool.query(
    `SELECT user_id FROM user_llm_connections WHERE ingest_token_hash = $1`,
    [hash]
  );
  if (!owner.rows[0]) throw httpError(401, 'Invalid ingest token');
  const userId = owner.rows[0].user_id;
  const campaignId = Number(body.campaignId || body.campaign_id);
  if (!Number.isFinite(campaignId) || campaignId <= 0) throw httpError(400, 'campaignId is required');
  await requireCampaign(userId, campaignId);
  const prospects = Array.isArray(body.prospects) ? body.prospects : [];
  const result = await addProspects(userId, campaignId, prospects, { status: 'researched' });
  console.log('[off-market] ingest', { userId, campaignId, inserted: result.inserted.length });
  return result;
}

export async function classifyReply(userId, bodyText) {
  const row = await loadFullConnection(userId);
  if (!row?.api_key_cipher || row.provider === 'webhook') return 'other';
  try {
    const raw = await completeJson(
      userId,
      'Classify this seller email reply. JSON only: {"label":"interested"|"not_interested"|"ooo"|"stop"|"other"}\n\n'
      + String(bodyText || '').slice(0, 4000)
    );
    const parsed = extractJson(raw);
    const label = String(parsed.label || 'other');
    if (['interested', 'not_interested', 'ooo', 'stop', 'other'].includes(label)) return label;
  } catch (err) {
    console.warn('[off-market] reply classify skipped', err.message);
  }
  return 'other';
}
