import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import { summarizeProjects } from '../lib/ceoDashboard.js';

const router = Router();

router.get('/', requireAuth, requirePermission('view:projects', 'view:dashboard:ceo'), (_req, res) => {
  const projects = store.getProjects();
  res.json({ projects, summary: summarizeProjects(projects) });
});

export default router;
