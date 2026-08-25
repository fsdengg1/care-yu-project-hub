import { apiRequest } from './api';
import {
  DailyUpdate,
  DailyUpdateSummary,
  DailyWorkStatus,
  Project,
  ProjectActivityItem,
  WorkAssignment,
} from './types';

export interface DailyUpdatePayload {
  assignment_id: string;
  work_date?: string;
  work_completed?: string;
  progress_percent?: number;
  hours_worked?: number;
  work_status?: DailyWorkStatus;
  blocker?: string;
  dependency?: string;
  support_required?: string;
  next_plan?: string;
  attachments?: string[];
  submission_status?: 'DRAFT' | 'SUBMITTED';
}

async function call<T>(path: string, options?: RequestInit) {
  return apiRequest<T>(path, options);
}

export const DailyUpdatesApi = {
  async assignments(mine = false) {
    const result = await call<{ assignments: WorkAssignment[] }>(
      `/api/daily-updates/assignments${mine ? '?mine=1' : ''}`
    );
    if (!result.ok) return [] as WorkAssignment[];
    return result.data.assignments;
  },

  async summary() {
    const result = await call<DailyUpdateSummary>('/api/daily-updates/summary');
    if (!result.ok) return null;
    return result.data;
  },

  async list(params: Record<string, string> = {}) {
    const query = new URLSearchParams(params).toString();
    const result = await call<{ updates: DailyUpdate[]; assignments: WorkAssignment[] }>(
      `/api/daily-updates${query ? `?${query}` : ''}`
    );
    if (!result.ok) return { updates: [] as DailyUpdate[], assignments: [] as WorkAssignment[] };
    return result.data;
  },

  async get(id: string) {
    const result = await call<{ update: DailyUpdate; activity: ProjectActivityItem[]; canEdit: boolean }>(
      `/api/daily-updates/${id}`
    );
    if (!result.ok) return null;
    return result.data;
  },

  async save(body: DailyUpdatePayload) {
    return call<{ update: DailyUpdate }>('/api/daily-updates', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async patch(id: string, body: Partial<DailyUpdatePayload> & { submission_status?: 'DRAFT' | 'SUBMITTED' }) {
    return call<{ update: DailyUpdate }>(`/api/daily-updates/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async comment(id: string, comment: string) {
    return call<{ update: DailyUpdate }>(`/api/daily-updates/${id}/comment`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },

  async escalate(id: string, impact?: string) {
    return call<{ escalation: { id: string } }>(`/api/daily-updates/${id}/escalate`, {
      method: 'POST',
      body: JSON.stringify({ impact, severity: 'HIGH' }),
    });
  },

  async projectActivity(projectId: string) {
    const result = await call<{ project: Project; activity: ProjectActivityItem[] }>(
      `/api/projects/${projectId}/activity`
    );
    if (!result.ok) return null;
    return result.data;
  },
};
