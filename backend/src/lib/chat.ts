import { store } from '../store/db.js';
import { ChatMessage, ChatMessageType, Conversation, ConversationParticipant, ConversationType, User } from '../types.js';
import { newId } from './leadWorkflow.js';
import { addEntityDocument } from './documents.js';
import {
  activeParticipant,
  canAccessConversation,
  canAttachToConversation,
  canCreateAnnouncement,
  canDeleteConversation,
  canManageGroup,
} from './conversationAccess.js';

export { canAccessConversation, canCreateAnnouncement, canManageGroup, canDeleteConversation };

const CHAT_NOTIFICATION_TYPES = new Set(['DIRECT_MESSAGE', 'CHAT_MESSAGE', 'GROUP_MESSAGE', 'ANNOUNCEMENT']);
const MESSAGE_TYPES: ChatMessageType[] = ['TEXT', 'LINK', 'IMAGE', 'DOCUMENT', 'PDF', 'EXCEL', 'WORD', 'POWERPOINT', 'NOTE', 'FILE'];

function previewText(text: string, max = 80) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trimEnd()}...`;
}

export function directPairKey(userA: string, userB: string) {
  return [userA, userB].sort().join(':');
}

export function messageTypeFromFile(fileName: string): ChatMessageType {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'IMAGE';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'EXCEL';
  if (ext === 'ppt' || ext === 'pptx') return 'POWERPOINT';
  if (ext === 'doc' || ext === 'docx') return 'WORD';
  return 'DOCUMENT';
}

function parseMessageType(value: unknown): ChatMessageType | undefined {
  if (typeof value === 'string' && MESSAGE_TYPES.includes(value as ChatMessageType)) return value as ChatMessageType;
  return undefined;
}

function parseLink(url?: string) {
  if (!url?.trim()) return undefined;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function lastPreview(message: ChatMessage) {
  if (message.message_type === 'IMAGE') return message.file_name || 'Image';
  if (message.message_type === 'PDF') return message.file_name || 'PDF';
  if (message.message_type === 'EXCEL') return message.file_name || 'Excel spreadsheet';
  if (message.message_type === 'WORD') return message.file_name || 'Word document';
  if (message.message_type === 'POWERPOINT') return message.file_name || 'PowerPoint';
  if (message.message_type === 'DOCUMENT' || message.message_type === 'FILE') return message.file_name || 'Document';
  if (message.message_type === 'LINK') return message.link_url || message.message || 'Link';
  if (message.message_type === 'NOTE') return `Note: ${message.message}`;
  return message.message;
}

function notificationCopy(user: User, conversation: Conversation, message: ChatMessage) {
  const type = message.message_type || 'TEXT';
  const file = message.file_name || 'a file';
  if (conversation.type === 'ANNOUNCEMENT') {
    if (type === 'EXCEL') return { title: 'New Excel Announcement', message: `${user.name} posted ${file}` };
    if (type === 'PDF') return { title: 'New PDF Announcement', message: `${user.name} posted ${file}` };
    if (type === 'IMAGE') return { title: 'New Image Announcement', message: `${user.name} posted an image` };
    if (type === 'POWERPOINT') return { title: 'New Presentation', message: `${user.name} posted ${file}` };
    if (type === 'WORD' || type === 'DOCUMENT' || type === 'FILE') {
      return { title: 'New Document Announcement', message: `${user.name} posted ${file}` };
    }
    if (type === 'LINK') return { title: 'New Link Announcement', message: `${user.name} posted a link` };
    if (type === 'NOTE') return { title: 'New Note Announcement', message: `${user.name} posted a note` };
    return { title: conversation.name || 'Announcement', message: `${user.name}: ${previewText(message.message)}` };
  }
  const groupPrefix = conversation.type === 'GROUP' ? `${conversation.name || 'Group'} · ` : '';
  if (type === 'EXCEL') return { title: `${groupPrefix}New Excel File`.trim(), message: `${user.name} sent ${file}` };
  if (type === 'PDF') return { title: `${groupPrefix}New PDF`.trim(), message: `${user.name} sent ${file}` };
  if (type === 'IMAGE') return { title: `${groupPrefix}New Image`.trim(), message: `${user.name} sent an image` };
  if (type === 'POWERPOINT') return { title: `${groupPrefix}New Presentation`.trim(), message: `${user.name} sent ${file}` };
  if (type === 'WORD' || type === 'DOCUMENT' || type === 'FILE') {
    return { title: `${groupPrefix}New Document`.trim(), message: `${user.name} sent ${file}` };
  }
  if (type === 'LINK') return { title: `${groupPrefix}New Link`.trim(), message: `${user.name} sent a link` };
  if (type === 'NOTE') return { title: `${groupPrefix}New Note`.trim(), message: `${user.name} sent you a note` };
  if (conversation.type === 'DIRECT') {
    return { title: `New message from ${user.name}`, message: previewText(message.message) };
  }
  return { title: conversation.name || 'New Group Message', message: `${user.name}: ${previewText(message.message)}` };
}

function scopedMessages(conversation: Conversation) {
  return store
    .getChatMessages()
    .filter((item) => item.conversation_id === conversation.id && !item.deleted_at)
    .filter((item) => !item.conversation_type || item.conversation_type === conversation.type);
}

export function backfillCommunicationRecords() {
  const conversations = store.getConversations();
  const participants = store.getConversationParticipants();
  const messages = store.getChatMessages();
  let conversationsChanged = false;
  let messagesChanged = false;

  for (const conversation of conversations) {
    if (conversation.type !== 'DIRECT' || conversation.merged_into) continue;
    const ids = participants
      .filter((item) => item.conversation_id === conversation.id && !item.left_at)
      .map((item) => item.user_id)
      .sort();
    if (ids.length === 2 && conversation.pair_key !== `${ids[0]}:${ids[1]}`) {
      conversation.pair_key = `${ids[0]}:${ids[1]}`;
      conversationsChanged = true;
    }
  }

  const byPair = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    if (conversation.type !== 'DIRECT' || conversation.merged_into || !conversation.pair_key) continue;
    const list = byPair.get(conversation.pair_key) || [];
    list.push(conversation);
    byPair.set(conversation.pair_key, list);
  }
  for (const list of byPair.values()) {
    if (list.length < 2) continue;
    const keep = [...list].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))[0];
    for (const duplicate of list) {
      if (duplicate.id === keep.id) continue;
      duplicate.merged_into = keep.id;
      conversationsChanged = true;
      for (const message of messages) {
        if (message.conversation_id === duplicate.id) {
          message.conversation_id = keep.id;
          message.conversation_type = 'DIRECT';
          messagesChanged = true;
        }
      }
    }
  }

  for (const message of messages) {
    if (message.conversation_type) continue;
    const conversation = conversations.find((item) => item.id === message.conversation_id);
    if (!conversation) continue;
    message.conversation_type = conversation.type;
    messagesChanged = true;
  }

  if (conversationsChanged) store.saveConversations(conversations);
  if (messagesChanged) store.saveChatMessages(messages);
}

function decorateMessage(item: ChatMessage): ChatMessage {
  if (!item.attachment_id || item.file_name) return item;
  const doc = store.getEntityDocuments().find((row) => row.id === item.attachment_id);
  if (!doc) return item;
  return {
    ...item,
    file_name: doc.original_file_name || doc.file_name,
    file_size: doc.file_size,
    mime_type: doc.mime_type,
    message_type: item.message_type === 'FILE' ? messageTypeFromFile(doc.file_name) : item.message_type,
  };
}

function summarize(user: User, item: Conversation) {
  const participants = store.getConversationParticipants();
  const members = participants.filter((row) => row.conversation_id === item.id && !row.left_at);
  const mine = members.find((row) => row.user_id === user.id);
  const others = members.filter((row) => row.user_id !== user.id);
  const thread = scopedMessages(item).sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
  const last = thread[0];
  const unread = thread.filter(
    (row) => row.sender_id !== user.id && (!mine?.last_read_at || row.created_at > mine.last_read_at)
  ).length;
  const other = others[0] ? store.findUserById(others[0].user_id) : undefined;
  return {
    ...item,
    unread_count: unread,
    last_message: last ? lastPreview(last) : undefined,
    last_message_at: last?.created_at,
    last_message_type: last?.message_type,
    member_count: members.length,
    other_user_id: other?.id,
    other_user_name: other?.name || item.name,
    other_user_role: other?.role_name,
    participant_names: members.map((row) => store.findUserById(row.user_id)?.name || 'Member'),
  };
}

export function listConversations(user: User, type?: ConversationType) {
  backfillCommunicationRecords();
  return store
    .getConversations()
    .filter((item) => !item.merged_into && !item.deleted_at)
    .filter((item) => !type || item.type === type)
    .filter((item) => canAccessConversation(user, item))
    .map((item) => summarize(user, item))
    .sort((a, b) => +new Date(b.last_message_at || b.updated_at) - +new Date(a.last_message_at || a.updated_at));
}

export function getConversation(user: User, id: string, expectedType?: ConversationType) {
  backfillCommunicationRecords();
  const conversation = store.getConversations().find((item) => item.id === id);
  if (!conversation || conversation.merged_into || conversation.deleted_at) return { error: 'not_found' as const };
  if (expectedType && conversation.type !== expectedType) return { error: 'forbidden' as const };
  if (!canAccessConversation(user, conversation)) return { error: 'forbidden' as const };
  if (conversation.type === 'ANNOUNCEMENT' && !activeParticipant(conversation.id, user.id)) {
    addParticipant(conversation.id, user.id, 'MEMBER');
  }
  const messages = scopedMessages(conversation)
    .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
    .map(decorateMessage);
  const participants = store
    .getConversationParticipants()
    .filter((item) => item.conversation_id === id && !item.left_at)
    .map((item) => {
      const member = store.findUserById(item.user_id);
      return {
        ...item,
        name: member?.name,
        role_name: member?.role_name,
        team_name: member?.team_name,
        is_owner: conversation.created_by_id === item.user_id,
      };
    });
  markRead(user, id);
  markConversationNotificationsRead(user, id);
  return { conversation, messages, participants };
}

function addParticipant(conversationId: string, userId: string, role: ConversationParticipant['role']) {
  const rows = store.getConversationParticipants();
  const existing = rows.find((item) => item.conversation_id === conversationId && item.user_id === userId);
  if (existing) {
    if (existing.left_at) {
      existing.left_at = undefined;
      existing.role = role;
      existing.joined_at = new Date().toISOString();
      store.saveConversationParticipants(rows);
    }
    return existing;
  }
  const row: ConversationParticipant = {
    id: newId('cpart'),
    conversation_id: conversationId,
    user_id: userId,
    role,
    joined_at: new Date().toISOString(),
  };
  rows.unshift(row);
  store.saveConversationParticipants(rows);
  return row;
}

export function getOrCreateDirect(user: User, otherUserId: string) {
  backfillCommunicationRecords();
  if (otherUserId === user.id) return { error: 'Cannot start a conversation with yourself.' };
  const other = store.findUserById(otherUserId);
  if (!other || other.status !== 'ACTIVE') return { error: 'Employee not found.' };
  const pair_key = directPairKey(user.id, other.id);
  const existing = store
    .getConversations()
    .find((item) => item.type === 'DIRECT' && !item.merged_into && !item.deleted_at && item.pair_key === pair_key);
  if (existing) {
    addParticipant(existing.id, user.id, 'ADMIN');
    addParticipant(existing.id, other.id, 'MEMBER');
    return { conversation: existing };
  }
  const mine = store.getConversationParticipants().filter((item) => item.user_id === user.id && !item.left_at);
  for (const row of mine) {
    const conversation = store
      .getConversations()
      .find((item) => item.id === row.conversation_id && item.type === 'DIRECT' && !item.merged_into && !item.deleted_at);
    if (!conversation) continue;
    const otherPart = store
      .getConversationParticipants()
      .find((item) => item.conversation_id === conversation.id && item.user_id === otherUserId && !item.left_at);
    if (otherPart) {
      conversation.pair_key = pair_key;
      store.saveConversations(store.getConversations().map((item) => (item.id === conversation.id ? conversation : item)));
      return { conversation };
    }
  }
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: newId('conv'),
    type: 'DIRECT',
    pair_key,
    created_by: user.name,
    created_by_id: user.id,
    created_at: now,
    updated_at: now,
  };
  const conversations = store.getConversations();
  conversations.unshift(conversation);
  store.saveConversations(conversations);
  addParticipant(conversation.id, user.id, 'ADMIN');
  addParticipant(conversation.id, other.id, 'MEMBER');
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'CONVERSATION',
    entity_id: conversation.id,
    action: 'CONVERSATION_STARTED',
    description: `${user.name} started a conversation with ${other.name}.`,
  });
  return { conversation };
}

export function createGroup(
  user: User,
  body: { name?: string; description?: string; member_ids?: string[]; project_id?: string }
) {
  const name = body.name?.trim();
  if (!name) return { error: 'Group name is required.' };
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: newId('conv'),
    type: 'GROUP',
    name,
    description: body.description?.trim() || undefined,
    created_by: user.name,
    created_by_id: user.id,
    project_id: body.project_id,
    created_at: now,
    updated_at: now,
  };
  const conversations = store.getConversations();
  conversations.unshift(conversation);
  store.saveConversations(conversations);
  addParticipant(conversation.id, user.id, 'ADMIN');
  for (const memberId of body.member_ids || []) {
    if (memberId !== user.id) addParticipant(conversation.id, memberId, 'MEMBER');
  }
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'CONVERSATION',
    entity_id: conversation.id,
    action: 'GROUP_CREATED',
    description: `${user.name} created group "${name}".`,
  });
  return { conversation };
}

export function createAnnouncement(
  user: User,
  body: {
    name?: string;
    message?: string;
    audience?: 'ALL' | 'PROJECT' | 'TEAMS';
    project_id?: string;
    team_ids?: string[];
    message_type?: ChatMessageType;
    link_url?: string;
    attachment_id?: string;
  }
) {
  if (!canCreateAnnouncement(user)) return { error: 'You do not have permission to create an announcement.', status: 403 as const };
  const audience = body.audience || 'ALL';
  if (audience === 'PROJECT' && !body.project_id) return { error: 'Select a project for this announcement.' };
  if (audience === 'TEAMS' && !(body.team_ids || []).length) return { error: 'Select at least one team.' };
  const hasContent = Boolean(body.message?.trim() || body.attachment_id || body.link_url);
  if (!hasContent) return { error: 'Announcement message is required.' };
  const name = body.name?.trim() || 'Company Announcement';
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: newId('conv'),
    type: 'ANNOUNCEMENT',
    name,
    created_by: user.name,
    created_by_id: user.id,
    audience,
    project_id: body.project_id,
    team_ids: audience === 'TEAMS' ? body.team_ids : undefined,
    created_at: now,
    updated_at: now,
  };
  const conversations = store.getConversations();
  conversations.unshift(conversation);
  store.saveConversations(conversations);
  addParticipant(conversation.id, user.id, 'ADMIN');
  const posted = postMessage(user, conversation.id, {
    message: body.message?.trim(),
    message_type: body.message_type,
    link_url: body.link_url,
    attachment_id: body.attachment_id,
  });
  if ('error' in posted) return posted;
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'ANNOUNCEMENT',
    entity_id: conversation.id,
    action: 'ANNOUNCEMENT_PUBLISHED',
    description: `${user.name} published announcement "${name}".`,
  });
  return { conversation };
}

export function updateGroupMembers(
  user: User,
  conversationId: string,
  body: { add?: string[]; remove?: string[]; name?: string; description?: string; transfer_to_user_id?: string }
) {
  const conversation = store.getConversations().find((item) => item.id === conversationId);
  if (!conversation || conversation.deleted_at) return { error: 'not_found' as const };
  if (conversation.type !== 'GROUP') return { error: 'forbidden' as const };
  if (!canManageGroup(user, conversation)) return { error: 'forbidden' as const };
  if (body.name?.trim()) conversation.name = body.name.trim();
  if (body.description !== undefined) conversation.description = body.description.trim() || undefined;
  conversation.updated_at = new Date().toISOString();
  store.saveConversations(store.getConversations().map((item) => (item.id === conversationId ? conversation : item)));

  if (body.transfer_to_user_id) {
    const nextOwner = activeParticipant(conversationId, body.transfer_to_user_id);
    if (!nextOwner) return { error: 'Transfer target must be a current group member.' };
    const rows = store.getConversationParticipants();
    for (const row of rows) {
      if (row.conversation_id !== conversationId || row.left_at) continue;
      if (row.user_id === body.transfer_to_user_id) row.role = 'ADMIN';
      else if (row.user_id === conversation.created_by_id) row.role = 'MEMBER';
    }
    store.saveConversationParticipants(rows);
    const nextUser = store.findUserById(body.transfer_to_user_id);
    conversation.created_by_id = body.transfer_to_user_id;
    conversation.created_by = nextUser?.name || conversation.created_by;
    store.saveConversations(store.getConversations().map((item) => (item.id === conversationId ? conversation : item)));
  }

  for (const id of body.add || []) addParticipant(conversationId, id, 'MEMBER');
  if (body.remove?.length) {
    if (body.remove.includes(conversation.created_by_id)) {
      return { error: 'Cannot remove the group owner. Transfer ownership first.' };
    }
    const rows = store.getConversationParticipants();
    for (const row of rows) {
      if (row.conversation_id === conversationId && body.remove.includes(row.user_id)) {
        row.left_at = new Date().toISOString();
      }
    }
    store.saveConversationParticipants(rows);
  }
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'CONVERSATION',
    entity_id: conversationId,
    action: 'GROUP_MEMBERS_UPDATED',
    description: `${user.name} updated members of ${conversation.name || 'group'}.`,
  });
  return { conversation };
}

export function deleteConversation(user: User, conversationId: string) {
  const conversation = store.getConversations().find((item) => item.id === conversationId);
  if (!conversation || conversation.deleted_at) return { error: 'not_found' as const };
  if (conversation.type === 'DIRECT') return { error: 'forbidden' as const };
  if (!canDeleteConversation(user, conversation)) return { error: 'forbidden' as const };
  conversation.deleted_at = new Date().toISOString();
  conversation.updated_at = conversation.deleted_at;
  store.saveConversations(store.getConversations().map((item) => (item.id === conversationId ? conversation : item)));
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: conversation.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT' : 'CONVERSATION',
    entity_id: conversationId,
    action: conversation.type === 'ANNOUNCEMENT' ? 'ANNOUNCEMENT_DELETED' : 'GROUP_DELETED',
    description: `${user.name} deleted ${conversation.name || 'a conversation'}.`,
  });
  return { conversation };
}

export type PostMessageBody = {
  message?: string;
  message_type?: ChatMessageType | string;
  attachment_id?: string;
  link_url?: string;
  file_name?: string;
  file_size?: string;
  mime_type?: string;
};

export function postMessage(user: User, conversationId: string, body: PostMessageBody) {
  const conversation = store.getConversations().find((item) => item.id === conversationId);
  if (!conversation || conversation.merged_into || conversation.deleted_at) return { error: 'not_found' as const };
  if (!canAccessConversation(user, conversation)) return { error: 'forbidden' as const };
  if (conversation.type === 'GROUP' && !activeParticipant(conversation.id, user.id)) return { error: 'forbidden' as const };
  if (conversation.type === 'ANNOUNCEMENT' && body.attachment_id && !canAttachToConversation(user, conversation)) {
    return { error: 'forbidden' as const };
  }
  const requestedType = parseMessageType(body.message_type);
  const link = parseLink(body.link_url);
  let messageType: ChatMessageType = requestedType || (body.attachment_id ? 'FILE' : link ? 'LINK' : 'TEXT');
  if (body.attachment_id) {
    const doc = store.getEntityDocuments().find((item) => item.id === body.attachment_id);
    if (!doc || doc.entity_id !== conversationId) return { error: 'Attachment is not linked to this conversation.' };
    messageType = requestedType && requestedType !== 'TEXT' ? requestedType : messageTypeFromFile(doc.file_name);
    body.file_name = body.file_name || doc.original_file_name || doc.file_name;
    body.file_size = body.file_size || doc.file_size;
    body.mime_type = body.mime_type || doc.mime_type;
  }
  if (messageType === 'LINK' && !link) return { error: 'A valid http(s) link is required.' };
  const text = body.message?.trim() || (messageType === 'LINK' ? link : '') || body.file_name || '';
  if (!text && !body.attachment_id && messageType !== 'LINK') return { error: 'Message is required.' };
  const now = new Date().toISOString();
  const message: ChatMessage = {
    id: newId('msg'),
    conversation_id: conversationId,
    conversation_type: conversation.type,
    sender_id: user.id,
    sender_name: user.name,
    message: text || lastPreview({ message: '', message_type: messageType } as ChatMessage),
    message_type: messageType,
    attachment_id: body.attachment_id,
    file_name: body.file_name,
    file_size: body.file_size,
    mime_type: body.mime_type,
    link_url: link,
    created_at: now,
    updated_at: now,
  };
  const messages = store.getChatMessages();
  messages.push(message);
  store.saveChatMessages(messages);
  conversation.updated_at = now;
  store.saveConversations(store.getConversations().map((item) => (item.id === conversationId ? conversation : item)));
  markRead(user, conversationId);

  const recipients = store
    .getConversationParticipants()
    .filter((item) => item.conversation_id === conversationId && item.user_id !== user.id && !item.left_at);
  const notifyList =
    conversation.type === 'ANNOUNCEMENT'
      ? store.getUsers().filter((item) => item.id !== user.id && item.status === 'ACTIVE' && canAccessConversation(item, conversation))
      : recipients.map((item) => store.findUserById(item.user_id)).filter((item): item is User => Boolean(item));
  const copy = notificationCopy(user, conversation, message);
  for (const recipient of notifyList) {
    if (recipient.id === user.id) continue;
    const type =
      conversation.type === 'ANNOUNCEMENT'
        ? 'ANNOUNCEMENT'
        : conversation.type === 'GROUP'
          ? 'GROUP_MESSAGE'
          : 'DIRECT_MESSAGE';
    store.appendNotification({
      recipient_id: recipient.id,
      sender_id: user.id,
      type,
      message_type: message.message_type,
      message_id: message.id,
      title: copy.title,
      message: copy.message,
      entity_type: 'CONVERSATION',
      entity_id: conversation.id,
    });
  }
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'CONVERSATION',
    entity_id: conversation.id,
    action: 'MESSAGE_SENT',
    description: `${user.name} sent a message in ${conversation.name || 'a conversation'}.`,
  });
  return { message: decorateMessage(message), conversation };
}

export function postAttachment(
  user: User,
  conversationId: string,
  body: {
    file_name?: string;
    original_file_name?: string;
    file_type?: string;
    file_size?: string;
    file_url?: string;
    mime_type?: string;
    size_bytes?: number;
    message?: string;
    message_type?: ChatMessageType | string;
  }
) {
  const conversation = store.getConversations().find((item) => item.id === conversationId);
  if (!conversation || conversation.merged_into || conversation.deleted_at) return { error: 'not_found' as const };
  if (!canAttachToConversation(user, conversation)) return { error: 'forbidden' as const, status: 403 as const };
  const uploaded = addEntityDocument(user, {
    file_name: String(body.file_name || ''),
    original_file_name: body.original_file_name,
    file_type: body.file_type,
    file_size: body.file_size,
    file_url: body.file_url,
    mime_type: body.mime_type,
    entity_type: 'CONVERSATION',
    entity_id: conversationId,
    size_bytes: body.size_bytes,
  });
  if ('error' in uploaded) return uploaded;
  return postMessage(user, conversationId, {
    message: body.message,
    attachment_id: uploaded.document.id,
    message_type: body.message_type || messageTypeFromFile(uploaded.document.file_name),
    file_name: uploaded.document.original_file_name || uploaded.document.file_name,
    file_size: uploaded.document.file_size,
    mime_type: uploaded.document.mime_type,
  });
}

export function markRead(user: User, conversationId: string) {
  const rows = store.getConversationParticipants();
  const index = rows.findIndex((item) => item.conversation_id === conversationId && item.user_id === user.id);
  if (index === -1) return;
  rows[index] = { ...rows[index], last_read_at: new Date().toISOString() };
  store.saveConversationParticipants(rows);
}

export function markConversationNotificationsRead(user: User, conversationId: string) {
  const notifications = store.getNotifications();
  let changed = false;
  const now = new Date().toISOString();
  for (let index = 0; index < notifications.length; index += 1) {
    const item = notifications[index];
    if (item.recipient_id !== user.id || item.entity_id !== conversationId) continue;
    if (!CHAT_NOTIFICATION_TYPES.has(item.type) || item.read_status) continue;
    notifications[index] = { ...item, read_status: true, read_at: now };
    changed = true;
  }
  if (changed) store.saveNotifications(notifications);
}

export function deleteMessage(user: User, conversationId: string, messageId: string) {
  const conversation = store.getConversations().find((item) => item.id === conversationId);
  if (!conversation || conversation.deleted_at) return { error: 'not_found' as const };
  if (!canAccessConversation(user, conversation)) return { error: 'forbidden' as const };
  const messages = store.getChatMessages();
  const index = messages.findIndex((item) => item.id === messageId && item.conversation_id === conversationId);
  if (index === -1) return { error: 'not_found' as const };
  if (messages[index].conversation_type && messages[index].conversation_type !== conversation.type) {
    return { error: 'forbidden' as const };
  }
  const me = activeParticipant(conversationId, user.id);
  const canModerate = conversation.type === 'ANNOUNCEMENT' ? canCreateAnnouncement(user) : me?.role === 'ADMIN';
  if (messages[index].sender_id !== user.id && !canModerate) return { error: 'forbidden' as const };
  messages[index] = { ...messages[index], deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  store.saveChatMessages(messages);
  return { message: messages[index] };
}

export function unreadCount(user: User) {
  return listConversations(user).reduce((sum, item) => sum + item.unread_count, 0);
}

export function parseConversationType(value: unknown): ConversationType | undefined {
  if (value === 'DIRECT' || value === 'GROUP' || value === 'ANNOUNCEMENT') return value;
  if (value === 'direct') return 'DIRECT';
  if (value === 'group') return 'GROUP';
  if (value === 'forum' || value === 'announcement') return 'ANNOUNCEMENT';
  return undefined;
}
