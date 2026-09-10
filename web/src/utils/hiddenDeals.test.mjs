import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  hiddenDealIdToDbId,
  marketDealHiddenToken,
  listingHiddenFingerprint,
  listingHiddenUrlToken,
  isDealHidden,
  parseHiddenExclude,
  excludeHiddenMarketDeals,
  hiddenStorageTokensForDeal,
  hiddenListingCount
} from './hiddenDeals.js';

describe('hiddenDealIdToDbId', () => {
  it('maps md tokens, numbers, and numeric strings', () => {
    assert.equal(hiddenDealIdToDbId('md:10429396'), 10429396);
    assert.equal(hiddenDealIdToDbId(10429396), 10429396);
    assert.equal(hiddenDealIdToDbId('10429396'), 10429396);
    assert.equal(hiddenDealIdToDbId('bizbuysell_99'), null);
    assert.equal(hiddenDealIdToDbId('fp:1|2|3|austin|tx'), null);
  });
});

describe('isDealHidden', () => {
  const deal = {
    id: 'airtable_bizbuysell_abc',
    dbId: 10429396,
    askingPrice: 450000,
    ebitda: 120000,
    revenue: 800000,
    city: 'Austin',
    state: 'TX',
    url: 'https://www.bizbuysell.com/listing/123#frag'
  };

  it('matches md token and numeric db id', () => {
    assert.equal(isDealHidden(deal, ['md:10429396']), true);
    assert.equal(isDealHidden(deal, [10429396]), true);
    assert.equal(isDealHidden(deal, ['10429396']), true);
    assert.equal(isDealHidden(deal, ['md:1']), false);
  });

  it('matches fingerprint and listing url after the db row is gone', () => {
    const fp = listingHiddenFingerprint(deal);
    const url = listingHiddenUrlToken(deal.url);
    assert.equal(fp, 'fp:450000|120000|800000|austin|tx');
    assert.equal(url, 'url:https://www.bizbuysell.com/listing/123');
    const ghost = { ...deal, dbId: 999, id: 'other_source_1' };
    assert.equal(isDealHidden(ghost, [fp]), true);
    assert.equal(isDealHidden(ghost, [url]), true);
  });
});

describe('hiddenStorageTokensForDeal', () => {
  it('stores md, fingerprint, and url', () => {
    const tokens = hiddenStorageTokensForDeal({
      id: 'src_1',
      dbId: 10,
      askingPrice: 100,
      ebitda: 20,
      revenue: 200,
      city: 'Denver',
      state: 'CO',
      url: 'https://example.com/a'
    });
    assert.equal(tokens.has('md:10'), true);
    assert.equal(tokens.has('fp:100|20|200|denver|co'), true);
    assert.equal(tokens.has('fs:100|20|200|co'), true);
    assert.equal(tokens.has('url:https://example.com/a'), true);
    assert.equal(marketDealHiddenToken(10), 'md:10');
  });
});

describe('parseHiddenExclude / excludeHiddenMarketDeals', () => {
  it('splits tokens for server exclude', () => {
    const parsed = parseHiddenExclude(['md:5', 'fp:1|2|3|a|b', 'url:https://x.com']);
    assert.deepEqual(parsed, {
      dbIds: [5],
      fingerprints: ['1|2|3|a|b'],
      financeStates: [],
      urls: ['https://x.com']
    });
  });

  it('counts unique listings not raw tokens', () => {
    assert.equal(hiddenListingCount(['md:1', 'fp:1|2|3|a|b', 'url:https://x.com', 'src_1']), 2);
    assert.equal(hiddenListingCount(['md:1', 'md:2']), 2);
  });

  it('drops hidden deals from a digest batch', () => {
    const deals = [
      { id: 11, name: 'Keep' },
      { id: 22, name: 'Hidden', dbId: 22 }
    ];
    const next = excludeHiddenMarketDeals(deals, ['md:22']);
    assert.deepEqual(next.map((d) => d.id), [11]);
  });
});
