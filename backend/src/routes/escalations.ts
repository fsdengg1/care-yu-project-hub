import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';

const router = Router();

router.get('/', requireAuth, requirePermission('view:escalations', 'view:dashboard:ceo'), (_req, res) => {
  const escalations = store
    .getEscalations()
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  res.json({ escalations });
});

router.get('/:id', requireAuth, requirePermission('view:escalations', 'view:dashboard:ceo'), (req, res) => {
  const escalation = store.getEscalations().find((item) => item.id === req.params.id || item.code === req.params.id);
  if (!escalation) return res.status(404).json({ message: 'Escalation not found.' });
  res.json({ escalation });
});

router.post(
  '/:id/resolve',
  requireAuth,
  requirePermission('decide:ceo_escalation'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const escalations = store.getEscalations();
    const index = escalations.findIndex((item) => item.id === req.params.id || item.code === req.params.id);
    if (index === -1) return res.status(404).json({ message: 'Escalation not found.' });

    const current = escalations[index];
    if (current.current_level !== 'CEO') {
      return res.status(403).json({
        message: 'Forbidden. Only escalations at CEO level can be resolved here.',
      });
    }

    const decision = typeof req.body?.decision === 'string' ? req.body.decision.trim() : '';
    if (!decision) {
      return res.status(400).json({ message: 'A decision / resolution is required.' });
    }

    const now = new Date().toISOString();
    escalations[index] = {
      ...current,
      status: 'RESOLVED',
      ceo_decision: decision,
      resolved_at: now,
      updated_at: now,
    };
    store.saveEscalations(escalations);
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'ESCALATION',
      entity_id: current.id,
      action: 'ESCALATION_RESOLVED',
      description: `${user.name} resolved ${current.code}: ${decision}`,
    });

    return res.json({ escalation: escalations[index] });
  }
);

export default router;
