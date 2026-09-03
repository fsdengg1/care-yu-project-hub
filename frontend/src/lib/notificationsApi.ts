import { apiRequest } from './api';
import { NotificationItem } from './types';

export interface EntityNotificationPayload {
  notifications: NotificationItem[];
  pendingCount: number;
  canSend: boolean;
  reminderAfterHours: number;
}

export const NotificationsApi = {
  async forEntity(entityType: string, entityId: string) {
    const result = await apiRequest<EntityNotificationPayload>(
      `/api/notifications/for-entity?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}`
    );
    if (!result.ok) {
      return { notifications: [] as NotificationItem[], pendingCount: 0, canSend: false, reminderAfterHours: 24 };
    }
    return result.data;
  },

  async sendEntityEmail(entityType: string, entityId: string) {
    return apiRequest<{ sent: NotificationItem[] }>('/api/notifications/for-entity/send-email', {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId }),
    });
  },

  async markViewed(entityType: string, entityId: string) {
    return apiRequest<{ changed: number }>('/api/notifications/for-entity/viewed', {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId }),
    });
  },

  async markRead(id: string) {
    return apiRequest<{ notification: NotificationItem }>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  async clearAll() {
    return apiRequest<{ ok: boolean; message: string }>('/api/notifications/clear-all', {
      method: 'DELETE',
    });
  },

  async sendClientEmail(body: {
    entityType: 'LEAD' | 'PROJECT';
    entityId: string;
    subject: string;
    message: string;
    customerEmail?: string;
    type?: NotificationItem['type'];
  }) {
    return apiRequest('/api/notifications/client-email', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
