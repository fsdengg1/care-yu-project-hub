import { store } from '../store/db.js';
import {
  Escalation,
  EscalationEvent,
  EscalationLevel,
  EscalationSeverity,
  NotificationItem,
  Project,
  ProjectAssignmentPath,
  ProjectIntakeStatus,
  ProjectWorkflowSnapshot,
  Task,
  User,
} from '../types.js';
import { newId } from './leadWorkflow.js';
import { emitWorkflowEvent, WorkflowEventKey } from './workflowEngine.js';

function canManageProject(user: User, project: Project): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  return user.role_code === 'PROJECT_MANAGER' && project.pm_id === user.id;
}

function resolveProjectTeamLead(project: Project): { team_lead_id?: string; team_lead_name?: string } {
  if (project.team_lead_id) {
    const user = store.findUserById(project.team_lead_id);
    return {
      team_lead_id: project.team_lead_id,
      team_lead_name: user?.name || project.team_lead_name,
    };
  }
  const teams = store.getTeams();
  for (const teamId of project.team_ids || []) {
    const team = teams.find((item) => item.id === teamId);
    if (team?.team_lead_id) {
      return { team_lead_id: team.team_lead_id, team_lead_name: team.team_lead_name };
    }
  }
  return { team_lead_id: project.team_lead_id, team_lead_name: project.team_lead_name };
}

function isAssignedTeamLead(user: User, project: Project) {
  if (user.role_code !== 'TEAM_LEAD') return false;
  if (resolveProjectTeamLead(project).team_lead_id === user.id) return true;
  return Boolean(user.team_id && (project.team_ids || []).includes(user.team_id));
}

function uniqueIds(values: Array<string | undefined>) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

const EXECUTION_ASSIGNABLE = new Set(['TEAM_LEAD', 'EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION', 'PROCUREMENT']);

function notify(
  recipientIds: Array<string | undefined>,
  actor: User | undefined,
  event: WorkflowEventKey,
  input: {
    entityType: string;
    entityId: string;
    entityName: string;
    message: string;
    actionUrl: string;
    customer?: string;
    status?: string;
    comments?: string;
    eventKey?: string;
    priority?: NotificationItem['priority'];
  }
) {
  emitWorkflowEvent({
    event,
    actor: actor || ({ name: 'System' } as User),
    entityType: input.entityType,
    entityId: input.entityId,
    entityName: input.entityName,
    recipientIds,
    customer: input.customer,
    status: input.status,
    comments: input.comments,
    actionUrl: input.actionUrl,
    message: input.message,
    eventKey: input.eventKey,
    priority: input.priority,
  });
}

export function intakeStatusOf(project: Project): ProjectIntakeStatus {
  if (project.intake_status) return project.intake_status;
  if (project.status === 'COMPLETED' || project.status === 'CANCELLED') return 'IN_EXECUTION';
  if ((project.progress || 0) > 0 || project.plan_initialized || project.tl_accepted_at) return 'IN_EXECUTION';
  if (project.team_lead_id) return 'PENDING_TL_REVIEW';
  return 'AWAITING_ASSIGNMENT';
}

export function persistProject(project: Project): Project {
  const projects = store.getProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index === -1) return project;
  const next = { ...project, updated_at: new Date().toISOString() };
  projects[index] = next;
  store.saveProjects(projects);
  return next;
}

export function stampProjectAction(user: User, action: string): Pick<
  Project,
  'last_action' | 'last_action_by_id' | 'last_action_by_name' | 'last_action_at' | 'last_update_at'
> {
  const now = new Date().toISOString();
  return {
    last_action: action,
    last_action_by_id: user.id,
    last_action_by_name: user.name,
    last_action_at: now,
    last_update_at: now,
  };
}

const LAST_ACTION_LABELS: Record<string, string> = {
  PROJECT_CREATED: 'Project created',
  PROJECT_DRAFT_SAVED: 'Draft saved',
  PROJECT_SUBMITTED_TO_PM: 'Submitted to PM',
  PM_ACCEPTED: 'PM accepted project',
  PM_RETURNED_TO_CREATOR: 'PM returned to creator',
  PROJECT_ASSIGNED: 'Project assigned',
  PROJECT_ACCEPTED: 'Project accepted',
  PROJECT_RETURNED: 'Project returned to PM',
  TASK_ASSIGNED: 'Task assigned',
  TASK_STARTED: 'Task started',
  TASK_PROGRESS_UPDATED: 'Progress updated',
  TASK_COMPLETED: 'Task completed',
  DAILY_UPDATE_SUBMITTED: 'Daily update submitted',
  MONITOR_ON_TRACK: 'Marked on track',
  ISSUE_IDENTIFIED: 'Issue / blocker identified',
  ISSUE_ESCALATED: 'Issue escalated',
  ISSUE_RESOLVED: 'Issue resolved',
  TL_FINAL_REVIEW: 'Team Lead final review completed',
  PROJECT_APPROVED: 'Project approved for handover',
  PROJECT_COMPLETED: 'Project completed',
};

function escalationLevelNumber(level?: EscalationLevel) {
  if (level === 'TEAM_LEAD') return 1;
  if (level === 'PROJECT_MANAGER') return 2;
  if (level === 'BUSINESS_HEAD' || level === 'ENG_DIRECTOR') return 3;
  if (level === 'CEO') return 4;
  return 0;
}

export function projectWorkflowView(project: Project): ProjectWorkflowSnapshot {
  const intake = intakeStatusOf(project);
  const openEscalations = store
    .getEscalations()
    .filter((item) => item.project_id === project.id && item.status !== 'RESOLVED')
    .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
  const latestEsc = openEscalations[0];
  const tasks = store.getTasks().filter((task) => task.project_id === project.id && !task.is_milestone);
  const pendingReview = tasks.some((task) => task.review_status === 'PENDING_TL_REVIEW');
  const anyBlocked = tasks.some((task) => task.status === 'BLOCKED');
  const anyInProgress = tasks.some(
    (task) => task.status === 'IN_PROGRESS' && task.review_status !== 'PENDING_TL_REVIEW' && task.review_status !== 'CORRECTION_REQUIRED'
  );
  const allDone =
    tasks.length > 0 &&
    tasks.every((task) => {
      if (task.review_status === 'PENDING_TL_REVIEW' || task.review_status === 'CORRECTION_REQUIRED') return false;
      return task.status === 'DONE';
    });
  const last = project.last_action;

  let step = 1;
  let stage = 'Project Assignment';
  let status = 'Awaiting Assignment';

  if (intake === 'DRAFT') {
    step = 0;
    stage = 'Draft';
    status = 'Draft';
  } else if (intake === 'SUBMITTED_TO_PM') {
    step = 0;
    stage = 'PM Review';
    status = 'Submitted to PM';
  } else if (intake === 'RETURNED_TO_CREATOR') {
    step = 0;
    stage = 'Returned to Creator';
    status = 'Returned to Creator';
  } else if (project.status === 'COMPLETED') {
    step = 8;
    stage = 'Resolution & Completion';
    status = 'Completed';
  } else if (project.status === 'HANDOVER') {
    step = 8;
    stage = 'Resolution & Completion';
    status = 'PM Approved — Handover';
  } else if (project.tl_reviewed_at) {
    step = 8;
    stage = 'Resolution & Completion';
    status = 'Pending PM Approval';
  } else if (allDone) {
    step = 8;
    stage = 'Resolution & Completion';
    status = 'Pending Team Lead Final Review';
  } else if (latestEsc) {
    step = 7;
    stage = 'Escalation';
    status = `Level ${escalationLevelNumber(latestEsc.current_level)} — ${latestEsc.current_level.replace(/_/g, ' ')}`;
  } else if (project.monitor_status === 'ISSUE_IDENTIFIED' || Boolean(project.issue) || anyBlocked) {
    step = 6;
    stage = 'Team Lead Review & Monitor';
    status = 'Issue / Blocker Identified';
  } else if (pendingReview) {
    step = 6;
    stage = 'Team Lead Review & Monitor';
    status = 'Pending Review';
  } else if (intake === 'RETURNED') {
    step = 1;
    stage = 'Project Assignment';
    status = 'Returned to PM';
  } else if (intake === 'AWAITING_ASSIGNMENT') {
    step = 1;
    stage = 'Project Assignment';
    status = 'Awaiting Assignment';
  } else if (intake === 'PENDING_TL_REVIEW') {
    step = 2;
    stage = 'Team Lead Review';
    status = 'Assigned';
  } else if (last === 'DAILY_UPDATE_SUBMITTED') {
    step = 5;
    stage = 'Daily Work Update';
    status = 'Updates in Progress';
  } else if (anyInProgress || last === 'TASK_STARTED' || last === 'TASK_PROGRESS_UPDATED') {
    step = 4;
    stage = 'Team Member Execution';
    status = 'In Progress';
  } else if (tasks.length) {
    step = 4;
    stage = 'Team Member Execution';
    status = 'Assigned';
  } else if (intake === 'ACCEPTED' || intake === 'IN_EXECUTION' || project.current_phase === 'TASK_BREAKDOWN') {
    step = 3;
    stage = 'Task Breakdown';
    status = 'Accepted';
  }

  return {
    step,
    stage,
    status,
    last_action: project.last_action,
    last_action_label: project.last_action ? LAST_ACTION_LABELS[project.last_action] || project.last_action.replace(/_/g, ' ') : undefined,
    last_action_by: project.last_action_by_name,
    last_action_at: project.last_action_at,
    intake_status: intake,
    assignment_path: project.assignment_path,
    monitor_status: project.monitor_status,
    escalation_level: latestEsc?.current_level,
    escalation_resolved: Boolean(project.status !== 'COMPLETED' && !latestEsc && store.getEscalations().some((item) => item.project_id === project.id && item.status === 'RESOLVED')),
  };
}

function appendEscalationEvent(
  escalation: Escalation,
  event: Omit<EscalationEvent, 'id'>
): Escalation {
  const entry: EscalationEvent = { id: newId('esev'), ...event };
  return { ...escalation, history: [...(escalation.history || []), entry] };
}

function ensureDirectMemberTask(project: Project, assignee: User, actor: User) {
  const tasks = store.getTasks();
  if (tasks.some((task) => task.project_id === project.id && task.assigned_to_id === assignee.id)) return;
  const now = new Date().toISOString();
  const task: Task = {
    id: newId('task'),
    lead_id: project.lead_id || '',
    project_id: project.id,
    title: `${project.name} — execution`,
    description: `Assigned execution work on ${project.customer_name} / ${project.name}. Review requirements and begin work.`,
    status: 'TODO',
    priority: 'Medium',
    due_date: project.target_completion,
    assigned_to: assignee.name,
    assigned_to_id: assignee.id,
    assigned_by: actor.name,
    assigned_by_id: actor.id,
    created_by: actor.name,
    created_by_id: actor.id,
    responsible_user_id: assignee.id,
    responsible_user_name: assignee.name,
    progress_percent: 0,
    team_id: assignee.team_id,
    team_name: assignee.team_name,
    task_type: 'PROJECT_TASK',
    review_status: 'NONE',
    comments: [],
    created_at: now,
    updated_at: now,
  };
  tasks.unshift(task);
  store.saveTasks(tasks);
  emitWorkflowEvent({
    event: 'TASK_ASSIGNED',
    actor,
    entityType: 'TASK',
    entityId: task.id,
    entityName: task.title,
    recipientIds: [assignee.id],
    customer: project.customer_name,
    status: 'Task Assigned',
    dueDate: task.due_date,
    assignedBy: actor.name,
    message: `${actor.name} assigned "${task.title}" to you.`,
    actionUrl: `/my-work?task=${encodeURIComponent(task.id)}`,
    eventKey: `TASK_ASSIGNED:${task.id}:${assignee.id}:${now}`,
  });
}

export function assignableUsersFor(_project?: Project): User[] {
  return store
    .getUsers()
    .filter((user) => user.status === 'ACTIVE' && EXECUTION_ASSIGNABLE.has(user.role_code))
    .sort((a, b) => {
      const team = (a.team_name || '').localeCompare(b.team_name || '');
      if (team) return team;
      if (a.role_code === 'TEAM_LEAD' && b.role_code !== 'TEAM_LEAD') return -1;
      if (a.role_code !== 'TEAM_LEAD' && b.role_code === 'TEAM_LEAD') return 1;
      return a.name.localeCompare(b.name);
    });
}

const PRE_PM_INTAKE = new Set<ProjectIntakeStatus>(['DRAFT', 'SUBMITTED_TO_PM', 'RETURNED_TO_CREATOR']);

export function canAssignProject(user: User, project: Project) {
  if (!canManageProject(user, project) || project.status !== 'ACTIVE') return false;
  return !PRE_PM_INTAKE.has(intakeStatusOf(project));
}

export function canPmReviewCreateProject(user: User, project: Project) {
  if (project.source !== 'DIRECT_CREATE') return false;
  if (project.status !== 'ACTIVE') return false;
  if (intakeStatusOf(project) !== 'SUBMITTED_TO_PM') return false;
  return canManageProject(user, project);
}

export function canReviewIntake(user: User, project: Project) {
  return isAssignedTeamLead(user, project) && intakeStatusOf(project) === 'PENDING_TL_REVIEW' && project.status === 'ACTIVE';
}

export function canTlFinalReview(user: User, project: Project) {
  const intake = intakeStatusOf(project);
  if (
    !isAssignedTeamLead(user, project) ||
    !['ACCEPTED', 'IN_EXECUTION'].includes(intake) ||
    project.tl_reviewed_at ||
    project.status !== 'ACTIVE'
  ) {
    return false;
  }
  const tasks = store.getTasks().filter((task) => task.project_id === project.id);
  if (!tasks.length) return false;
  return tasks.every((task) => {
    if (task.review_status === 'PENDING_TL_REVIEW' || task.review_status === 'CORRECTION_REQUIRED') return false;
    return task.status === 'DONE';
  });
}

export function canEscalateProject(user: User, project: Project) {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (canManageProject(user, project)) return true;
  if (isAssignedTeamLead(user, project)) return true;
  if (['BUSINESS_HEAD', 'ENG_DIRECTOR', 'CEO'].includes(user.role_code)) return true;
  return false;
}

export function canHandoverProject(user: User, project: Project) {
  return canManageProject(user, project) && project.status === 'ACTIVE' && !completionBlockers(project);
}

export function canCloseProject(user: User, project: Project) {
  return canManageProject(user, project) && project.status === 'HANDOVER';
}

export function canBreakdownTasks(user: User, project: Project) {
  const intake = intakeStatusOf(project);
  if (!['ACCEPTED', 'IN_EXECUTION'].includes(intake) || project.status !== 'ACTIVE' || project.tl_reviewed_at) {
    return false;
  }
  if (isAssignedTeamLead(user, project)) return true;
  if (canManageProject(user, project) && project.assignment_path === 'DIRECT_MEMBER') return true;
  return false;
}

export function canMonitorProject(user: User, project: Project) {
  const intake = intakeStatusOf(project);
  return isAssignedTeamLead(user, project) && ['ACCEPTED', 'IN_EXECUTION'].includes(intake) && project.status === 'ACTIVE';
}

export function projectActions(user: User, project: Project) {
  const intake = intakeStatusOf(project);
  return {
    canAssign: canAssignProject(user, project),
    canPmReview: canPmReviewCreateProject(user, project),
    canIntake: canReviewIntake(user, project),
    canTlReview: canTlFinalReview(user, project),
    canEscalate: canEscalateProject(user, project) && project.status === 'ACTIVE',
    canHandover: canHandoverProject(user, project),
    canComplete: canCloseProject(user, project),
    canBreakdown: canBreakdownTasks(user, project),
    canMonitor: canMonitorProject(user, project),
    intake_status: intake,
  };
}

export function assignProject(user: User, project: Project, assigneeIds: string | string[]) {
  if (!canAssignProject(user, project)) {
    return { error: 'Only the assigned Project Manager can assign this project.', status: 403 as const };
  }
  const ids = uniqueIds(Array.isArray(assigneeIds) ? assigneeIds : [assigneeIds]);
  if (!ids.length) {
    return { error: 'Select at least one Team Lead or Team Member to assign this project.' };
  }

  const assignees: User[] = [];
  for (const id of ids) {
    const assignee = store.findUserById(id);
    if (!assignee || assignee.status !== 'ACTIVE') {
      return { error: 'Select a Team Lead or Team Member to assign this project.' };
    }
    if (!EXECUTION_ASSIGNABLE.has(assignee.role_code)) {
      return { error: 'Assign the project to a Team Lead or Team Member.' };
    }
    assignees.push(assignee);
  }

  const now = new Date().toISOString();
  const teamLeads = assignees.filter((item) => item.role_code === 'TEAM_LEAD');
  const members = assignees.filter((item) => item.role_code !== 'TEAM_LEAD');
  const path: ProjectAssignmentPath = teamLeads.length ? 'TEAM_LEAD' : 'DIRECT_MEMBER';
  const teamIds = new Set(project.team_ids || []);
  for (const assignee of assignees) {
    if (assignee.team_id) teamIds.add(assignee.team_id);
  }

  let teamLeadId = project.team_lead_id;
  let teamLeadName = project.team_lead_name;
  if (teamLeads.length) {
    teamLeadId = teamLeads[0].id;
    teamLeadName = teamLeads.map((item) => item.name).join(', ');
  } else {
    const withLead = members.find((item) => item.team_lead_id);
    if (withLead?.team_lead_id) {
      const lead = store.findUserById(withLead.team_lead_id);
      teamLeadId = withLead.team_lead_id;
      teamLeadName = lead?.name || withLead.team_lead_name;
    }
  }

  const existingMemberNames = (project.assigned_member_name || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  const memberNames = [...new Set([...existingMemberNames, ...members.map((item) => item.name)])];
  const assignedMemberId = members[0]?.id || project.assigned_member_id;
  const assignedMemberName = memberNames.length ? memberNames.join(', ') : project.assigned_member_name;

  const next: Project = {
    ...project,
    assignment_path: path,
    assigned_member_id: assignedMemberId,
    assigned_member_name: assignedMemberName,
    assigned_by_id: user.id,
    assigned_by_name: user.name,
    assigned_at: now,
    team_ids: [...teamIds],
    team_lead_id: teamLeadId,
    team_lead_name: teamLeadName,
    intake_status: path === 'TEAM_LEAD' ? 'PENDING_TL_REVIEW' : 'IN_EXECUTION',
    intake_comment: undefined,
    tl_accepted_at: path === 'DIRECT_MEMBER' ? now : project.tl_accepted_at,
    current_phase: path === 'TEAM_LEAD' ? 'TEAM_LEAD_REVIEW' : 'EXECUTION',
    ...stampProjectAction(user, 'PROJECT_ASSIGNED'),
  };
  persistProject(next);
  for (const member of members) {
    ensureDirectMemberTask(next, member, user);
  }

  const names = assignees.map((item) => item.name).join(', ');
  const teamNames = [...new Set(assignees.map((item) => item.team_name).filter(Boolean))].join(', ');
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'PROJECT',
    entity_id: next.id,
    entity_name: next.code,
    action: 'PROJECT_ASSIGNED',
    description:
      path === 'TEAM_LEAD'
        ? `${user.name} assigned ${next.code} to ${names}${teamNames ? ` (${teamNames})` : ''} for review.`
        : `${user.name} assigned ${next.code} directly to ${names}${teamNames ? ` (${teamNames})` : ''}.`,
    new_value: ids.join(','),
  });
  for (const assignee of assignees) {
    const isLead = assignee.role_code === 'TEAM_LEAD';
    notify([assignee.id], user, 'PROJECT_ASSIGNED', {
      entityType: 'PROJECT',
      entityId: next.id,
      entityName: next.name,
      customer: next.customer_name,
      status: isLead ? 'Assigned to Team Lead' : 'Directly Assigned',
      message: isLead
        ? `${user.name} assigned ${next.customer_name} – ${next.name} for Team Lead review.`
        : `${user.name} assigned ${next.customer_name} – ${next.name} directly to you.`,
      actionUrl: `/projects/${next.id}`,
      eventKey: `PROJECT_ASSIGNED:${next.id}:${assignee.id}`,
      priority: 'HIGH',
    });
  }
  if (path === 'DIRECT_MEMBER' && teamLeadId && !ids.includes(teamLeadId)) {
    notify([teamLeadId], user, 'PROJECT_ASSIGNED', {
      entityType: 'PROJECT',
      entityId: next.id,
      entityName: next.name,
      customer: next.customer_name,
      status: 'Directly Assigned',
      message: `${user.name} assigned this project directly to ${names}. You retain team visibility.`,
      actionUrl: `/projects/${next.id}`,
      eventKey: `PROJECT_ASSIGNED_VISIBLE:${next.id}:${teamLeadId}`,
    });
  }
  return { project: next };
}

export function reviewCreateProjectByPm(user: User, project: Project, action: 'accept' | 'return', comments?: string) {
  if (!canPmReviewCreateProject(user, project)) {
    return { error: 'Only the assigned Project Manager can review this project.', status: 403 as const };
  }
  const note = (comments || '').trim();
  if (action === 'return' && !note) {
    return { error: 'Comments are required when returning a project to the creator.' };
  }
  const accepted = action === 'accept';
  const next: Project = {
    ...project,
    intake_status: accepted ? 'AWAITING_ASSIGNMENT' : 'RETURNED_TO_CREATOR',
    intake_comment: note || undefined,
    current_phase: accepted ? 'ASSIGNMENT' : 'RETURNED_TO_CREATOR',
    ...stampProjectAction(user, accepted ? 'PM_ACCEPTED' : 'PM_RETURNED_TO_CREATOR'),
  };
  persistProject(next);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'PROJECT',
    entity_id: next.id,
    entity_name: next.code,
    action: accepted ? 'PM_ACCEPTED' : 'PM_RETURNED_TO_CREATOR',
    description: accepted
      ? `${user.name} accepted ${next.code} for assignment.`
      : `${user.name} returned ${next.code} to the creator: ${note}`,
  });
  notify(
    [next.created_by_id],
    user,
    accepted ? 'PROJECT_APPROVED' : 'PROJECT_SENT_BACK',
    {
      entityType: 'PROJECT',
      entityId: next.id,
      entityName: next.name,
      customer: next.customer_name,
      status: accepted ? 'Accepted — Assign Team Lead' : 'Returned to Creator',
      comments: note,
      message: accepted
        ? `${user.name} accepted ${next.customer_name} – ${next.name}. Next: assign a Team Lead.`
        : `${user.name} returned ${next.customer_name} – ${next.name}: ${note}`,
      actionUrl: accepted ? `/projects/${next.id}` : `/projects/create?id=${next.id}`,
      eventKey: `${accepted ? 'PM_ACCEPTED' : 'PM_RETURNED_TO_CREATOR'}:${next.id}`,
      priority: 'HIGH',
    }
  );
  return { project: next };
}

export function reviewProjectIntake(user: User, project: Project, action: 'accept' | 'return', comments?: string) {
  if (!canReviewIntake(user, project)) {
    return { error: 'Only the assigned Team Lead can accept or return this project.', status: 403 as const };
  }
  const note = (comments || '').trim();
  if (action === 'return' && !note) {
    return { error: 'Comments are required when returning a project to the Project Manager.' };
  }
  const now = new Date().toISOString();
  const accepted = action === 'accept';
  const next: Project = {
    ...project,
    intake_status: accepted ? 'ACCEPTED' : 'RETURNED',
    intake_comment: note || undefined,
    tl_accepted_at: accepted ? now : undefined,
    current_phase: accepted ? 'TASK_BREAKDOWN' : 'RETURNED_TO_PM',
    monitor_status: accepted ? undefined : project.monitor_status,
    ...stampProjectAction(user, accepted ? 'PROJECT_ACCEPTED' : 'PROJECT_RETURNED'),
  };
  persistProject(next);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'PROJECT',
    entity_id: next.id,
    entity_name: next.code,
    action: accepted ? 'PROJECT_ACCEPTED' : 'PROJECT_RETURNED',
    description: accepted
      ? `${user.name} accepted ${next.code}.`
      : `${user.name} returned ${next.code} to PM: ${note}`,
  });
  notify([next.pm_id], user, accepted ? 'PROJECT_ACCEPTED' : 'PROJECT_RETURNED_TO_PM', {
    entityType: 'PROJECT',
    entityId: next.id,
    entityName: next.name,
    customer: next.customer_name,
    status: accepted ? 'Project Accepted' : 'Returned to PM',
    comments: note,
    message: accepted
      ? `${user.name} accepted ${next.customer_name} – ${next.name} and will break it into tasks.`
      : `${user.name} returned ${next.customer_name} – ${next.name}: ${note}`,
    actionUrl: `/projects/${next.id}`,
    eventKey: `${accepted ? 'PROJECT_ACCEPTED' : 'PROJECT_RETURNED_TO_PM'}:${next.id}`,
    priority: accepted ? 'MEDIUM' : 'HIGH',
  });
  return { project: next };
}

export function markAcceptedInExecution(project: Project, user?: User) {
  if (project.intake_status !== 'ACCEPTED') return project;
  return persistProject({
    ...project,
    intake_status: 'IN_EXECUTION',
    current_phase: project.current_phase === 'TASK_BREAKDOWN' ? 'EXECUTION' : project.current_phase || 'EXECUTION',
    ...(user ? stampProjectAction(user, 'TASK_ASSIGNED') : {}),
  });
}

export function markTlFinalReview(user: User, project: Project, comments?: string) {
  if (!canTlFinalReview(user, project)) {
    return { error: 'Team Lead final review is not available yet.', status: 403 as const };
  }
  const now = new Date().toISOString();
  const note = (comments || '').trim();
  const next: Project = {
    ...project,
    tl_reviewed_at: now,
    intake_status: 'IN_EXECUTION',
    intake_comment: note || project.intake_comment,
    current_phase: 'PM_FINAL_REVIEW',
    ...stampProjectAction(user, 'TL_FINAL_REVIEW'),
  };
  persistProject(next);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'PROJECT',
    entity_id: next.id,
    entity_name: next.code,
    action: 'TL_FINAL_REVIEW',
    description: `${user.name} completed Team Lead final review on ${next.code}${note ? `: ${note}` : '.'}`,
  });
  notify([next.pm_id], user, 'FINAL_REVIEW_REQUIRED', {
    entityType: 'PROJECT',
    entityId: next.id,
    entityName: next.name,
    customer: next.customer_name,
    status: 'Project Completed – Pending Final Review',
    comments: note,
    message: `${user.name} completed Team Lead review. Please approve handover and close the project.`,
    actionUrl: `/projects/${next.id}`,
    eventKey: `FINAL_REVIEW_REQUIRED:${next.id}`,
    priority: 'HIGH',
  });
  return { project: next };
}

export function completionBlockers(project: Project): string | null {
  const openEscalations = store
    .getEscalations()
    .filter((item) => item.project_id === project.id && item.status !== 'RESOLVED');
  if (openEscalations.length) {
    return 'Resolve open escalations before completing the project.';
  }
  const tasks = store.getTasks().filter((task) => task.project_id === project.id);
  if (!tasks.length) {
    return 'At least one completed task is required before project completion.';
  }
  const incomplete = tasks.filter((task) => {
    if (task.review_status === 'PENDING_TL_REVIEW' || task.review_status === 'CORRECTION_REQUIRED') return true;
    return task.status !== 'DONE';
  });
  if (incomplete.length) {
    return 'All tasks must be completed and approved before project completion.';
  }
  if (project.team_lead_id && !project.tl_reviewed_at) {
    return 'Team Lead final review is required before PM approval.';
  }
  return null;
}

export function monitorProject(user: User, project: Project, status: 'ON_TRACK' | 'ISSUE_IDENTIFIED', comments?: string) {
  if (!canMonitorProject(user, project)) {
    return { error: 'Only the assigned Team Lead can update project monitoring.', status: 403 as const };
  }
  const note = (comments || '').trim();
  if (status === 'ISSUE_IDENTIFIED' && !note) {
    return { error: 'Describe the issue or blocker before marking the project off track.' };
  }
  const now = new Date().toISOString();
  const next: Project = {
    ...project,
    monitor_status: status,
    issue: status === 'ISSUE_IDENTIFIED' ? note : undefined,
    current_phase: status === 'ISSUE_IDENTIFIED' ? 'TL_MONITOR' : project.current_phase === 'TL_MONITOR' ? 'EXECUTION' : project.current_phase,
    health: status === 'ISSUE_IDENTIFIED' ? 'AT_RISK' : project.health === 'CRITICAL' ? project.health : 'ON_TRACK',
    ...stampProjectAction(user, status === 'ON_TRACK' ? 'MONITOR_ON_TRACK' : 'ISSUE_IDENTIFIED'),
  };
  persistProject(next);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'PROJECT',
    entity_id: next.id,
    entity_name: next.code,
    action: status === 'ON_TRACK' ? 'PROJECT_ON_TRACK' : 'PROJECT_ISSUE_IDENTIFIED',
    description:
      status === 'ON_TRACK'
        ? `${user.name} marked ${next.code} on track.`
        : `${user.name} identified an issue on ${next.code}: ${note}`,
  });
  if (status === 'ISSUE_IDENTIFIED') {
    notify([next.pm_id], user, 'ISSUE_RAISED', {
      entityType: 'PROJECT',
      entityId: next.id,
      entityName: next.name,
      customer: next.customer_name,
      status: 'Issue / Blocker Identified',
      comments: note,
      message: `${user.name} identified an issue on ${next.customer_name} – ${next.name}: ${note}`,
      actionUrl: `/projects/${next.id}`,
      eventKey: `ISSUE_IDENTIFIED:${next.id}:${now}`,
      priority: 'HIGH',
    });
  }
  return { project: next };
}

export function startingEscalationLevel(user: User, severity?: EscalationSeverity): EscalationLevel {
  if (severity === 'CRITICAL' && ['PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'CEO'].includes(user.role_code)) {
    return 'CEO';
  }
  if (user.role_code === 'TEAM_LEAD') return 'PROJECT_MANAGER';
  if (user.role_code === 'PROJECT_MANAGER') return 'BUSINESS_HEAD';
  if (['BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code)) return 'CEO';
  return 'TEAM_LEAD';
}

export function nextEscalationLevel(current: EscalationLevel): EscalationLevel | null {
  if (current === 'TEAM_LEAD') return 'PROJECT_MANAGER';
  if (current === 'PROJECT_MANAGER') return 'BUSINESS_HEAD';
  if (current === 'BUSINESS_HEAD' || current === 'ENG_DIRECTOR') return 'CEO';
  return null;
}

export function actorForLevel(project: Project | undefined, level: EscalationLevel): User | undefined {
  const users = store.getUsers().filter((item) => item.status === 'ACTIVE');
  if (level === 'TEAM_LEAD' && project) {
    const lead = resolveProjectTeamLead(project);
    return lead.team_lead_id ? store.findUserById(lead.team_lead_id) : users.find((item) => item.role_code === 'TEAM_LEAD');
  }
  if (level === 'PROJECT_MANAGER' && project) return store.findUserById(project.pm_id);
  if (level === 'BUSINESS_HEAD') return users.find((item) => item.role_code === 'BUSINESS_HEAD');
  if (level === 'ENG_DIRECTOR') return users.find((item) => item.role_code === 'ENG_DIRECTOR');
  if (level === 'CEO') return users.find((item) => item.role_code === 'CEO');
  return undefined;
}

export function canViewEscalation(user: User, escalation: Escalation) {
  if (['CEO', 'CTO', 'SYSTEM_ADMIN', 'BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code)) return true;
  if (escalation.raised_by_id === user.id) return true;
  if (user.role_code === 'PROJECT_MANAGER') {
    const project = escalation.project_id
      ? store.getProjects().find((item) => item.id === escalation.project_id)
      : undefined;
    return !project || project.pm_id === user.id;
  }
  if (user.role_code === 'TEAM_LEAD') {
    const project = escalation.project_id
      ? store.getProjects().find((item) => item.id === escalation.project_id)
      : undefined;
    if (escalation.team_id && user.team_id === escalation.team_id) return true;
    return Boolean(project && project.team_lead_id === user.id);
  }
  return canActOnEscalation(user, escalation);
}

export function canActOnEscalation(user: User, escalation: Escalation) {
  if (escalation.status === 'RESOLVED') return false;
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  const project = escalation.project_id
    ? store.getProjects().find((item) => item.id === escalation.project_id)
    : undefined;
  const level = escalation.current_level;
  if (level === 'TEAM_LEAD') {
    if (user.role_code !== 'TEAM_LEAD') return false;
    if (!project) return escalation.team_id ? escalation.team_id === user.team_id : true;
    return resolveProjectTeamLead(project).team_lead_id === user.id;
  }
  if (level === 'PROJECT_MANAGER') {
    return user.role_code === 'PROJECT_MANAGER' && (!project || project.pm_id === user.id);
  }
  if (level === 'BUSINESS_HEAD' || level === 'ENG_DIRECTOR') {
    return ['BUSINESS_HEAD', 'ENG_DIRECTOR'].includes(user.role_code);
  }
  if (level === 'CEO') return user.role_code === 'CEO';
  return false;
}

export function notifyEscalationOwner(escalation: Escalation, actorName: string) {
  const project = escalation.project_id
    ? store.getProjects().find((item) => item.id === escalation.project_id)
    : undefined;
  const owner = actorForLevel(project, escalation.current_level);
  const critical = escalation.current_level === 'CEO' || escalation.severity === 'CRITICAL';
  notify([owner?.id], { name: actorName } as User, critical ? 'CRITICAL_ESCALATION' : 'ISSUE_ESCALATED', {
    entityType: 'ESCALATION',
    entityId: escalation.id,
    entityName: escalation.issue,
    customer: escalation.customer_name,
    status: critical ? 'LEVEL 4 Escalation' : `Escalated to ${escalation.current_level}`,
    message: `${actorName} raised ${escalation.severity.toLowerCase()} issue: ${escalation.issue}`,
    actionUrl: `/dashboard/ceo/escalations/${escalation.id}`,
    eventKey: `ISSUE_ESCALATED:${escalation.id}:${escalation.current_level}`,
    priority: critical ? 'CRITICAL' : 'HIGH',
  });
}

export function buildEscalation(
  user: User,
  project: Project | undefined,
  body: {
    issue: string;
    impact?: string;
    severity?: EscalationSeverity;
    previous_actions?: string;
    team_id?: string;
    team_name?: string;
    customer_name?: string;
    project_name?: string;
  }
): Escalation {
  const now = new Date().toISOString();
  const level = startingEscalationLevel(user, body.severity);
  const base: Escalation = {
    id: newId('esc'),
    code: `ESC-${String(store.getEscalations().length + 1).padStart(3, '0')}`,
    project_id: project?.id,
    project_name: body.project_name || project?.name || 'Project',
    customer_name: body.customer_name || project?.customer_name || '',
    issue: body.issue,
    impact: body.impact || 'Execution risk requiring management attention',
    summary: body.issue,
    severity: body.severity || 'HIGH',
    status: 'OPEN',
    raised_by_id: user.id,
    raised_by_name: user.name,
    raised_by_role: user.role_name,
    team_id: body.team_id || user.team_id,
    team_name: body.team_name || user.team_name,
    previous_actions: body.previous_actions || 'Raised from project execution',
    current_level: level,
    created_at: now,
    updated_at: now,
  };
  return appendEscalationEvent(base, {
    level,
    action: 'RAISED',
    actor_id: user.id,
    actor_name: user.name,
    comments: body.issue,
    at: now,
  });
}

export function saveEscalation(escalation: Escalation) {
  const escalations = store.getEscalations();
  const index = escalations.findIndex((item) => item.id === escalation.id);
  if (index === -1) escalations.unshift(escalation);
  else escalations[index] = escalation;
  store.saveEscalations(escalations);
}

export function resolveEscalation(user: User, escalation: Escalation, decision: string) {
  if (!canActOnEscalation(user, escalation)) {
    return { error: 'You cannot resolve this escalation at the current level.', status: 403 as const };
  }
  const note = decision.trim();
  if (!note) return { error: 'A decision / resolution is required.' };
  const now = new Date().toISOString();
  const next: Escalation = appendEscalationEvent(
    {
      ...escalation,
      status: 'RESOLVED',
      resolution: note,
      ceo_decision: note,
      resolved_at: now,
      updated_at: now,
    },
    {
      level: escalation.current_level,
      action: 'RESOLVED',
      actor_id: user.id,
      actor_name: user.name,
      comments: note,
      at: now,
    }
  );
  saveEscalation(next);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'ESCALATION',
    entity_id: next.id,
    action: 'ESCALATION_RESOLVED',
    description: `${user.name} resolved ${next.code}: ${note}`,
  });
  notify([next.raised_by_id], user, 'ISSUE_RESOLVED', {
    entityType: 'ESCALATION',
    entityId: next.id,
    entityName: next.issue,
    status: 'Issue Resolved',
    comments: note,
    message: `${user.name} resolved the issue. Continue execution: ${note}`,
    actionUrl: next.project_id ? `/projects/${next.project_id}` : `/dashboard/ceo/escalations/${next.id}`,
    eventKey: `ISSUE_RESOLVED:${next.id}`,
  });
  if (next.project_id) {
    const project = store.getProjects().find((item) => item.id === next.project_id);
    if (project) {
      persistProject({
        ...project,
        issue: undefined,
        monitor_status: 'ON_TRACK',
        current_phase: project.tl_reviewed_at ? 'PM_FINAL_REVIEW' : 'EXECUTION',
        ...stampProjectAction(user, 'ISSUE_RESOLVED'),
      });
      if (project.pm_id !== next.raised_by_id) {
        notify([project.pm_id], user, 'ISSUE_RESOLVED', {
          entityType: 'PROJECT',
          entityId: project.id,
          entityName: project.name,
          customer: project.customer_name,
          status: 'Issue Resolved',
          message: `${user.name} resolved ${project.code}. Work can continue.`,
          actionUrl: `/projects/${project.id}`,
          eventKey: `ISSUE_RESOLVED:${next.id}:${project.id}`,
        });
      }
    }
  }
  return { escalation: next };
}

export function promoteEscalation(user: User, escalation: Escalation, comments?: string) {
  if (!canActOnEscalation(user, escalation)) {
    return { error: 'You cannot escalate this issue further from the current level.', status: 403 as const };
  }
  const nextLevel = nextEscalationLevel(escalation.current_level);
  if (!nextLevel) {
    return { error: 'This escalation is already at CEO level. Record a resolution.' };
  }
  const note = (comments || '').trim();
  const now = new Date().toISOString();
  const next: Escalation = appendEscalationEvent(
    {
      ...escalation,
      current_level: nextLevel,
      previous_actions: [escalation.previous_actions, note ? `${user.name}: ${note}` : `${user.name} promoted to ${nextLevel}`]
        .filter(Boolean)
        .join(' | '),
      status: 'IN_REVIEW',
      updated_at: now,
    },
    {
      level: nextLevel,
      action: 'PROMOTED',
      actor_id: user.id,
      actor_name: user.name,
      comments: note || `Promoted to ${nextLevel}`,
      at: now,
    }
  );
  saveEscalation(next);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'ESCALATION',
    entity_id: next.id,
    action: 'ESCALATION_PROMOTED',
    description: `${user.name} promoted ${next.code} to ${nextLevel}.`,
  });
  notifyEscalationOwner(next, user.name);
  return { escalation: next };
}
