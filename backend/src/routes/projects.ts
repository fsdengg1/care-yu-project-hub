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
  escalateProject,
  listVisibleProjects,
} from '../lib/projects.js';
import { getProjectPlan } from '../lib/planning.js';
import { ProjectStatus } from '../types.js';

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
    const allowed: Array<ProjectStatus | 'ALL'> = ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'ALL'];
    const filter = allowed.includes(status) ? status : 'ACTIVE';
    const projects = listVisibleProjects(req.user!, filter === 'ALL' ? 'ALL' : filter);
    res.json({ projects, summary: summarizeProjects(projects) });
  }
);

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
  requirePermission('view:projects', 'view:dashboard:ceo', 'view:daily-updates'),
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
    const updated = applyProjectPatch(user, project, req.body || {});
    return res.json({ project: updated, detail: buildProjectDetail(user, project.id) });
  }
);

router.post(
  '/:id/escalate',
  requireAuth,
  requirePermission('escalate:issue', 'manage:project'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const project = store.getProjects().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!project) return res.status(404).json({ message: 'Project not found.' });
    if (!canManageProject(user, project)) {
      return res.status(403).json({ message: 'Only the assigned Project Manager can escalate this project.' });
    }
    const escalation = escalateProject(user, project, {
      issue: req.body?.issue,
      impact: req.body?.impact,
      severity: req.body?.severity,
    });
    applyProjectPatch(user, project, {});
    return res.status(201).json({ escalation });
  }
);

export default router;
