import {
  classifyBuyBoxMatch,
  dealMatchesBuyBox,
  dealPassesSlotFeed,
  isAbsenteeRemoteDeal
} from '../src/lib/buyBoxMatcher.js';
import { groupDealsByBuyBox } from '../src/services/dealMatchDigestService.js';

const box = {
  maxPrice: 1_000_000,
  minEbitda: 200_000,
  includeNearMatchesPercent: 10,
  includeAbsenteeRemoteNearMatches: false
};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const exact = classifyBuyBoxMatch(
  { askingPrice: 900_000, ebitda: 250_000 },
  box
);
assert(exact.kind === 'exact', `expected exact, got ${exact.kind}`);

const numericNear = classifyBuyBoxMatch(
  { askingPrice: 1_080_000, ebitda: 250_000 },
  box
);
assert(numericNear.kind === 'near', `expected near, got ${numericNear.kind}`);

const tooFar = classifyBuyBoxMatch(
  { askingPrice: 1_150_000, ebitda: 250_000 },
  box
);
assert(tooFar.kind === 'none', `expected none for 15% over at 10% flex, got ${tooFar.kind}`);

const remoteTooFar = classifyBuyBoxMatch(
  { askingPrice: 1_150_000, ebitda: 250_000, remote: 'Yes' },
  { ...box, includeAbsenteeRemoteNearMatches: true }
);
assert(remoteTooFar.kind === 'near', `expected remote 15% to be near, got ${remoteTooFar.kind}`);
assert(
  remoteTooFar.reasons.some((r) => r.type === 'absentee_remote'),
  'expected absentee/remote reason'
);

const remoteWayOut = classifyBuyBoxMatch(
  { askingPrice: 1_300_000, ebitda: 250_000, remote: 'Absentee' },
  { ...box, includeNearMatchesPercent: 0, includeAbsenteeRemoteNearMatches: true }
);
assert(remoteWayOut.kind === 'none', `expected 30% over remote to be none, got ${remoteWayOut.kind}`);

const remoteOff = classifyBuyBoxMatch(
  { askingPrice: 1_150_000, ebitda: 250_000, remote: 'Yes' },
  box
);
assert(remoteOff.kind === 'none', 'remote should not qualify when checkbox is off and over flex');

assert(isAbsenteeRemoteDeal({ remote: 'Relocatable' }) === true, 'relocatable should count');
assert(isAbsenteeRemoteDeal({ remote: 'No' }) === false, 'No should not count');

const grouped = groupDealsByBuyBox(
  [
    { id: 1, name: 'Exact Co', askingPrice: 900_000, ebitda: 250_000 },
    { id: 2, name: 'Near Co', askingPrice: 1_080_000, ebitda: 250_000 },
    { id: 3, name: 'Remote Co', askingPrice: 1_150_000, ebitda: 250_000, remote: 'Yes' }
  ],
  [{
    name: '1M Max',
    maxPrice: 1_000_000,
    includeNearMatchesPercent: 10,
    includeAbsenteeRemoteNearMatches: true
  }]
);
assert(grouped.total === 3, `expected 3 grouped, got ${grouped.total}`);
assert(grouped.groups[0].deals.length === 1, 'expected 1 exact');
assert(grouped.groups[0].nearDeals.length === 2, 'expected 2 near');

assert(dealMatchesBuyBox({ state: 'CA' }, { targetStates: ['CA'] }) === true, 'CA should match CA');

const profitBox = { profitMultiple: 3, includeNearMatchesPercent: 0 };
assert(
  dealMatchesBuyBox({ askingPrice: 900_000, ebitda: 400_000 }, profitBox) === true,
  '2.25x reported profit should pass a 3.0x cap'
);
assert(
  dealMatchesBuyBox({ askingPrice: 1_000_000, ebitda: 250_000 }, profitBox) === false,
  '4.0x reported profit should fail a 3.0x cap'
);
assert(
  dealMatchesBuyBox({ askingPrice: 1_000_000, ebitda: null }, profitBox) === true,
  'listing with no reported EBITDA or SDE should stay in the feed'
);
assert(
  dealMatchesBuyBox({ askingPrice: 1_000_000, profitMultiple: 2.5 }, profitBox) === true,
  'stored profit multiple should be used when profit dollars are missing'
);
const profitNear = classifyBuyBoxMatch(
  { askingPrice: 960_000, ebitda: 300_000 },
  { profitMultiple: 3, includeNearMatchesPercent: 10 }
);
assert(profitNear.kind === 'near', `3.2x vs 3.0x at 10% flex should be near, got ${profitNear.kind}`);
assert(
  profitNear.reasons.some((r) => r.field === 'profit multiple'),
  'near reason should name profit multiple'
);
assert(dealMatchesBuyBox({ state: 'Ontario Canada' }, { targetStates: ['CA'] }) === false, 'Canada must not match CA');
assert(dealPassesSlotFeed(
  { name: 'Full Service Car Wash', state: 'NV', description: 'tunnel, smog station' },
  { feedSearch: 'smog' }
) === true, 'smog in the description should count');
assert(dealPassesSlotFeed(
  { name: 'Full Service Car Wash', state: 'NV', description: 'detail area' },
  { feedSearch: 'CA, smog' }
) === false, 'car must not satisfy the CA keyword');

const smogBox = groupDealsByBuyBox(
  [
    { id: 10, name: 'Vegas car wash', state: 'NV', description: 'detail only', askingPrice: 200_000, ebitda: 80_000 },
    { id: 11, name: 'STAR Smog Check', state: 'CA', description: '', askingPrice: 200_000, ebitda: 80_000 },
    { id: 12, name: 'Smog shop', state: 'Ontario Canada', askingPrice: 200_000, ebitda: 80_000 },
    { id: 13, name: 'Franchise smog', state: 'CA', description: 'smog', askingPrice: 200_000, ebitda: 80_000 }
  ],
  [{
    name: 'SMOG',
    targetStates: ['CA'],
    feedSearch: 'smog',
    excludeKeywords: ['franchise']
  }]
);
assert(smogBox.total === 1, `expected only the CA smog shop, got ${smogBox.total}`);
assert(smogBox.groups[0].dealIds.length === 1 && smogBox.groups[0].dealIds[0] === 11, 'expected deal 11');

console.log('[test-buybox-classify] ok');
