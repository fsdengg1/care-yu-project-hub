import { store } from '../store/db.js';
import {
  DailyUpdate,
  Escalation,
  Lead,
  Project,
  ProjectHealth,
  ProjectRemark,
  ProjectStatus,
  User,
} from '../types.js';
import { buildProjectActivity, canViewProject } from './dailyUpdates.js';
import { findPm, newId, parseMoney } from './leadWorkflow.js';
import {
  assignableUsersFor,
  buildEscalation,
  notifyEscalationOwner,
  projectActions,
  projectWorkflowView,
  saveEscalation,
  stampProjectAction,
} from './projectWorkflow.js';
import { withComputedProgress } from './projectProgress.js';
import { usersWithRole } from './lifecycleNotify.js';
import { emitWorkflowEvent } from './workflowEngine.js';

const EXECUTION_ROLES = new Set(['EMPLOYEE', 'TEAM_LEAD', 'PROCUREMENT', 'EXECUTION', 'PROJECT_ENGINEER']);

export function canManageProject(user: User, project: Project): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  return user.role_code === 'PROJECT_MANAGER' && project.pm_id === user.id;
}

export function resolveProjectTeamLead(project: Project): { team_lead_id?: string; team_lead_name?: string } {
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
  if (project.lead_id) {
    const lead = store.getLeads().find((item) => item.id === project.lead_id);
    if (lead?.assigned_team_lead_id) {
      return { team_lead_id: lead.assigned_team_lead_id, team_lead_name: lead.assigned_team_lead_name };
    }
  }
  return {};
}

export type GanttProjectRole =
  | 'PROJECT_MANAGER'
  | 'TEAM_LEAD'
  | 'TEAM_MEMBER'
  | 'BUSINESS_HEAD'
  | 'ENG_DIRECTOR'
  | 'CEO'
  | 'CTO'
  | 'SYSTEM_ADMIN'
  | 'NONE';

const GANTT_VIEW_ROLES = new Set([
  'PROJECT_MANAGER',
  'TEAM_LEAD',
  'BUSINESS_HEAD',
  'ENG_DIRECTOR',
  'CEO',
  'CTO',
  'SYSTEM_ADMIN',
  'EMPLOYEE',
  'PROJECT_ENGINEER',
  'EXECUTION',
  'SALES',
  'PROCUREMENT',
]);

export function canAccessGanttModule(user: User): boolean {
  return GANTT_VIEW_ROLES.has(user.role_code);
}

export function canEditProjectGantt(user: User, project: Project): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  return user.role_code === 'PROJECT_MANAGER' && project.pm_id === user.id;
}

export function canViewProjectGantt(user: User, project: Project): boolean {
  if (!canAccessGanttModule(user)) return false;
  if (['SALES', 'PROCUREMENT'].includes(user.role_code)) return true;
  if (user.role_code === 'TEAM_LEAD') {
    const lead = resolveProjectTeamLead(project);
    if (lead.team_lead_id === user.id) return true;
  }
  return canViewProject(user, project);
}

export function ganttAccessFor(user: User, project: Project) {
  const canViewGantt = canViewProjectGantt(user, project);
  const canEditGantt = canViewGantt && canEditProjectGantt(user, project);
  let projectRole: GanttProjectRole = 'NONE';
  if (user.role_code === 'SYSTEM_ADMIN') projectRole = 'SYSTEM_ADMIN';
  else if (canEditGantt) projectRole = 'PROJECT_MANAGER';
  else if (user.role_code === 'TEAM_LEAD' && canViewGantt) projectRole = 'TEAM_LEAD';
  else if (['EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION'].includes(user.role_code) && canViewGantt) projectRole = 'TEAM_MEMBER';
  else if (user.role_code === 'BUSINESS_HEAD' && canViewGantt) projectRole = 'BUSINESS_HEAD';
  else if (user.role_code === 'ENG_DIRECTOR' && canViewGantt) projectRole = 'ENG_DIRECTOR';
  else if (user.role_code === 'CEO' && canViewGantt) projectRole = 'CEO';
  else if (user.role_code === 'CTO' && canViewGantt) projectRole = 'CTO';
  else if (['SALES', 'PROCUREMENT'].includes(user.role_code) && canViewGantt) projectRole = 'TEAM_MEMBER';
  return {
    canViewGantt,
    canEditGantt,
    canManageGantt: canEditGantt,
    projectRole,
  };
}

function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function projectValue(project: Project, lead?: Lead): number {
  if (typeof project.value === 'number' && Number.isFinite(project.value)) return project.value;
  if (lead && typeof lead.expected_value === 'number') return lead.expected_value;
  return parseMoney(lead?.estimated_opportunity_value ?? lead?.customer_budget);
}

function leadFor(project: Project): Lead | undefined {
  if (!project.lead_id) return undefined;
  return store.getLeads().find((lead) => lead.id === project.lead_id);
}

export function hydrateProject(project: Project): Project {
  const lead = leadFor(project);
  const value = project.value ?? projectValue(project, lead);
  const start = project.start_date || project.created_at.slice(0, 10);
  const teamLead = resolveProjectTeamLead(project);
  return {
    ...project,
    value,
    start_date: start,
    target_completion: project.target_completion || addDays(project.created_at, 90),
    current_phase: project.current_phase || (
      project.status === 'COMPLETED'
        ? 'COMPLETED'
        : project.intake_status === 'AWAITING_ASSIGNMENT'
          ? 'ASSIGNMENT'
          : project.intake_status === 'PENDING_TL_REVIEW'
            ? 'TEAM_LEAD_REVIEW'
            : project.intake_status === 'ACCEPTED'
              ? 'TASK_BREAKDOWN'
              : 'EXECUTION'
    ),
    last_update_at: project.last_update_at || project.updated_at,
    remarks: project.remarks || [],
    team_lead_id: teamLead.team_lead_id,
    team_lead_name: teamLead.team_lead_name,
    intake_status:
      project.intake_status ||
      (project.status === 'COMPLETED' || project.status === 'CANCELLED'
        ? 'IN_EXECUTION'
        : (project.progress || 0) > 0 || project.plan_initialized || project.tl_accepted_at
          ? 'IN_EXECUTION'
          : teamLead.team_lead_id
            ? 'PENDING_TL_REVIEW'
            : 'AWAITING_ASSIGNMENT'),
  };
}

function latestSubmitted(updates: DailyUpdate[]) {
  return [...updates]
    .filter((item) => item.submission_status === 'SUBMITTED')
    .sort((a, b) => +new Date(b.submitted_at || b.created_at) - +new Date(a.submitted_at || a.created_at));
}

export function deriveHealthAndIssue(project: Project): { health: ProjectHealth; issue?: string } {
  const updates = latestSubmitted(store.getDailyUpdates().filter((item) => item.project_id === project.id));
  const blocked = updates.find((item) => item.work_status === 'BLOCKED');
  const openEscalations = store
    .getEscalations()
    .filter((item) => item.project_id === project.id && item.status === 'OPEN');
  const criticalEsc = openEscalations.find((item) => item.severity === 'CRITICAL');
  const delayedProcurement = store
    .getProcurementRequests()
    .find((item) => item.project_id === project.id && item.status === 'DELAYED');
  const overdue =
    Boolean(project.target_completion) &&
    project.status === 'ACTIVE' &&
    project.progress < 100 &&
    project.target_completion! < new Date().toISOString().slice(0, 10);

  let issue: string | undefined;
  if (blocked?.blocker) issue = blocked.blocker.startsWith('BLOCKED') ? blocked.blocker : blocked.blocker;
  else if (criticalEsc) issue = criticalEsc.summary || criticalEsc.issue;
  else if (openEscalations[0]) issue = openEscalations[0].summary || openEscalations[0].issue;
  else if (delayedProcurement) issue = delayedProcurement.impact || `${delayedProcurement.request} delayed`;
  else if (project.issue && project.issue !== '—') issue = project.issue;

  if (criticalEsc || (blocked && openEscalations.length > 0)) {
    return { health: 'CRITICAL', issue };
  }
  if (blocked || delayedProcurement || overdue || openEscalations.length > 0) {
    return { health: 'AT_RISK', issue };
  }
  if (issue) {
    if (/critical|blocked/i.test(issue)) return { health: 'CRITICAL', issue };
    if (/delay|procurement|shortage|risk/i.test(issue)) return { health: 'AT_RISK', issue };
  }
  return { health: 'ON_TRACK', issue };
}

export function refreshProjectConditions(project: Project): Project {
  const hydrated = hydrateProject(project);
  const derived = deriveHealthAndIssue(hydrated);
  const latest = latestSubmitted(store.getDailyUpdates().filter((item) => item.project_id === project.id))[0];
  return withComputedProgress({
    ...hydrated,
    health: derived.health,
    issue: derived.issue,
    last_update_at: latest?.submitted_at || hydrated.last_update_at,
  });
}

export function persistRefreshedProjects() {
  const projects = store.getProjects();
  let changed = false;
  const next = projects.map((project) => {
    const refreshed = refreshProjectConditions(project);
    if (
      refreshed.health !== project.health ||
      (refreshed.issue || '') !== (project.issue || '') ||
      refreshed.value !== project.value ||
      refreshed.progress !== project.progress
    ) {
      changed = true;
      if (refreshed.health !== project.health) {
        store.appendAudit({
          user_id: 'system',
          user_name: 'System',
          user_role: 'System',
          entity_type: 'PROJECT',
          entity_id: project.id,
          entity_name: project.code,
          action: 'HEALTH_CHANGED',
          description: `${project.code} health ${project.health} → ${refreshed.health}${refreshed.issue ? ` (${refreshed.issue})` : ''}`,
          old_value: project.health,
          new_value: refreshed.health,
        });
      }
      return { ...refreshed, updated_at: new Date().toISOString() };
    }
    return refreshed;
  });
  if (changed) store.saveProjects(next);
  return next.map(hydrateProject);
}

export function syncConvertedLeadsToProjects() {
  const leads = store.getLeads().filter((lead) => lead.status === 'ORDER_CONVERTED' || lead.status === 'WON');
  const projects = store.getProjects();
  const pm = findPm();
  let added = false;
  const now = new Date().toISOString();

  for (const lead of leads) {
    if (projects.some((project) => project.lead_id === lead.id || project.id === lead.project_id)) continue;
    const project: Project = {
      id: newId('prj'),
      code: `PRJ-${String(projects.length + 1).padStart(3, '0')}`,
      name: lead.title,
      customer_name: lead.customer_name,
      pm_id: lead.pm_id || pm?.id || lead.sales_owner_id || 'u-pm',
      pm_name: lead.pm_name || pm?.name || lead.sales_owner || 'Project Manager',
      progress: 0,
      health: 'ON_TRACK',
      status: 'ACTIVE',
      lead_id: lead.id,
      team_ids: lead.assigned_team_id ? [lead.assigned_team_id] : [],
        team_lead_id: lead.assigned_team_lead_id,
        team_lead_name: lead.assigned_team_lead_name,
        intake_status: lead.assigned_team_lead_id ? 'PENDING_TL_REVIEW' : 'AWAITING_ASSIGNMENT',
        assignment_path: lead.assigned_team_lead_id ? 'TEAM_LEAD' : undefined,
      value: typeof lead.expected_value === 'number' ? lead.expected_value : parseMoney(lead.estimated_opportunity_value),
      start_date: now.slice(0, 10),
      target_completion: addDays(now, 90),
      current_phase: 'EXECUTION',
      last_update_at: now,
      plan_initialized: false,
      created_at: now,
      updated_at: now,
    };
    projects.unshift(project);
    added = true;
    store.appendAudit({
      user_id: lead.created_by_id,
      user_name: lead.created_by,
      user_role: lead.created_by_role || 'Business Head',
      entity_type: 'PROJECT',
      entity_id: project.id,
      entity_name: project.code,
      action: 'PROJECT_CREATED',
      description: `${lead.lead_number} converted to active project ${project.code}.`,
    });
  }

  if (added) store.saveProjects(projects);
  return persistRefreshedProjects();
}

export function listVisibleProjects(user: User, status: ProjectStatus | 'ALL' = 'ACTIVE') {
  syncConvertedLeadsToProjects();
  const projects = persistRefreshedProjects().filter((project) => {
    if (status === 'ALL') return project.status !== 'CANCELLED';
    if (status === 'ACTIVE') return project.status === 'ACTIVE' || project.status === 'HANDOVER';
    return project.status === status;
  });
  return projects.filter((project) => canViewProject(user, project));
}

export function buildProjectDetail(user: User, projectId: string) {
  syncConvertedLeadsToProjects();
  const raw = persistRefreshedProjects().find((item) => item.id === projectId || item.code === projectId);
  if (!raw) return null;
  if (!canViewProject(user, raw)) return { forbidden: true as const };

  const project = hydrateProject(raw);
  const lead = leadFor(project);
  const teams = store.getTeams();
  const users = store.getUsers().filter((item) => item.status === 'ACTIVE');
  const tasks = store.getTasks().filter((task) => task.project_id === project.id);
  const updates = latestSubmitted(store.getDailyUpdates().filter((item) => item.project_id === project.id));
  const escalations = store.getEscalations().filter((item) => item.project_id === project.id);

  const assignedTeams = (project.team_ids || []).map((teamId) => {
    const team = teams.find((item) => item.id === teamId);
    const members = users.filter((item) => item.team_id === teamId && EXECUTION_ROLES.has(item.role_code));
    const memberIds = new Set(members.map((item) => item.id));
    const teamTasks = tasks.filter((task) => memberIds.has(task.assigned_to_id));
    const open = teamTasks.filter((task) => task.status !== 'DONE').length;
    return {
      id: teamId,
      name: team?.name || teamId,
      team_lead_id: team?.team_lead_id,
      team_lead_name: team?.team_lead_name || members.find((item) => item.role_code === 'TEAM_LEAD')?.name,
      members: members.map((member) => ({
        id: member.id,
        name: member.name,
        role_name: member.role_name,
        open_tasks: tasks.filter((task) => task.assigned_to_id === member.id && task.status !== 'DONE').length,
      })),
      workload: { total: teamTasks.length, open },
    };
  });

  const currentTask =
    tasks.find((task) => task.status === 'BLOCKED') ||
    tasks.find((task) => task.status === 'IN_PROGRESS') ||
    tasks.filter((task) => task.status !== 'DONE').sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];

  const latest = updates[0];
  const latestEmployee = updates.find((item) => !['Team Lead', 'Project Manager', 'CEO', 'Business Head'].includes(item.user_role || '')) || latest;
  const latestTl = updates.find((item) => item.user_role === 'Team Lead');
  const latestPmRemark = [...(project.remarks || [])].reverse()[0];

  const upcomingTasks = tasks
    .filter((task) => task.status !== 'DONE' && task.due_date)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const nextMilestone = upcomingTasks[0]
    ? {
        name: upcomingTasks[0].title,
        date: upcomingTasks[0].due_date,
        owner: upcomingTasks[0].assigned_to,
        delayed: (upcomingTasks[0].due_date || '') < new Date().toISOString().slice(0, 10),
      }
    : project.target_completion
      ? {
          name: 'Target completion',
          date: project.target_completion,
          owner: project.pm_name,
          delayed: project.target_completion < new Date().toISOString().slice(0, 10) && project.progress < 100,
        }
      : undefined;

  const delayedMilestones = upcomingTasks
    .filter((task) => (task.due_date || '') < new Date().toISOString().slice(0, 10))
    .map((task) => ({ name: task.title, date: task.due_date, owner: task.assigned_to }));

  return {
    project: {
      ...project,
      lead_number: lead?.lead_number,
    },
    lead: lead
      ? {
          id: lead.id,
          lead_number: lead.lead_number,
          title: lead.title,
          status: lead.status,
          pipeline_stage: lead.pipeline_stage,
          expected_value: lead.expected_value,
        }
      : null,
    canManage: canManageProject(user, project),
    actions: projectActions(user, project),
    workflow: projectWorkflowView(project),
    tasks: ['EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION', 'PROCUREMENT'].includes(user.role_code)
      ? tasks.filter((task) => task.assigned_to_id === user.id)
      : tasks,
    dailyUpdates: (['EMPLOYEE', 'PROJECT_ENGINEER', 'EXECUTION', 'PROCUREMENT'].includes(user.role_code)
      ? updates.filter((item) => item.user_id === user.id)
      : updates
    ).slice(0, 20),
    assignableUsers: assignableUsersFor(project).map((item) => ({
      id: item.id,
      name: item.name,
      role_code: item.role_code,
      role_name: item.role_name,
      team_name: item.team_name,
    })),
    currentStatus: {
      phase: project.current_phase || 'EXECUTION',
      current_task: currentTask?.title || latest?.task_title || 'No open task',
      current_owner: currentTask?.assigned_to || latest?.user_name || project.pm_name,
      current_blocker: project.issue,
      last_update: project.last_update_at,
      next_milestone: nextMilestone,
    },
    teams: assignedTeams,
    progress: project.progress,
    dailyWork: {
      latestEmployee,
      latestTeamLead: latestTl,
      latestPmRemark,
      recentBlockers: updates.filter((item) => item.work_status === 'BLOCKED').slice(0, 5),
      recentCompleted: updates.filter((item) => item.work_status === 'COMPLETED').slice(0, 5),
    },
    delayedMilestones,
    escalations: escalations.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    activity: buildProjectActivity(project.id),
  };
}

export function applyProjectPatch(
  user: User,
  project: Project,
  body: {
    status?: ProjectStatus;
    progress?: number;
    remarks?: string;
    target_completion?: string;
    current_phase?: string;
    issue?: string | null;
  }
) {
  const projects = store.getProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index === -1) return null;
  const now = new Date().toISOString();
  let next: Project = { ...hydrateProject(projects[index]) };

  if (typeof body.progress === 'number' && Number.isFinite(body.progress) && !next.plan_initialized) {
    const progress = Math.max(0, Math.min(100, Math.round(body.progress)));
    if (progress !== next.progress) {
      store.appendAudit({
        user_id: user.id,
        user_name: user.name,
        user_role: user.role_name,
        entity_type: 'PROJECT',
        entity_id: next.id,
        entity_name: next.code,
        action: 'PROGRESS_UPDATED',
        description: `${user.name} set ${next.code} progress ${next.progress}% → ${progress}%`,
        old_value: String(next.progress),
        new_value: String(progress),
      });
    }
    next = { ...next, progress };
  }

  if (body.target_completion) next = { ...next, target_completion: body.target_completion.slice(0, 10) };
  if (body.current_phase) next = { ...next, current_phase: body.current_phase };

  if (body.issue !== undefined) {
    const issue = body.issue === null || body.issue === '' || body.issue === '—' ? undefined : body.issue;
    if (!issue && next.issue) {
      store.appendAudit({
        user_id: user.id,
        user_name: user.name,
        user_role: user.role_name,
        entity_type: 'PROJECT',
        entity_id: next.id,
        entity_name: next.code,
        action: 'BLOCKER_RESOLVED',
        description: `${user.name} cleared blocker on ${next.code}: ${next.issue}`,
        old_value: next.issue,
      });
    }
    next = { ...next, issue };
  }

  if (body.remarks?.trim()) {
    const remark: ProjectRemark = {
      id: newId('rmk'),
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      comment: body.remarks.trim(),
      created_at: now,
    };
    next = { ...next, remarks: [...(next.remarks || []), remark] };
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'PROJECT',
      entity_id: next.id,
      entity_name: next.code,
      action: 'PROJECT_REMARK_ADDED',
      description: `${user.name} added a remark on ${next.code}: ${remark.comment}`,
    });
  }

  if (body.status && body.status !== next.status) {
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'PROJECT',
      entity_id: next.id,
      entity_name: next.code,
      action: body.status === 'COMPLETED' ? 'PROJECT_COMPLETED' : 'PROJECT_STATUS_CHANGED',
      description: `${user.name} set ${next.code} status ${next.status} → ${body.status}`,
      old_value: next.status,
      new_value: body.status,
    });
    next = {
      ...next,
      status: body.status,
      current_phase:
        body.status === 'COMPLETED' ? 'COMPLETED' : body.status === 'HANDOVER' ? 'HANDOVER' : next.current_phase,
      progress: body.status === 'COMPLETED' ? 100 : next.progress,
    };
    const stakeholders = () => {
      const lead = next.lead_id ? store.getLeads().find((item) => item.id === next.lead_id) : undefined;
      const teamMembers = store
        .getUsers()
        .filter((item) => item.status === 'ACTIVE' && item.team_id && (next.team_ids || []).includes(item.team_id))
        .map((item) => item.id);
      return [
        next.team_lead_id,
        next.assigned_member_id,
        lead?.created_by_id,
        lead?.sales_owner_id,
        ...teamMembers,
        ...usersWithRole('BUSINESS_HEAD', 'ENG_DIRECTOR', 'CEO').map((item) => item.id),
      ];
    };
    if (body.status === 'HANDOVER') {
      next = {
        ...next,
        pm_approved_at: now,
        current_phase: 'HANDOVER',
        ...stampProjectAction(user, 'PROJECT_APPROVED'),
      };
      emitWorkflowEvent({
        event: 'PROJECT_APPROVED_FOR_CLOSURE',
        actor: user,
        entityType: 'PROJECT',
        entityId: next.id,
        entityName: next.name,
        recipientIds: stakeholders(),
        customer: next.customer_name,
        status: 'Ready for Handover',
        message: `${user.name} approved ${next.code} for handover. Complete closure documents.`,
        actionUrl: `/projects/${next.id}`,
        eventKey: `PROJECT_APPROVED_FOR_CLOSURE:${next.id}`,
      });
    }
    if (body.status === 'COMPLETED') {
      next = {
        ...next,
        pm_approved_at: next.pm_approved_at || now,
        current_phase: 'COMPLETED',
        ...stampProjectAction(user, 'PROJECT_COMPLETED'),
      };
      emitWorkflowEvent({
        event: 'PROJECT_CLOSED',
        actor: user,
        entityType: 'PROJECT',
        entityId: next.id,
        entityName: next.name,
        recipientIds: stakeholders(),
        customer: next.customer_name,
        status: 'Project Closed',
        message: `${user.name} closed ${next.code}. Handover and closure are complete.`,
        actionUrl: `/projects/${next.id}`,
        eventKey: `PROJECT_CLOSED:${next.id}`,
      });
    }
  }

  next = refreshProjectConditions({ ...next, updated_at: now, last_update_at: now });
  projects[index] = next;
  store.saveProjects(projects);
  return next;
}

export function escalateProject(
  user: User,
  project: Project,
  body: { issue?: string; impact?: string; severity?: Escalation['severity'] }
) {
  const issue = (body.issue || project.issue || project.name).trim();
  const escalation = buildEscalation(user, project, {
    issue,
    impact: body.impact,
    severity: body.severity,
    previous_actions: 'Raised from Active Projects',
    project_name: project.name,
    customer_name: project.customer_name,
  });
  saveEscalation(escalation);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'ESCALATION',
    entity_id: escalation.id,
    entity_name: project.code,
    action: 'ESCALATION_RAISED',
    description: `${user.name} escalated ${project.code}: ${escalation.issue}`,
  });
  notifyEscalationOwner(escalation, user.name);
  persistProjectIssue(user, project, issue);
  return escalation;
}

function persistProjectIssue(user: User, project: Project, issue: string) {
  const projects = store.getProjects();
  const index = projects.findIndex((item) => item.id === project.id);
  if (index === -1) return;
  projects[index] = {
    ...projects[index],
    issue,
    monitor_status: 'ISSUE_IDENTIFIED',
    current_phase: 'ESCALATION',
    ...stampProjectAction(user, 'ISSUE_ESCALATED'),
    updated_at: new Date().toISOString(),
  };
  store.saveProjects(projects);
}

function nextProjectCode(projects: Project[]) {
  const numbers = projects
    .map((item) => Number(String(item.code || '').replace(/\D/g, '')))
    .filter((value) => Number.isFinite(value));
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `PRJ-${String(next).padStart(3, '0')}`;
}

export function createDirectProject(user: User, body: Record<string, unknown>) {
  const title = String(body.title || '').trim();
  const customerName = String(body.customer_name || '').trim();
  if (!title) return { error: 'Project title is required.', status: 400 as const };
  if (!customerName) return { error: 'Customer name is required.', status: 400 as const };

  const projects = store.getProjects();
  const requestedId = String(body.id || '').trim();
  const existing = requestedId
    ? projects.find((item) => item.id === requestedId && item.source === 'DIRECT_CREATE')
    : undefined;
  if (requestedId && !existing) {
    return { error: 'Project not found.', status: 404 as const };
  }
  if (existing && existing.created_by_id && existing.created_by_id !== user.id && user.role_code !== 'SYSTEM_ADMIN') {
    return { error: 'You cannot update this project.', status: 403 as const };
  }

  const pm = findPm();
  const now = new Date().toISOString();
  const intakeForm = { ...body };
  delete intakeForm.id;
  delete intakeForm.lead_id;

  const project: Project = {
    id: existing?.id || newId('prj'),
    code: existing?.code || nextProjectCode(projects),
    name: title,
    customer_name: customerName,
    pm_id: existing?.pm_id || pm?.id || user.id,
    pm_name: existing?.pm_name || pm?.name || user.name,
    progress: existing?.progress ?? 0,
    health: existing?.health || 'ON_TRACK',
    status: existing?.status || 'ACTIVE',
    team_ids: existing?.team_ids || [],
    value: parseMoney(body.estimated_opportunity_value ?? body.expected_value ?? existing?.value),
    start_date: existing?.start_date || now.slice(0, 10),
    target_completion:
      String(body.customer_target_date || existing?.target_completion || addDays(now, 90)).slice(0, 10) || addDays(now, 90),
    current_phase: existing?.current_phase || 'ASSIGNMENT',
    last_update_at: now,
    intake_status: existing?.intake_status || 'AWAITING_ASSIGNMENT',
    source: 'DIRECT_CREATE',
    created_by_id: existing?.created_by_id || user.id,
    created_by_name: existing?.created_by_name || user.name,
    intake_form: intakeForm,
    last_action: existing?.last_action || 'PROJECT_CREATED',
    last_action_by_id: existing?.last_action_by_id || user.id,
    last_action_by_name: existing?.last_action_by_name || user.name,
    last_action_at: existing?.last_action_at || now,
    created_at: existing?.created_at || now,
    updated_at: now,
  };

  if (existing) {
    const index = projects.findIndex((item) => item.id === existing.id);
    projects[index] = { ...existing, ...project, lead_id: existing.lead_id };
    if (!existing.lead_id) delete projects[index].lead_id;
    store.saveProjects(projects);
    store.appendAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'PROJECT',
      entity_id: project.id,
      entity_name: project.code,
      action: 'PROJECT_INTAKE_UPDATED',
      description: `${user.name} updated project ${project.code}.`,
    });
    return { project: projects[index] };
  }

  projects.unshift(project);
  store.saveProjects(projects);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'PROJECT',
    entity_id: project.id,
    entity_name: project.code,
    action: 'PROJECT_CREATED',
    description: `${user.name} created project ${project.code} (${project.name}).`,
  });
  if (project.pm_id && project.pm_id !== user.id) {
    emitWorkflowEvent({
      event: 'PROJECT_SUBMITTED',
      actor: user,
      entityType: 'PROJECT',
      entityId: project.id,
      entityName: project.name,
      recipientIds: [project.pm_id],
      customer: project.customer_name,
      status: 'Awaiting Assignment',
      message: `${user.name} created ${project.code} (${project.name}). Assign it to a Team Lead or Team Member.`,
      actionUrl: `/projects/${project.id}`,
      eventKey: `PROJECT_CREATED:${project.id}`,
      priority: 'HIGH',
    });
  }
  return { project };
}
