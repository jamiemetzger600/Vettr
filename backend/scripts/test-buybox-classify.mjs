import {
  classifyBuyBoxMatch,
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

console.log('[test-buybox-classify] ok');
