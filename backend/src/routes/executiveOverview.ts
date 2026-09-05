import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requireExecutiveOverview } from '../lib/rbac.js';
import {
  buildExecutiveExcel,
  buildExecutiveOverview,
  buildExecutivePdfHtml,
  buildExecutiveProjectDetail,
  ExecutiveOverviewQuery,
  ExecutiveSortKey,
  ExecutiveStatusFilter,
} from '../lib/executiveOverview.js';
import { store } from '../store/db.js';

const router = Router();

function queryFrom(req: AuthedRequest): ExecutiveOverviewQuery {
  const now = new Date();
  const month = Number(req.query.month) || now.getMonth() + 1;
  const year = Number(req.query.year) || now.getFullYear();
  return {
    month,
    year,
    search: typeof req.query.search === 'string' ? req.query.search : undefined,
    department: typeof req.query.department === 'string' ? req.query.department : undefined,
    status: (typeof req.query.status === 'string' ? req.query.status : 'ALL') as ExecutiveStatusFilter,
    projectManager: typeof req.query.projectManager === 'string' ? req.query.projectManager : undefined,
    stage: typeof req.query.stage === 'string' ? req.query.stage : undefined,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 20,
    sort: (typeof req.query.sort === 'string' ? req.query.sort : 'last_activity') as ExecutiveSortKey,
    sortDir: req.query.sortDir === 'asc' ? 'asc' : 'desc',
  };
}

router.get('/', requireAuth, requireExecutiveOverview, (req: AuthedRequest, res) => {
  try {
    const query = queryFrom(req);
    if (query.month < 1 || query.month > 12 || query.year < 2000 || query.year > 2100) {
      return res.status(400).json({ message: 'Select a valid month and year.' });
    }
    if ((Number(req.query.page) || 1) <= 1) {
      store.appendAudit({
        user_id: req.user!.id,
        user_name: req.user!.name,
        user_role: req.user!.role_name,
        entity_type: 'PROJECT',
        entity_id: 'executive-overview',
        entity_name: 'Executive Overview',
        action: 'EXECUTIVE_OVERVIEW_VIEWED',
        description: `${req.user!.name} viewed Executive Overview for ${query.month}/${query.year}.`,
      });
    }
    return res.json(buildExecutiveOverview(query));
  } catch (error) {
    console.error('[executive-overview]', error);
    return res.status(500).json({ message: 'Unable to load Executive Overview. Please try again.' });
  }
});

router.get('/projects/:id', requireAuth, requireExecutiveOverview, (req: AuthedRequest, res) => {
  try {
    const now = new Date();
    const month = Number(req.query.month) || now.getMonth() + 1;
    const year = Number(req.query.year) || now.getFullYear();
    const detail = buildExecutiveProjectDetail(String(req.params.id), year, month);
    if (!detail) return res.status(404).json({ message: 'Project not found.' });
    return res.json(detail);
  } catch (error) {
    console.error('[executive-overview:detail]', error);
    return res.status(500).json({ message: 'Unable to load project details. Please try again.' });
  }
});

router.get('/export', requireAuth, requireExecutiveOverview, (req: AuthedRequest, res) => {
  try {
    const query = queryFrom(req);
    const format = String(req.query.format || 'excel').toLowerCase();
    const file = format === 'pdf' ? buildExecutivePdfHtml(query) : buildExecutiveExcel(query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    return res.send(file.body);
  } catch (error) {
    console.error('[executive-overview:export]', error);
    return res.status(500).json({ message: 'Unable to export Executive Overview. Please try again.' });
  }
});

export default router;
