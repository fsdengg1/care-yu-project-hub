import { store } from '../store/db.js';
import {
  Escalation,
  EscalationLevel,
  EscalationSeverity,
  NotificationItem,
  Project,
  ProjectAssignmentPath,
  ProjectIntakeStatus,
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

export function assignableUsersFor(project: Project): User[] {
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE' && EXECUTION_ASSIGNABLE.has(user.role_code));
  const teamIds = project.team_ids || [];
  if (!teamIds.length) return users;
  const inTeam = users.filter((user) => user.team_id && teamIds.includes(user.team_id));
  return inTeam.length ? inTeam : users;
}

export function canAssignProject(user: User, project: Project) {
  return canManageProject(user, project) && project.status === 'ACTIVE';
}

export function canReviewIntake(user: User, project: Project) {
  const lead = resolveProjectTeamLead(project);
  return (
    user.role_code === 'TEAM_LEAD' &&
    lead.team_lead_id === user.id &&
    intakeStatusOf(project) === 'PENDING_TL_REVIEW' &&
    project.status === 'ACTIVE'
  );
}

export function canTlFinalReview(user: User, project: Project) {
  const lead = resolveProjectTeamLead(project);
  const intake = intakeStatusOf(project);
  if (
    user.role_code !== 'TEAM_LEAD' ||
    lead.team_lead_id !== user.id ||
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
  const lead = resolveProjectTeamLead(project);
  if (user.role_code === 'TEAM_LEAD' && lead.team_lead_id === user.id) return true;
  if (['BUSINESS_HEAD', 'ENG_DIRECTOR', 'CEO'].includes(user.role_code)) return true;
  return false;
}

export function canHandoverProject(user: User, project: Project) {
  return canManageProject(user, project) && project.status === 'ACTIVE' && !completionBlockers(project);
}

export function canCloseProject(user: User, project: Project) {
  return canManageProject(user, project) && project.status === 'HANDOVER';
}

export function projectActions(user: User, project: Project) {
  const intake = intakeStatusOf(project);
  return {
    canAssign: canAssignProject(user, project),
    canIntake: canReviewIntake(user, project),
    canTlReview: canTlFinalReview(user, project),
    canEscalate: canEscalateProject(user, project) && project.status === 'ACTIVE',
    canHandover: canHandoverProject(user, project),
    canComplete: canCloseProject(user, project),
    intake_status: intake,
  };
}

export function assignProject(user: User, project: Project, assigneeId: string) {
  if (!canAssignProject(user, project)) {
    return { error: 'Only the assigned Project Manager can assign this project.', status: 403 as const };
  }
  const assignee = store.findUserById(assigneeId);
  if (!assignee || assignee.status !== 'ACTIVE') {
    return { error: 'Select a Team Lead or Team Member to assign this project.' };
  }
  if (!EXECUTION_ASSIGNABLE.has(assignee.role_code)) {
    return { error: 'Assign the project to a Team Lead or Team Member.' };
  }

  const now = new Date().toISOString();
  const path: ProjectAssignmentPath = assignee.role_code === 'TEAM_LEAD' ? 'TEAM_LEAD' : 'DIRECT_MEMBER';
  const teamIds = new Set(project.team_ids || []);
  if (assignee.team_id) teamIds.add(assignee.team_id);

  let teamLeadId = project.team_lead_id;
  let teamLeadName = project.team_lead_name;
  if (path === 'TEAM_LEAD') {
    teamLeadId = assignee.id;
    teamLeadName = assignee.name;
  } else if (assignee.team_lead_id) {
    const lead = store.findUserById(assignee.team_lead_id);
    teamLeadId = assignee.team_lead_id;
    teamLeadName = lead?.name || assignee.team_lead_name;
  }

  const next: Project = {
    ...project,
    assignment_path: path,
    assigned_member_id: path === 'DIRECT_MEMBER' ? assignee.id : undefined,
    assigned_member_name: path === 'DIRECT_MEMBER' ? assignee.name : undefined,
    team_ids: [...teamIds],
    team_lead_id: teamLeadId,
    team_lead_name: teamLeadName,
    intake_status: path === 'TEAM_LEAD' ? 'PENDING_TL_REVIEW' : 'IN_EXECUTION',
    intake_comment: undefined,
    tl_accepted_at: path === 'DIRECT_MEMBER' ? now : undefined,
    current_phase: path === 'TEAM_LEAD' ? 'TEAM_LEAD_REVIEW' : 'EXECUTION',
    last_update_at: now,
  };
  persistProject(next);
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
        ? `${user.name} assigned ${next.code} to Team Lead ${assignee.name} for review.`
        : `${user.name} assigned ${next.code} directly to ${assignee.name}.`,
    new_value: assignee.id,
  });
  notify([assignee.id], user, 'PROJECT_ASSIGNED', {
    entityType: 'PROJECT',
    entityId: next.id,
    entityName: next.name,
    customer: next.customer_name,
    status: path === 'TEAM_LEAD' ? 'Assigned to Team Lead' : 'Directly Assigned',
    message:
      path === 'TEAM_LEAD'
        ? `${user.name} assigned ${next.customer_name} – ${next.name} for Team Lead review.`
        : `${user.name} assigned ${next.customer_name} – ${next.name} directly to you.`,
    actionUrl: `/projects/${next.id}`,
    eventKey: `PROJECT_ASSIGNED:${next.id}:${assignee.id}`,
    priority: 'HIGH',
  });
  if (path === 'DIRECT_MEMBER' && teamLeadId && teamLeadId !== assignee.id) {
    notify([teamLeadId], user, 'PROJECT_ASSIGNED', {
      entityType: 'PROJECT',
      entityId: next.id,
      entityName: next.name,
      customer: next.customer_name,
      status: 'Directly Assigned',
      message: `${user.name} assigned this project directly to ${assignee.name}. You retain team visibility.`,
      actionUrl: `/projects/${next.id}`,
      eventKey: `PROJECT_ASSIGNED_VISIBLE:${next.id}:${teamLeadId}`,
    });
  }
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
    intake_status: accepted ? 'IN_EXECUTION' : 'RETURNED',
    intake_comment: note || undefined,
    tl_accepted_at: accepted ? now : undefined,
    current_phase: accepted ? 'TASK_BREAKDOWN' : 'RETURNED_TO_PM',
    last_update_at: now,
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

export function markAcceptedInExecution(project: Project) {
  if (project.intake_status !== 'ACCEPTED') return project;
  return persistProject({ ...project, intake_status: 'IN_EXECUTION', current_phase: project.current_phase || 'EXECUTION' });
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
    last_update_at: now,
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
  const busy = store
    .getTasks()
    .filter((task) => task.project_id === project.id && (task.status === 'IN_PROGRESS' || task.status === 'BLOCKED'));
  if (busy.length) {
    return 'Complete or unblock in-progress tasks before project completion.';
  }
  if (project.assignment_path !== 'DIRECT_MEMBER' && project.team_lead_id && !project.tl_reviewed_at) {
    return 'Team Lead final review is required before PM approval.';
  }
  return null;
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
  return {
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
  const next: Escalation = {
    ...escalation,
    status: 'RESOLVED',
    resolution: note,
    ceo_decision: note,
    resolved_at: now,
    updated_at: now,
  };
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
      persistProject({ ...project, issue: undefined, last_update_at: now });
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
  const next: Escalation = {
    ...escalation,
    current_level: nextLevel,
    previous_actions: [escalation.previous_actions, note ? `${user.name}: ${note}` : `${user.name} promoted to ${nextLevel}`]
      .filter(Boolean)
      .join(' | '),
    status: 'IN_REVIEW',
    updated_at: now,
  };
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
