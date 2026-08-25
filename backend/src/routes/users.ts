import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { publicUser, isPendingSignupOnly } from '../lib/authUser.js';
import { createUser, deleteUser, updateUser } from '../lib/users.js';
import { store } from '../store/db.js';
import { DEFAULT_NOTIFICATION_PREFERENCES, userPreferences } from '../lib/responsibility.js';
import { NotificationPreferences } from '../types.js';

const router = Router();

function paramId(req: AuthedRequest) {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function publicUsers() {
  return store
    .getUsers()
    .filter((user) => !isPendingSignupOnly(user))
    .map((user) => publicUser(user));
}

router.get('/', requireAuth, (_req: AuthedRequest, res) => {
  res.json({ users: publicUsers() });
});

router.patch('/me/notification-preferences', requireAuth, (req: AuthedRequest, res) => {
  const user = req.user!;
  const users = store.getUsers();
  const index = users.findIndex((item) => item.id === user.id);
  if (index === -1) return res.status(404).json({ message: 'User not found.' });
  const body = (req.body || {}) as Partial<NotificationPreferences>;
  const current = userPreferences(users[index]);
  const next: NotificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...current,
    email_enabled: body.email_enabled ?? current.email_enabled,
    in_app_enabled: body.in_app_enabled ?? current.in_app_enabled,
    assignment: body.assignment ?? current.assignment,
    forward: body.forward ?? current.forward,
    reminder: body.reminder ?? current.reminder,
    approval: body.approval ?? current.approval,
  };
  users[index] = {
    ...users[index],
    notification_preferences: next,
    updated_at: new Date().toISOString(),
  };
  store.saveUsers(users);
  return res.json({ user: publicUser(users[index]) });
});

router.post('/', requireAuth, requirePermission('manage:users'), (req: AuthedRequest, res) => {
  const result = createUser(req.user!, req.body || {});
  if ('error' in result) return res.status(400).json({ message: result.error });
  return res.status(201).json({ user: publicUser(result.user), users: publicUsers() });
});

router.patch('/:id', requireAuth, requirePermission('manage:users'), (req: AuthedRequest, res) => {
  const result = updateUser(req.user!, paramId(req), req.body || {});
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'User not found.' });
  if ('error' in result) return res.status(400).json({ message: result.error });
  return res.json({ user: publicUser(result.user), users: publicUsers() });
});

router.delete('/:id', requireAuth, requirePermission('manage:users'), (req: AuthedRequest, res) => {
  const result = deleteUser(req.user!, paramId(req));
  if ('error' in result && result.error === 'not_found') return res.status(404).json({ message: 'User not found.' });
  if ('error' in result) return res.status(400).json({ message: result.error });
  return res.json({ user: publicUser(result.user), users: publicUsers() });
});

export default router;
