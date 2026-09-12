import {
  listCampaigns,
  createCampaign,
  updateCampaign,
  requireCampaign,
  getCampaignSequence,
  updateCampaignSequence,
  listProspects,
  addProspects,
  importProspectsCsv,
  patchProspect,
  campaignStats,
  activeCampaignCount
} from '../services/offMarketService.js';
import {
  getLlmConnection,
  upsertLlmConnection,
  rotateIngestToken,
  deleteLlmConnection,
  testLlmConnection,
  researchCampaign,
  ingestByToken
} from '../services/offMarketLlmService.js';
import { enqueueCampaign, sendTick, syncUserInbox } from '../services/offMarketMailService.js';
import { promoteProspect } from '../services/offMarketPromoteService.js';
import {
  getGoogleConnection,
  connectionHasGmailSend,
  connectionHasGmailReadonly
} from '../services/googleCalendarService.js';

function handleError(res, error, label) {
  if (error.status) {
    return res.status(error.status).json({ error: error.message, code: error.code || undefined });
  }
  console.error(`[off-market] ${label}`, error);
  return res.status(500).json({ error: 'Server error' });
}

export const getOffMarketStatus = async (req, res) => {
  try {
    const connection = await getGoogleConnection(req.user.userId);
    let llm = { connected: false, provider: null, hasKey: false };
    try {
      llm = await getLlmConnection(req.user.userId);
    } catch (llmErr) {
      console.warn('[off-market] llm status skipped', llmErr.message);
    }
    const campaignCount = await activeCampaignCount(req.user.userId);
    res.json({
      campaignCount,
      gmail: connectionHasGmailSend(connection),
      gmailReadonly: connectionHasGmailReadonly(connection),
      googleEmail: connection?.google_email || null,
      llm
    });
  } catch (error) {
    handleError(res, error, 'status');
  }
};

export const getCampaigns = async (req, res) => {
  try {
    const campaigns = await listCampaigns(req.user.userId);
    res.json({ campaigns });
  } catch (error) {
    handleError(res, error, 'list campaigns');
  }
};

export const postCampaign = async (req, res) => {
  try {
    const campaign = await createCampaign(req.user.userId, req.body || {});
    res.status(201).json({ campaign });
  } catch (error) {
    handleError(res, error, 'create campaign');
  }
};

export const getCampaign = async (req, res) => {
  try {
    const campaign = await requireCampaign(req.user.userId, Number(req.params.id));
    const stats = await campaignStats(req.user.userId, campaign.id);
    res.json({ campaign, stats });
  } catch (error) {
    handleError(res, error, 'get campaign');
  }
};

export const patchCampaign = async (req, res) => {
  try {
    const campaign = await updateCampaign(req.user.userId, Number(req.params.id), req.body || {});
    res.json({ campaign });
  } catch (error) {
    handleError(res, error, 'patch campaign');
  }
};

export const getSequence = async (req, res) => {
  try {
    const sequence = await getCampaignSequence(req.user.userId, Number(req.params.id));
    res.json({ sequence });
  } catch (error) {
    handleError(res, error, 'get sequence');
  }
};

export const putSequence = async (req, res) => {
  try {
    const sequence = await updateCampaignSequence(req.user.userId, Number(req.params.id), req.body?.steps);
    res.json({ sequence });
  } catch (error) {
    handleError(res, error, 'put sequence');
  }
};

export const getProspects = async (req, res) => {
  try {
    const prospects = await listProspects(req.user.userId, Number(req.params.id), { status: req.query.status });
    res.json({ prospects });
  } catch (error) {
    handleError(res, error, 'list prospects');
  }
};

export const postProspects = async (req, res) => {
  try {
    const campaignId = Number(req.params.id);
    if (req.body?.csv) {
      const result = await importProspectsCsv(req.user.userId, campaignId, req.body.csv);
      return res.status(201).json(result);
    }
    const rows = Array.isArray(req.body?.prospects) ? req.body.prospects : [req.body];
    const result = await addProspects(req.user.userId, campaignId, rows);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'add prospects');
  }
};

export const patchProspectRow = async (req, res) => {
  try {
    const prospect = await patchProspect(req.user.userId, Number(req.params.prospectId), req.body || {});
    res.json({ prospect });
  } catch (error) {
    handleError(res, error, 'patch prospect');
  }
};

export const postResearch = async (req, res) => {
  try {
    const result = await researchCampaign(req.user.userId, Number(req.params.id), {
      extraBrief: req.body?.brief
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'research');
  }
};

export const postEnqueue = async (req, res) => {
  try {
    const result = await enqueueCampaign(req.user.userId, Number(req.params.id), {
      stepIndex: Number(req.body?.stepIndex) || 0
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'enqueue');
  }
};

export const postSendTick = async (req, res) => {
  try {
    const result = await sendTick(req.user.userId, Number(req.params.id), {
      limit: Number(req.body?.limit) || 5
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'send-tick');
  }
};

export const getStats = async (req, res) => {
  try {
    const stats = await campaignStats(req.user.userId, Number(req.params.id));
    res.json({ stats });
  } catch (error) {
    handleError(res, error, 'stats');
  }
};

export const postSync = async (req, res) => {
  try {
    const result = await syncUserInbox(req.user.userId);
    res.json(result);
  } catch (error) {
    handleError(res, error, 'sync');
  }
};

export const postPromote = async (req, res) => {
  try {
    const result = await promoteProspect(req.user.userId, Number(req.params.prospectId), {
      teamId: req.body?.teamId
    });
    res.json(result);
  } catch (error) {
    handleError(res, error, 'promote');
  }
};

export const getLlm = async (req, res) => {
  try {
    res.json(await getLlmConnection(req.user.userId));
  } catch (error) {
    handleError(res, error, 'get llm');
  }
};

export const putLlm = async (req, res) => {
  try {
    res.json(await upsertLlmConnection(req.user.userId, req.body || {}));
  } catch (error) {
    handleError(res, error, 'put llm');
  }
};

export const deleteLlm = async (req, res) => {
  try {
    res.json(await deleteLlmConnection(req.user.userId));
  } catch (error) {
    handleError(res, error, 'delete llm');
  }
};

export const postLlmTest = async (req, res) => {
  try {
    res.json(await testLlmConnection(req.user.userId));
  } catch (error) {
    handleError(res, error, 'llm test');
  }
};

export const postRotateIngest = async (req, res) => {
  try {
    res.json(await rotateIngestToken(req.user.userId));
  } catch (error) {
    handleError(res, error, 'rotate ingest');
  }
};

export const postIngest = async (req, res) => {
  try {
    const result = await ingestByToken(req.params.token, req.body || {});
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error, 'ingest');
  }
};
