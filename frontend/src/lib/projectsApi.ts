import { apiRequest } from './api';
import { Escalation, Project, ProjectDetailPayload, ProjectStatus, ProjectWorkflowSnapshot } from './types';

export const ProjectsApi = {
  async create(body: Record<string, unknown>) {
    const result = await apiRequest<{ project: Project; workflow?: ProjectWorkflowSnapshot }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    if (result.ok) return { ok: true as const, project: result.data.project, workflow: result.data.workflow };
    return { ok: false as const, message: result.message, status: result.status };
  },
  async list(status: ProjectStatus | 'ALL' = 'ACTIVE') {
    const result = await apiRequest<{ projects: Project[]; summary: { total: number; onTrack: number; atRisk: number; critical: number; needAttention: number } }>(
      `/api/projects?status=${encodeURIComponent(status)}`
    );
    if (!result.ok) return { ok: false as const, message: result.message, projects: [] as Project[], summary: null };
    return { ok: true as const, projects: result.data.projects, summary: result.data.summary };
  },

  async get(id: string) {
    const result = await apiRequest<ProjectDetailPayload>(`/api/projects/${id}`);
    if (!result.ok) return null;
    return result.data;
  },

  async patch(id: string, body: {
    status?: Project['status'];
    progress?: number;
    remarks?: string;
    target_completion?: string;
    current_phase?: string;
    issue?: string | null;
  }) {
    return apiRequest<{ project: Project; detail: ProjectDetailPayload }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async assign(id: string, assigneeId: string | string[]) {
    const assigneeIds = Array.isArray(assigneeId) ? assigneeId : [assigneeId];
    return apiRequest<{ project: Project; detail: ProjectDetailPayload }>(`/api/projects/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assignee_id: assigneeIds[0], assignee_ids: assigneeIds }),
    });
  },

  async pmReview(id: string, action: 'accept' | 'return', comments?: string) {
    return apiRequest<{ project: Project; detail: ProjectDetailPayload }>(`/api/projects/${id}/pm-review`, {
      method: 'POST',
      body: JSON.stringify({ action, comments }),
    });
  },

  async intake(id: string, action: 'accept' | 'return', comments?: string) {
    return apiRequest<{ project: Project; detail: ProjectDetailPayload }>(`/api/projects/${id}/intake`, {
      method: 'POST',
      body: JSON.stringify({ action, comments }),
    });
  },

  async tlReview(id: string, comments?: string) {
    return apiRequest<{ project: Project; detail: ProjectDetailPayload }>(`/api/projects/${id}/tl-review`, {
      method: 'POST',
      body: JSON.stringify({ comments }),
    });
  },

  async monitor(id: string, status: 'ON_TRACK' | 'ISSUE_IDENTIFIED', comments?: string) {
    return apiRequest<{ project: Project; detail: ProjectDetailPayload }>(`/api/projects/${id}/monitor`, {
      method: 'POST',
      body: JSON.stringify({ status, comments }),
    });
  },

  async escalate(id: string, body: { issue?: string; impact?: string; severity?: Escalation['severity'] }) {
    return apiRequest<{ escalation: Escalation }>(`/api/projects/${id}/escalate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
};
