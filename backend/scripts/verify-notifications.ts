import { initStore, shutdownStore, store } from '../src/store/db.js';
import { notificationService } from '../src/lib/notificationService.js';
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

  console.log('verify-notifications ok', {
    pm: pm!.email,
    ownerAfterForward: other!.email,
    duplicateSkipped: duplicate.skipped,
  });
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore();
  process.exit(1);
});
