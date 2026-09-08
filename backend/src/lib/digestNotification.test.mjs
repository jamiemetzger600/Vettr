import { buildDigestNotification } from './digestNotification.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const grouped = {
  total: 2,
  groups: [{
    name: 'Hawaii',
    deals: [
      { id: 11, name: 'Island HVAC', location: 'Honolulu, HI' },
      { id: 22, name: 'Maui Dental', location: 'Kahului, HI' }
    ],
    nearDeals: [],
    dealIds: [11, 22]
  }]
};

const push = buildDigestNotification({ grouped, team: {}, crmItems: [] });
assert(push.alertType === 'deal_match', `type: ${push.alertType}`);
assert(push.url.includes('tab=aggregator'), `url tab: ${push.url}`);
assert(push.url.includes('matchIds='), `url matchIds: ${push.url}`);
assert(push.url.includes('11') && push.url.includes('22'), `both ids in url: ${push.url}`);
assert(Array.isArray(push.dealDbIds) && push.dealDbIds.join(',') === '11,22', `dealDbIds ${push.dealDbIds}`);

console.log('digestNotification tests passed');
