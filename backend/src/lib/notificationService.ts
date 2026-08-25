import { env } from '../config/env.js';
import { store } from '../store/db.js';
import {
  EmailDeliveryStatus,
  NotificationDelivery,
  NotificationItem,
  NotificationPreferenceCategory,
  User,
} from '../types.js';
import { sendEmail } from './email.js';
import {
  entityActionUrl,
  userPreferences,
} from './responsibility.js';
import {
  acceptedEmail,
  assignmentEmail,
  digestEmail,
  escalationEmail,
  forwardEmail,
  reminderEmail,
  workflowEmailContent,
} from './workflowEmails.js';

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const CRITICAL_CATEGORIES = new Set<NotificationPreferenceCategory>(['assignment', 'forward', 'approval']);

type NotifyInput = {
  recipientUserId: string;
  type: NotificationItem['type'];
  title: string;
  message: string;
  entityType: string;
  entityId: string;
  senderId?: string;
  actionUrl?: string;
  priority?: NotificationItem['priority'];
  eventKey: string;
  preferenceCategory: NotificationPreferenceCategory;
  emailType: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
};

function findByEventKey(eventKey: string) {
  return store.getNotifications().find((item) => item.event_key === eventKey);
}

function shouldSendInApp(prefs: ReturnType<typeof userPreferences>, category: NotificationPreferenceCategory) {
  if (CRITICAL_CATEGORIES.has(category)) return true;
  return prefs.in_app_enabled !== false && prefs[category] !== false;
}

function shouldSendEmail(prefs: ReturnType<typeof userPreferences>, category: NotificationPreferenceCategory) {
  if (CRITICAL_CATEGORIES.has(category)) return prefs.email_enabled !== false;
  return prefs.email_enabled !== false && prefs[category] !== false;
}

function saveDelivery(entry: NotificationDelivery) {
  const deliveries = store.getNotificationDeliveries();
  const index = deliveries.findIndex((item) => item.id === entry.id);
  if (index === -1) deliveries.unshift(entry);
  else deliveries[index] = entry;
  store.saveNotificationDeliveries(deliveries);
  return entry;
}

async function deliverEmail(params: {
  notification: NotificationItem;
  recipient: User;
  input: NotifyInput;
}): Promise<NotificationItem> {
  const now = new Date().toISOString();
  const delivery: NotificationDelivery = {
    id: newId('ndel'),
    notification_id: params.notification.id,
    event_key: params.input.eventKey,
    recipient_user_id: params.recipient.id,
    recipient_email: params.recipient.email,
    subject: params.input.emailSubject,
    email_type: params.input.emailType,
    status: 'PENDING',
    retry_count: 0,
    created_at: now,
    updated_at: now,
  };
  saveDelivery(delivery);

  try {
    const result = await sendEmail({
      toEmail: params.recipient.email,
      toName: params.recipient.name,
      toUserId: params.recipient.id,
      subject: params.input.emailSubject,
      htmlContent: params.input.emailHtml,
      text: params.input.emailText,
    });
    const status: EmailDeliveryStatus = result.status === 'FAILED' ? 'FAILED' : 'SENT';
    saveDelivery({
      ...delivery,
      status,
      transaction_id: result.transactionId,
      sent_at: status === 'SENT' ? new Date().toISOString() : undefined,
      failure_reason: status === 'FAILED' ? 'Email provider rejected or failed the message.' : undefined,
      updated_at: new Date().toISOString(),
    });
    const notifications = store.getNotifications();
    const index = notifications.findIndex((item) => item.id === params.notification.id);
    if (index !== -1) {
      notifications[index] = {
        ...notifications[index],
        email_status: status,
        email_sent_at: status === 'SENT' ? new Date().toISOString() : undefined,
      };
      store.saveNotifications(notifications);
      return notifications[index];
    }
    return { ...params.notification, email_status: status };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email delivery failed.';
    saveDelivery({
      ...delivery,
      status: 'FAILED',
      failure_reason: message,
      updated_at: new Date().toISOString(),
    });
    const notifications = store.getNotifications();
    const index = notifications.findIndex((item) => item.id === params.notification.id);
    if (index !== -1) {
      notifications[index] = { ...notifications[index], email_status: 'FAILED' };
      store.saveNotifications(notifications);
      return notifications[index];
    }
    return { ...params.notification, email_status: 'FAILED' };
  }
}

export async function notifyUser(input: NotifyInput): Promise<{ notification?: NotificationItem; skipped: boolean }> {
  const existing = findByEventKey(input.eventKey);
  if (existing) {
    return { notification: existing, skipped: true };
  }

  const recipient = store.findUserById(input.recipientUserId);
  if (!recipient || recipient.status !== 'ACTIVE') {
    return { skipped: true };
  }

  const prefs = userPreferences(recipient);
  const actionUrl = input.actionUrl || entityActionUrl(input.entityType, input.entityId);
  let notification: NotificationItem | undefined;

  if (shouldSendInApp(prefs, input.preferenceCategory)) {
    try {
      notification = store.appendNotification({
        recipient_id: recipient.id,
        sender_id: input.senderId,
        type: input.type,
        title: input.title,
        message: input.message,
        entity_type: input.entityType,
        entity_id: input.entityId,
        action_url: actionUrl,
        priority: input.priority || 'HIGH',
        event_key: input.eventKey,
        email_status: 'PENDING',
      });
    } catch (error) {
      console.error('[notifications] in-app create failed', error);
    }
  }

  if (!shouldSendEmail(prefs, input.preferenceCategory)) {
    if (notification) {
      const notifications = store.getNotifications();
      const index = notifications.findIndex((item) => item.id === notification!.id);
      if (index !== -1) {
        notifications[index] = { ...notifications[index], email_status: 'SKIPPED' };
        store.saveNotifications(notifications);
        notification = notifications[index];
      }
    }
    return { notification, skipped: false };
  }

  if (!notification) {
    notification = {
      id: newId('notif'),
      recipient_id: recipient.id,
      sender_id: input.senderId,
      type: input.type,
      title: input.title,
      message: input.message,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action_url: actionUrl,
      priority: input.priority || 'HIGH',
      event_key: input.eventKey,
      email_status: 'PENDING',
      read_status: false,
      created_at: new Date().toISOString(),
    };
  }

  try {
    notification = await deliverEmail({ notification, recipient, input: { ...input, actionUrl } });
  } catch (error) {
    console.error('[notifications] email failed', error);
    if (notification.id.startsWith('notif-') && store.getNotifications().some((item) => item.id === notification!.id)) {
      const notifications = store.getNotifications();
      const index = notifications.findIndex((item) => item.id === notification!.id);
      if (index !== -1) {
        notifications[index] = { ...notifications[index], email_status: 'FAILED' };
        store.saveNotifications(notifications);
        notification = notifications[index];
      }
    }
  }

  return { notification, skipped: false };
}

export async function retryNotificationEmail(notificationId: string) {
  const notification = store.getNotifications().find((item) => item.id === notificationId);
  if (!notification) return { error: 'not_found' as const };
  const recipient = store.findUserById(notification.recipient_id);
  if (!recipient) return { error: 'recipient_missing' as const };

  const deliveries = store.getNotificationDeliveries().filter((item) => item.notification_id === notificationId);
  const latest = deliveries[0];
  if (!latest) return { error: 'no_delivery' as const };

  const branded = workflowEmailContent({
    title: notification.title,
    greeting: `Hello ${recipient.name},`,
    intro: notification.message,
    details: [],
    ctaLabel: 'View Item',
    ctaUrl: `${env.frontendUrl}${notification.action_url || '/notifications'}`,
  });
  const result = await sendEmail({
    toEmail: recipient.email,
    toName: recipient.name,
    toUserId: recipient.id,
    subject: latest.subject,
    htmlContent: branded.html,
    text: branded.text,
  });

  const status: EmailDeliveryStatus = result.status === 'FAILED' ? 'FAILED' : 'SENT';
  saveDelivery({
    ...latest,
    status,
    transaction_id: result.transactionId || latest.transaction_id,
    sent_at: status === 'SENT' ? new Date().toISOString() : latest.sent_at,
    failure_reason: status === 'FAILED' ? 'Retry failed.' : undefined,
    retry_count: (latest.retry_count || 0) + 1,
    updated_at: new Date().toISOString(),
  });

  const notifications = store.getNotifications();
  const index = notifications.findIndex((item) => item.id === notificationId);
  if (index !== -1) {
    notifications[index] = {
      ...notifications[index],
      email_status: status,
      email_sent_at: status === 'SENT' ? new Date().toISOString() : notifications[index].email_sent_at,
    };
    store.saveNotifications(notifications);
  }

  return { notification: index === -1 ? notification : notifications[index], deliveryStatus: status };
}

export async function notifyAssignment(params: {
  entityType: 'LEAD' | 'TASK';
  entityId: string;
  entityName: string;
  recipientUserId: string;
  assignedByUserId: string;
  priority?: string;
  createdOn?: string;
  eventKey?: string;
}) {
  const recipient = store.findUserById(params.recipientUserId);
  const actor = store.findUserById(params.assignedByUserId);
  if (!recipient || !actor) return { skipped: true as const };
  const actionUrl = entityActionUrl(params.entityType, params.entityId);
  const email = assignmentEmail({
    recipientName: recipient.name,
    itemName: params.entityName,
    createdBy: actor.name,
    priority: params.priority,
    createdOn: params.createdOn,
    actionUrl,
    entityLabel: params.entityType === 'TASK' ? 'Task' : 'Lead',
  });
  const entityLabel = params.entityType === 'TASK' ? 'task' : 'lead';
  return notifyUser({
    recipientUserId: recipient.id,
    senderId: actor.id,
    type: params.entityType === 'TASK' ? 'TASK_ASSIGNED' : 'LEAD_ASSIGNED',
    title: params.entityType === 'TASK' ? 'New Task Assigned' : 'New Lead Assigned to You',
    message: `A new ${entityLabel} has been assigned to you by ${actor.name}. ${params.entityType === 'LEAD' ? 'Lead' : 'Task'}: ${params.entityName}. Priority: ${params.priority || 'Medium'}. Please review and take the required action.`,
    entityType: params.entityType,
    entityId: params.entityId,
    actionUrl,
    priority: 'HIGH',
    eventKey: params.eventKey || `${params.entityType}_ASSIGNED:${params.entityId}:${recipient.id}:${params.createdOn || Date.now()}`,
    preferenceCategory: 'assignment',
    emailType: params.entityType === 'TASK' ? 'TASK_ASSIGNED' : 'LEAD_ASSIGNED',
    emailSubject: email.subject,
    emailHtml: email.html,
    emailText: email.text,
  });
}

export async function notifyForward(params: {
  entityType: 'LEAD' | 'TASK';
  entityId: string;
  entityName: string;
  recipientUserId: string;
  assignedByUserId: string;
  previousUserId?: string;
  reason?: string;
  eventKey?: string;
}) {
  const recipient = store.findUserById(params.recipientUserId);
  const actor = store.findUserById(params.assignedByUserId);
  const previous = params.previousUserId ? store.findUserById(params.previousUserId) : undefined;
  if (!recipient || !actor) return { skipped: true as const };
  const actionUrl = entityActionUrl(params.entityType, params.entityId);
  const email = forwardEmail({
    recipientName: recipient.name,
    itemName: params.entityName,
    previousName: previous?.name || actor.name,
    currentName: recipient.name,
    forwardedBy: actor.name,
    reason: params.reason,
    actionUrl,
    entityLabel: params.entityType === 'TASK' ? 'Task' : 'Lead',
  });
  return notifyUser({
    recipientUserId: recipient.id,
    senderId: actor.id,
    type: params.entityType === 'TASK' ? 'TASK_FORWARDED' : 'LEAD_FORWARDED',
    title: params.entityType === 'TASK' ? 'Task Forwarded to You' : 'Lead Forwarded to You',
    message: `${actor.name} has forwarded the ${params.entityType === 'TASK' ? 'task' : 'lead'} "${params.entityName}" to you. Please review and take action.`,
    entityType: params.entityType,
    entityId: params.entityId,
    actionUrl,
    priority: 'HIGH',
    eventKey: params.eventKey || `${params.entityType}_FORWARDED:${params.entityId}:${recipient.id}:${Date.now()}`,
    preferenceCategory: 'forward',
    emailType: params.entityType === 'TASK' ? 'TASK_FORWARDED' : 'LEAD_FORWARDED',
    emailSubject: email.subject,
    emailHtml: email.html,
    emailText: email.text,
  });
}

export async function notifyApproval(params: {
  entityType: 'LEAD' | 'TASK';
  entityId: string;
  entityName: string;
  recipientUserId: string;
  senderUserId: string;
  message: string;
  eventKey?: string;
}) {
  const recipient = store.findUserById(params.recipientUserId);
  const actor = store.findUserById(params.senderUserId);
  if (!recipient) return { skipped: true as const };
  const actionUrl = entityActionUrl(params.entityType, params.entityId);
  const email = acceptedEmail({
    recipientName: recipient.name,
    itemName: params.entityName,
    acceptedBy: actor?.name || 'CareYu',
    actionUrl,
  });
  return notifyUser({
    recipientUserId: recipient.id,
    senderId: actor?.id,
    type: 'APPROVAL_REQUIRED',
    title: 'Approval Required',
    message: params.message,
    entityType: params.entityType,
    entityId: params.entityId,
    actionUrl,
    priority: 'HIGH',
    eventKey: params.eventKey || `APPROVAL:${params.entityType}:${params.entityId}:${recipient.id}`,
    preferenceCategory: 'approval',
    emailType: 'APPROVAL_REQUIRED',
    emailSubject: `Approval Required – ${params.entityName}`,
    emailHtml: email.html,
    emailText: email.text,
  });
}

export async function notifyReminder(params: {
  entityType: 'LEAD' | 'TASK';
  entityId: string;
  entityName: string;
  recipientUserId: string;
  stage?: string;
  assignedOn?: string;
  status?: string;
  reminderCount: number;
}) {
  const recipient = store.findUserById(params.recipientUserId);
  if (!recipient) return { skipped: true as const };
  const actionUrl = entityActionUrl(params.entityType, params.entityId);
  const email = reminderEmail({
    recipientName: recipient.name,
    itemName: params.entityName,
    stage: params.stage,
    assignedOn: params.assignedOn,
    status: params.status,
    actionUrl,
    entityLabel: params.entityType === 'TASK' ? 'Task' : 'Lead',
  });
  return notifyUser({
    recipientUserId: recipient.id,
    type: 'DAILY_REMINDER',
    title: 'Reminder: Action Required',
    message: `This is a reminder that "${params.entityName}" is still pending with you.`,
    entityType: params.entityType,
    entityId: params.entityId,
    actionUrl,
    priority: 'MEDIUM',
    eventKey: `REMINDER:${params.entityType}:${params.entityId}:${recipient.id}:${params.reminderCount}`,
    preferenceCategory: 'reminder',
    emailType: 'DAILY_REMINDER',
    emailSubject: email.subject,
    emailHtml: email.html,
    emailText: email.text,
  });
}

export async function notifyEscalation(params: {
  entityType: 'LEAD' | 'TASK';
  entityId: string;
  entityName: string;
  recipientUserId: string;
  employeeName: string;
  assignedOn?: string;
  stage?: string;
  reminderCount: number;
}) {
  const recipient = store.findUserById(params.recipientUserId);
  if (!recipient) return { skipped: true as const };
  const actionUrl = entityActionUrl(params.entityType, params.entityId);
  const email = escalationEmail({
    recipientName: recipient.name,
    employeeName: params.employeeName,
    itemName: params.entityName,
    assignedOn: params.assignedOn,
    stage: params.stage,
    reminderCount: params.reminderCount,
    actionUrl,
    entityLabel: params.entityType === 'TASK' ? 'Task' : 'Lead',
  });
  return notifyUser({
    recipientUserId: recipient.id,
    type: 'ESCALATION',
    title: 'Escalation Required',
    message: `The following ${params.entityType === 'TASK' ? 'task' : 'lead'} has remained pending with ${params.employeeName}. Reminder count: ${params.reminderCount}.`,
    entityType: params.entityType,
    entityId: params.entityId,
    actionUrl,
    priority: 'CRITICAL',
    eventKey: `ESCALATION:${params.entityType}:${params.entityId}:${recipient.id}`,
    preferenceCategory: 'approval',
    emailType: 'ESCALATION',
    emailSubject: email.subject,
    emailHtml: email.html,
    emailText: email.text,
  });
}

export async function notifyDigest(params: {
  recipientUserId: string;
  newCount: number;
  pendingCount: number;
  overdueCount: number;
  dayKey: string;
}) {
  const recipient = store.findUserById(params.recipientUserId);
  if (!recipient) return { skipped: true as const };
  const email = digestEmail({
    recipientName: recipient.name,
    newCount: params.newCount,
    pendingCount: params.pendingCount,
    overdueCount: params.overdueCount,
  });
  return notifyUser({
    recipientUserId: recipient.id,
    type: 'ACTION_REQUIRED',
    title: 'CareYu Daily Work Summary',
    message: `You have ${params.pendingCount} pending action${params.pendingCount === 1 ? '' : 's'} today.`,
    entityType: 'USER',
    entityId: recipient.id,
    actionUrl: '/dashboard',
    priority: 'MEDIUM',
    eventKey: `DIGEST:${recipient.id}:${params.dayKey}`,
    preferenceCategory: 'reminder',
    emailType: 'DAILY_DIGEST',
    emailSubject: email.subject,
    emailHtml: email.html,
    emailText: email.text,
  });
}

export const notificationService = {
  notifyUser,
  notifyAssignment,
  notifyForward,
  notifyApproval,
  notifyReminder,
  notifyEscalation,
  notifyDigest,
  retryNotificationEmail,
};
