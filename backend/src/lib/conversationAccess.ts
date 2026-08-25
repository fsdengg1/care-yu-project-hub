import { store } from '../store/db.js';
import { Conversation, ConversationParticipant, User } from '../types.js';
import { hasPermission } from './rbac.js';

const FORUM_ROLES = new Set(['CEO', 'CTO', 'BUSINESS_HEAD', 'SYSTEM_ADMIN']);

export function canCreateAnnouncement(user: User) {
  return hasPermission(user, 'create:announcement') || FORUM_ROLES.has(user.role_code);
}

export function activeParticipant(conversationId: string, userId: string) {
  return store
    .getConversationParticipants()
    .find((item) => item.conversation_id === conversationId && item.user_id === userId && !item.left_at);
}

export function isGroupAdmin(user: User, conversation: Conversation) {
  if (conversation.type !== 'GROUP') return false;
  const me = activeParticipant(conversation.id, user.id);
  return me?.role === 'ADMIN';
}

export function isGroupOwner(user: User, conversation: Conversation) {
  return conversation.type === 'GROUP' && conversation.created_by_id === user.id;
}

export function canManageGroup(user: User, conversation: Conversation) {
  return isGroupOwner(user, conversation) || isGroupAdmin(user, conversation);
}

export function canDeleteConversation(user: User, conversation: Conversation) {
  if (conversation.type === 'GROUP') return canManageGroup(user, conversation);
  if (conversation.type === 'ANNOUNCEMENT') {
    return conversation.created_by_id === user.id || canCreateAnnouncement(user);
  }
  return false;
}

export function canPostToConversation(user: User, conversation: Conversation) {
  if (!canAccessConversation(user, conversation)) return false;
  if (conversation.type === 'ANNOUNCEMENT') {
    return canCreateAnnouncement(user) || conversation.created_by_id === user.id || Boolean(activeParticipant(conversation.id, user.id));
  }
  return true;
}

export function canAttachToConversation(user: User, conversation: Conversation) {
  if (!canAccessConversation(user, conversation)) return false;
  if (conversation.type === 'ANNOUNCEMENT') {
    return canCreateAnnouncement(user) || conversation.created_by_id === user.id;
  }
  return Boolean(activeParticipant(conversation.id, user.id));
}

export function canAccessConversation(user: User, conversation: Conversation) {
  if (conversation.merged_into || conversation.deleted_at) return false;
  if (conversation.type === 'ANNOUNCEMENT') {
    if (conversation.created_by_id === user.id || FORUM_ROLES.has(user.role_code)) return true;
    const audience = conversation.audience || 'ALL';
    if (audience === 'ALL') return true;
    if (audience === 'TEAMS') {
      return Boolean(user.team_id && (conversation.team_ids || []).includes(user.team_id));
    }
    if (audience === 'PROJECT' && conversation.project_id) {
      const project = store.getProjects().find((item) => item.id === conversation.project_id);
      if (!project) return false;
      if (project.pm_id === user.id || project.team_lead_id === user.id) return true;
      return Boolean(user.team_id && (project.team_ids || []).includes(user.team_id));
    }
    return Boolean(activeParticipant(conversation.id, user.id));
  }
  return Boolean(activeParticipant(conversation.id, user.id));
}

export function participantRole(conversationId: string, userId: string): ConversationParticipant['role'] | undefined {
  return activeParticipant(conversationId, userId)?.role;
}
