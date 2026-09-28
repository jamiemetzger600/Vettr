/**
 * Arrange-Act-Assert: auth rate limiter keys by client IP and returns 429 JSON.
 */
import http from 'http';
import express from 'express';
import { createAuthRateLimiter } from './authRateLimit.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(port);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function post(port, headers = {}) {
  const res = await fetch(`http://127.0.0.1:${port}/hit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: '{}'
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// --- Limit by CF-Connecting-IP; different IPs do not share a bucket ---
{
  const app = express();
  app.set('trust proxy', true);
  app.use(createAuthRateLimiter({ max: 2, name: 'rl-test', windowMs: 60_000 }));
  app.post('/hit', (_req, res) => res.json({ ok: true }));

  await withServer(app, async (port) => {
    // Arrange: distinct client IPs via Worker-forwarded header
    const ipA = { 'X-Vettr-Client-IP': '203.0.113.50' };
    const ipB = { 'X-Vettr-Client-IP': '203.0.113.99' };

    // Act
    const r1 = await post(port, ipA);
    const r2 = await post(port, ipB);
    const r3 = await post(port, ipA);
    const r4 = await post(port, ipA); // 3rd for A → 429
    const r5 = await post(port, ipB); // 2nd for B → still ok

    // Assert
    assert(r1.status === 200, `A1 expected 200, got ${r1.status}`);
    assert(r2.status === 200, `B1 expected 200, got ${r2.status}`);
    assert(r3.status === 200, `A2 expected 200, got ${r3.status}`);
    assert(r4.status === 429, `A3 expected 429, got ${r4.status}`);
    assert(
      typeof r4.body.error === 'string' && r4.body.error.toLowerCase().includes('too many'),
      `429 JSON message: ${JSON.stringify(r4.body)}`
    );
    assert(r5.status === 200, `B2 expected 200 (separate bucket), got ${r5.status}`);
  });
}

// --- X-Forwarded-For used when CF header absent ---
{
  const app = express();
  app.set('trust proxy', true);
  app.use(createAuthRateLimiter({ max: 1, name: 'xff-test', windowMs: 60_000 }));
  app.post('/hit', (_req, res) => res.json({ ok: true }));

  await withServer(app, async (port) => {
    const headers = { 'X-Forwarded-For': '198.51.100.77, 10.0.0.1' };
    const first = await post(port, headers);
    const second = await post(port, headers);
    assert(first.status === 200, `xff first expected 200, got ${first.status}`);
    assert(second.status === 429, `xff second expected 429, got ${second.status}`);
  });
}

console.log('authRateLimit tests passed');
