import { store } from '../store/db.js';
import { Lead, Project, StageTransition, User } from '../types.js';
import { stageCompletedEmail } from './email.js';
import { newId } from './leadWorkflow.js';

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
  const email = stageCompletedEmail({
    to: nextUser,
    projectName: params.projectName,
    stageName: params.stageName,
    completedBy: params.actor.name,
    completedOn,
    nextStage: params.nextStage,
  });
  const notification = store.appendNotification({
    recipient_id: nextUser.id,
    sender_id: params.actor.id,
    type: 'STAGE_COMPLETED',
    title: `${params.stageName} completed – ${params.projectName}`,
    message: `${params.actor.name} completed ${params.stageName}. The project is ready for the next stage.`,
    entity_type: params.project?.id ? 'PROJECT' : 'LEAD',
    entity_id: params.project?.id || params.lead?.id || params.stageId,
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
    status: email.status === 'FAILED' ? 'QUEUED' : 'SENT',
    sent_at: email.status === 'FAILED' ? undefined : new Date().toISOString(),
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
    entity_id: params.project?.id || params.lead?.id || params.stageId,
    entity_name: params.projectName,
    action: 'STAGE_COMPLETED',
    description: `${params.actor.name} completed ${params.stageName}; notified ${nextUser.name}.`,
  });
  return transition;
}

export function findPmUser() {
  return store.getUsers().find((item) => item.role_code === 'PROJECT_MANAGER' && item.status === 'ACTIVE');
}
