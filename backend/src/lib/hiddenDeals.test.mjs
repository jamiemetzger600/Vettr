import { excludeHiddenMarketDeals } from './hiddenDeals.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const deals = [
  { id: 11, name: 'Keep', url: 'https://example.com/keep' },
  { id: 22, name: 'Hidden', dbId: 22, url: 'https://example.com/gone' }
];
const visible = excludeHiddenMarketDeals(deals, ['md:22']);
assert(visible.length === 1 && visible[0].id === 11, `hidden pk filtered: ${visible.map((d) => d.id)}`);

const byUrl = excludeHiddenMarketDeals(deals, ['url:https://example.com/gone']);
assert(byUrl.length === 1 && byUrl[0].id === 11, 'hidden url filtered');

console.log('hiddenDeals digest filter ok');
