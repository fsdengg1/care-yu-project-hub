import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { canAccessGanttModule } from '../lib/projects.js';
import {
  addPhase,
  addPlanTask,
  createDefaultPlan,
  deletePhase,
  deletePlanTask,
  getProjectPlan,
  listPlanningProjects,
  loadAuthorizedPlan,
  patchPhase,
  patchPlanTask,
  requireAssignableProject,
} from '../lib/planning.js';

const router = Router();

function param(req: AuthedRequest, key: string) {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

const GANTT_FORBIDDEN = {
  success: false as const,
  message: "You do not have permission to view this project's Gantt plan.",
};

const GANTT_EDIT_FORBIDDEN = {
  success: false as const,
  message: 'Only the assigned Project Manager can modify this Gantt plan.',
};

function denyModule(req: AuthedRequest, res: import('express').Response) {
  if (!canAccessGanttModule(req.user!)) {
    res.status(403).json({
      success: false,
      message: "You do not have permission to view this project's Gantt plan.",
    });
    return true;
  }
  return false;
}

function planOrError(req: AuthedRequest, res: import('express').Response, projectId: string) {
  const plan = getProjectPlan(req.user!, projectId);
  if ('error' in plan && plan.error === 'not_found') {
    res.status(404).json({ success: false, message: 'Project not found.' });
    return null;
  }
  if ('error' in plan) {
    res.status(403).json(GANTT_FORBIDDEN);
    return null;
  }
  return plan;
}

router.get('/', requireAuth, requirePermission('view:projects', 'view:dashboard:ceo', 'view:daily-updates'), (req: AuthedRequest, res) => {
  if (denyModule(req, res)) return;
  res.json({
    success: true,
    canAccessGantt: true,
    projects: listPlanningProjects(req.user!),
  });
});

router.get('/:projectId', requireAuth, requirePermission('view:projects', 'view:dashboard:ceo', 'view:daily-updates'), (req: AuthedRequest, res) => {
  if (denyModule(req, res)) return;
  const plan = planOrError(req, res, param(req, 'projectId'));
  if (!plan) return;
  return res.json({ success: true, ...plan });
});

router.post('/:projectId/plan', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const plan = createDefaultPlan(req.user!, result.project);
  if (!plan) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  return res.json({ success: true, ...plan });
});

router.post('/:projectId/phases', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const created = addPhase(req.user!, result.project, req.body || {});
  if ('error' in created) return res.status(400).json({ success: false, message: created.error });
  return res.json({ success: true, ...created, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

router.patch('/:projectId/phases/:phaseId', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const phase = patchPhase(req.user!, result.project, param(req, 'phaseId'), req.body || {});
  if (!phase) return res.status(404).json({ success: false, message: 'Phase not found.' });
  return res.json({ success: true, phase, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

router.delete('/:projectId/phases/:phaseId', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const phase = deletePhase(req.user!, result.project, param(req, 'phaseId'));
  if (!phase) return res.status(404).json({ success: false, message: 'Phase not found.' });
  return res.json({ success: true, phase, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

router.post('/:projectId/tasks', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const created = addPlanTask(req.user!, result.project, req.body || {});
  if ('error' in created) return res.status(400).json({ success: false, message: created.error });
  return res.json({ success: true, ...created, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

router.patch('/:projectId/tasks/:taskId', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const task = patchPlanTask(req.user!, result.project, param(req, 'taskId'), req.body || {});
  if (!task) return res.status(404).json({ success: false, message: 'Task not found on this project.' });
  return res.json({ success: true, task, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

router.delete('/:projectId/tasks/:taskId', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const task = deletePlanTask(req.user!, result.project, param(req, 'taskId'));
  if (!task) return res.status(404).json({ success: false, message: 'Task not found on this project.' });
  return res.json({ success: true, task, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

router.post('/:projectId/milestones', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const created = addPlanTask(req.user!, result.project, { ...(req.body || {}), is_milestone: true });
  if ('error' in created) return res.status(400).json({ success: false, message: created.error });
  return res.json({ success: true, ...created, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

router.patch('/:projectId/milestones/:milestoneId', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const task = patchPlanTask(req.user!, result.project, param(req, 'milestoneId'), { ...(req.body || {}), is_milestone: true });
  if (!task) return res.status(404).json({ success: false, message: 'Milestone not found.' });
  return res.json({ success: true, task, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

router.delete('/:projectId/milestones/:milestoneId', requireAuth, requirePermission('manage:project'), (req: AuthedRequest, res) => {
  const result = requireAssignableProject(req.user!, param(req, 'projectId'));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ success: false, message: 'Project not found.' });
  if ('error' in result) return res.status(403).json(GANTT_EDIT_FORBIDDEN);
  const task = deletePlanTask(req.user!, result.project, param(req, 'milestoneId'));
  if (!task) return res.status(404).json({ success: false, message: 'Milestone not found.' });
  return res.json({ success: true, task, plan: loadAuthorizedPlan(req.user!, result.project.id) });
});

export default router;
