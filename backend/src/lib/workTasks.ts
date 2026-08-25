import { store } from '../store/db.js';
import { Task, TaskComment, User } from '../types.js';
import { hasPermission } from './rbac.js';
import { newId } from './leadWorkflow.js';
import { canViewProject } from './dailyUpdates.js';
import { notificationService } from './notificationService.js';
import { reminderScheduleFields, transferTaskResponsibility } from './responsibility.js';

export function canCreateWorkTask(user: User) {
  return hasPermission(user, 'create:task') || hasPermission(user, 'assign:task');
}

export function canViewTask(user: User, task: Task) {
  if (task.assigned_to_id === user.id || task.created_by_id === user.id || task.assigned_by_id === user.id) return true;
  if (task.responsible_user_id === user.id) return true;
  if (['CEO', 'CTO', 'BUSINESS_HEAD', 'SYSTEM_ADMIN'].includes(user.role_code)) return true;
  if (user.role_code === 'PROJECT_MANAGER') {
    if (!task.project_id) return true;
    const project = store.getProjects().find((item) => item.id === task.project_id);
    return Boolean(project && project.pm_id === user.id);
  }
  if (task.project_id) {
    const project = store.getProjects().find((item) => item.id === task.project_id);
    return Boolean(project && canViewProject(user, project));
  }
  return false;
}

export function createWorkTask(user: User, body: Record<string, unknown>) {
  if (!canCreateWorkTask(user)) {
    return { error: 'You do not have permission to create a task.', status: 403 as const };
  }
  const title = String(body.title || '').trim() || 'Untitled task';
  const taskType =
    body.task_type === 'NON_PROJECT_TASK' || (!body.task_type && !body.project_id)
      ? 'NON_PROJECT_TASK'
      : 'PROJECT_TASK';
  const projectId = taskType === 'PROJECT_TASK' ? String(body.project_id || '').trim() : '';
  if (taskType === 'PROJECT_TASK' && !projectId) {
    return { error: 'Project is required for a project task.' };
  }
  const project = projectId ? store.getProjects().find((item) => item.id === projectId) : undefined;
  if (taskType === 'PROJECT_TASK' && !project) return { error: 'Project not found.' };
  if (project && user.role_code === 'PROJECT_MANAGER' && project.pm_id !== user.id) {
    return { error: 'You do not have permission to view this project.', status: 403 as const };
  }

  const assigneeId = String(body.assigned_to_id || user.id);
  const assignee = store.findUserById(assigneeId);
  if (!assignee || assignee.status !== 'ACTIVE') return { error: 'Assigned employee was not found.' };

  const now = new Date().toISOString();
  const task: Task = {
    id: newId('task'),
    lead_id: project?.lead_id || '',
    project_id: project?.id,
    title,
    description: String(body.description || '').trim() || undefined,
    status: 'TODO',
    priority: (body.priority as Task['priority']) || 'Medium',
    due_date: body.due_date ? String(body.due_date) : undefined,
    start_date: body.start_date ? String(body.start_date) : undefined,
    assigned_to: assignee.name,
    assigned_to_id: assignee.id,
    assigned_by: user.name,
    assigned_by_id: user.id,
    created_by: user.name,
    created_by_id: user.id,
    responsible_user_id: assignee.id,
    responsible_user_name: assignee.name,
    ...reminderScheduleFields(true),
    progress_percent: Number(body.progress_percent || 0) || 0,
    team_id: assignee.team_id,
    team_name: assignee.team_name,
    remarks: body.remarks ? String(body.remarks) : undefined,
    task_type: taskType,
    comments: [],
    created_at: now,
    updated_at: now,
  };
  const tasks = store.getTasks();
  tasks.unshift(task);
  store.saveTasks(tasks);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'TASK',
    entity_id: task.id,
    entity_name: task.title,
    action: 'TASK_ASSIGNED',
    description: `${user.name} assigned "${task.title}" to ${assignee.name}.`,
  });
  if (assignee.id !== user.id) {
    void notificationService.notifyAssignment({
      entityType: 'TASK',
      entityId: task.id,
      entityName: task.title,
      recipientUserId: assignee.id,
      assignedByUserId: user.id,
      priority: task.priority,
      createdOn: now,
      eventKey: `TASK_ASSIGNED:${task.id}:${assignee.id}:${now}`,
    });
  }
  return { task };
}

export function updateWorkTask(user: User, id: string, body: Record<string, unknown>) {
  const tasks = store.getTasks();
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const };
  const current = tasks[index];
  if (!canViewTask(user, current)) return { error: 'forbidden' as const };
  const canManage =
    current.created_by_id === user.id ||
    current.assigned_by_id === user.id ||
    hasPermission(user, 'create:task') ||
    ['PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
  const canExecute = current.assigned_to_id === user.id || canManage;
  if (!canExecute) return { error: 'forbidden' as const };

  const next: Task = { ...current, updated_at: new Date().toISOString() };
  if (canManage) {
    if (body.title) next.title = String(body.title).trim();
    if (body.description !== undefined) next.description = String(body.description);
    if (body.priority) next.priority = body.priority as Task['priority'];
    if (body.due_date !== undefined) next.due_date = String(body.due_date || '') || undefined;
    if (body.start_date !== undefined) next.start_date = String(body.start_date || '') || undefined;
    if (body.assigned_to_id) {
      const assignee = store.findUserById(String(body.assigned_to_id));
      if (assignee && assignee.id !== current.assigned_to_id) {
        const transferred = transferTaskResponsibility(next, assignee, user, 'Task reassigned');
        Object.assign(next, transferred.task);
        void notificationService.notifyForward({
          entityType: 'TASK',
          entityId: next.id,
          entityName: next.title,
          recipientUserId: assignee.id,
          assignedByUserId: user.id,
          previousUserId: transferred.previous?.id,
          reason: 'Task reassigned',
          eventKey: `TASK_FORWARDED:${next.id}:${assignee.id}:${next.updated_at}`,
        });
      } else if (assignee) {
        next.assigned_to_id = assignee.id;
        next.assigned_to = assignee.name;
        next.responsible_user_id = assignee.id;
        next.responsible_user_name = assignee.name;
      }
    }
  }
  if (body.status && ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'].includes(String(body.status))) {
    next.status = body.status as Task['status'];
  }
  if (body.progress_percent !== undefined) {
    next.progress_percent = Math.max(0, Math.min(100, Number(body.progress_percent) || 0));
  }
  if (body.blocked_reason !== undefined) next.blocked_reason = String(body.blocked_reason);
  if (next.status === 'DONE') {
    next.progress_percent = 100;
    next.pending_action = false;
    next.last_action_at = new Date().toISOString();
    next.next_reminder_at = undefined;
  }

  tasks[index] = next;
  store.saveTasks(tasks);
  if (current.status !== 'DONE' && next.status === 'DONE') {
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'TASK',
      entity_id: next.id,
      entity_name: next.title,
      action: 'TASK_COMPLETED',
      description: `${user.name} completed "${next.title}".`,
    });
  }
  return { task: next };
}

export function addTaskComment(user: User, id: string, text: string) {
  const comment = text.trim();
  if (!comment) return { error: 'Comment is required.' };
  const tasks = store.getTasks();
  const index = tasks.findIndex((item) => item.id === id);
  if (index === -1) return { error: 'not_found' as const };
  const task = tasks[index];
  if (!canViewTask(user, task)) return { error: 'forbidden' as const };
  const entry: TaskComment = {
    id: newId('tcomm'),
    user_id: user.id,
    user_name: user.name,
    comment,
    created_at: new Date().toISOString(),
  };
  task.comments = [entry, ...(task.comments || [])];
  task.updated_at = entry.created_at;
  tasks[index] = task;
  store.saveTasks(tasks);
  return { task, comment: entry };
}
