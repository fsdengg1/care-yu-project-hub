import { store } from '../store/db.js';
import { Lead, Project, StageTransition, User } from '../types.js';
import { newId } from './leadWorkflow.js';
import { entityActionUrl } from './responsibility.js';
import { reminderDueAt } from './smartNotifications.js';
import { stageReadyEmail } from './workflowEmails.js';

function alreadySent(stageId: string, toUserId: string) {
  return store
    .getStageTransitions()
    .some((item) => item.stage_id === stageId && item.to_user_id === toUserId && item.to_status === 'COMPLETED');
}

export function notifyStageCompleted(params: {
  actor: User;
  stageName: string;
  stageId: string;
  projectName: string;
  lead?: Lead;
  project?: Project;
  nextUser?: User;
  nextStage?: string;
}) {
  const nextUser = params.nextUser;
  if (!nextUser || nextUser.id === params.actor.id) return null;
  if (alreadySent(params.stageId, nextUser.id)) return null;

  const completedOn = new Date().toLocaleString('en-IN', { dateStyle: 'medium' });
  const entityType = params.project?.id ? 'PROJECT' : 'LEAD';
  const entityId = params.project?.id || params.lead?.id || params.stageId;
  const actionUrl = entityActionUrl(entityType, entityId);
  const email = stageReadyEmail({
    recipientName: nextUser.name,
    projectName: params.projectName,
    stageName: params.stageName,
    completedBy: params.actor.name,
    completedOn,
    nextStage: params.nextStage,
    actionUrl,
  });
  const notification = store.appendNotification({
    recipient_id: nextUser.id,
    sender_id: params.actor.id,
    type: 'STAGE_COMPLETED',
    title: `${params.stageName} completed – ${params.projectName}`,
    message: `${params.actor.name} completed ${params.stageName}. The project is ready for the next stage.`,
    entity_type: entityType,
    entity_id: entityId,
    action_url: actionUrl,
    event_key: `STAGE_COMPLETED:${params.stageId}:${nextUser.id}`,
    email_status: 'NOT_SENT',
    email_channel: 'INTERNAL',
    email_policy: 'DEFERRED',
    email_dispatch: 'NOT_SENT',
    notification_status: 'NOT_SENT',
    reminder_due_at: reminderDueAt(),
    stage_name: params.stageName,
    email_payload: {
      subject: email.subject,
      html: email.html,
      text: email.text,
      type: 'STAGE_COMPLETED',
    },
    notification_history: [
      {
        status: 'NOT_SENT',
        reason: `${params.stageName} completed. Email was not sent automatically.`,
        actor_id: params.actor.id,
        actor_name: params.actor.name,
        created_at: new Date().toISOString(),
      },
    ],
  });
  const transition: StageTransition = {
    id: newId('stg'),
    project_id: params.project?.id,
    lead_id: params.lead?.id,
    stage_id: params.stageId,
    stage_name: params.stageName,
    from_status: 'IN_PROGRESS',
    to_status: 'COMPLETED',
    from_user_id: params.actor.id,
    from_user_name: params.actor.name,
    to_user_id: nextUser.id,
    to_user_name: nextUser.name,
    notification_id: notification.id,
    notification_type: 'STAGE_COMPLETED',
    status: 'QUEUED',
    created_at: new Date().toISOString(),
  };
  const rows = store.getStageTransitions();
  rows.unshift(transition);
  store.saveStageTransitions(rows);
  store.appendAudit({
    user_id: params.actor.id,
    user_name: params.actor.name,
    user_role: params.actor.role_name,
    entity_type: 'PROJECT',
    entity_id: entityId,
    entity_name: params.projectName,
    action: 'STAGE_COMPLETED',
    description: `${params.actor.name} completed ${params.stageName}; ${nextUser.name} can see it on their dashboard. Email was not sent automatically.`,
  });
  return transition;
}

export function findPmUser() {
  return store.getUsers().find((item) => item.role_code === 'PROJECT_MANAGER' && item.status === 'ACTIVE');
}
