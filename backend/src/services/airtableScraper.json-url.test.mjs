process.env.SCRAPE_CLI_ONCE = '1';

import assert from 'node:assert/strict';
import test from 'node:test';

const { preferJsonSharedViewUrl } = await import('./airtableScraper.js');
const { default: pool } = await import('../db/pool.js');

test.after(async () => {
  await pool.end();
});

function buildUrl(objectParams) {
  const encoded = encodeURIComponent(JSON.stringify(objectParams));
  return `/v0.3/view/viwTEST123/readSharedViewData?stringifiedObjectParams=${encoded}&requestId=reqTEST`;
}

test('preferJsonSharedViewUrl forces allowMsgpackOfResult true → false', () => {
  const input = buildUrl({
    shouldUseNestedResponseFormat: true,
    allowMsgpackOfResult: true,
  });
  const out = preferJsonSharedViewUrl(input);

  assert.notEqual(out, input);
  const params = new URLSearchParams(out.slice(out.indexOf('?') + 1));
  const obj = JSON.parse(params.get('stringifiedObjectParams'));
  assert.equal(obj.allowMsgpackOfResult, false);
  assert.equal(obj.shouldUseNestedResponseFormat, true);
  assert.ok(out.startsWith('/v0.3/view/viwTEST123/readSharedViewData?'));
  assert.equal(params.get('requestId'), 'reqTEST');
});

test('preferJsonSharedViewUrl leaves URL without allowMsgpackOfResult unchanged', () => {
  const input = buildUrl({ shouldUseNestedResponseFormat: true });
  assert.equal(preferJsonSharedViewUrl(input), input);
});

test('preferJsonSharedViewUrl leaves URL with allowMsgpackOfResult false unchanged', () => {
  const input = buildUrl({
    shouldUseNestedResponseFormat: true,
    allowMsgpackOfResult: false,
  });
  assert.equal(preferJsonSharedViewUrl(input), input);
});
