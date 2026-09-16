import pool from '../db/pool.js';
import { remountHiddenDealIdsForSourceIdDuplicates } from './marketDealsDedupe.js';

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const n = await remountHiddenDealIdsForSourceIdDuplicates(client, 'airtable_bizbuysell');
  if (typeof n !== 'number') throw new Error(`expected rowCount number, got ${n}`);
  await client.query('ROLLBACK');
  console.log('marketDealsDedupe remount SQL ok', { remounted: n });
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('marketDealsDedupe remount SQL failed:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
