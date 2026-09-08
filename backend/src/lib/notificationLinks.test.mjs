import { notificationPath, parseMatchDealIds } from './notificationLinks.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(parseMatchDealIds('10, 10, abc, 22').join(',') === '10,22', 'parse unique numeric ids');
assert(parseMatchDealIds([3, '3', 4]).join(',') === '3,4', 'parse array ids');

const many = notificationPath({
  alertType: 'deal_match',
  dealDbIds: [101, 202, 303],
  newToday: true
});
assert(many.includes('tab=aggregator'), `aggregator tab: ${many}`);
assert(many.includes('matchIds=101%2C202%2C303') || many.includes('matchIds=101,202,303'), `matchIds: ${many}`);
assert(!many.includes('newToday=1'), `ids skip calendar-day filter: ${many}`);
assert(!many.includes('dealDbId='), `do not auto-open one of many: ${many}`);

const one = notificationPath({
  alertType: 'deal_match',
  dealDbId: 55,
  dealDbIds: [55]
});
assert(one.includes('matchIds=55'), `single matchIds: ${one}`);
assert(one.includes('dealDbId=55'), `open the one match: ${one}`);

const legacy = notificationPath({ alertType: 'deal_match', newToday: true });
assert(legacy.includes('tab=aggregator') && legacy.includes('newToday=1'), `legacy new today: ${legacy}`);
assert(!legacy.includes('matchIds='), `legacy has no matchIds: ${legacy}`);

const tasks = notificationPath({
  alertType: 'task_due',
  savedDealId: 99
});
assert(tasks.includes('tab=crm') && tasks.includes('crmSubview=tasks'), `tasks list: ${tasks}`);
assert(!tasks.includes('crmDeal='), `tasks toast does not open a deal: ${tasks}`);

console.log('notificationLinks tests passed');
