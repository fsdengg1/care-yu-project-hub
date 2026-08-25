import { apiRequest } from './api';
import {
  EntityDocument,
  ForumCategory,
  ForumCommentView,
  ForumPostDetail,
  ForumPostSummary,
  ForumReactionKind,
  ForumThreadKind,
  ForumLiveMessage,
  PresenceUser,
} from './types';

export const ForumApi = {
  async list(query?: { q?: string; category?: string; tag?: string }) {
    const params = new URLSearchParams();
    if (query?.q) params.set('q', query.q);
    if (query?.category) params.set('category', query.category);
    if (query?.tag) params.set('tag', query.tag);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const result = await apiRequest<{ posts: ForumPostSummary[]; tags: string[] }>(`/api/forum/posts${suffix}`);
    if (!result.ok) return { ok: false as const, message: result.message, posts: [] as ForumPostSummary[], tags: [] as string[] };
    return { ok: true as const, posts: result.data.posts, tags: result.data.tags };
  },

  async get(id: string) {
    return apiRequest<{ post: ForumPostDetail; comments: ForumCommentView[] }>(`/api/forum/posts/${id}`);
  },

  async create(body: { title: string; body: string; category: ForumCategory; tags?: string[]; thread_kind?: ForumThreadKind }) {
    return apiRequest<{ post: ForumPostSummary }>('/api/forum/posts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async update(
    id: string,
    body: {
      title?: string;
      body?: string;
      category?: ForumCategory;
      tags?: string[];
      thread_kind?: ForumThreadKind;
      pinned?: boolean;
      locked?: boolean;
    }
  ) {
    return apiRequest<{ post: ForumPostSummary }>(`/api/forum/posts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async remove(id: string) {
    return apiRequest<{ post: ForumPostSummary }>(`/api/forum/posts/${id}`, { method: 'DELETE' });
  },

  async addComment(postId: string, body: { body: string; parent_id?: string }) {
    return apiRequest<{ comment: ForumCommentView }>(`/api/forum/posts/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateComment(id: string, body: string) {
    return apiRequest<{ comment: ForumCommentView }>(`/api/forum/comments/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ body }),
    });
  },

  async removeComment(id: string) {
    return apiRequest<{ comment: ForumCommentView }>(`/api/forum/comments/${id}`, { method: 'DELETE' });
  },

  async reactPost(id: string, kind: ForumReactionKind) {
    return apiRequest<{ removed: boolean; reaction_counts: Partial<Record<ForumReactionKind, number>>; my_reactions: ForumReactionKind[] }>(
      `/api/forum/posts/${id}/reactions`,
      { method: 'POST', body: JSON.stringify({ kind }) }
    );
  },

  async reactComment(id: string, kind: ForumReactionKind) {
    return apiRequest<{ removed: boolean; reaction_counts: Partial<Record<ForumReactionKind, number>>; my_reactions: ForumReactionKind[] }>(
      `/api/forum/comments/${id}/reactions`,
      { method: 'POST', body: JSON.stringify({ kind }) }
    );
  },

  async attach(target: 'posts' | 'comments', id: string, body: {
    file_name: string;
    original_file_name?: string;
    file_type?: string;
    file_size?: string;
    file_url?: string;
    mime_type?: string;
    size_bytes?: number;
  }) {
    return apiRequest<{ document: EntityDocument }>(`/api/forum/${target}/${id}/attachments`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async heartbeat() {
    return apiRequest<{ active_count: number; total_users: number; users: PresenceUser[] }>('/api/forum/presence', {
      method: 'POST',
    });
  },

  async presence() {
    return apiRequest<{ active_count: number; total_users: number; users: PresenceUser[] }>('/api/forum/presence');
  },

  async live() {
    return apiRequest<{
      messages: ForumLiveMessage[];
      presence: { active_count: number; total_users: number; users: PresenceUser[] };
    }>('/api/forum/live');
  },

  async sendLive(message: string) {
    return apiRequest<{
      message: ForumLiveMessage;
      presence: { active_count: number; total_users: number; users: PresenceUser[] };
    }>('/api/forum/live', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
};
