import { store } from '../store/db.js';
import { EntityDocument, User } from '../types.js';
import { fileTypeError, isAllowedFileType, isAllowedMimeType, MAX_FILE_SIZE } from '../config/files.js';
import { canAccessConversation, canAttachToConversation } from './conversationAccess.js';
import { canViewProject } from './dailyUpdates.js';
import { newId } from './leadWorkflow.js';

export function validateUpload(fileName: string, sizeBytes?: number, mimeType?: string) {
  if (!isAllowedFileType(fileName) || !isAllowedMimeType(fileName, mimeType)) return fileTypeError();
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_FILE_SIZE) return fileTypeError();
  return null;
}

export function canAccessEntity(user: User, entityType: EntityDocument['entity_type'], entityId: string) {
  if (user.role_code === 'SYSTEM_ADMIN' && entityType !== 'CONVERSATION') return true;
  if (entityType === 'LEAD' || entityType === 'ADDITIONAL_INPUT') {
    const lead = store.getLeads().find((item) => item.id === entityId);
    if (!lead) return false;
    if (['CEO', 'CTO', 'PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code)) return true;
    return (
      lead.created_by_id === user.id ||
      lead.sales_owner_id === user.id ||
      lead.assigned_team_lead_id === user.id ||
      lead.assigned_member_id === user.id ||
      lead.responsible_user_id === user.id ||
      lead.pm_id === user.id ||
      Boolean(user.team_id && user.team_id === lead.assigned_team_id)
    );
  }
  if (entityType === 'PROJECT') {
    const project = store.getProjects().find((item) => item.id === entityId);
    return Boolean(project && canViewProject(user, project));
  }
  if (entityType === 'TASK') {
    const task = store.getTasks().find((item) => item.id === entityId);
    if (!task) return false;
    if (task.assigned_to_id === user.id || task.created_by_id === user.id) return true;
    if (task.project_id) {
      const project = store.getProjects().find((item) => item.id === task.project_id);
      return Boolean(project && canViewProject(user, project));
    }
    return ['CEO', 'CTO', 'PROJECT_MANAGER', 'BUSINESS_HEAD', 'SYSTEM_ADMIN'].includes(user.role_code);
  }
  if (entityType === 'CONVERSATION') {
    const conversation = store.getConversations().find((item) => item.id === entityId);
    if (!conversation) return false;
    return canAccessConversation(user, conversation);
  }
  if (entityType === 'FORUM_POST') {
    return store.getForumPosts().some((item) => item.id === entityId && !item.deleted_at);
  }
  if (entityType === 'FORUM_COMMENT') {
    return store.getForumComments().some((item) => item.id === entityId && !item.deleted_at);
  }
  return false;
}

export function publicDocument(doc: EntityDocument): Omit<EntityDocument, 'file_url'> & { file_url?: undefined } {
  const { file_url: _fileUrl, ...rest } = doc;
  return rest;
}

export function listDocuments(entityType: EntityDocument['entity_type'], entityId: string) {
  return store
    .getEntityDocuments()
    .filter((item) => item.entity_type === entityType && item.entity_id === entityId)
    .map(publicDocument);
}

export function addEntityDocument(
  user: User,
  body: {
    file_name: string;
    original_file_name?: string;
    file_type?: string;
    file_size?: string;
    file_url?: string;
    mime_type?: string;
    entity_type: EntityDocument['entity_type'];
    entity_id: string;
    size_bytes?: number;
  }
) {
  const error = validateUpload(body.file_name, body.size_bytes, body.mime_type);
  if (error) return { error };
  if (!body.entity_id) return { error: 'Document must be linked to a business entity.' };
  if (!canAccessEntity(user, body.entity_type, body.entity_id)) {
    return { error: 'You do not have permission to upload a document to this record.', status: 403 as const };
  }
  if (body.entity_type === 'CONVERSATION') {
    const conversation = store.getConversations().find((item) => item.id === body.entity_id);
    if (!conversation || !canAttachToConversation(user, conversation)) {
      return { error: 'You do not have permission to upload a document to this record.', status: 403 as const };
    }
  }
  const now = new Date().toISOString();
  const doc: EntityDocument = {
    id: newId('edoc'),
    file_name: body.file_name,
    original_file_name: body.original_file_name || body.file_name,
    file_type: body.file_type || 'Document',
    file_size: body.file_size || '—',
    file_url: body.file_url,
    mime_type: body.mime_type,
    uploaded_by: user.name,
    uploaded_by_id: user.id,
    uploaded_at: now,
    entity_type: body.entity_type,
    entity_id: body.entity_id,
    created_at: now,
    updated_at: now,
  };
  const docs = store.getEntityDocuments();
  docs.unshift(doc);
  store.saveEntityDocuments(docs);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'DOCUMENT',
    entity_id: doc.id,
    entity_name: doc.file_name,
    action: 'DOCUMENT_UPLOADED',
    description: `${user.name} uploaded ${doc.file_name} to ${body.entity_type} ${body.entity_id}.`,
  });
  return { document: publicDocument(doc) };
}

export function getEntityDocument(user: User, id: string) {
  const doc = store.getEntityDocuments().find((item) => item.id === id);
  if (!doc) return { error: 'not_found' as const };
  if (!canAccessEntity(user, doc.entity_type, doc.entity_id)) return { error: 'forbidden' as const };
  return { document: publicDocument(doc) };
}

export function getEntityDocumentFile(user: User, id: string) {
  const doc = store.getEntityDocuments().find((item) => item.id === id);
  if (!doc) return { error: 'not_found' as const };
  if (!canAccessEntity(user, doc.entity_type, doc.entity_id)) return { error: 'forbidden' as const };
  return { document: doc };
}

export function deleteEntityDocument(user: User, id: string) {
  const docs = store.getEntityDocuments();
  const index = docs.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const };
  const doc = docs[index];
  if (!canAccessEntity(user, doc.entity_type, doc.entity_id)) return { error: 'forbidden' as const };
  if (doc.uploaded_by_id !== user.id && !['PROJECT_MANAGER', 'SYSTEM_ADMIN', 'CEO'].includes(user.role_code)) {
    return { error: 'forbidden' as const };
  }
  docs.splice(index, 1);
  store.saveEntityDocuments(docs);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'DOCUMENT',
    entity_id: doc.id,
    entity_name: doc.file_name,
    action: 'DOCUMENT_DELETED',
    description: `${user.name} deleted ${doc.file_name}.`,
  });
  return { document: doc };
}
