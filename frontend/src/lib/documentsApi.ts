import { apiRequest, API_URL } from './api';
import { StorageService } from './storage';
import { EntityDocument } from './types';

export const DocumentsApi = {
  async list(entityType: EntityDocument['entity_type'], entityId: string) {
    const result = await apiRequest<{ documents: EntityDocument[] }>(
      `/api/documents?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}`
    );
    if (!result.ok) return { ok: false as const, message: result.message, documents: [] as EntityDocument[] };
    return { ok: true as const, documents: result.data.documents };
  },

  async upload(body: {
    file_name: string;
    original_file_name?: string;
    file_type?: string;
    file_size?: string;
    file_url?: string;
    mime_type?: string;
    entity_type: EntityDocument['entity_type'];
    entity_id: string;
    size_bytes?: number;
  }) {
    return apiRequest<{ document: EntityDocument }>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async uploadFile(
    file: File,
    meta: {
      entity_type: EntityDocument['entity_type'];
      entity_id: string;
      file_type?: string;
    }
  ) {
    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('X-File-Name', encodeURIComponent(file.name));
    headers.set('X-Entity-Type', meta.entity_type);
    headers.set('X-Entity-Id', meta.entity_id);
    headers.set('X-File-Size', String(file.size));
    if (file.type) headers.set('X-Mime-Type', file.type);
    if (meta.file_type) headers.set('X-File-Type', encodeURIComponent(meta.file_type));
    const token = StorageService.getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    try {
      const response = await fetch(`${API_URL}/api/documents/binary`, {
        method: 'POST',
        headers,
        body: file,
        credentials: 'same-origin',
        referrerPolicy: 'same-origin',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false as const,
          message: payload.message || 'Unable to upload document.',
        };
      }
      return { ok: true as const, document: payload.document as EntityDocument };
    } catch {
      return { ok: false as const, message: 'Unable to reach the server. Please confirm the backend is running.' };
    }
  },

  async file(id: string) {
    return apiRequest<{ document: EntityDocument }>(`/api/documents/${id}/file`);
  },

  async remove(id: string) {
    return apiRequest<{ document: EntityDocument }>(`/api/documents/${id}`, { method: 'DELETE' });
  },
};
