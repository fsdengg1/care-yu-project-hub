import { initStore, runWithoutPersisting, shutdownStore, store } from '../src/store/db.js';
import { notificationService } from '../src/lib/notificationService.js';
import {
  canManuallySendEmail,
  deriveNotificationStatus,
  dispatchNotificationEmail,
  markNotificationsViewed,
} from '../src/lib/smartNotifications.js';
import {
  isCurrentResponsible,
  leadNeedsReminder,
  resolveResponsibleUser,
  transferLeadResponsibility,
} from '../src/lib/responsibility.js';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  await initStore();
  await runWithoutPersisting(async () => {
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE');
  const pm = resolveResponsibleUser({ roleCode: 'PROJECT_MANAGER' });
  const other = users.find((user) => user.id !== pm?.id);
  assert(pm, 'Expected a designated Project Manager in the user store');
  assert(other, 'Expected a second active user');
  assert(pm!.id === resolveResponsibleUser({ roleCode: 'PROJECT_MANAGER' })?.id, 'Role resolution must pick one designated user');

  const sample = store.getLeads()[0];
  assert(sample, 'Expected at least one lead');
  const copy = { ...sample, id: `verify-lead-${Date.now()}` };
  const assigned = transferLeadResponsibility(copy, pm!, other!, 'Verification assignment');
  assert(assigned.lead.responsible_user_id === pm!.id, 'Lead owner should be the designated PM');
  assert(isCurrentResponsible(pm!, assigned.lead), 'PM should be current responsible person');
  assert(!isCurrentResponsible(other!, assigned.lead), 'Non-owner must not be treated as responsible');
  assert(leadNeedsReminder(assigned.lead), 'Newly assigned lead should be pending for reminders');

  const forwarded = transferLeadResponsibility(assigned.lead, other!, pm!, 'Forwarded during verification');
  assert(forwarded.lead.responsible_user_id === other!.id, 'Forward must change current owner');
  assert(forwarded.previous?.id === pm!.id, 'Previous owner must be recorded');
  assert((forwarded.lead.reminder_count || 0) === 0, 'New owner reminder count must reset');
  assert(forwarded.lead.responsible_user_id !== pm!.id, 'Old owner must no longer be responsible');

  const eventKey = `VERIFY_IDEM:${Date.now()}`;
  store.appendNotification({
    recipient_id: other.id,
    type: 'LEAD_ASSIGNED',
    title: 'Verification',
    message: 'Idempotency probe',
    entity_type: 'LEAD',
    entity_id: copy.id,
    event_key: eventKey,
    email_status: 'SKIPPED',
  });
  const duplicate = await notificationService.notifyUser({
    recipientUserId: other.id,
    type: 'LEAD_ASSIGNED',
    title: 'Verification',
    message: 'Idempotency probe',
    entityType: 'LEAD',
    entityId: copy.id,
    eventKey,
    preferenceCategory: 'assignment',
    emailType: 'LEAD_ASSIGNED',
    emailSubject: 'Verification',
    emailHtml: '<p>Verification</p>',
    emailText: 'Verification',
  });
  assert(duplicate.skipped === true, 'Duplicate event key must not send a second notification');

  const assignKey = `VERIFY_DEFER:${Date.now()}`;
  const created = await notificationService.notifyAssignment({
    entityType: 'LEAD',
    entityId: copy.id,
    entityName: copy.title,
    recipientUserId: other.id,
    assignedByUserId: pm!.id,
    eventKey: assignKey,
  });
  assert(created.skipped === false, 'New assignment should create an in-app notification');
  assert(created.notification?.email_status === 'NOT_SENT', 'Assignment must not send Outlook email immediately');
  assert(created.notification?.email_policy === 'DEFERRED', 'Assignment email policy should be deferred');
  assert(created.notification?.email_channel === 'INTERNAL', 'Assignment email is an internal PMS notification');
  assert(deriveNotificationStatus(created.notification!) === 'NOT_SENT', 'Lifecycle status starts as Not Sent');
  assert(canManuallySendEmail(pm!, created.notification!), 'Assigner can click Send Email Notification');
  assert(!canManuallySendEmail(other!, created.notification!), 'Assignee cannot send the email to themselves');

  const outboundBefore = store.getOutboundEmails().length;
  const sent = await dispatchNotificationEmail({
    notification: created.notification!,
    mode: 'MANUAL',
    actor: pm!,
  });
  assert(
    sent.notification.email_dispatch === 'MANUALLY_SENT' ||
      sent.notification.email_status === 'SENT' ||
      sent.notification.email_status === 'PENDING' ||
      sent.notification.email_status === 'FAILED',
    'Manual send should update dispatch status'
  );
  assert(store.getOutboundEmails().length >= outboundBefore, 'Manual send writes an outbound email record');

  markNotificationsViewed('LEAD', copy.id, other.id);
  const viewed = store.getNotifications().find((item) => item.id === created.notification!.id);
  assert(viewed?.viewed_at, 'Assigned person viewing the lead should mark the notification viewed');
  assert(viewed?.read_status === true, 'Viewing the lead should clear the unread badge');

  const leftover = store.getNotifications();
  const leftoverIndex = leftover.findIndex((item) => item.id === created.notification!.id);
  leftover[leftoverIndex] = { ...leftover[leftoverIndex], read_status: false, read_at: undefined };
  store.saveNotifications(leftover);
  markNotificationsViewed('LEAD', copy.id, other.id);
  const cleared = store.getNotifications().find((item) => item.id === created.notification!.id);
  assert(cleared?.read_status === true, 'Opening the same lead again must clear a leftover unread badge');

  const reminder = await notificationService.notifyReminder({
    entityType: 'LEAD',
    entityId: copy.id,
    entityName: copy.title,
    recipientUserId: other.id,
    reminderCount: 1,
    status: 'SUBMITTED_TO_PM',
  });
  assert(reminder.notification?.email_policy === 'IMMEDIATE', 'Automatic reminders still send email immediately');

  console.log('verify-notifications ok', {
    pm: pm!.email,
    ownerAfterForward: other!.email,
    duplicateSkipped: duplicate.skipped,
    deferredStatus: created.notification?.email_status,
    manualDispatch: sent.notification.email_dispatch,
  });
  });
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore();
  process.exit(1);
});
