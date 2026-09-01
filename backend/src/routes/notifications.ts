import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import { env } from '../config/env.js';
import { notificationService } from '../lib/notificationService.js';
import {
  canManuallySendEmail,
  dispatchNotificationEmail,
  deriveNotificationStatus,
  isClientNotification,
  markAllNotificationsRead,
  markNotificationsViewed,
  notificationsForEntity,
  pendingInternalEmails,
  publicNotificationView,
} from '../lib/smartNotifications.js';

const router = Router();

function paramId(req: AuthedRequest) {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function queryString(req: AuthedRequest, key: string) {
  const value = req.query[key];
  return typeof value === 'string' ? value : '';
}

router.get('/', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const requestedUserId = queryString(req, 'userId');
  if (requestedUserId && requestedUserId !== user.id && user.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. You can only view your own notifications.' });
  }
  const recipientId = user.role_code === 'SYSTEM_ADMIN' && requestedUserId ? requestedUserId : user.id;
  const channel = queryString(req, 'channel').toUpperCase();
  let notifications = store
    .getNotifications()
    .filter((item) => item.recipient_id === recipientId)
    .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  if (channel === 'CLIENT') {
    notifications = notifications.filter(isClientNotification);
  } else if (channel === 'INTERNAL') {
    notifications = notifications.filter((item) => !isClientNotification(item));
  }
  return res.json({
    notifications: notifications.map((item) => ({ ...item, notification_status: deriveNotificationStatus(item) })),
    unreadCount: notifications.filter((item) => !item.read_status).length,
    reminderAfterHours: env.reminderAfterHours,
  });
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
  const outbound = store.getOutboundEmails().slice(0, 100);
  return res.json({
    deliveries,
    outboundEmails: outbound,
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

router.get('/for-entity', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const entityType = queryString(req, 'entityType');
  const entityId = queryString(req, 'entityId');
  if (!entityType || !entityId) {
    return res.status(400).json({ message: 'entityType and entityId are required.' });
  }
  const items = notificationsForEntity(entityType, entityId);
  const pending = pendingInternalEmails(entityType, entityId);
  const canSend = pending.some((item) => canManuallySendEmail(req.user!, item));
  return res.json({
    notifications: items.map((item) => publicNotificationView(item, req.user)),
    pendingCount: pending.length,
    canSend,
    reminderAfterHours: env.reminderAfterHours,
  });
});

router.post('/for-entity/send-email', requireAuth, async (req: AuthedRequest, res) => {
  const entityType = String(req.body?.entityType || '');
  const entityId = String(req.body?.entityId || '');
  if (!entityType || !entityId) {
    return res.status(400).json({ message: 'entityType and entityId are required.' });
  }
  const pending = pendingInternalEmails(entityType, entityId).filter((item) => canManuallySendEmail(req.user!, item));
  if (!pending.length) {
    return res.status(400).json({ message: 'There is no pending internal email notification to send.' });
  }
  const sent = [];
  for (const item of pending) {
    sent.push(await dispatchNotificationEmail({ notification: item, mode: 'MANUAL', actor: req.user }));
  }
  return res.json({
    sent: sent.map((row) => publicNotificationView(row.notification, req.user)),
    reminderAfterHours: env.reminderAfterHours,
  });
});

router.post('/for-entity/viewed', requireAuth, (req: AuthedRequest, res) => {
  const entityType = String(req.body?.entityType || '');
  const entityId = String(req.body?.entityId || '');
  if (!entityType || !entityId) {
    return res.status(400).json({ message: 'entityType and entityId are required.' });
  }
  const changed = markNotificationsViewed(entityType, entityId, req.user!.id);
  return res.json({ changed });
});

router.post('/client-email', requireAuth, async (req: AuthedRequest, res) => {
  const entityType = String(req.body?.entityType || 'LEAD') as 'LEAD' | 'PROJECT';
  const entityId = String(req.body?.entityId || '');
  const subject = String(req.body?.subject || '').trim();
  const intro = String(req.body?.message || req.body?.intro || '').trim();
  if (!entityId || !subject || !intro) {
    return res.status(400).json({ message: 'entityId, subject, and message are required.' });
  }
  const lead = entityType === 'LEAD' ? store.getLeads().find((item) => item.id === entityId) : undefined;
  const project = entityType === 'PROJECT' ? store.getProjects().find((item) => item.id === entityId) : undefined;
  const customerEmail = String(req.body?.customerEmail || lead?.customer_email || '').trim();
  const customerName = String(req.body?.customerName || lead?.customer_name || project?.customer_name || '').trim();
  if (!customerEmail) {
    return res.status(400).json({ message: 'A customer email address is required.' });
  }
  const result = await notificationService.notifyClientEmail({
    actor: req.user!,
    entityType,
    entityId,
    entityName: lead?.title || project?.name || entityId,
    customerName: customerName || customerEmail,
    customerEmail,
    customerContact: lead?.customer_contact,
    type: (req.body?.type as 'CLIENT_LEAD_EMAIL' | 'CLIENT_PROJECT_UPDATE' | 'CLIENT_COMMUNICATION' | 'CLIENT_PROPOSAL') || 'CLIENT_COMMUNICATION',
    subject,
    intro,
    eventKey: `CLIENT_MANUAL:${entityType}:${entityId}:${Date.now()}`,
  });
  if ('error' in result && result.error) {
    return res.status(400).json({ message: 'Unable to send this customer email.' });
  }
  return res.json(result);
});

router.patch('/read-all', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const changed = markAllNotificationsRead(req.user!.id);
  return res.json({ changed });
});

router.get('/:id', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const notification = store.getNotifications().find((item) => item.id === paramId(req));
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  if (notification.recipient_id !== req.user!.id && req.user!.role_code !== 'SYSTEM_ADMIN' && notification.sender_id !== req.user!.id) {
    return res.status(403).json({ message: 'Forbidden. You can only view your own notifications.' });
  }
  return res.json({ notification: publicNotificationView(notification, req.user) });
});

router.patch('/:id/read', requireAuth, requirePermission('view:notifications'), (req: AuthedRequest, res) => {
  const notifications = store.getNotifications();
  const index = notifications.findIndex((item) => item.id === paramId(req));
  if (index === -1) return res.status(404).json({ message: 'Notification not found.' });
  if (notifications[index].recipient_id !== req.user!.id && req.user!.role_code !== 'SYSTEM_ADMIN') {
    return res.status(403).json({ message: 'Forbidden. You can only view your own notifications.' });
  }
  notifications[index] = { ...notifications[index], read_status: true, read_at: new Date().toISOString() };
  if (!notifications[index].viewed_at && notifications[index].recipient_id === req.user!.id) {
    notifications[index].viewed_at = notifications[index].read_at;
    if (notifications[index].notification_status === 'NOT_SENT' || notifications[index].notification_status === 'MANUALLY_SENT' || notifications[index].notification_status === 'AUTOMATICALLY_SENT') {
      notifications[index].notification_status = 'VIEWED';
    }
  }
  store.saveNotifications(notifications);
  return res.json({ notification: notifications[index] });
});

router.post('/:id/send-email', requireAuth, async (req: AuthedRequest, res) => {
  const notification = store.getNotifications().find((item) => item.id === paramId(req));
  if (!notification) return res.status(404).json({ message: 'Notification not found.' });
  if (!canManuallySendEmail(req.user!, notification)) {
    return res.status(403).json({ message: 'You cannot send this email notification.' });
  }
  const result = await dispatchNotificationEmail({ notification, mode: 'MANUAL', actor: req.user });
  if (result.error === 'already_sent') {
    return res.status(400).json({ message: 'This email notification has already been sent.' });
  }
  if (result.error) {
    return res.status(400).json({ message: 'Unable to send this email notification.' });
  }
  return res.json({ notification: publicNotificationView(result.notification, req.user) });
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
