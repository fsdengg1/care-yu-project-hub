import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import { createWorkTask } from '../lib/workTasks.js';

const router = Router();

router.post('/tasks', requireAuth, requirePermission('create:task'), (req: AuthedRequest, res) => {
  const result = createWorkTask(req.user!, req.body || {});
  if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
  return res.status(201).json({ task: result.task });
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
