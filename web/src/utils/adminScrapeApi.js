// Admin scrape platform API client. Separate from api.js so the core client stays untouched.
import { buildAuthHeaders } from './api';

const API_URL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_API_URL || '/api');
const BASE = `${API_URL}/admin/scrape`;

export class AdminApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function req(path, { method = 'GET', body, timeoutMs = 120000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'include',
      headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    if (!res.ok) {
      const msg = data?.error || `${res.status} ${res.statusText}`;
      const details = Array.isArray(data?.details) ? `: ${data.details.join('; ')}` : '';
      console.warn('[admin-scrape]', method, path, res.status, msg);
      throw new AdminApiError(msg + details, { status: res.status, body: data });
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new AdminApiError('Request timed out', { status: 0 });
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const adminScrapeAPI = {
  status: () => req('/status'),
  sources: () => req('/sources'),
  createSource: (payload) => req('/sources', { method: 'POST', body: payload }),
  source: (key) => req(`/sources/${encodeURIComponent(key)}`),
  updateSource: (key, payload) => req(`/sources/${encodeURIComponent(key)}`, { method: 'PATCH', body: payload }),
  deleteSource: (key) => req(`/sources/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  runSource: (key, payload = {}) => req(`/sources/${encodeURIComponent(key)}/run`, { method: 'POST', body: payload }),
  pause: (key, reason) => req(`/sources/${encodeURIComponent(key)}/pause`, { method: 'POST', body: { reason } }),
  resume: (key) => req(`/sources/${encodeURIComponent(key)}/resume`, { method: 'POST', body: {} }),
  publish: (key) => req(`/sources/${encodeURIComponent(key)}/publish`, { method: 'POST', body: {} }),
  unpublish: (key, removeFromPool) => req(`/sources/${encodeURIComponent(key)}/unpublish`, { method: 'POST', body: { removeFromPool } }),
  discoverTest: (key, payload) => req(`/sources/${encodeURIComponent(key)}/discover-test`, { method: 'POST', body: payload, timeoutMs: 180000 }),
  test: (key, payload) => req(`/sources/${encodeURIComponent(key)}/test`, { method: 'POST', body: payload, timeoutMs: 300000 }),
  deals: (key, params = {}) => req(`/sources/${encodeURIComponent(key)}/deals?${new URLSearchParams(params)}`),
  runs: (params = {}) => req(`/runs?${new URLSearchParams(params)}`),
  run: (id) => req(`/runs/${id}`),
  runItems: (id, params = {}) => req(`/runs/${id}/items?${new URLSearchParams(params)}`),
  cancelRun: (id) => req(`/runs/${id}/cancel`, { method: 'POST', body: {} }),
  alerts: (open = true) => req(`/alerts?open=${open ? 1 : 0}`),
  ackAlert: (id) => req(`/alerts/${id}/ack`, { method: 'POST', body: {} }),
  ackAll: (sourceKey) => req('/alerts/ack-all', { method: 'POST', body: { source_key: sourceKey } }),
  proposals: (status = 'pending') => req(`/proposals?status=${status}`),
  approveProposal: (id) => req(`/proposals/${id}/approve`, { method: 'POST', body: {} }),
  rejectProposal: (id) => req(`/proposals/${id}/reject`, { method: 'POST', body: {} }),
  digestPreview: () => req('/digest/preview'),
  sendDigest: () => req('/digest/send', { method: 'POST', body: {} }),
  snapshot: (payload) => req('/snapshot', { method: 'POST', body: payload, timeoutMs: 180000 }),
  selector: (id, path) => req(`/snapshot/${id}/selector`, { method: 'POST', body: { path } }),
  extractSnapshot: (id, payload) => req(`/snapshot/${id}/extract`, { method: 'POST', body: payload }),
  suggest: (id, fields) => req(`/snapshot/${id}/suggest`, { method: 'POST', body: { fields }, timeoutMs: 300000 }),
  generalize: (payload) => req('/generalize', { method: 'POST', body: payload, timeoutMs: 600000 }),
  coverage: () => req('/coverage'),
};

export function fmtMoney(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 2)}M`;
  if (Math.abs(v) >= 1e3) return `$${Math.round(v / 1e3)}K`;
  return `$${v}`;
}

export function fmtAgo(ts) {
  if (!ts) return 'never';
  const d = new Date(ts);
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function fmtDuration(start, end) {
  if (!start) return '—';
  const ms = (end ? new Date(end) : new Date()).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
