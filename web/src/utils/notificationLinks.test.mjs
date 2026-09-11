import { alertBannerPreview } from './notificationLinks.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const redundant = alertBannerPreview({
  title: 'Alesha passed on Roofing Co',
  body: 'Alesha passed on Roofing Co',
  deal_name: 'Roofing Co',
  metadata: {}
});
assert(redundant === '', `hide repeated title: ${redundant}`);

const withNames = alertBannerPreview({
  title: 'Alesha passed on 2 deals',
  body: 'Roofing Co · HVAC Shop · Dental Practice',
  deal_name: 'Roofing Co',
  metadata: {
    stages: [{
      names: [
        'Roofing Co',
        'HVAC Shop',
        'Dental Practice'
      ],
      newStages: ['Passed On Deal', 'Passed On Deal', 'Passed On Deal']
    }]
  }
});
assert(withNames.includes('HVAC Shop'), `lists other deals: ${withNames}`);
assert(withNames.includes('Dental Practice'), `lists third deal: ${withNames}`);
assert(!/passed on 2 deals/i.test(withNames), `does not repeat title: ${withNames}`);
assert(!/→ Passed On Deal/.test(withNames), `same-stage preview skips stage arrows: ${withNames}`);

const singleNamed = alertBannerPreview({
  title: 'Alesha requested NDA on Maui Dental',
  body: '',
  deal_name: 'Maui Dental',
  metadata: {
    stages: [{
      names: ['Maui Dental'],
      newStages: ['Requested NDA']
    }]
  }
});
assert(singleNamed === '', `single deal already in title: ${singleNamed}`);


const customNow = alertBannerPreview({
  title: 'Alesha moved Premier Specialty Engineering & Drilling… to Waiting on seller P&Ls',
  body: '',
  deal_name: 'Premier Specialty Engineering & Drilling Company LLC',
  metadata: {
    stages: [{
      names: ['Premier Specialty Engineering & Drilling Company LLC'],
      newStages: ['Custom Status'],
      customLabels: ['Waiting on seller P&Ls']
    }]
  }
});
assert(customNow === 'Now: Waiting on seller P&Ls', `custom Now line: ${customNow}`);

console.log('alertBannerPreview tests passed');
