import { apiRequest } from './api';
import { Task, TaskComment, WorkAssignment } from './types';

export interface CreateTaskPayload {
  title: string;
  description?: string;
  task_type: 'PROJECT_TASK' | 'NON_PROJECT_TASK';
  project_id?: string;
  assigned_to_id: string;
  start_date?: string;
  due_date?: string;
  priority?: string;
}

export const TasksApi = {
  async mine() {
    const result = await apiRequest<{ assignments: WorkAssignment[] }>('/api/tasks?mine=1');
    if (!result.ok) return [] as WorkAssignment[];
    return result.data.assignments;
  },

  async create(body: CreateTaskPayload) {
    return apiRequest<{ task: Task }>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async update(id: string, body: Partial<Task> & { review_action?: 'approve' | 'return' | 'resubmit'; review_comments?: string }) {
    return apiRequest<{ task: Task }>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },

  async comment(id: string, comment: string) {
    return apiRequest<{ task: Task; comment: TaskComment }>(`/api/tasks/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
  },
};
