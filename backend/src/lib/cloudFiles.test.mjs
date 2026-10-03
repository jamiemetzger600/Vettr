import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCloudName, normalizeQaCategory, normalizeQaSource } from './cloudFiles.js';

test('folder names drop characters drives reject', () => {
  assert.equal(sanitizeCloudName('Royal Family / Construction'), 'Royal Family Construction');
  assert.equal(sanitizeCloudName('   '), 'Deal');
});

test('Q&A categories keep known labels and group names', () => {
  assert.equal(normalizeQaCategory('hr'), 'HR');
  assert.equal(normalizeQaCategory('', 'Financial & QoE'), 'Financial & QoE');
  assert.equal(normalizeQaSource('broker'), 'broker');
  assert.equal(normalizeQaSource('nope'), 'seller');
});
