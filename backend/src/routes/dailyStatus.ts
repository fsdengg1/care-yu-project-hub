import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import {
  buildDailyStatusKpis,
  buildDailyStatusRows,
  canSeeAllDailyStatusRows,
  compareSnapshots,
  directoryPeople,
  fromSheetStatus,
  loadDailyStatusSnapshot,
  renderDailyStatusEmailHtml,
  restoreDailyStatusReport,
  rowsForPeriod,
  saveDailyStatusSnapshot,
  sendDailyStatusReport,
  SnapshotPeriod,
  visibleProjects,
} from '../lib/dailyStatus.js';
import { formatEmployeeDisplayName } from '../lib/people.js';
import { updateWorkTask } from '../lib/workTasks.js';

const router = Router();

function readPeriod(value: unknown): SnapshotPeriod {
  return String(value || '').toLowerCase() === 'evening' ? 'evening' : 'morning';
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

router.use(requireAuth);

router.get(
  '/sheet',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const rows = buildDailyStatusRows(user);
    return res.json({
      rows,
      kpis: buildDailyStatusKpis(user, rows),
      people: directoryPeople(),
      projects: visibleProjects(user).map((project) => ({
        id: project.id,
        name: project.name,
        code: project.code,
      })),
    });
  }
);

router.post(
  '/snapshot',
  requirePermission('view:daily-updates', 'submit:daily-update'),
  (req: AuthedRequest, res) => {
    if (!canSeeAllDailyStatusRows(req.user!)) {
      return res.status(403).json({ message: 'Only the Project Manager, Engineering Director, or CEO can save the shared morning/evening snapshot.' });
    }
    const period = readPeriod(req.body?.period);
    const date = typeof req.body?.date === 'string' && req.body.date ? req.body.date : todayDate();
    const result = saveDailyStatusSnapshot(req.user!, period, date);
    return res.json({
      message: `${period === 'morning' ? 'Morning' : 'Evening'} snapshot saved.`,
      ...result,
    });
  }
);

router.get(
  '/snapshot',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const period = readPeriod(req.query.period);
    const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : todayDate();
    const packed = rowsForPeriod(req.user!, period, date);
    return res.json({
      date,
      period,
      source: packed.source,
      available: packed.available,
      rows: packed.rows,
      snapshot: loadDailyStatusSnapshot(date, period),
    });
  }
);

router.get(
  '/compare',
  requirePermission('view:daily-updates', 'submit:daily-update', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : undefined;
    const result = compareSnapshots(req.user!, date);
    return res.json({
      ...result,
      message: result.available ? undefined : 'Morning and evening updates are not yet available.',
    });
  }
);

router.get(
  '/email-preview',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  (req: AuthedRequest, res) => {
    const period = readPeriod(req.query.period);
    const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : todayDate();
    const packed = rowsForPeriod(req.user!, period, date);
    if (!packed.available) {
      return res.json({
        available: false,
        message: 'Morning and evening updates are not yet available.',
        html: '',
        rows: [],
        period,
        date,
      });
    }
    const rendered = renderDailyStatusEmailHtml({
      period,
      date,
      rows: packed.rows,
      recipientName: formatEmployeeDisplayName(req.user!),
    });
    return res.json({
      available: true,
      source: packed.source,
      html: rendered.html,
      text: rendered.text,
      subject: rendered.subject,
      rows: packed.rows,
      period,
      date,
    });
  }
);

router.post(
  '/email-send',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  async (req: AuthedRequest, res) => {
    const period = readPeriod(req.body?.period);
    const toEmail = typeof req.body?.toEmail === 'string' ? req.body.toEmail : undefined;
    const date = typeof req.body?.date === 'string' && req.body.date ? req.body.date : todayDate();
    const result = await sendDailyStatusReport({ actor: req.user!, period, toEmail, date });
    if ('error' in result) {
      return res.status(400).json({ message: result.error });
    }
    if (result.result.status === 'FAILED') {
      return res.status(502).json({ message: result.result.reason || 'Unable to send the email report.' });
    }
    return res.json({
      message: 'Email report sent.',
      subject: result.subject,
      html: result.html,
      rows: result.rows,
      date: result.date,
      period: result.period,
    });
  }
);

router.get(
  '/email-restore',
  requirePermission('view:daily-updates', 'view:dashboard:ceo'),
  (_req, res) => {
    const restored = restoreDailyStatusReport();
    if (!restored) return res.status(404).json({ message: 'No previous report is available to restore.' });
    return res.json(restored);
  }
);

router.patch(
  '/rows/:id',
  requirePermission('view:daily-updates', 'create:task', 'submit:daily-update'),
  (req: AuthedRequest, res) => {
    const body: Record<string, unknown> = { ...(req.body || {}) };
    if (typeof body.status === 'string' && !['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'WAITING', 'HOLD'].includes(body.status)) {
      body.status = fromSheetStatus(body.status);
    }
    const result = updateWorkTask(req.user!, String(req.params.id), body);
    if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'Task not found.' });
    if ('error' in result) {
      return res.status(result.status || 400).json({
        message:
          result.error === 'forbidden'
            ? 'You do not have permission to update this task.'
            : result.error,
      });
    }
    return res.json({ task: result.task, rows: buildDailyStatusRows(req.user!) });
  }
);

export default router;
