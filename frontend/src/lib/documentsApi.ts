import { apiRequest } from './api';
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

  async file(id: string) {
    return apiRequest<{ document: EntityDocument }>(`/api/documents/${id}/file`);
  },

  async remove(id: string) {
    return apiRequest<{ document: EntityDocument }>(`/api/documents/${id}`, { method: 'DELETE' });
  },
};
