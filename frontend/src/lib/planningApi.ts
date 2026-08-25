import { apiRequest } from './api';
import { PlanningPlanPayload, PlanningProjectSummary, PriorityLevel, Task } from './types';

export interface PlanTaskPayload {
  title?: string;
  description?: string;
  status?: Task['status'];
  priority?: PriorityLevel;
  start_date?: string;
  due_date?: string;
  duration_days?: number;
  progress_percent?: number;
  assigned_to_id?: string;
  team_id?: string;
  phase_id?: string | null;
  parent_task_id?: string | null;
  depends_on_id?: string | null;
  is_milestone?: boolean;
  remarks?: string;
  blocked_reason?: string;
}

async function call<T>(path: string, options?: RequestInit) {
  return apiRequest<T>(path, options);
}

export const PlanningApi = {
  async list() {
    const result = await call<{ projects: PlanningProjectSummary[] }>('/api/planning');
    if (!result.ok) return { ok: false as const, message: result.message, projects: [] as PlanningProjectSummary[] };
    return { ok: true as const, projects: result.data.projects };
  },

  async get(projectId: string) {
    const result = await call<PlanningPlanPayload>(`/api/planning/${projectId}`);
    if (!result.ok) return { ok: false as const, message: result.message, plan: null };
    return { ok: true as const, plan: result.data };
  },

  async createPlan(projectId: string) {
    return call<PlanningPlanPayload>(`/api/planning/${projectId}/plan`, { method: 'POST' });
  },

  async addPhase(projectId: string, body: { name: string; start_date?: string; due_date?: string; remarks?: string }) {
    return call<{ plan: PlanningPlanPayload }>(`/api/planning/${projectId}/phases`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async addTask(projectId: string, body: PlanTaskPayload) {
    return call<{ plan: PlanningPlanPayload }>(`/api/planning/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async patchTask(projectId: string, taskId: string, body: PlanTaskPayload) {
    return call<{ plan: PlanningPlanPayload }>(`/api/planning/${projectId}/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async deleteTask(projectId: string, taskId: string) {
    return call<{ plan: PlanningPlanPayload }>(`/api/planning/${projectId}/tasks/${taskId}`, {
      method: 'DELETE',
    });
  },

  async deletePhase(projectId: string, phaseId: string) {
    return call<{ plan: PlanningPlanPayload }>(`/api/planning/${projectId}/phases/${phaseId}`, {
      method: 'DELETE',
    });
  },
};
