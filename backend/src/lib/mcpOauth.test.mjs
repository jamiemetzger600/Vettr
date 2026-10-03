import test from 'node:test';
import assert from 'node:assert/strict';
import {
  READ_TOOLS,
  WRITE_TOOLS,
  assertToolScope,
  exchangeAuthorizationCode,
  isAllowedRedirectUri,
  normalizeScopes,
  pkceS256,
  sha256,
  verifyPkce
} from './mcpOauth.js';
import { buyBoxCanSearch, marketQueryFromBuyBox } from '../mcp/buyBoxQuery.js';

test('PKCE S256 accepts the matching verifier and rejects a mismatch', () => {
  const verifier = 'a'.repeat(43);
  const challenge = pkceS256(verifier);
  assert.equal(verifyPkce(verifier, challenge), true);
  assert.equal(verifyPkce(`${verifier}x`, challenge), false);
  assert.equal(verifyPkce('', challenge), false);
});

test('scopes drop unknown values and default to read plus write', () => {
  assert.deepEqual(normalizeScopes(''), ['vettr:read', 'vettr:write']);
  assert.deepEqual(normalizeScopes('vettr:read delete vettr:write'), ['vettr:read', 'vettr:write']);
  assert.deepEqual(normalizeScopes('gmail.send'), []);
});

test('redirect URIs allow https and localhost only', () => {
  assert.equal(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback'), true);
  assert.equal(isAllowedRedirectUri('http://localhost:6274/oauth/callback'), true);
  assert.equal(isAllowedRedirectUri('http://evil.example/callback'), false);
  assert.equal(isAllowedRedirectUri('javascript:alert(1)'), false);
});

test('authorization code exchange issues a refresh token once', async () => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  const verifier = 'verifier-value-that-is-long-enough-for-pkce';
  const code = 'one-time-code';
  const row = {
    client_id: 'client-1',
    user_id: 7,
    email: 'buyer@example.com',
    redirect_uri: 'https://claude.ai/callback',
    code_challenge: pkceS256(verifier),
    scopes: 'vettr:read',
    resource: 'https://vettr-api.example/mcp',
    expires_at: new Date(Date.now() + 60_000).toISOString()
  };
  let stored = { [sha256(code)]: row };
  let issued = 0;
  const store = {
    async consumeCode(hash) {
      const found = stored[hash];
      delete stored[hash];
      return found || null;
    },
    async issueRefresh() {
      issued += 1;
      return { token: 'vtr_rt_test' };
    }
  };
  const granted = await exchangeAuthorizationCode(store, {
    code,
    client_id: 'client-1',
    redirect_uri: 'https://claude.ai/callback',
    code_verifier: verifier
  });
  assert.equal(granted.scope, 'vettr:read');
  assert.equal(granted.refreshToken, 'vtr_rt_test');
  assert.equal(issued, 1);
  await assert.rejects(
    () => exchangeAuthorizationCode(store, {
      code,
      client_id: 'client-1',
      redirect_uri: 'https://claude.ai/callback',
      code_verifier: verifier
    }),
    (err) => err.code === 'invalid_grant'
  );
});

test('code exchange rejects a bad PKCE verifier', async () => {
  const verifier = 'correct-verifier-correct-verifier-correct';
  const store = {
    async consumeCode() {
      return {
        client_id: 'client-1',
        user_id: 1,
        email: 'a@b.c',
        redirect_uri: 'http://localhost:3333/cb',
        code_challenge: pkceS256(verifier),
        scopes: 'vettr:read vettr:write',
        resource: 'http://localhost:3001/mcp',
        expires_at: new Date(Date.now() + 60_000).toISOString()
      };
    },
    async issueRefresh() {
      throw new Error('should not issue');
    }
  };
  await assert.rejects(
    () => exchangeAuthorizationCode(store, {
      code: 'abc',
      client_id: 'client-1',
      redirect_uri: 'http://localhost:3333/cb',
      code_verifier: 'wrong-verifier-wrong-verifier-wrong-ver'
    }),
    (err) => err.code === 'invalid_grant' && /PKCE/.test(err.message)
  );
});

test('write tools require vettr:write and unknown tools are refused', () => {
  assert.doesNotThrow(() => assertToolScope('get_buy_boxes', ['vettr:read']));
  assert.throws(() => assertToolScope('add_note', ['vettr:read']), (err) => err.code === 'forbidden');
  assert.doesNotThrow(() => assertToolScope('add_dd_answer', ['vettr:write']));
  for (const name of ['delete_deal', 'send_gmail', 'update_buy_box', 'patch_deal_stage', 'delete_dd_answer']) {
    assert.throws(() => assertToolScope(name, ['vettr:read', 'vettr:write']), (err) => err.code === 'forbidden');
    assert.equal(READ_TOOLS.has(name), false);
    assert.equal(WRITE_TOOLS.has(name), false);
  }
});

test('buy box query maps criteria, search, and exclude keywords', () => {
  const query = marketQueryFromBuyBox({
    minPrice: 500000,
    maxPrice: 2000000,
    minEbitda: 100000,
    targetStates: ['CA', 'TX'],
    targetIndustries: ['HVAC'],
    feedSearch: 'plumbing',
    excludeKeywords: ['franchise', ''],
    includeNearMatchesPercent: 0
  });
  assert.equal(query.min_price, '500000');
  assert.equal(query.max_price, '2000000');
  assert.equal(query.min_profit, '100000');
  assert.equal(query.state, 'CA,TX');
  assert.equal(query.industry, 'HVAC');
  assert.equal(query.search, 'plumbing');
  assert.deepEqual(JSON.parse(query.exclude_keywords), ['franchise']);
  assert.equal(buyBoxCanSearch({ feedSearch: 'plumbing' }), true);
  assert.equal(buyBoxCanSearch({ name: 'Empty' }), false);
});
