process.env.SCRAPE_CLI_ONCE = '1';

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { extractApiParams } = await import('./airtableScraper.js');
const { default: pool } = await import('../db/pool.js');

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

function loadFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), 'utf8');
}

test.after(async () => {
  await pool.end();
});

test('extractApiParams reads object-literal urlWithParams (pre-Nov 2026 shape)', () => {
  const html = loadFixture('airtable-share-old-urlWithParams.html');
  const { urlWithParams, appId, pageLoadId, matchedPattern } = extractApiParams(html);

  assert.match(urlWithParams, /^\/v0\.3\/view\/viwOLDSHAPE123\/readSharedViewData\?/);
  assert.equal(urlWithParams.includes('\\u002F'), false);
  assert.equal(appId, 'appEGxhjno0HTpEco');
  assert.equal(pageLoadId, 'pglOLDSHAPE123456');
  assert.ok(
    ['objectPropertyString', 'quotedObjectPropertyString', 'looseObjectPropertyString'].includes(
      matchedPattern
    ),
    `unexpected matchedPattern: ${matchedPattern}`
  );
});

test('extractApiParams reads var urlWithParams assignment (Nov 2026+ shape)', () => {
  const html = loadFixture('airtable-share-new-urlWithParams.html');
  const { urlWithParams, appId, pageLoadId, matchedPattern } = extractApiParams(html);

  assert.match(urlWithParams, /^\/v0\.3\/view\/viw4OORhKKWPUsWa4\/readSharedViewData\?/);
  assert.ok(urlWithParams.includes('requestId=reqNEW123'));
  assert.equal(urlWithParams.includes('\\u002F'), false);
  assert.equal(appId, 'appEGxhjno0HTpEco');
  assert.equal(pageLoadId, 'pglNEWSHAPE123456');
  assert.equal(matchedPattern, 'varAssignment');
});

test('extractApiParams error lists which patterns were tried', () => {
  assert.throws(
    () => extractApiParams('<html><body>no api params here</body></html>'),
    /Could not find urlWithParams in HTML \(tried: objectPropertyString, quotedObjectPropertyString, looseObjectPropertyString, varAssignment\)/
  );
});
