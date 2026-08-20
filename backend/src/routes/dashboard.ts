import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { buildCeoDashboard, summarizeProjects } from '../lib/ceoDashboard.js';
import { store } from '../store/db.js';

const router = Router();

router.get(
  '/ceo',
  requireAuth,
  requirePermission('view:dashboard:ceo'),
  (_req: AuthedRequest, res) => {
    res.json(buildCeoDashboard());
  }
);

router.get(
  '/ceo/pipeline',
  requireAuth,
  requirePermission('view:dashboard:ceo'),
  (_req, res) => {
    const { pipeline } = buildCeoDashboard();
    res.json({
      totalValue: pipeline.value,
      activeLeads: pipeline.activeLeads,
      awaitingApproval: pipeline.awaitingApproval,
      inProgress: pipeline.inProgress,
      negotiation: pipeline.negotiation,
    });
  }
);

router.get(
  '/ceo/projects',
  requireAuth,
  requirePermission('view:dashboard:ceo'),
  (_req, res) => {
    res.json(summarizeProjects(store.getProjects()));
  }
);

router.get(
  '/ceo/teams',
  requireAuth,
  requirePermission('view:dashboard:ceo'),
  (_req, res) => {
    const { teams } = buildCeoDashboard();
    res.json(teams);
  }
);

router.get(
  '/ceo/project-manager',
  requireAuth,
  requirePermission('view:dashboard:ceo'),
  (_req, res) => {
    const { projectManager } = buildCeoDashboard();
    res.json(projectManager);
  }
);

export default router;
