import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';

const router = Router();

router.get('/', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const notifications = store
    .getNotifications()
    .filter((item) => item.recipient_id === user.id)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  res.json({ notifications, unreadCount: notifications.filter((item) => !item.read_status).length });
});

router.patch('/:id/read', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const notifications = store.getNotifications();
  const index = notifications.findIndex((item) => item.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Notification not found.' });
  if (notifications[index].recipient_id !== req.user!.id && req.user!.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
  }
  notifications[index] = { ...notifications[index], read_status: true };
  store.saveNotifications(notifications);
  return res.json({ notification: notifications[index] });
});

export default router;
