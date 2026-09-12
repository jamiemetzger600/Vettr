import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getOffMarketStatus,
  getCampaigns,
  postCampaign,
  getCampaign,
  patchCampaign,
  getSequence,
  putSequence,
  getProspects,
  postProspects,
  patchProspectRow,
  postResearch,
  postEnqueue,
  postSendTick,
  getStats,
  postSync,
  postPromote,
  getLlm,
  putLlm,
  deleteLlm,
  postLlmTest,
  postRotateIngest,
  postIngest
} from '../controllers/offMarketController.js';

const router = express.Router();

router.post('/ingest/:token', postIngest);

router.use(authMiddleware);

router.get('/status', getOffMarketStatus);
router.get('/llm-connection', getLlm);
router.put('/llm-connection', putLlm);
router.delete('/llm-connection', deleteLlm);
router.post('/llm-connection/test', postLlmTest);
router.post('/llm-connection/ingest-token', postRotateIngest);

router.get('/campaigns', getCampaigns);
router.post('/campaigns', postCampaign);
router.get('/campaigns/:id', getCampaign);
router.patch('/campaigns/:id', patchCampaign);
router.get('/campaigns/:id/sequence', getSequence);
router.put('/campaigns/:id/sequence', putSequence);
router.get('/campaigns/:id/prospects', getProspects);
router.post('/campaigns/:id/prospects', postProspects);
router.post('/campaigns/:id/research', postResearch);
router.post('/campaigns/:id/enqueue', postEnqueue);
router.post('/campaigns/:id/send-tick', postSendTick);
router.get('/campaigns/:id/stats', getStats);

router.patch('/prospects/:prospectId', patchProspectRow);
router.post('/prospects/:prospectId/promote', postPromote);
router.post('/sync', postSync);

export default router;
