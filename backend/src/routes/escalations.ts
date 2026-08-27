import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import {
  canActOnEscalation,
  canViewEscalation,
  nextEscalationLevel,
  promoteEscalation,
  resolveEscalation,
} from '../lib/projectWorkflow.js';

const router = Router();

function paramId(req: AuthedRequest) {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

router.get('/', requireAuth, requirePermission('view:escalations', 'view:dashboard:ceo', 'view:projects', 'view:daily-updates'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const escalations = store
    .getEscalations()
    .filter((item) => canViewEscalation(user, item))
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .map((item) => ({
      ...item,
      can_act: canActOnEscalation(user, item),
      can_promote: canActOnEscalation(user, item) && Boolean(nextEscalationLevel(item.current_level)),
    }));
  res.json({ escalations });
});

router.get('/:id', requireAuth, requirePermission('view:escalations', 'view:dashboard:ceo', 'view:projects', 'view:daily-updates'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const escalation = store.getEscalations().find((item) => item.id === paramId(req) || item.code === paramId(req));
  if (!escalation) return res.status(404).json({ message: 'Escalation not found.' });
  if (!canViewEscalation(user, escalation)) {
    return res.status(403).json({ message: 'You do not have access to this escalation.' });
  }
  return res.json({
    escalation,
    can_act: canActOnEscalation(user, escalation),
    can_promote: canActOnEscalation(user, escalation) && Boolean(nextEscalationLevel(escalation.current_level)),
  });
});

router.post(
  '/:id/resolve',
  requireAuth,
  requirePermission('decide:ceo_escalation', 'escalate:issue', 'view:escalations', 'view:projects'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const current = store.getEscalations().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!current) return res.status(404).json({ message: 'Escalation not found.' });
    const result = resolveEscalation(user, current, String(req.body?.decision || req.body?.resolution || ''));
    if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
    return res.json({ escalation: result.escalation });
  }
);

router.post(
  '/:id/promote',
  requireAuth,
  requirePermission('escalate:issue', 'view:escalations', 'view:projects'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const current = store.getEscalations().find((item) => item.id === paramId(req) || item.code === paramId(req));
    if (!current) return res.status(404).json({ message: 'Escalation not found.' });
    const result = promoteEscalation(user, current, req.body?.comments);
    if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
    return res.json({ escalation: result.escalation });
  }
);

export default router;
