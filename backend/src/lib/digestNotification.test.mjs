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

const moved = buildDigestNotification({
  grouped: { groups: [], total: 0 },
  team: {
    headlines: ['Alesha moved Maui Dental to Requested NDA'],
    added: [],
    mentions: [],
    stages: [{
      label: 'Alesha',
      count: 1,
      names: ['Maui Dental'],
      ids: [77],
      newStages: ['Requested NDA']
    }]
  },
  crmItems: []
});
assert(moved.alertType === 'team_activity', `moved type: ${moved.alertType}`);
assert(Number(moved.savedDealId) === 77, `moved savedDealId: ${moved.savedDealId}`);
assert(moved.url.includes('crmDeal=77'), `moved url: ${moved.url}`);
assert(moved.actionTitle === 'Open deal', `moved action: ${moved.actionTitle}`);
assert(/Maui Dental/.test(moved.title), `moved title names the deal: ${moved.title}`);
assert(/requested NDA/i.test(moved.title), `moved title names the action: ${moved.title}`);
assert(!/moved .* in the pipeline/i.test(moved.title), `no generic pipeline copy: ${moved.title}`);

const overdueWithMatches = buildDigestNotification({
  grouped,
  team: {},
  crmItems: [
    { kind: 'overdue', title: 'Call broker', dealName: 'HVAC Shop', savedDealId: 9 }
  ]
});
assert(overdueWithMatches.alertType === 'task_due', `overdue wins push: ${overdueWithMatches.alertType}`);
assert(Array.isArray(overdueWithMatches.dealDbIds) && overdueWithMatches.dealDbIds.length === 2, `match ids still attached: ${overdueWithMatches.dealDbIds}`);

const passed = buildDigestNotification({
  grouped: { groups: [], total: 0 },
  team: {
    headlines: ['Alesha passed on 2 deals'],
    added: [],
    mentions: [],
    stages: [{
      label: 'Alesha',
      count: 2,
      names: ['Roofing Co', 'Kayak Tours'],
      ids: [11, 12],
      newStages: ['Passed On Deal', 'Passed On Deal']
    }]
  },
  crmItems: []
});
assert(/passed on 2 deals/i.test(passed.title), `passed title: ${passed.title}`);
assert(/Roofing Co/.test(passed.body) && /Kayak Tours/.test(passed.body), `passed body lists deals: ${passed.body}`);
assert(!/pipeline/i.test(passed.title), `passed title skips pipeline jargon: ${passed.title}`);

console.log('digestNotification tests passed');
