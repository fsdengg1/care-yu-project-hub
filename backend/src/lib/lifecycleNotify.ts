import { store } from '../store/db.js';
import { NotificationItem, User } from '../types.js';
import { notifyUser } from './notificationService.js';
import { entityActionUrl } from './responsibility.js';
import { handoverEmail } from './workflowEmails.js';

export type HandoverInput = {
  recipientIds: Array<string | undefined>;
  actor?: User;
  entityType: string;
  entityId: string;
  entityName: string;
  title: string;
  message: string;
  actionRequired: string;
  ctaLabel?: string;
  actionUrl?: string;
  type: NotificationItem['type'];
  customer?: string;
  status?: string;
  previousStatus?: string;
  dueDate?: string;
  comments?: string;
  assignedBy?: string;
  details?: Array<[string, string]>;
  priority?: NotificationItem['priority'];
  eventKey: string;
  preferenceCategory?: 'assignment' | 'forward' | 'approval' | 'reminder';
};

function uniqueIds(ids: Array<string | undefined>, skipId?: string) {
  return [...new Set(ids.filter((id): id is string => Boolean(id && id !== skipId)))];
}

export function dispatchHandover(input: HandoverInput) {
  void dispatchHandoverAsync(input);
}

export async function dispatchHandoverAsync(input: HandoverInput) {
  const recipients = uniqueIds(input.recipientIds, input.actor?.id);
  const actionUrl = input.actionUrl || entityActionUrl(input.entityType, input.entityId);
  for (const recipientId of recipients) {
    const recipient = store.findUserById(recipientId);
    if (!recipient || recipient.status !== 'ACTIVE') continue;
    const details: Array<[string, string]> = [
      ['Item', input.entityName],
      ['Customer', input.customer || ''],
      ['Submitted / assigned by', input.assignedBy || input.actor?.name || ''],
      ['Current status', input.status || ''],
      ['Previous status', input.previousStatus || ''],
      ['Due date', input.dueDate || ''],
      ['Comments', input.comments || ''],
      ...(input.details || []),
    ];
    const email = handoverEmail({
      recipientName: recipient.name,
      subject: input.title,
      title: input.title,
      intro: input.message,
      actionRequired: input.actionRequired,
      ctaLabel: input.ctaLabel || 'Open',
      actionUrl,
      details,
    });
    await notifyUser({
      recipientUserId: recipient.id,
      senderId: input.actor?.id,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      actionUrl,
      priority: input.priority || 'HIGH',
      eventKey: `${input.eventKey}:${recipient.id}`,
      preferenceCategory: input.preferenceCategory || 'approval',
      emailType: input.type,
      emailSubject: email.subject,
      emailHtml: email.html,
      emailText: email.text,
    });
  }
}

export function usersWithRole(...roleCodes: string[]): User[] {
  return store.getUsers().filter((user) => user.status === 'ACTIVE' && roleCodes.includes(user.role_code));
}

export function procurementUsers(): User[] {
  return store.getUsers().filter((user) => {
    if (user.status !== 'ACTIVE') return false;
    if (user.role_code === 'PROCUREMENT') return true;
    const hay = `${user.team_name || ''} ${user.role_name || ''}`.toLowerCase();
    return hay.includes('procurement') || hay.includes('costing');
  });
}
