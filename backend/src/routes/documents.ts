import express, { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE } from '../config/files.js';
import {
  addEntityDocument,
  canAccessEntity,
  deleteEntityDocument,
  getEntityDocument,
  getEntityDocumentFile,
  listDocuments,
} from '../lib/documents.js';
import { EntityDocument } from '../types.js';

const router = Router();

function paramId(req: AuthedRequest, key = 'id') {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] : value;
}

const ENTITY_TYPES: EntityDocument['entity_type'][] = [
  'LEAD',
  'PROJECT',
  'TASK',
  'ADDITIONAL_INPUT',
  'FEASIBILITY',
  'LIVE_DEMO',
  'CONVERSATION',
  'FORUM_POST',
  'FORUM_COMMENT',
];

function parseEntityType(value: unknown): EntityDocument['entity_type'] | null {
  if (typeof value === 'string' && ENTITY_TYPES.includes(value as EntityDocument['entity_type'])) {
    return value as EntityDocument['entity_type'];
  }
  return null;
}

router.get('/files/config', requireAuth, (_req, res) => {
  res.json({
    MAX_FILE_SIZE,
    ALLOWED_FILE_TYPES,
  });
});

router.get('/documents', requireAuth, (req: AuthedRequest, res) => {
  const entityType = parseEntityType(req.query.entity_type);
  const entityId = String(req.query.entity_id || '');
  if (!entityType || !entityId) {
    return res.status(400).json({ message: 'entity_type and entity_id are required.' });
  }
  const user = req.user!;
  if (!canAccessEntity(user, entityType, entityId)) {
    return res.status(403).json({ message: 'You do not have permission to view this project.' });
  }
  return res.json({ documents: listDocuments(entityType, entityId) });
});

function headerValue(req: AuthedRequest, name: string) {
  const value = req.headers[name];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  try {
    return decodeURIComponent(String(raw));
  } catch {
    return String(raw);
  }
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function typeLabel(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'ppt' || ext === 'pptx') return 'PowerPoint';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'Excel';
  if (ext === 'doc' || ext === 'docx') return 'Word';
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) return 'Image';
  return 'Document';
}

router.post('/documents', requireAuth, (req: AuthedRequest, res) => {
  const entityType = parseEntityType(req.body?.entity_type);
  if (!entityType) return res.status(400).json({ message: 'A valid entity_type is required.' });
  const result = addEntityDocument(req.user!, {
    file_name: String(req.body?.file_name || ''),
    original_file_name: req.body?.original_file_name,
    file_type: req.body?.file_type,
    file_size: req.body?.file_size,
    file_url: req.body?.file_url,
    mime_type: req.body?.mime_type,
    entity_type: entityType,
    entity_id: String(req.body?.entity_id || ''),
    size_bytes: req.body?.size_bytes != null ? Number(req.body.size_bytes) : undefined,
  });
  if ('error' in result) {
    return res.status(result.status || 400).json({ message: result.error });
  }
  return res.status(201).json({ document: result.document });
});

router.post(
  '/documents/binary',
  requireAuth,
  express.raw({ type: 'application/octet-stream', limit: '15mb' }),
  (req: AuthedRequest, res) => {
    const entityType = parseEntityType(headerValue(req, 'x-entity-type'));
    if (!entityType) return res.status(400).json({ message: 'A valid entity_type is required.' });
    const fileName = headerValue(req, 'x-file-name') || 'document';
    const mimeType = headerValue(req, 'x-mime-type') || 'application/octet-stream';
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const result = addEntityDocument(req.user!, {
      file_name: fileName,
      original_file_name: fileName,
      file_type: headerValue(req, 'x-file-type') || typeLabel(fileName),
      file_size: formatSize(buffer.length),
      file_url: `data:${mimeType};base64,${buffer.toString('base64')}`,
      mime_type: mimeType,
      entity_type: entityType,
      entity_id: headerValue(req, 'x-entity-id'),
      size_bytes: buffer.length,
    });
    if ('error' in result) {
      return res.status(result.status || 400).json({ message: result.error });
    }
    return res.status(201).json({ document: result.document });
  }
);

router.get('/documents/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = getEntityDocument(req.user!, paramId(req));
  if (result.error === 'not_found') return res.status(404).json({ message: 'Document not found.' });
  if (result.error === 'forbidden') {
    return res.status(403).json({ message: 'You do not have permission to view this project.' });
  }
  return res.json({ document: result.document });
});

router.get('/documents/:id/file', requireAuth, (req: AuthedRequest, res) => {
  const result = getEntityDocumentFile(req.user!, paramId(req));
  if (result.error === 'not_found') return res.status(404).json({ message: 'Document not found.' });
  if (result.error === 'forbidden') {
    return res.status(403).json({ message: 'You do not have permission to view this project.' });
  }
  return res.json({ document: result.document });
});

router.delete('/documents/:id', requireAuth, (req: AuthedRequest, res) => {
  const result = deleteEntityDocument(req.user!, paramId(req));
  if (result.error === 'not_found') return res.status(404).json({ message: 'Document not found.' });
  if (result.error === 'forbidden') {
    return res.status(403).json({ message: 'You do not have permission to view this project.' });
  }
  return res.json({ document: result.document });
});

export default router;
