import { apiRequest, API_URL } from './api';
import { StorageService } from './storage';

export type ExecutiveStatusFilter =
  | 'ALL'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'PENDING'
  | 'DELAYED'
  | 'AT_RISK'
  | 'BLOCKED';

export type ExecutiveSortKey =
  | 'name'
  | 'start_date'
  | 'deadline'
  | 'progress'
  | 'status'
  | 'last_activity'
  | 'completed_tasks';

export type ExecutiveOverviewQuery = {
  month: number;
  year: number;
  search?: string;
  department?: string;
  status?: ExecutiveStatusFilter;
  projectManager?: string;
  stage?: string;
  page?: number;
  limit?: number;
  sort?: ExecutiveSortKey;
  sortDir?: 'asc' | 'desc';
};

export type ExecutiveProjectRow = {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  department: string;
  department_ids: string[];
  pm_id: string;
  pm_name: string;
  team_names: string[];
  start_date?: string;
  deadline?: string;
  progress: number;
  current_stage: string;
  workflow_step: number;
  completed_tasks: number;
  pending_tasks: number;
  blocked_tasks: number;
  in_progress_tasks: number;
  total_tasks: number;
  status: string;
  health: string;
  project_status: string;
  last_activity?: string;
  last_activity_label?: string;
};

export type ExecutiveOverviewPayload = {
  month: number;
  year: number;
  month_label: string;
  summary: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    delayedProjects: number;
    pendingProjects: number;
    teamMembers: number;
  };
  projects: ExecutiveProjectRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
  departments: Array<{ id: string; name: string; projects: number }>;
  projectManagers: Array<{ id: string; name: string }>;
  stages: string[];
  statusDistribution: Array<{ key: string; label: string; count: number }>;
  activityTrend: Array<{
    month: number;
    year: number;
    label: string;
    projectsWorked: number;
    projectsCompleted: number;
    tasksCompleted: number;
    tasksCreated: number;
  }>;
  attentionRequired: Array<{
    id: string;
    code: string;
    name: string;
    reason: 'DELAYED' | 'AT_RISK' | 'BLOCKED';
    deadline?: string;
    progress: number;
    pending_tasks: number;
    blocked_tasks: number;
    status: string;
  }>;
  availableMonths: Array<{ month: number; year: number; label: string }>;
};

export type ExecutiveProjectDetail = {
  project: ExecutiveProjectRow;
  customer_name: string;
  team_lead_name?: string;
  progress: number;
  lifecycle: Array<{ step: number; stage: string; state: 'completed' | 'current' | 'pending' }>;
  tasks: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    blocked: number;
  };
  monthly: {
    label: string;
    completed: number;
    started: number;
    in_progress: number;
    blocked: number;
  };
  team: Array<{
    user_id: string;
    name: string;
    assigned: number;
    completed: number;
    pending: number;
    hours: number;
  }>;
  taskList: Array<{
    id: string;
    title: string;
    assigned_to: string;
    department: string;
    status: string;
    due_date?: string;
    last_update?: string;
  }>;
  timeline: Array<{
    id: string;
    at: string;
    kind: string;
    title: string;
    detail: string;
    actor?: string;
    status?: string;
  }>;
};

function toQuery(params: ExecutiveOverviewQuery) {
  const qs = new URLSearchParams();
  qs.set('month', String(params.month));
  qs.set('year', String(params.year));
  if (params.search) qs.set('search', params.search);
  if (params.department) qs.set('department', params.department);
  if (params.status && params.status !== 'ALL') qs.set('status', params.status);
  if (params.projectManager) qs.set('projectManager', params.projectManager);
  if (params.stage) qs.set('stage', params.stage);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.sort) qs.set('sort', params.sort);
  if (params.sortDir) qs.set('sortDir', params.sortDir);
  return qs.toString();
}

export const ExecutiveOverviewApi = {
  async load(params: ExecutiveOverviewQuery) {
    return apiRequest<ExecutiveOverviewPayload>(`/api/executive-overview?${toQuery(params)}`);
  },

  async detail(projectId: string, month: number, year: number) {
    return apiRequest<ExecutiveProjectDetail>(
      `/api/executive-overview/projects/${encodeURIComponent(projectId)}?month=${month}&year=${year}`
    );
  },

  async exportReport(params: ExecutiveOverviewQuery, format: 'excel' | 'pdf') {
    const token = StorageService.getAuthToken();
    const qs = `${toQuery({ ...params, page: 1, limit: 500 })}&format=${format}`;
    const response = await fetch(`${API_URL}/api/executive-overview/export?${qs}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'same-origin',
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      return {
        ok: false as const,
        message: payload.message || 'Unable to export Executive Overview. Please try again.',
      };
    }
    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] || `CareYu-Executive-Overview.${format === 'excel' ? 'xls' : 'html'}`;
    const url = URL.createObjectURL(blob);
    if (format === 'pdf') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return { ok: true as const };
    }
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true as const };
  },
};
