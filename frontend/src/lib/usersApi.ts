import { apiRequest } from './api';
import { User } from './types';

export interface UserPayload {
  name?: string;
  email?: string;
  phone?: string;
  employee_id?: string;
  role_id?: string;
  team_id?: string | null;
  reporting_manager_id?: string | null;
  status?: User['status'];
}

export const UsersApi = {
  async list() {
    const result = await apiRequest<{ users: User[] }>('/api/users');
    if (!result.ok) return { ok: false as const, message: result.message, users: [] as User[] };
    return { ok: true as const, users: result.data.users };
  },

  async create(body: UserPayload) {
    return apiRequest<{ user: User; users: User[] }>('/api/users', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async update(id: string, body: UserPayload) {
    return apiRequest<{ user: User; users: User[] }>(`/api/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async remove(id: string) {
    return apiRequest<{ user: User; users: User[] }>(`/api/users/${id}`, {
      method: 'DELETE',
    });
  },

  async updateNotificationPreferences(body: NonNullable<User['notification_preferences']>) {
    return apiRequest<{ user: User }>('/api/users/me/notification-preferences', {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
};
