import {
  addedActivityHeadline,
  primaryTeamSavedDealId,
  savedDealIdForTeamAlert,
  stageActivityHeadline,
  teamActivityAlertItems,
  teamActivityDetailLine
} from './teamActivity.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(primaryTeamSavedDealId({
  stages: [{ count: 1, ids: [42], names: ['Island HVAC'] }]
}) === 42, 'stage move uses that deal id');

assert(primaryTeamSavedDealId({
  added: [{ count: 2, ids: [1, 2] }],
  stages: [{ count: 1, ids: [99] }]
}) === 99, 'single stage move beats many adds');

assert(primaryTeamSavedDealId({
  added: [{ count: 1, ids: [7] }],
  stages: [{ count: 3, ids: [8, 9, 10] }]
}) === 7, 'single add beats many stage moves');

assert(primaryTeamSavedDealId({
  stages: [{ count: 3, ids: [8, 9, 10] }]
}) === 8, 'many moves still open the most recent deal');

assert(savedDealIdForTeamAlert(
  { title: 'Alesha passed on 2 deals' },
  { added: [{ count: 1, ids: [1] }], stages: [{ count: 2, ids: [42, 43] }] }
) === 42, 'passed-on toast prefers the stage deal');

assert(
  stageActivityHeadline({
    label: 'Alesha',
    count: 1,
    names: ['Maui Dental'],
    newStages: ['Requested NDA']
  }) === 'Alesha requested NDA on Maui Dental',
  'named NDA headline'
);

assert(
  stageActivityHeadline({
    label: 'Alesha',
    count: 2,
    names: ['Roofing Co', 'Kayak Tours'],
    newStages: ['Passed On Deal', 'Passed On Deal']
  }) === 'Alesha passed on 2 deals',
  'passed-on count headline'
);

assert(
  addedActivityHeadline({ label: 'Alesha', count: 1, names: ['Maui Dental'] })
    === 'Alesha added Maui Dental',
  'named add headline'
);

assert(
  teamActivityDetailLine({
    headlines: ['Alesha passed on 2 deals'],
    stages: [{
      count: 2,
      names: ['Roofing Co', 'Kayak Tours'],
      newStages: ['Passed On Deal', 'Passed On Deal']
    }]
  }, { title: 'Alesha passed on 2 deals' })
    === 'Roofing Co · Kayak Tours',
  'same-stage detail lists deal names only'
);

assert(
  teamActivityDetailLine({
    headlines: ['Alesha moved 3 deals to Review CIM']
  }, { title: 'Alesha moved 3 deals to Review CIM' }) === '',
  'no redundant detail when names are missing'
);

const items = teamActivityAlertItems({
  added: [],
  stages: [
    {
      label: 'Alesha',
      count: 2,
      names: ['Roofing Co', 'Kayak Tours'],
      ids: [11, 12],
      newStages: ['Passed On Deal', 'Passed On Deal']
    },
    {
      label: 'Alesha',
      count: 1,
      names: ['Maui Dental'],
      ids: [77],
      newStages: ['Requested NDA']
    }
  ],
  mentions: [{ saved_deal_id: 99 }]
});
assert(items.length === 2, `one alert per action, not mentions: ${items.length}`);
assert(items[0].title === 'Alesha passed on 2 deals', items[0].title);
assert(items[0].body === 'Roofing Co · Kayak Tours', items[0].body);
assert(items[1].title === 'Alesha requested NDA on Maui Dental', items[1].title);
assert(items[1].savedDealId === 77, String(items[1].savedDealId));

console.log('teamActivity tests passed');
