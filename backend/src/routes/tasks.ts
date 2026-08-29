import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { store } from '../store/db.js';
import { addTaskComment, canViewTask, createWorkTask, updateWorkTask } from '../lib/workTasks.js';
import { listAssignmentsForUser } from '../lib/dailyUpdates.js';

const router = Router();

function paramId(req: AuthedRequest) {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

router.get('/', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const mine = String(req.query.mine || '') === '1';
  if (mine) {
    return res.json({ assignments: listAssignmentsForUser(user) });
  }
  const tasks = store.getTasks().filter((task) => canViewTask(user, task));
  return res.json({ tasks });
});

router.post('/', requireAuth, (req: AuthedRequest, res) => {
  const result = createWorkTask(req.user!, req.body || {});
  if ('error' in result) return res.status(result.status || 400).json({ message: result.error });
  return res.status(201).json({ task: result.task, tasks: result.tasks || [result.task] });
});

router.get('/:id', requireAuth, (req: AuthedRequest, res) => {
  const task = store.getTasks().find((item) => item.id === paramId(req));
  if (!task) return res.status(404).json({ message: 'Task not found.' });
  if (!canViewTask(req.user!, task)) {
    return res.status(403).json({ message: 'You do not have permission to view this project.' });
  }
  return res.json({ task });
});

router.patch('/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = updateWorkTask(req.user!, paramId(req), req.body || {});
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'Task not found.' });
  if ('error' in result) {
    return res.status(result.status || 403).json({ message: result.error === 'forbidden' ? 'You do not have permission to update this task.' : result.error });
  }
  return res.json({ task: result.task });
});

router.post('/:id/comments', requireAuth, (req: AuthedRequest, res) => {
  const result = addTaskComment(req.user!, paramId(req), String(req.body?.comment || ''));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'Task not found.' });
  if ('error' in result && result.error === 'forbidden') {
    return res.status(403).json({ message: 'You do not have permission to view this project.' });
  }
  if ('error' in result) return res.status(400).json({ message: result.error });
  return res.status(201).json({ task: result.task, comment: result.comment });
});

export default router;
