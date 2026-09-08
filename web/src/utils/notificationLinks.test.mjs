import { alertBannerPreview } from './notificationLinks.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const redundant = alertBannerPreview({
  title: 'alesha moved 3 deals in the pipeline',
  body: 'alesha moved 3 deals in the pipeline',
  deal_name: 'Profitable And Unique Flooring Company In Sacramento For Sale',
  metadata: {}
});
assert(redundant === '', `hide repeated title: ${redundant}`);

const withNames = alertBannerPreview({
  title: 'alesha moved 3 deals in the pipeline',
  body: 'alesha moved 3 deals in the pipeline',
  deal_name: 'Profitable And Unique Flooring Company In Sacramento For Sale',
  metadata: {
    stages: [{
      names: [
        'Profitable And Unique Flooring Company In Sacramento For Sale',
        'HVAC Shop',
        'Dental Practice'
      ],
      newStages: ['Requested NDA', 'Review CIM', 'LOI Sent']
    }]
  }
});
assert(withNames.includes('HVAC Shop'), `lists other deals: ${withNames}`);
assert(withNames.includes('Requested NDA'), `includes stages: ${withNames}`);
assert(!/^alesha moved 3 deals/i.test(withNames), `does not repeat title: ${withNames}`);

console.log('alertBannerPreview tests passed');
