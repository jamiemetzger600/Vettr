import { crmAPI, dealsAPI } from './api';

export const IOI_STAGE = 'Send IOI';

/**
 * Persist IOI notes and advance pipeline via the CRM stage endpoint
 * so kanban, aggregator, and workspace stay in sync.
 */
export async function recordIoiSent(savedDealId, { ioiText = '', existingNotes } = {}) {
  if (savedDealId == null) {
    throw new Error('recordIoiSent: missing savedDealId');
  }

  let notes = existingNotes;
  if (notes == null) {
    try {
      const data = await dealsAPI.getDeal(savedDealId);
      notes = data?.deal?.notes || data?.notes || '';
    } catch (err) {
      console.warn('[recordIoiSent] fetch notes failed', err.message);
      notes = '';
    }
  }

  const dateLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const separator = `\n\n--- IOI Sent ${dateLabel} ---\n`;
  const updatedNotes = (notes ? notes + separator : `--- IOI Sent ${dateLabel} ---\n`) + (ioiText || '');

  await dealsAPI.updateDeal(savedDealId, { notes: updatedNotes });
  const result = await crmAPI.updateStage(savedDealId, IOI_STAGE);
  console.log('[recordIoiSent] stage synced', {
    savedDealId,
    stage: IOI_STAGE,
    unchanged: Boolean(result?.unchanged)
  });
  return {
    notes: updatedNotes,
    result,
    progressHistory: result?.progressHistory || null
  };
}
