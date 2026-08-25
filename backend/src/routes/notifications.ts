import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import { notificationService } from '../lib/notificationService.js';

const router = Router();

function paramId(req: AuthedRequest) {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

router.get('/', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const requestedUserId = typeof req.query.userId === 'string' ? req.query.userId : '';
  if (requestedUserId && requestedUserId !== user.id && user.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. You can only view your own notifications.' });
  }
  const recipientId = user.role_code === 'SYSTEM_ADMIN' && requestedUserId ? requestedUserId : user.id;
  const notifications = store
    .getNotifications()
    .filter((item) => item.recipient_id === recipientId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  return res.json({ notifications, unreadCount: notifications.filter((item) => !item.read_status).length });
});

router.get('/admin/deliveries', requireAuth, (req: AuthedRequest, res) => {
  if (req.user!.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
  }
  const deliveries = store
    .getNotificationDeliveries()
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
    .slice(0, 200);
  const pending = store.getLeads().filter((lead) => lead.pending_action && lead.responsible_user_id);
  return res.json({
    deliveries,
    pendingLeads: pending.map((lead) => ({
      id: lead.id,
      title: lead.title,
      responsible_user_id: lead.responsible_user_id,
      responsible_user_name: lead.responsible_user_name,
      reminder_count: lead.reminder_count || 0,
      escalated_at: lead.escalated_at,
      status: lead.status,
    })),
  });
});

router.get('/:id', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const notification = store.getNotifications().find((item) => item.id === paramId(req));
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  if (notification.recipient_id !== req.user!.id && req.user!.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. You can only view your own notifications.' });
  }
  return res.json({ notification });
});

router.patch('/:id/read', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const notifications = store.getNotifications();
  const index = notifications.findIndex((item) => item.id === paramId(req));
  if (index === -1) return res.status(404).json({ message: 'Notification not found.' });
  if (notifications[index].recipient_id !== req.user!.id && req.user!.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. You can only view your own notifications.' });
  }
  notifications[index] = { ...notifications[index], read_status: true, read_at: new Date().toISOString() };
  store.saveNotifications(notifications);
  return res.json({ notification: notifications[index] });
});

router.post('/:id/retry-email', requireAuth, async (req: AuthedRequest, res) => {
  if (req.user!.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. This action is not permitted for your role.' });
  }
  const result = await notificationService.retryNotificationEmail(paramId(req));
  if ('error' in result) {
    const status = result.error === 'not_found' ? 404 : 400;
    return res.status(status).json({ message: 'Unable to retry this notification email.' });
  }
  return res.json(result);
});

export default router;
