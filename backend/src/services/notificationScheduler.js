import cron from 'node-cron';
import { processDueReminders } from './crmReminderService.js';
import {
  runMorningDigests,
  runInstantDealMatches,
  runTeamActivityFlush
} from './dailyDigestService.js';
import { runOffMarketSendTick, runOffMarketInboxSync } from './offMarketMailService.js';

const TZ = process.env.DIGEST_TZ || 'America/Los_Angeles';

cron.schedule('0 9 * * *', async () => {
  console.log('[scheduler] daily digest 9:00 AM', TZ);
  try {
    await runMorningDigests({ weeklyOnly: false });
  } catch (error) {
    console.error('[scheduler] daily digest error', error);
  }
}, { timezone: TZ });

cron.schedule('0 9 * * 1', async () => {
  console.log('[scheduler] weekly digest Monday 9:00 AM', TZ);
  try {
    await runMorningDigests({ weeklyOnly: true });
  } catch (error) {
    console.error('[scheduler] weekly digest error', error);
  }
}, { timezone: TZ });

cron.schedule('*/15 * * * *', async () => {
  console.log('[scheduler] instant deal-match check');
  try {
    await runInstantDealMatches();
  } catch (error) {
    console.error('[scheduler] instant deal match error', error);
  }
});

// Offset from :00 so it does not collide with the 9:00 AM digest.
cron.schedule('5,20,35,50 * * * *', async () => {
  console.log('[scheduler] team activity flush');
  try {
    await runTeamActivityFlush();
  } catch (error) {
    console.error('[scheduler] team activity flush error', error);
  }
});

cron.schedule('*/15 * * * *', async () => {
  try {
    await processDueReminders();
  } catch (error) {
    console.error('[scheduler] CRM reminder job error', error);
  }
});

cron.schedule('*/5 * * * *', async () => {
  try {
    const result = await runOffMarketSendTick();
    if (result.sent) console.log('[scheduler] off-market send-tick', result);
  } catch (error) {
    console.error('[scheduler] off-market send-tick error', error);
  }
});

cron.schedule('*/10 * * * *', async () => {
  try {
    const result = await runOffMarketInboxSync();
    if (result.synced) console.log('[scheduler] off-market inbox sync', result);
  } catch (error) {
    console.error('[scheduler] off-market inbox sync error', error);
  }
});

console.log('[scheduler] initialized');
console.log(`   - Daily email/push summary: 9:00 AM ${TZ}`);
console.log(`   - Weekly (weekly-frequency users): Monday 9:00 AM ${TZ}`);
console.log('   - Instant matches + team activity: every 15 minutes');
console.log('   - CRM task reminders: every 15 minutes');
console.log('   - Off Market send-tick: every 5 minutes');
console.log('   - Off Market inbox sync: every 10 minutes');
