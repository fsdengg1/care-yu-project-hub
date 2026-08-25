import { apiRequest } from './api';
import { User } from './types';

const PENDING_ACCOUNT_STATUSES = new Set([
  'INVITED',
  'INVITATION_VERIFIED',
  'PASSWORD_SETUP_REQUIRED',
  'INVITATION_EXPIRED',
]);

const ACCOUNT_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  INVITED: 'Pending invitation',
  INVITATION_VERIFIED: 'Password setup',
  PASSWORD_SETUP_REQUIRED: 'Password setup',
  DISABLED: 'Inactive',
  INVITATION_EXPIRED: 'Invitation expired',
};

export function directoryStatus(user: User) {
  if (user.status === 'INACTIVE' || user.account_status === 'DISABLED') {
    return { key: 'INACTIVE', label: 'Inactive', pending: false };
  }
  const key = user.account_status || 'ACTIVE';
  return {
    key,
    label: ACCOUNT_STATUS_LABELS[key] || 'Active',
    pending: PENDING_ACCOUNT_STATUSES.has(key),
  };
}

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
