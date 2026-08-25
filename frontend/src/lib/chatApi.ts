import { apiRequest } from './api';
import { ChatMessage, ChatMessageType, Conversation, ConversationSummary, ConversationType } from './types';

export type ChatParticipant = {
  user_id: string;
  role: 'ADMIN' | 'MEMBER';
  name?: string;
  role_name?: string;
  team_name?: string;
  is_owner?: boolean;
};

export const ChatApi = {
  async list(type?: ConversationType) {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    const result = await apiRequest<{ conversations: ConversationSummary[]; unread_count: number }>(
      `/api/chat/conversations${query}`
    );
    if (!result.ok) return { conversations: [] as ConversationSummary[], unread_count: 0, message: result.message };
    return result.data;
  },

  async unread() {
    const result = await apiRequest<{ unread_count: number }>('/api/chat/unread');
    if (!result.ok) return 0;
    return result.data.unread_count;
  },

  async employees(q = '') {
    const result = await apiRequest<{
      employees: Array<{ id: string; name: string; email: string; role_name: string; role_code: string; team_name?: string }>;
    }>(`/api/chat/employees${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    if (!result.ok) return [];
    return result.data.employees;
  },

  async get(id: string, type?: ConversationType) {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    return apiRequest<{
      conversation: Conversation;
      messages: ChatMessage[];
      participants: ChatParticipant[];
    }>(`/api/chat/conversations/${id}${query}`);
  },

  async messages(id: string, type?: ConversationType) {
    const query = type ? `?type=${encodeURIComponent(type)}` : '';
    return apiRequest<{ conversation: Conversation; messages: ChatMessage[] }>(
      `/api/chat/conversations/${id}/messages${query}`
    );
  },

  async startDirect(userId: string) {
    return apiRequest<{ conversation: Conversation }>('/api/chat/direct', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  async createGroup(body: { name: string; description?: string; member_ids: string[]; project_id?: string }) {
    return apiRequest<{ conversation: Conversation }>('/api/chat/groups', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async createAnnouncement(body: {
    name?: string;
    message?: string;
    audience?: 'ALL' | 'PROJECT' | 'TEAMS';
    project_id?: string;
    team_ids?: string[];
    message_type?: ChatMessageType;
    link_url?: string;
  }) {
    return apiRequest<{ conversation: Conversation }>('/api/chat/announcements', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateMembers(
    id: string,
    body: { add?: string[]; remove?: string[]; name?: string; description?: string; transfer_to_user_id?: string }
  ) {
    return apiRequest<{ conversation: Conversation }>(`/api/chat/conversations/${id}/members`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async deleteConversation(id: string) {
    return apiRequest<{ conversation: Conversation }>(`/api/chat/conversations/${id}`, { method: 'DELETE' });
  },

  async send(
    id: string,
    body: string | { message?: string; message_type?: ChatMessageType; link_url?: string; attachment_id?: string }
  ) {
    const payload = typeof body === 'string' ? { message: body } : body;
    return apiRequest<{ message: ChatMessage; conversation: Conversation }>(`/api/chat/conversations/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async attach(
    id: string,
    body: {
      file_name: string;
      original_file_name?: string;
      file_type?: string;
      file_size?: string;
      file_url?: string;
      mime_type?: string;
      size_bytes?: number;
      message?: string;
      message_type?: ChatMessageType;
    }
  ) {
    return apiRequest<{ message: ChatMessage; conversation: Conversation }>(`/api/chat/conversations/${id}/attachments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
