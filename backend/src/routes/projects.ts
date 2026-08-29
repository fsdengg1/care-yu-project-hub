import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import { summarizeProjects } from '../lib/ceoDashboard.js';
import { buildProjectActivity, canViewProject } from '../lib/dailyUpdates.js';
import {
  applyProjectPatch,
  buildProjectDetail,
  canAccessGanttModule,
  canManageProject,
  createDirectProject,
  escalateProject,
  listVisibleProjects,
} from '../lib/projects.js';
import { getProjectPlan } from '../lib/planning.js';
import { ProjectStatus } from '../types.js';
import {
  assignProject,
  canEscalateProject,
  completionBlockers,
  markTlFinalReview,
  monitorProject,
  reviewProjectIntake,
} from '../lib/projectWorkflow.js';

const router = Router();

function paramId(req: AuthedRequest): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

router.get(
  '/',
  requireAuth,
  requirePermission('view:projects', 'view:dashboard:ceo', 'view:daily-updates'),
  (req: AuthedRequest, res) => {
    const status = (typeof req.query.status === 'string' ? req.query.status : 'ACTIVE') as ProjectStatus | 'ALL';
    const allowed: Array<ProjectStatus | 'ALL'> = ['ACTIVE', 'ON_HOLD', 'HANDOVER', 'COMPLETED', 'CANCELLED', 'ALL'];
    const filter = allowed.includes(status) ? status : 'ACTIVE';
    const projects = listVisibleProjects(req.user!, filter === 'ALL' ? 'ALL' : filter);
    res.json({ projects, summary: summarizeProjects(projects) });
  }
);

router.post('/', requireAuth, requirePermission('create:lead'), (req: AuthedRequest, res) => {
  const result = createDirectProject(req.user!, (req.body || {}) as Record<string, unknown>);
  if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
  return res.status(201).json({ project: result.project });
});

router.get(
  '/:id/activity',
  requireAuth,
  requirePermission('view:projects', 'view:dashboard:ceo', 'view:daily-updates'),
  (req: AuthedRequest, res) => {
    const project = store.getProjects().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    if (!canViewProject(req.user!, project)) {
      return res.status(403).json({ message: 'You do not have access to this project activity.' });
    }
    return res.json({ project, activity: buildProjectActivity(project.id) });
  }
);

router.get(
  '/:id/gantt',
  requireAuth,
  requirePermission('view:projects', 'view:dashboard:ceo', 'view:daily-updates', 'view:leads'),
  (req: AuthedRequest, res) => {
    if (!canAccessGanttModule(req.user!)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this project's Gantt plan.",
      });
    }
    const plan = getProjectPlan(req.user!, paramId(req));
    if ('error' in plan && plan.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
    if ('error' in plan) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view this project's Gantt plan.",
      });
    }
    return res.json({ success: true, ...plan });
  }
);

router.get(
  '/:id',
  requireAuth,
  requirePermission('view:projects', 'view:dashboard:ceo', 'view:daily-updates'),
  (req: AuthedRequest, res) => {
    const detail = buildProjectDetail(req.user!, paramId(req));
    if (!detail) return res.status(404).json({ message: 'Project not found.' });
    if ('forbidden' in detail) return res.status(403).json({ message: 'You do not have access to this project.' });
    return res.json(detail);
  }
);

router.patch(
  '/:id',
  requireAuth,
  requirePermission('manage:project', 'view:projects'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const project = store.getProjects().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    if (!canManageProject(user, project)) {
      return res.status(403).json({ message: 'Only the assigned Project Manager can update this project.' });
    }
    if (req.body?.status === 'COMPLETED' || req.body?.status === 'HANDOVER') {
      const blocked = completionBlockers(project);
      if (blocked) {
        return res.status(400).json({ message: blocked });
      }
    }
    if (req.body?.status === 'COMPLETED' && project.status !== 'HANDOVER' && project.status !== 'COMPLETED') {
      req.body.status = 'HANDOVER';
    }
    const updated = applyProjectPatch(user, project, req.body || {});
    return res.json({ project: updated, detail: buildProjectDetail(user, project.id) });
  }
);

router.post(
  '/:id/assign',
  requireAuth,
  requirePermission('manage:project'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const project = store.getProjects().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    const result = assignProject(user, project, String(req.body?.assignee_id || ''));
    if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
    return res.json({ project: result.project, detail: buildProjectDetail(user, result.project.id) });
  }
);

router.post(
  '/:id/intake',
  requireAuth,
  requirePermission('view:projects'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const project = store.getProjects().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    const action = String(req.body?.action || '').toLowerCase() === 'return' ? 'return' : 'accept';
    const result = reviewProjectIntake(user, project, action, req.body?.comments);
    if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
    return res.json({ project: result.project, detail: buildProjectDetail(user, result.project.id) });
  }
);

router.post(
  '/:id/tl-review',
  requireAuth,
  requirePermission('view:projects'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const project = store.getProjects().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    const result = markTlFinalReview(user, project, req.body?.comments);
    if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
    return res.json({ project: result.project, detail: buildProjectDetail(user, result.project.id) });
  }
);

router.post(
  '/:id/monitor',
  requireAuth,
  requirePermission('view:projects'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const project = store.getProjects().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    const status = String(req.body?.status || '').toUpperCase() === 'ISSUE_IDENTIFIED' ? 'ISSUE_IDENTIFIED' : 'ON_TRACK';
    const result = monitorProject(user, project, status, req.body?.comments);
    if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
    return res.json({ project: result.project, detail: buildProjectDetail(user, result.project.id) });
  }
);

router.post(
  '/:id/escalate',
  requireAuth,
  requirePermission('escalate:issue', 'manage:project', 'view:projects'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const project = store.getProjects().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    if (!canEscalateProject(user, project)) {
      return res.status(403).json({ message: 'You cannot escalate this project.' });
    }
    const issue = String(req.body?.issue || project.issue || '').trim();
    if (!issue) return res.status(400).json({ message: 'Describe the issue to escalate.' });
    const escalation = escalateProject(user, project, {
      issue,
      impact: req.body?.impact,
      severity: req.body?.severity,
    });
    return res.status(201).json({ escalation });
  }
);

export default router;
