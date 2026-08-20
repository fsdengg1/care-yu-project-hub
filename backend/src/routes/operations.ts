import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import { DailyUpdate, Task } from '../types.js';

const router = Router();

router.post('/tasks', requireAuth, requirePermission('create:task'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const now = new Date().toISOString();
  const task: Task = {
    id: `task-${Date.now()}`,
    lead_id: req.body?.lead_id || '',
    title: req.body?.title || 'Untitled task',
    description: req.body?.description,
    status: 'TODO',
    priority: req.body?.priority || 'Medium',
    due_date: req.body?.due_date,
    assigned_to: req.body?.assigned_to || user.name,
    assigned_to_id: req.body?.assigned_to_id || user.id,
    created_by: user.name,
    created_by_id: user.id,
    created_at: now,
    updated_at: now,
  };
  const tasks = store.getTasks();
  tasks.unshift(task);
  store.saveTasks(tasks);
  return res.status(201).json({ task });
});

router.post('/daily-updates', requireAuth, requirePermission('submit:daily-update'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const update: DailyUpdate = {
    id: `upd-${Date.now()}`,
    user_id: user.id,
    user_name: user.name,
    task_id: req.body?.task_id,
    project_id: req.body?.project_id,
    summary: req.body?.summary || '',
    created_at: new Date().toISOString(),
  };
  const updates = store.getDailyUpdates();
  updates.unshift(update);
  store.saveDailyUpdates(updates);
  return res.status(201).json({ update });
});

router.post('/feasibility', requireAuth, requirePermission('create:feasibility'), (req: AuthedRequest, res) => {
  const user = req.user!;
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'FEASIBILITY',
    entity_id: req.body?.lead_id || 'feasibility',
    action: 'FEASIBILITY_CREATED',
    description: `${user.name} submitted a feasibility record`,
  });
  return res.status(201).json({ ok: true });
});

router.get('/audit-logs', requireAuth, requirePermission('view:audit', 'view:dashboard:ceo'), (_req, res) => {
  res.json({
    audits: store.getAudits().sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
  });
});

router.get('/procurement', requireAuth, requirePermission('view:projects', 'view:dashboard:ceo', 'view:leads'), (_req, res) => {
  res.json({ requests: store.getProcurementRequests() });
});

export default router;
