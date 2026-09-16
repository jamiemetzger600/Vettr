import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, parseLocation, parseYearEstablished, parseIndustries, normalizeListing, sourceIdFromUrl } from './normalize.js';
import { validateListing } from './validate.js';

test('parseMoney handles common listing formats', () => {
  assert.equal(parseMoney('$1,200,000'), 1200000);
  assert.equal(parseMoney('$1.2M'), 1200000);
  assert.equal(parseMoney('450K'), 450000);
  assert.equal(parseMoney('Asking Price: $16,500,000'), 16500000);
  assert.equal(parseMoney('$1M - $2M'), 1000000);
  assert.equal(parseMoney('Not Disclosed'), null);
  assert.equal(parseMoney('N/A'), null);
  assert.equal(parseMoney('12%'), null);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney(250000), 250000);
});

test('parseLocation splits city/state variants', () => {
  assert.deepEqual(parseLocation('Austin, TX'), { city: 'Austin', county: null, state: 'TX', country: 'USA' });
  assert.deepEqual(parseLocation('Austin, Texas'), { city: 'Austin', county: null, state: 'TX', country: 'USA' });
  assert.deepEqual(parseLocation('Texas'), { city: null, county: null, state: 'TX', country: 'USA' });
  assert.deepEqual(parseLocation('Travis County, TX'), { city: null, county: 'Travis', state: 'TX', country: 'USA' });
  assert.deepEqual(parseLocation('Dallas, TX, USA'), { city: 'Dallas', county: null, state: 'TX', country: 'USA' });
  assert.equal(parseLocation('Undisclosed').state, null);
});

test('parseYearEstablished + industries', () => {
  assert.equal(parseYearEstablished('Est. 1998'), 1998);
  assert.equal(parseYearEstablished('25 years in business'), new Date().getFullYear() - 25);
  assert.deepEqual(parseIndustries('Manufacturing, Industrial | Wholesale'), ['Manufacturing', 'Industrial', 'Wholesale']);
});

test('sourceIdFromUrl is stable and host-scoped', () => {
  assert.equal(sourceIdFromUrl('https://vrsanantonio.com/listing/582-established-engineering-firm/'), 'vrsanantonio.com/listing/582-established-engineering-firm');
  assert.equal(sourceIdFromUrl('https://www.example.com/biz?id=123'), 'example.com/biz?id=123');
});

test('normalizeListing + validateListing on a VR-style extraction', () => {
  const extracted = {
    name: { value: '582 – Established Engineering firm' },
    asking_price: { value: '$16,500,000' },
    annual_profit: { value: '$2,952,399' },
    annual_revenue: { value: '$5,145,806' },
    location: { value: 'Texas' },
  };
  const row = normalizeListing(extracted, 'https://vrsanantonio.com/listing/582-established-engineering-firm/', 'vr_business_brokers');
  assert.equal(row.source, 'vr_business_brokers');
  assert.equal(row.asking_price, 16500000);
  assert.equal(row.annual_profit, 2952399);
  assert.equal(row.state, 'TX');
  assert.equal(row.country, 'USA');
  assert.equal(row.profit_multiple, 5.59);
  assert.ok(row.content_hash?.length === 16);
  const v = validateListing(row);
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test('validateListing rejects empty and generic rows', () => {
  const row = normalizeListing({ name: { value: 'Businesses for Sale' } }, 'https://x.com/listings/', 'x');
  const v = validateListing(row);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.code === 'anyOf'));
  assert.ok(v.errors.some((e) => e.code === 'generic_name'));
});
