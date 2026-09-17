import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  getCrmToday,
  getCrmKanban,
  getCrmAnalytics,
  getCalendarStatus,
  getCalendarOAuthConfig,
  getCalendarOAuthUrl,
  googleCalendarOAuthCallback,
  deleteCalendarConnection,
  postGmailSend,
  getCalendarEvents,
  postCalendarEvent,
  patchCalendarEvent,
  removeCalendarEvent,
  postCalendarSync,
  getDealActivities,
  addDealActivity,
  refreshDealFromListing,
  patchDealStage,
  getDealTasks,
  postDealTask,
  postQuickFollowUp,
  postCompleteNudge,
  patchTask,
  getDealDocuments,
  postDealDocument,
  getCrmSearch
} from '../controllers/crmController.js';
import {
  listCrmContacts,
  postCrmContact,
  patchCrmContact,
  removeCrmContact,
  listCrmCompanies,
  postCrmCompany,
  patchCrmCompany,
  getDealContactList,
  postDealContactLink,
  deleteDealContactLink,
  postCsvImport,
  getCrmViews,
  postCrmView,
  patchCrmView,
  removeCrmView,
  getTaskComments,
  postTaskComment,
  postQuickAddTask,
  patchDealNote,
  postDealNoteRich,
  getCrmTasksFiltered
} from '../controllers/crmOrganizeController.js';
import {
  getThread,
  postThreadMessage,
  postReaction,
  patchResolve,
  getThreadMembers
} from '../controllers/dealThreadController.js';
import {
  getUnreadAlerts,
  patchAlertRead,
  postAlertsReadAll
} from '../controllers/userAlertController.js';
import {
  getDealDd,
  startDealDd,
  getDealDdTemplates,
  patchDealDdItem,
  patchDealDdItemsBulk,
  postDdShareLink,
  deleteDdShareLink,
  postDdGroup,
  postDdItem,
  postDdItemDocument
} from '../controllers/ddController.js';
import {
  getDealUnderwriting,
  getUnderwritingHub,
  postBlankUnderwriting,
  patchUnderwritingModel,
  postStructurePath,
  patchStructurePath,
  deleteStructurePath,
  postRevision,
  putCustomSheet,
  removeCustomSheet,
  postEvidenceLink,
  postRequestEvidence,
  postShareLink,
  deleteShareLink,
  postImportPreview,
  postImportApply,
  getUnderwritingByModel
} from '../controllers/underwritingController.js';

const router = express.Router();

router.get('/calendar/oauth/callback', googleCalendarOAuthCallback);
router.get('/calendar/oauth-config', getCalendarOAuthConfig);

router.use(authMiddleware);

router.get('/today', getCrmToday);
router.get('/search', getCrmSearch);
router.get('/alerts', getUnreadAlerts);
router.patch('/alerts/:alertId/read', patchAlertRead);
router.post('/alerts/read-all', postAlertsReadAll);
router.get('/tasks', getCrmTasksFiltered);
router.post('/tasks/quick-add', postQuickAddTask);
router.get('/kanban', getCrmKanban);
router.get('/contacts', listCrmContacts);
router.post('/contacts', postCrmContact);
router.patch('/contacts/:contactId', patchCrmContact);
router.delete('/contacts/:contactId', removeCrmContact);
router.get('/companies', listCrmCompanies);
router.post('/companies', postCrmCompany);
router.patch('/companies/:companyId', patchCrmCompany);
router.post('/import/csv', postCsvImport);
router.get('/views', getCrmViews);
router.post('/views', postCrmView);
router.patch('/views/:viewId', patchCrmView);
router.delete('/views/:viewId', removeCrmView);
router.get('/analytics', getCrmAnalytics);
router.get('/calendar/status', getCalendarStatus);
router.get('/calendar/events', getCalendarEvents);
router.post('/calendar/events', postCalendarEvent);
router.post('/calendar/sync', postCalendarSync);
router.patch('/calendar/events/:eventId', patchCalendarEvent);
router.delete('/calendar/events/:eventId', removeCalendarEvent);
router.get('/calendar/oauth/start', getCalendarOAuthUrl);
router.delete('/calendar/connection', deleteCalendarConnection);
router.post('/gmail/send', postGmailSend);
router.patch('/deals/:id/stage', patchDealStage);
router.get('/deals/:id/activities', getDealActivities);
router.post('/deals/:id/activities', addDealActivity);
router.post('/deals/:id/notes', postDealNoteRich);
router.patch('/notes/:activityId', patchDealNote);
router.post('/deals/:id/refresh-from-listing', refreshDealFromListing);

router.get('/deals/:id/thread', getThread);
router.get('/deals/:id/thread/members', getThreadMembers);
router.post('/deals/:id/thread', postThreadMessage);
router.post('/deals/:id/thread/messages/:messageId/reactions', postReaction);
router.patch('/deals/:id/thread/messages/:messageId/resolve', patchResolve);

router.get('/deals/:id/contacts', getDealContactList);
router.post('/deals/:id/contacts', postDealContactLink);
router.delete('/deals/:id/contacts/:contactId', deleteDealContactLink);

router.get('/deals/:id/tasks', getDealTasks);
router.post('/deals/:id/tasks', postDealTask);
router.post('/deals/:id/follow-up', postQuickFollowUp);
router.post('/deals/:id/nudge/complete', postCompleteNudge);
router.patch('/tasks/:taskId', patchTask);
router.get('/tasks/:taskId/comments', getTaskComments);
router.post('/tasks/:taskId/comments', postTaskComment);

router.get('/deals/:id/documents', getDealDocuments);
router.post('/deals/:id/documents', postDealDocument);

router.get('/deals/:id/dd', getDealDd);
router.get('/deals/:id/dd/templates', getDealDdTemplates);
router.post('/deals/:id/dd/start', startDealDd);
router.patch('/deals/:id/dd/items', patchDealDdItemsBulk);
router.patch('/deals/:id/dd/items/:itemId', patchDealDdItem);
router.post('/deals/:id/dd/groups', postDdGroup);
router.post('/deals/:id/dd/groups/:groupId/items', postDdItem);
router.post('/deals/:id/dd/items/:itemId/documents', postDdItemDocument);
router.post('/deals/:id/dd/share-links', postDdShareLink);
router.delete('/deals/:id/dd/share-links/:linkId', deleteDdShareLink);

router.get('/underwriting', getUnderwritingHub);
router.post('/underwriting/blank', postBlankUnderwriting);
router.get('/underwriting/models/:modelId', getUnderwritingByModel);
router.patch('/underwriting/models/:modelId', patchUnderwritingModel);
router.post('/underwriting/models/:modelId/paths', postStructurePath);
router.patch('/underwriting/models/:modelId/paths/:pathId', patchStructurePath);
router.delete('/underwriting/models/:modelId/paths/:pathId', deleteStructurePath);
router.post('/underwriting/models/:modelId/revisions', postRevision);
router.put('/underwriting/models/:modelId/custom-sheets', putCustomSheet);
router.delete('/underwriting/models/:modelId/custom-sheets/:sheetId', removeCustomSheet);
router.post('/underwriting/models/:modelId/evidence', postEvidenceLink);
router.post('/underwriting/models/:modelId/evidence/request-dd', postRequestEvidence);
router.post('/underwriting/models/:modelId/share-links', postShareLink);
router.delete('/underwriting/models/:modelId/share-links/:linkId', deleteShareLink);
router.post('/underwriting/models/:modelId/import/preview', postImportPreview);
router.post('/underwriting/models/:modelId/import/apply', postImportApply);
router.get('/deals/:id/underwriting', getDealUnderwriting);

export default router;
