import { env } from '../config/env.js';
import { store } from '../store/db.js';
import { AssignmentHistory, Lead, NotificationPreferences, Task, User } from '../types.js';

function newId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  email_enabled: true,
  in_app_enabled: true,
  assignment: true,
  forward: true,
  reminder: true,
  approval: true,
};

export const NOT_RESPONSIBLE_MESSAGE = 'You are not the current responsible person for this item.';

const TERMINAL_LEAD_STATUSES = new Set(['ORDER_CONVERTED', 'WON', 'LOST', 'ON_HOLD', 'DRAFT']);
const PENDING_TASK_STATUSES = new Set(['TODO', 'IN_PROGRESS', 'BLOCKED']);

const LEAD_STAGE_RESPONSIBLE_ROLE: Record<string, string> = {
  SUBMITTED_TO_PM: 'PROJECT_MANAGER',
  UNDER_PM_REVIEW: 'PROJECT_MANAGER',
  RESUBMITTED_TO_PM: 'PROJECT_MANAGER',
  ACCEPTED_FOR_FEASIBILITY: 'PROJECT_MANAGER',
  FEASIBILITY_IN_PROGRESS: 'TEAM_LEAD',
  FEASIBILITY_RETURNED: 'TEAM_LEAD',
  FEASIBILITY_SUBMITTED: 'PROJECT_MANAGER',
  COSTING_IN_PROGRESS: 'PROCUREMENT',
  COSTING_RETURNED: 'PROCUREMENT',
  COSTING_SUBMITTED: 'PROJECT_MANAGER',
  QUOTATION: 'BUSINESS_HEAD',
  NEGOTIATION: 'BUSINESS_HEAD',
};

export function userPreferences(user?: User | null): NotificationPreferences {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...(user?.notification_preferences || {}),
  };
}

export function hoursFromNow(hours: number) {
  return new Date(Date.now() + Math.max(1, hours) * 3600 * 1000).toISOString();
}

export function formatDateTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(+date)) return value;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function isActiveUser(user?: User) {
  return Boolean(user && user.status === 'ACTIVE');
}

function designatedUserForRole(roleCode: string, lead?: Lead): User | undefined {
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE' && user.role_code === roleCode);

  if (roleCode === 'PROJECT_MANAGER') {
    if (env.defaultProjectManagerEmail) {
      const configured = users.find((user) => user.email.toLowerCase() === env.defaultProjectManagerEmail);
      if (configured) return configured;
    }
    if (lead?.pm_id) {
      const named = store.findUserById(lead.pm_id);
      if (isActiveUser(named) && named?.role_code === 'PROJECT_MANAGER') return named;
    }
  }

  if (roleCode === 'TEAM_LEAD' && lead?.assigned_team_lead_id) {
    const named = store.findUserById(lead.assigned_team_lead_id);
    if (isActiveUser(named)) return named;
  }

  if ((roleCode === 'BUSINESS_HEAD' || roleCode === 'SALES' || roleCode === 'ENG_DIRECTOR') && lead?.created_by_id) {
    const creator = store.findUserById(lead.created_by_id);
    if (isActiveUser(creator) && creator?.role_code === roleCode) return creator;
    if (isActiveUser(creator) && lead.sales_owner_id) {
      const owner = store.findUserById(lead.sales_owner_id);
      if (isActiveUser(owner)) return owner;
    }
  }

  return [...users].sort((a, b) => a.employee_id.localeCompare(b.employee_id))[0];
}

export function workflowRoleForLead(lead: Lead): string | undefined {
  return LEAD_STAGE_RESPONSIBLE_ROLE[lead.status];
}

export function resolveResponsibleUser(params: {
  explicitUserId?: string;
  roleCode?: string;
  lead?: Lead;
  fallbackUserId?: string;
}): User | undefined {
  if (params.explicitUserId) {
    const explicit = store.findUserById(params.explicitUserId);
    if (isActiveUser(explicit)) return explicit;
  }

  if (params.lead?.responsible_user_id) {
    const current = store.findUserById(params.lead.responsible_user_id);
    if (isActiveUser(current)) return current;
  }

  const roleCode = params.roleCode || (params.lead ? workflowRoleForLead(params.lead) : undefined);
  if (roleCode) {
    const designated = designatedUserForRole(roleCode, params.lead);
    if (designated) return designated;
  }

  if (params.fallbackUserId) {
    const fallback = store.findUserById(params.fallbackUserId);
    if (isActiveUser(fallback)) return fallback;
  }

  if (params.lead?.created_by_id) {
    const creator = store.findUserById(params.lead.created_by_id);
    if (creator?.reporting_manager_id) {
      const manager = store.findUserById(creator.reporting_manager_id);
      if (isActiveUser(manager)) return manager;
    }
  }

  return undefined;
}

export function findPm(lead?: Lead): User | undefined {
  return resolveResponsibleUser({ roleCode: 'PROJECT_MANAGER', lead });
}

export function isCurrentResponsible(user: User, entity: { responsible_user_id?: string }) {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  return Boolean(entity.responsible_user_id && entity.responsible_user_id === user.id);
}

export function reportingManagerOf(user?: User | null): User | undefined {
  if (!user?.reporting_manager_id) return undefined;
  const manager = store.findUserById(user.reporting_manager_id);
  return isActiveUser(manager) ? manager : undefined;
}

export function appendAssignmentHistory(entry: Omit<AssignmentHistory, 'id'>): AssignmentHistory {
  const history = store.getAssignmentHistory();
  const item: AssignmentHistory = { ...entry, id: newId('asg') };
  history.unshift(item);
  store.saveAssignmentHistory(history);
  return item;
}

export function reminderScheduleFields(pending = true) {
  return {
    pending_action: pending,
    reminder_count: 0,
    last_reminder_at: undefined,
    next_reminder_at: pending ? hoursFromNow(env.reminderAfterHours) : undefined,
    escalated_at: undefined,
    escalated_to_user_id: undefined,
  };
}

export function transferLeadResponsibility(
  lead: Lead,
  newUser: User,
  assignedBy: User,
  reason?: string
): { lead: Lead; previous?: User; history: AssignmentHistory } {
  const previous = lead.responsible_user_id ? store.findUserById(lead.responsible_user_id) : undefined;
  const now = new Date().toISOString();
  const history = appendAssignmentHistory({
    entity_type: 'LEAD',
    entity_id: lead.id,
    previous_responsible_user_id: previous?.id,
    previous_responsible_user_name: previous?.name,
    new_responsible_user_id: newUser.id,
    new_responsible_user_name: newUser.name,
    assigned_by_id: assignedBy.id,
    assigned_by_name: assignedBy.name,
    assigned_at: now,
    reason,
  });

  const next: Lead = {
    ...lead,
    responsible_user_id: newUser.id,
    responsible_user_name: newUser.name,
    responsible_role_code: newUser.role_code,
    assigned_by_id: assignedBy.id,
    assigned_by_name: assignedBy.name,
    assigned_at: now,
    forwarded_by_id: previous ? assignedBy.id : lead.forwarded_by_id,
    forwarded_by_name: previous ? assignedBy.name : lead.forwarded_by_name,
    forwarded_at: previous ? now : lead.forwarded_at,
    last_action_at: undefined,
    ...reminderScheduleFields(true),
  };

  return { lead: next, previous, history };
}

export function transferTaskResponsibility(
  task: Task,
  newUser: User,
  assignedBy: User,
  reason?: string
): { task: Task; previous?: User; history: AssignmentHistory } {
  const previousId = task.responsible_user_id || task.assigned_to_id;
  const previous = previousId ? store.findUserById(previousId) : undefined;
  const now = new Date().toISOString();
  const history = appendAssignmentHistory({
    entity_type: 'TASK',
    entity_id: task.id,
    previous_responsible_user_id: previous?.id,
    previous_responsible_user_name: previous?.name,
    new_responsible_user_id: newUser.id,
    new_responsible_user_name: newUser.name,
    assigned_by_id: assignedBy.id,
    assigned_by_name: assignedBy.name,
    assigned_at: now,
    reason,
  });

  const next: Task = {
    ...task,
    assigned_to_id: newUser.id,
    assigned_to: newUser.name,
    assigned_by_id: assignedBy.id,
    assigned_by: assignedBy.name,
    responsible_user_id: newUser.id,
    responsible_user_name: newUser.name,
    last_action_at: undefined,
    ...reminderScheduleFields(PENDING_TASK_STATUSES.has(task.status)),
    updated_at: now,
  };

  return { task: next, previous, history };
}

export function markLeadActed(lead: Lead, extra: Partial<Lead> = {}): Lead {
  return {
    ...lead,
    ...extra,
    pending_action: false,
    last_action_at: new Date().toISOString(),
    next_reminder_at: undefined,
  };
}

export function leadNeedsReminder(lead: Lead) {
  if (!lead.responsible_user_id) return false;
  if (lead.pending_action === false) return false;
  if (TERMINAL_LEAD_STATUSES.has(lead.status)) return false;
  if (lead.status === 'DRAFT') return false;
  return true;
}

export function taskNeedsReminder(task: Task) {
  const ownerId = task.responsible_user_id || task.assigned_to_id;
  if (!ownerId) return false;
  if (task.pending_action === false) return false;
  if (task.status === 'DONE') return false;
  return PENDING_TASK_STATUSES.has(task.status);
}

export function entityActionUrl(entityType: string, entityId: string) {
  if (entityType === 'LEAD') return `/pre-sales/leads/${entityId}`;
  if (entityType === 'TASK') return `/my-work?task=${encodeURIComponent(entityId)}`;
  if (entityType === 'PROJECT') return `/projects/${entityId}`;
  return '/notifications';
}
