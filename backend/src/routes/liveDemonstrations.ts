import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { LeadWorkflowError } from '../lib/leadValidation.js';
import { findLead, hydrateLead } from '../lib/leadWorkflow.js';
import {
  assignLiveDemonstration,
  cancelDemonstration,
  canAssignLiveDemo,
  canCreateLiveDemoRequest,
  canReviewLiveDemo,
  canScheduleLiveDemo,
  canViewLiveDemo,
  completeDemonstration,
  createLiveDemoRequest,
  eligibleLeadsForRequest,
  findDemoByLead,
  listLiveDemonstrations,
  liveDemoActivity,
  markLiveDemoPending,
  proceedToProcurement,
  publicDemoPayload,
  reviewLiveDemoRequest,
  resolveLiveDemoPending,
  saveLiveCaseReference,
  scheduleDemonstration,
  solutionCostingCompleted,
  startDemonstration,
  summarizeLiveDemonstrations,
  updateChecklist,
  updateDemonstrationDetails,
  updateFollowUp,
  verifyLiveCaseReference,
} from '../lib/liveDemonstration.js';

const router = Router();

function paramId(req: AuthedRequest, key = 'id') {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

function workflowError(res: import('express').Response, error: unknown) {
  if (error instanceof LeadWorkflowError) {
    return res.status(error.status).json({ message: error.message });
  }
  console.error(error);
  return res.status(500).json({ message: 'Unable to update LIVE Case Demonstration.' });
}

function loadLead(req: AuthedRequest, res: import('express').Response) {
  const user = req.user!;
  const lead = findLead(paramId(req, 'id') || paramId(req, 'leadId'));
  if (!lead) {
    res.status(404).json({ message: 'Lead not found.' });
    return null;
  }
  const hydrated = hydrateLead(lead);
  if (!canViewLiveDemo(user, hydrated)) {
    res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
    return null;
  }
  return hydrated;
}

router.get(
  '/',
  requireAuth,
  requirePermission('view:leads', 'view:dashboard:ceo', 'review:lead'),
  (req: AuthedRequest, res) => {
    res.json(listLiveDemonstrations((req.query || {}) as Record<string, unknown>));
  }
);

router.get(
  '/summary',
  requireAuth,
  requirePermission('view:leads', 'view:dashboard:ceo', 'review:lead'),
  (_req, res) => {
    res.json(summarizeLiveDemonstrations());
  }
);

router.get(
  '/eligible-leads',
  requireAuth,
  requirePermission('view:leads', 'create:live-demo-request', 'schedule:live-demo', 'create:lead', 'review:lead'),
  (req: AuthedRequest, res) => {
    res.json({ leads: eligibleLeadsForRequest(req.user!) });
  }
);

router.get(
  '/lead/:id',
  requireAuth,
  requirePermission('view:leads', 'create:lead', 'create:feasibility', 'create:costing'),
  (req: AuthedRequest, res) => {
    const lead = loadLead(req, res);
    if (!lead) return;
    const demo = findDemoByLead(lead.id) || null;
    return res.json({
      lead,
      ...publicDemoPayload(lead, demo),
      activity: liveDemoActivity(demo),
      can_schedule: canScheduleLiveDemo(req.user!),
      can_create: canCreateLiveDemoRequest(req.user!),
      can_review: canReviewLiveDemo(req.user!),
      can_assign: canAssignLiveDemo(req.user!),
    });
  }
);

router.post(
  '/lead/:id/request',
  requireAuth,
  requirePermission('create:live-demo-request', 'schedule:live-demo', 'create:lead', 'edit:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = createLiveDemoRequest(lead, req.user!, req.body || {});
      return res.status(201).json({ ...result, ...publicDemoPayload(result.lead, result.demo) });
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/review',
  requireAuth,
  requirePermission('review:live-demo', 'review:lead', 'verify:live-demo'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = reviewLiveDemoRequest(lead, req.user!, req.body || {});
      return res.json({ ...result, ...publicDemoPayload(result.lead, result.demo) });
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/assign',
  requireAuth,
  requirePermission('assign:live-demo', 'schedule:live-demo', 'review:lead', 'edit:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = assignLiveDemonstration(lead, req.user!, req.body || {});
      return res.json({ ...result, ...publicDemoPayload(result.lead, result.demo) });
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/pending',
  requireAuth,
  requirePermission('edit:lead', 'schedule:live-demo', 'review:lead', 'create:live-demo-request'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = markLiveDemoPending(lead, req.user!, req.body || {});
      return res.json({ ...result, ...publicDemoPayload(result.lead, result.demo) });
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/resolve-pending',
  requireAuth,
  requirePermission('edit:lead', 'schedule:live-demo', 'review:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = resolveLiveDemoPending(lead, req.user!, req.body || {});
      return res.json({ ...result, ...publicDemoPayload(result.lead, result.demo) });
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/schedule',
  requireAuth,
  requirePermission('edit:lead', 'create:quotation', 'review:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      if (!solutionCostingCompleted(lead)) {
        return res.status(400).json({ message: 'LIVE Case Demonstration is available only after Solution & Costing is completed.' });
      }
      const result = scheduleDemonstration(lead, req.user!, req.body || {});
      return res.json({ ...result, ...publicDemoPayload(result.lead, result.demo) });
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.patch(
  '/lead/:id',
  requireAuth,
  requirePermission('edit:lead', 'create:quotation', 'review:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = updateDemonstrationDetails(lead, req.user!, req.body || {});
      return res.json({ ...result, ...publicDemoPayload(result.lead, result.demo) });
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/checklist',
  requireAuth,
  requirePermission('edit:lead', 'create:quotation', 'review:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = updateChecklist(lead, req.user!, req.body || {});
      return res.json(result);
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/start',
  requireAuth,
  requirePermission('edit:lead', 'create:quotation', 'review:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = startDemonstration(lead, req.user!);
      return res.json(result);
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/complete',
  requireAuth,
  requirePermission('edit:lead', 'create:quotation', 'review:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = completeDemonstration(lead, req.user!, req.body || {});
      return res.json(result);
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/reference',
  requireAuth,
  requirePermission('edit:lead', 'create:quotation', 'review:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = saveLiveCaseReference(lead, req.user!, req.body?.live_case_reference ?? req.body?.reference);
      return res.json(result);
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/verify',
  requireAuth,
  requirePermission('review:lead', 'approve:costing', 'convert:lead', 'verify:live-demo'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = verifyLiveCaseReference(lead, req.user!, req.body || {});
      return res.json(result);
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/cancel',
  requireAuth,
  requirePermission('edit:lead', 'create:quotation', 'review:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = cancelDemonstration(lead, req.user!, req.body?.reason);
      return res.json(result);
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/follow-up',
  requireAuth,
  requirePermission('edit:lead', 'create:quotation', 'review:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = updateFollowUp(lead, req.user!, req.body || {});
      return res.json(result);
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

router.post(
  '/lead/:id/proceed-procurement',
  requireAuth,
  requirePermission('create:quotation', 'edit:lead', 'convert:lead', 'review:lead'),
  (req: AuthedRequest, res) => {
    try {
      const lead = loadLead(req, res);
      if (!lead) return;
      const result = proceedToProcurement(lead, req.user!);
      return res.json(result);
    } catch (error) {
      return workflowError(res, error);
    }
  }
);

export default router;
