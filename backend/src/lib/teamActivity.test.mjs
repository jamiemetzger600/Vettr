import {
  addedActivityHeadline,
  primaryTeamSavedDealId,
  savedDealIdForTeamAlert,
  stageActivityHeadline
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
  { title: 'Alesha moved 1 deal in the pipeline' },
  { added: [{ count: 1, ids: [1] }], stages: [{ count: 1, ids: [42] }] }
) === 42, 'moved toast prefers the stage deal');

assert(
  stageActivityHeadline({
    label: 'Alesha',
    count: 1,
    names: ['Maui Dental'],
    newStages: ['Requested NDA']
  }) === 'Alesha moved Maui Dental to Requested NDA',
  'named stage headline'
);

assert(
  addedActivityHeadline({ label: 'Alesha', count: 1, names: ['Maui Dental'] })
    === 'Alesha added Maui Dental',
  'named add headline'
);

console.log('teamActivity tests passed');
