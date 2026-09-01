import { store } from '../store/db.js';
import { Task, TaskComment, User } from '../types.js';
import { hasPermission } from './rbac.js';
import { newId } from './leadWorkflow.js';
import { canViewProject } from './dailyUpdates.js';
import { notificationService } from './notificationService.js';
import { reminderScheduleFields, transferTaskResponsibility } from './responsibility.js';
import { emitWorkflowEvent, WorkflowEventKey } from './workflowEngine.js';
import { intakeStatusOf, markAcceptedInExecution, persistProject, stampProjectAction } from './projectWorkflow.js';
import { persistComputedProgress } from './projectProgress.js';

export function canCreateWorkTask(user: User) {
  return hasPermission(user, 'create:task') || hasPermission(user, 'assign:task');
}

function resolveProjectFromBody(body: Record<string, unknown>) {
  const requestedId = String(body.project_id || '').trim();
  const typedName = String(body.project_name || '').trim();
  const projects = store.getProjects();
  const byId = requestedId ? projects.find((item) => item.id === requestedId) : undefined;
  if (byId) return { project: byId, typedName: typedName || byId.name };
  const needle = (typedName || requestedId).trim().toLowerCase();
  if (!needle) return { project: undefined, typedName: '' };
  const byName = projects.find(
    (item) =>
      item.name.trim().toLowerCase() === needle ||
      String(item.code || '').trim().toLowerCase() === needle
  );
  return { project: byName, typedName: typedName || requestedId };
}

function taskStatusFromBody(value: unknown): Task['status'] {
  const raw = String(value || '').trim();
  if (!raw) return 'TODO';
  const upper = raw.toUpperCase().replace(/\s+/g, '_');
  if (raw === 'Completed' || upper === 'DONE' || upper === 'COMPLETED') return 'DONE';
  if (raw === 'In Progress' || upper === 'IN_PROGRESS' || upper === 'WORK_IN_PROGRESS') return 'IN_PROGRESS';
  if (raw === 'Hold' || upper === 'HOLD' || upper === 'ON_HOLD') return 'HOLD';
  if (raw === 'Waiting' || upper === 'WAITING' || upper === 'BLOCKED') return 'WAITING';
  if (raw === 'Yet to Start' || upper === 'TODO' || upper === 'YET_TO_START' || upper === 'NOT_STARTED') return 'TODO';
  return 'TODO';
}

export function reviewerForTask(task: Task): User | undefined {
  if (task.project_id) {
    const project = store.getProjects().find((item) => item.id === task.project_id);
    if (project?.team_lead_id) {
      const lead = store.findUserById(project.team_lead_id);
      if (lead?.status === 'ACTIVE') return lead;
    }
    if (project?.pm_id) {
      const pm = store.findUserById(project.pm_id);
      if (pm?.status === 'ACTIVE' && !task.assigned_to_id) return pm;
    }
  }
  const assignee = store.findUserById(task.assigned_to_id);
  if (assignee?.team_lead_id) {
    const lead = store.findUserById(assignee.team_lead_id);
    if (lead?.status === 'ACTIVE') return lead;
  }
  if (task.assigned_by_id && task.assigned_by_id !== task.assigned_to_id) {
    const creator = store.findUserById(task.assigned_by_id);
    if (creator && ['TEAM_LEAD', 'PROJECT_MANAGER'].includes(creator.role_code) && creator.status === 'ACTIVE') {
      return creator;
    }
  }
  return undefined;
}

export function isTaskFullyComplete(task: Task) {
  if (task.review_status === 'PENDING_TL_REVIEW' || task.review_status === 'CORRECTION_REQUIRED') return false;
  return task.status === 'DONE';
}

function notifyTaskHandover(task: Task, actor: User, recipientIds: Array<string | undefined>, input: {
  event: WorkflowEventKey;
  message: string;
  status: string;
  comments?: string;
}) {
  const project = task.project_id ? store.getProjects().find((item) => item.id === task.project_id) : undefined;
  emitWorkflowEvent({
    event: input.event,
    actor,
    entityType: 'TASK',
    entityId: task.id,
    entityName: task.title,
    recipientIds,
    customer: project?.customer_name,
    status: input.status,
    dueDate: task.due_date,
    comments: input.comments,
    assignedBy: actor.name,
    message: input.message,
    actionUrl: `/my-work?task=${encodeURIComponent(task.id)}`,
    eventKey: `${input.event}:${task.id}`,
  });
}

export function applyTaskLifecycle(
  user: User,
  previous: Task,
  next: Task,
  opts?: { reviewAction?: string; comments?: string }
): Task {
  const now = new Date().toISOString();
  const reviewer = reviewerForTask(next);
  const isAssignee = user.id === previous.assigned_to_id;
  const isReviewer = Boolean(reviewer && reviewer.id === user.id);
  const reviewAction = (opts?.reviewAction || '').toLowerCase();
  const comments = (opts?.comments || '').trim();

  if (reviewAction === 'approve' && (isReviewer || hasPermission(user, 'create:task'))) {
    next.status = 'DONE';
    next.review_status = 'COMPLETED';
    next.progress_percent = 100;
    next.pending_action = false;
    next.last_action_at = now;
    next.next_reminder_at = undefined;
    notifyTaskHandover(next, user, [next.assigned_to_id], {
      event: 'TASK_COMPLETED',
      message: `${user.name} approved "${next.title}". The task is complete.`,
      status: 'Completed',
      comments,
    });
    return next;
  }

  if (reviewAction === 'return' && (isReviewer || hasPermission(user, 'create:task'))) {
    next.status = 'IN_PROGRESS';
    next.review_status = 'CORRECTION_REQUIRED';
    next.progress_percent = Math.min(next.progress_percent ?? 90, 90);
    next.pending_action = true;
    next.responsible_user_id = next.assigned_to_id;
    next.responsible_user_name = next.assigned_to;
    next.remarks = comments || next.remarks;
    notifyTaskHandover(next, user, [next.assigned_to_id], {
      event: 'TASK_SENT_BACK',
      message: `${user.name} sent "${next.title}" back for correction.${comments ? ` ${comments}` : ''}`,
      status: 'Correction Required',
      comments,
    });
    return next;
  }

  const requestedStart = next.status === 'IN_PROGRESS' && previous.status !== 'IN_PROGRESS' && previous.status !== 'DONE';
  if (requestedStart) {
    next.last_action_at = now;
    next.start_date = next.start_date || now.slice(0, 10);
    if (!(next.progress_percent || 0)) next.progress_percent = 10;
    notifyTaskHandover(next, user, [reviewer?.id, next.assigned_by_id], {
      event: 'TASK_STARTED',
      message: `${user.name} started "${next.title}".`,
      status: 'Task In Progress',
    });
  }

  const wantsComplete =
    (next.status === 'DONE' && previous.status !== 'DONE') ||
    reviewAction === 'resubmit' ||
    (previous.review_status === 'CORRECTION_REQUIRED' && isAssignee && next.status === 'DONE');

  if (wantsComplete && isAssignee && reviewer && reviewer.id !== user.id && !next.is_milestone) {
    next.status = 'IN_PROGRESS';
    next.review_status = 'PENDING_TL_REVIEW';
    next.progress_percent = 100;
    next.pending_action = true;
    next.responsible_user_id = reviewer.id;
    next.responsible_user_name = reviewer.name;
    next.last_action_at = now;
    notifyTaskHandover(next, user, [reviewer.id], {
      event: 'TASK_COMPLETED',
      message: `${user.name} submitted "${next.title}" for Team Lead review.`,
      status: 'Task Completed – Pending Team Lead Review',
      comments,
    });
    return next;
  }

  if (next.status === 'DONE') {
    next.review_status = 'COMPLETED';
    next.progress_percent = 100;
    next.pending_action = false;
    next.last_action_at = now;
    next.next_reminder_at = undefined;
    if (previous.status !== 'DONE' || previous.review_status === 'PENDING_TL_REVIEW') {
      notifyTaskHandover(next, user, [reviewer?.id, next.assigned_by_id], {
        event: 'TASK_COMPLETED',
        message: `${user.name} completed "${next.title}".`,
        status: 'Completed',
      });
    }
  }

  return next;
}

export function canViewTask(user: User, task: Task) {
  if (task.assigned_to_id === user.id || task.created_by_id === user.id || task.assigned_by_id === user.id) return true;
  if (task.responsible_user_id === user.id) return true;
  if (['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)) return true;
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

type CreateWorkTaskResult = { error: string; status?: number } | { task: Task; tasks: Task[] };

export function createWorkTask(user: User, body: Record<string, unknown>): CreateWorkTaskResult {
  const wantsAdditional = Boolean(body.is_additional);
  const requestedAssignee = String(body.assigned_to_id || '').trim() || user.id;
  const selfCreate = requestedAssignee === user.id;
  if (!canCreateWorkTask(user) && !selfCreate) {
    return { error: 'You do not have permission to create a task.', status: 403 as const };
  }
  if (!canCreateWorkTask(user)) {
    body = { ...body, assigned_to_id: user.id, is_additional: wantsAdditional };
  }
  const extraIds = Array.isArray(body.assigned_to_ids)
    ? (body.assigned_to_ids as unknown[]).map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  const primary = String(body.assigned_to_id || '').trim();
  const assigneeIds = [...new Set([...extraIds, ...(primary ? [primary] : [])])];
  if (assigneeIds.length > 1) {
    const created: Task[] = [];
    for (const id of assigneeIds) {
      const result = createWorkTask(user, { ...body, assigned_to_id: id, assigned_to_ids: undefined });
      if ('error' in result) return created.length ? { task: created[0], tasks: created } : result;
      created.push(result.task);
    }
    return { task: created[0], tasks: created };
  }

  const title = String(body.title || '').trim() || 'Untitled task';
  const resolved = resolveProjectFromBody(body);
  const project = resolved.project;
  const typedProjectName = resolved.typedName;
  const taskType = project || typedProjectName ? 'PROJECT_TASK' : 'NON_PROJECT_TASK';
  if (project && ['AWAITING_ASSIGNMENT', 'PENDING_TL_REVIEW', 'RETURNED', 'DRAFT', 'SUBMITTED_TO_PM', 'RETURNED_TO_CREATOR'].includes(intakeStatusOf(project))) {
    return { error: 'Assign and accept the project before creating execution tasks.' };
  }
  if (project && user.role_code === 'PROJECT_MANAGER' && project.pm_id !== user.id) {
    return { error: 'You do not have permission to view this project.', status: 403 as const };
  }
  if (project && user.role_code === 'TEAM_LEAD' && project.team_lead_id !== user.id && !(project.team_ids || []).includes(user.team_id || '')) {
    return { error: 'You can only create tasks for projects assigned to your team.', status: 403 as const };
  }
  if (project && !canCreateWorkTask(user) && !canViewProject(user, project)) {
    return { error: 'You can only create tasks for projects assigned to you.', status: 403 as const };
  }

  const assigneeId = String(body.assigned_to_id || user.id);
  const assignee = store.findUserById(assigneeId);
  if (!assignee || assignee.status !== 'ACTIVE') return { error: 'Assigned employee was not found.' };
  if (user.role_code === 'TEAM_LEAD' && assignee.id !== user.id && assignee.team_id !== user.team_id) {
    return { error: 'Team Leads can only assign tasks to members of their own team.' };
  }

  const now = new Date().toISOString();
  const initialStatus = taskStatusFromBody(body.status);
  const initialProgress =
    Number(body.progress_percent || 0) ||
    (initialStatus === 'DONE' ? 100 : initialStatus === 'IN_PROGRESS' ? 10 : 0);
  const task: Task = {
    id: newId('task'),
    lead_id: project?.lead_id || '',
    project_id: project?.id,
    project_name: project?.name || typedProjectName || undefined,
    title,
    description: String(body.description || '').trim() || undefined,
    status: initialStatus,
    priority: (body.priority as Task['priority']) || 'Medium',
    due_date: body.due_date ? String(body.due_date) : undefined,
    start_date: body.start_date ? String(body.start_date) : now.slice(0, 10),
    assigned_to: assignee.name,
    assigned_to_id: assignee.id,
    assigned_by: user.name,
    assigned_by_id: user.id,
    created_by: user.name,
    created_by_id: user.id,
    responsible_user_id: assignee.id,
    responsible_user_name: assignee.name,
    ...reminderScheduleFields(true),
    progress_percent: initialProgress,
    team_id: assignee.team_id,
    team_name: assignee.team_name,
    remarks: body.remarks ? String(body.remarks) : undefined,
    task_type: taskType,
    is_additional: Boolean(body.is_additional),
    depends_on_id: body.depends_on_id ? String(body.depends_on_id) : undefined,
    depends_on_ids: Array.isArray(body.depends_on_ids)
      ? [...new Set((body.depends_on_ids as unknown[]).map((id) => String(id || '').trim()).filter(Boolean))]
      : body.depends_on_id
        ? [String(body.depends_on_id)]
        : undefined,
    review_status: 'NONE',
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
    emitWorkflowEvent({
      event: 'TASK_ASSIGNED',
      actor: user,
      entityType: 'TASK',
      entityId: task.id,
      entityName: task.title,
      recipientIds: [assignee.id],
      customer: project?.customer_name,
      status: 'Task Assigned',
      dueDate: task.due_date,
      assignedBy: user.name,
      message: `New task assigned to you for ${project?.name || task.title}. Please review the requirements and begin execution.`,
      actionUrl: `/my-work?task=${encodeURIComponent(task.id)}`,
      eventKey: `TASK_ASSIGNED:${task.id}:${assignee.id}:${now}`,
    });
  }
  if (project) {
    const current = store.getProjects().find((item) => item.id === project.id);
    if (current) {
      const afterAccept = markAcceptedInExecution(current, user);
      persistProject({
        ...afterAccept,
        current_phase: 'EXECUTION',
        ...stampProjectAction(user, 'TASK_ASSIGNED'),
      });
      persistComputedProgress(project.id);
    }
  }
  return { task, tasks: [task] };
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
    ['PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code);
  const ownAdditional = Boolean(current.is_additional) && current.assigned_to_id === user.id;
  const project = current.project_id ? store.getProjects().find((item) => item.id === current.project_id) : undefined;
  const isProjectTeamLead = user.role_code === 'TEAM_LEAD' && Boolean(project && project.team_lead_id === user.id);
  const canExecute = current.assigned_to_id === user.id || canManage || isProjectTeamLead || ownAdditional;
  if (!canExecute) return { error: 'forbidden' as const };
  if (
    current.review_status === 'PENDING_TL_REVIEW' &&
    current.assigned_to_id === user.id &&
    !canManage &&
    !isProjectTeamLead
  ) {
    return { error: 'This task is awaiting Team Lead review and can no longer be edited.', status: 403 as const };
  }
  if (
    current.status === 'BLOCKED' &&
    !['TEAM_LEAD', 'PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)
  ) {
    const resumeAttempt =
      (body.status && String(body.status) !== 'BLOCKED') ||
      body.progress_percent !== undefined ||
      body.review_action;
    if (resumeAttempt) {
      return { error: 'This task is blocked until the Team Lead resolves the issue.', status: 403 as const };
    }
  }

  const next: Task = { ...current, updated_at: new Date().toISOString() };
  if (canManage || ownAdditional) {
    if (body.title) next.title = String(body.title).trim();
    if (body.description !== undefined) next.description = String(body.description);
    if (body.due_date !== undefined) next.due_date = String(body.due_date || '') || undefined;
  }
  if (canManage) {
    if (body.priority) next.priority = body.priority as Task['priority'];
    if (body.start_date !== undefined) next.start_date = String(body.start_date || '') || undefined;
    if (body.project_id !== undefined) {
      const projectId = String(body.project_id || '').trim();
      if (!projectId) {
        next.project_id = undefined;
        next.task_type = 'NON_PROJECT_TASK';
      } else {
        const nextProject = store.getProjects().find((item) => item.id === projectId);
        if (nextProject) {
          next.project_id = nextProject.id;
          next.lead_id = nextProject.lead_id || next.lead_id;
          next.task_type = 'PROJECT_TASK';
        }
      }
    }
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
  if (body.status && ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED', 'WAITING', 'HOLD'].includes(String(body.status))) {
    next.status = body.status as Task['status'];
  }
  if (
    current.status === 'BLOCKED' &&
    next.status === 'IN_PROGRESS' &&
    user.role_code !== 'TEAM_LEAD' &&
    !['PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)
  ) {
    return { error: 'Only the Team Lead can clear a blocked task.', status: 403 as const };
  }
  if (body.progress_percent !== undefined) {
    next.progress_percent = Math.max(0, Math.min(100, Number(body.progress_percent) || 0));
    next.last_update_at = new Date().toISOString();
    if (next.status === 'TODO' && next.progress_percent > 0) next.status = 'IN_PROGRESS';
  }
  if ((canManage || ownAdditional) && body.depends_on_ids !== undefined) {
    const ids = Array.isArray(body.depends_on_ids)
      ? [...new Set((body.depends_on_ids as unknown[]).map((id) => String(id || '').trim()).filter(Boolean))]
      : [];
    next.depends_on_ids = ids;
    next.depends_on_id = ids[0];
  }
  if (body.blocked_reason !== undefined) next.blocked_reason = String(body.blocked_reason);
  if (canExecute && body.remarks !== undefined) next.remarks = String(body.remarks);
  if (next.status === 'IN_PROGRESS' && current.status === 'BLOCKED') {
    next.blocked_reason = undefined;
  }
  if (next.status === 'DONE' && current.assigned_to_id !== user.id && !canManage) {
    return { error: 'You can only complete tasks assigned to you.', status: 403 as const };
  }
  if (next.status === 'BLOCKED' && !String(next.blocked_reason || '').trim()) {
    return { error: 'Describe the issue or doubt against this task.', status: 400 as const };
  }
  applyTaskLifecycle(user, current, next, {
    reviewAction: String(body.review_action || ''),
    comments: String(body.review_comments || body.comments || ''),
  });

  if (next.status === 'BLOCKED' && current.status !== 'BLOCKED') {
    const project = next.project_id ? store.getProjects().find((item) => item.id === next.project_id) : undefined;
    notifyTaskHandover(next, user, [reviewerForTask(next)?.id, project?.team_lead_id], {
      event: 'ISSUE_RAISED',
      message: `${user.name} raised an issue on "${next.title}": ${next.blocked_reason}`,
      status: 'Issue / Doubt',
      comments: next.blocked_reason,
    });
    if (project) {
      persistProject({
        ...project,
        issue: next.blocked_reason,
        monitor_status: 'ISSUE_IDENTIFIED',
        ...stampProjectAction(user, 'ISSUE_IDENTIFIED'),
      });
    }
  }
  if (current.status === 'BLOCKED' && next.status === 'IN_PROGRESS' && next.project_id) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) {
      const stillBlocked = store
        .getTasks()
        .some((task) => task.project_id === next.project_id && task.id !== next.id && task.status === 'BLOCKED');
      persistProject({
        ...project,
        issue: stillBlocked ? project.issue : undefined,
        monitor_status: stillBlocked ? project.monitor_status : undefined,
        current_phase: 'EXECUTION',
        ...stampProjectAction(user, 'ISSUE_RESOLVED'),
      });
    }
  } else if (next.status === 'IN_PROGRESS' && current.status !== 'IN_PROGRESS' && next.project_id) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) persistProject({ ...project, current_phase: 'EXECUTION', ...stampProjectAction(user, 'TASK_STARTED') });
  } else if (
    next.project_id &&
    body.progress_percent !== undefined &&
    next.status !== 'DONE' &&
    next.review_status !== 'PENDING_TL_REVIEW'
  ) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) persistProject({ ...project, ...stampProjectAction(user, 'TASK_PROGRESS_UPDATED') });
  }
  if (
    next.project_id &&
    (next.status === 'DONE' && current.status !== 'DONE' ||
      (next.review_status === 'PENDING_TL_REVIEW' && current.review_status !== 'PENDING_TL_REVIEW'))
  ) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) persistProject({ ...project, ...stampProjectAction(user, 'TASK_COMPLETED') });
  }

  tasks[index] = next;
  store.saveTasks(tasks);
  if (next.project_id) persistComputedProgress(next.project_id);
  if (!isTaskFullyComplete(current) && isTaskFullyComplete(next)) {
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
    void import('./smartNotifications.js').then((mod) => {
      mod.markNotificationsCompleted('TASK', next.id);
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

export function deleteWorkTasks(user: User, ids: string[]) {
  const uniqueIds = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!uniqueIds.length) return { error: 'No tasks selected.', status: 400 as const };
  const canManage = hasPermission(user, 'create:task') || ['PROJECT_MANAGER', 'SYSTEM_ADMIN', 'TEAM_LEAD'].includes(user.role_code);
  if (!canManage) return { error: 'You do not have permission to delete tasks.', status: 403 as const };
  const tasks = store.getTasks();
  const selected = tasks.filter((task) => uniqueIds.includes(task.id) && canViewTask(user, task));
  if (!selected.length) return { error: 'No matching tasks were found.', status: 404 as const };
  const removedIds = new Set(selected.map((task) => task.id));
  const next = tasks
    .filter((task) => !removedIds.has(task.id))
    .map((task) => {
      let updated = task;
      if (task.parent_task_id && removedIds.has(task.parent_task_id)) updated = { ...updated, parent_task_id: undefined };
      if (task.depends_on_id && removedIds.has(task.depends_on_id)) updated = { ...updated, depends_on_id: undefined };
      if (task.depends_on_ids?.some((id) => removedIds.has(id))) {
        updated = { ...updated, depends_on_ids: task.depends_on_ids.filter((id) => !removedIds.has(id)) };
      }
      return updated;
    });
  store.saveTasks(next);
  const projectIds = [...new Set(selected.map((task) => task.project_id).filter(Boolean))] as string[];
  for (const projectId of projectIds) persistComputedProgress(projectId);
  for (const removed of selected) {
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'TASK',
      entity_id: removed.id,
      entity_name: removed.title,
      action: 'TASK_DELETED',
      description: `${user.name} deleted task "${removed.title}".`,
    });
  }
  return { deleted: selected.length, ids: [...removedIds] };
}
