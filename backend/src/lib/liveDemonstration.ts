import fs from 'node:fs';
import path from 'node:path';
import { store } from '../store/db.js';
import {
  Lead,
  LiveDemoChecklistItem,
  LiveDemoCustomerDecision,
  LiveDemoCustomerParticipant,
  LiveDemoFollowUpStatus,
  LiveDemoMode,
  LiveDemoOutcome,
  LiveDemoPendingWith,
  LiveDemoRequestSource,
  LiveDemonstration,
  LiveDemoStatus,
  Task,
  User,
} from '../types.js';
import { hasPermission } from './rbac.js';
import { isPendingSignupOnly, isSmokeTestAccount } from './authUser.js';
import {
  audit,
  findLead,
  hydrateLead,
  newId,
  notify,
  saveLead,
  transitionLead,
} from './leadWorkflow.js';
import { LeadWorkflowError } from './leadValidation.js';
import {
  formStatusValue,
  isLiveDemoPendingStatus,
  liveDemoStatusLabel,
  parseLiveDemoFormStatus,
  pendingWithForStatus,
} from './liveDemoStatus.js';

export const LIVE_DEMO_PROCUREMENT_BLOCK_MESSAGE =
  'LIVE Case Demonstration must be completed and the LIVE Case Reference must be verified before Procurement can proceed.';

const WAITING_REASON = 'Customer LIVE system demonstration is required before proceeding to Procurement.';
const WAITING_NEXT_ACTION =
  'Capture the customer LIVE demonstration request, then review, assign and schedule.';
const ORG_TIMEZONE = 'Asia/Kolkata';
const MIGRATION_META_ID = 'live-demo-gate-v1';
const MIGRATION_REQUEST_FLOW_ID = 'live-demo-request-flow-v2';
const REQUEST_SOURCES: LiveDemoRequestSource[] = [
  'CUSTOMER',
  'BUSINESS_HEAD',
  'ENG_DIRECTOR',
  'SALES_OWNER',
  'PROJECT_MANAGER',
  'OTHER',
];
const ACTIVE_REQUEST_STATUSES: LiveDemoStatus[] = [
  'WAITING',
  'REQUESTED',
  'REQUEST',
  'PENDING',
  'PENDING_CUSTOMER',
  'PENDING_INTERNAL',
  'PENDING_BOTH',
  'UNDER_REVIEW',
  'APPROVED',
  'ASSIGNED',
  'SCHEDULED',
  'IN_PROGRESS',
  'DEMONSTRATED',
  'CASE_REFERENCE_PENDING',
  'VERIFICATION_PENDING',
  'VERIFIED',
  'COMPLETED',
  'RESCHEDULED',
];

const ACCEPTABLE_OUTCOMES: LiveDemoOutcome[] = [
  'SUCCESSFUL',
  'SUCCESSFUL_WITH_FOLLOW_UP',
  'PARTIALLY_SUCCESSFUL',
  'CUSTOMER_REQUESTED_CHANGES',
];

const MANDATORY_FOLLOW_UP: LiveDemoOutcome[] = [
  'SUCCESSFUL_WITH_FOLLOW_UP',
  'PARTIALLY_SUCCESSFUL',
  'CUSTOMER_REQUESTED_CHANGES',
];

export const DEFAULT_LIVE_DEMO_CHECKLIST: string[] = [
  'LIVE Care Yu environment available',
  'Required system access confirmed',
  'Customer participants confirmed',
  'Demonstrator confirmed',
  'Support team confirmed',
  'Demonstration requirement prepared',
  'Demo data ready',
  'Meeting link/location confirmed',
];

function nowIso() {
  return new Date().toISOString();
}

function userName(id?: string) {
  if (!id) return '';
  return store.findUserById(id)?.name || '';
}

function namesFor(ids: string[]) {
  return ids.map((id) => userName(id)).filter(Boolean);
}

function defaultChecklist(): LiveDemoChecklistItem[] {
  return DEFAULT_LIVE_DEMO_CHECKLIST.map((label) => ({ id: newId('chk'), label, done: false }));
}

export function solutionCostingCompleted(lead: Lead) {
  return lead.costing?.status === 'APPROVED' && Boolean(lead.costing?.pm_approved_at);
}

export function liveDemoHasPassedProcurement(lead: Lead) {
  if (lead.live_demo_gate_exempt) return true;
  if (['ORDER_CONVERTED', 'WON', 'NEGOTIATION'].includes(lead.status)) return true;
  if (lead.status === 'QUOTATION' && lead.quotation?.sent_at) return true;
  if ((lead.negotiation_history || []).length > 0) return true;
  return false;
}

export function findDemoByLead(leadId: string) {
  return store.getLiveDemonstrations().find((item) => item.lead_id === leadId);
}

function persistDemo(demo: LiveDemonstration) {
  const rows = store.getLiveDemonstrations();
  const index = rows.findIndex((item) => item.id === demo.id);
  const next = { ...demo, updated_at: nowIso() };
  if (index === -1) rows.unshift(next);
  else rows[index] = next;
  store.saveLiveDemonstrations(rows);
  return next;
}

function syncLeadParticipants(lead: Lead, demo: LiveDemonstration) {
  const ids = [
    ...new Set(
      [
        demo.coordinator_id,
        demo.demonstrator_id,
        ...demo.support_user_ids,
        ...demo.internal_participant_ids,
      ].filter(Boolean) as string[]
    ),
  ];
  if (JSON.stringify(lead.live_demo_participant_ids || []) === JSON.stringify(ids)) return lead;
  return saveLead({ ...lead, live_demo_participant_ids: ids });
}

export function isActivePmsUser(user?: User | null) {
  if (!user) return false;
  if (isPendingSignupOnly(user) || isSmokeTestAccount(user)) return false;
  if (user.status !== 'ACTIVE') return false;
  if (user.account_status === 'DISABLED' || user.account_status === 'INVITATION_EXPIRED') return false;
  return true;
}

export function activePmsUsers() {
  return store.getUsers().filter(isActivePmsUser);
}

function assertActiveUserIds(ids: string[]) {
  for (const id of ids) {
    if (!isActivePmsUser(store.findUserById(id))) {
      throw new LeadWorkflowError('Selected users must be active PMS accounts.', 400);
    }
  }
}

function isPlaceholderWaiting(demo: LiveDemonstration) {
  return (
    demo.status === 'WAITING' &&
    !demo.scheduled_date &&
    !demo.started_at &&
    !demo.completed_at &&
    !demo.live_case_reference &&
    !demo.request_source &&
    (demo.reason === WAITING_REASON || !demo.reason)
  );
}

function hasActiveRequest(demo?: LiveDemonstration | null) {
  if (!demo) return false;
  if (['CANCELLED', 'REJECTED'].includes(demo.status)) return false;
  if (isPlaceholderWaiting(demo)) return false;
  return ACTIVE_REQUEST_STATUSES.includes(demo.status);
}

function emptyDemo(lead: Lead, actor?: User): LiveDemonstration {
  const stamp = nowIso();
  return {
    id: newId('ldemo'),
    lead_id: lead.id,
    project_id: lead.project_id,
    status: 'REQUESTED',
    reason: '',
    next_action: 'Review the LIVE demonstration request.',
    support_user_ids: [],
    support_user_names: [],
    internal_participant_ids: [],
    customer_participants: [],
    timezone: ORG_TIMEZONE,
    checklist: defaultChecklist(),
    follow_up_required: false,
    reference_status: 'NOT_ENTERED',
    schedule_history: [],
    pending_history: [],
    status_history: [],
    pending_with: 'NONE',
    created_by: actor?.name,
    created_by_id: actor?.id,
    created_at: stamp,
    updated_at: stamp,
  };
}

/** @deprecated Placeholders are no longer auto-created. Returns existing row only. */
export function ensureWaitingDemo(lead: Lead): LiveDemonstration | undefined {
  return findDemoByLead(lead.id);
}

export function isLiveDemoGateComplete(lead: Lead, demo = findDemoByLead(lead.id)) {
  if (liveDemoHasPassedProcurement(lead) && lead.status !== 'LIVE_CASE_DEMONSTRATION') {
    if (lead.live_demo_gate_exempt) return true;
    if (['QUOTATION', 'NEGOTIATION', 'ORDER_CONVERTED', 'WON'].includes(lead.status) && !demo) return true;
  }
  if (!demo) return false;
  if (!['COMPLETED', 'VERIFIED'].includes(demo.status)) return false;
  const reference = String(demo.live_case_reference || '').trim();
  if (!reference) return false;
  if (demo.reference_status !== 'VERIFIED') return false;
  if (!demo.started_at || !demo.completed_at) return false;
  if (!demo.outcome || !ACCEPTABLE_OUTCOMES.includes(demo.outcome)) return false;
  if (MANDATORY_FOLLOW_UP.includes(demo.outcome) && demo.follow_up_status !== 'COMPLETED') return false;
  return true;
}

export function assertProcurementAllowed(lead: Lead) {
  if (isLiveDemoGateComplete(lead)) return;
  throw new LeadWorkflowError(LIVE_DEMO_PROCUREMENT_BLOCK_MESSAGE, 400);
}

export function canViewLiveDemo(user: User, lead: Lead) {
  if (hasPermission(user, 'view:leads') || hasPermission(user, 'view:dashboard:ceo')) return true;
  const demo = findDemoByLead(lead.id);
  if (!demo) return false;
  return [demo.coordinator_id, demo.demonstrator_id, ...demo.support_user_ids].includes(user.id);
}

export function canScheduleLiveDemo(user: User) {
  return (
    hasPermission(user, 'edit:lead') ||
    hasPermission(user, 'create:quotation') ||
    hasPermission(user, 'review:lead') ||
    hasPermission(user, 'create:lead') ||
    ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN', 'CTO'].includes(user.role_code)
  );
}

export function canVerifyLiveDemo(user: User) {
  return (
    hasPermission(user, 'review:lead') ||
    hasPermission(user, 'approve:costing') ||
    hasPermission(user, 'convert:lead') ||
    hasPermission(user, 'verify:live-demo') ||
    hasPermission(user, 'review:live-demo') ||
    ['PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN', 'CEO', 'CTO'].includes(user.role_code)
  );
}

export function canCreateLiveDemoRequest(user: User) {
  return (
    hasPermission(user, 'create:live-demo-request') ||
    hasPermission(user, 'schedule:live-demo') ||
    ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SALES', 'CTO', 'SYSTEM_ADMIN'].includes(user.role_code)
  );
}

export function canReviewLiveDemo(user: User) {
  return (
    hasPermission(user, 'review:live-demo') ||
    hasPermission(user, 'review:lead') ||
    ['PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN', 'CTO', 'CEO'].includes(user.role_code)
  );
}

export function canAssignLiveDemo(user: User) {
  return (
    hasPermission(user, 'assign:live-demo') ||
    hasPermission(user, 'schedule:live-demo') ||
    ['PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN', 'CTO'].includes(user.role_code)
  );
}

function canOperateScheduledDemo(user: User, demo: LiveDemonstration) {
  if (canScheduleLiveDemo(user)) return true;
  return [demo.coordinator_id, demo.demonstrator_id, ...demo.support_user_ids, ...demo.internal_participant_ids].includes(user.id);
}

function requireCostingComplete(lead: Lead) {
  if (!solutionCostingCompleted(lead)) {
    throw new LeadWorkflowError('LIVE Case Demonstration is available only after Solution & Costing is completed.', 400);
  }
}

function mutateGuard(demo: LiveDemonstration, expected: LiveDemoStatus[]) {
  if (!expected.includes(demo.status)) {
    throw new LeadWorkflowError(`This action is not available while LIVE Case Demonstration is ${demo.status}.`, 409);
  }
}

function notifyTargets(ids: Array<string | undefined>, actor: User, lead: Lead, type: string, title: string, message: string) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id) && id !== actor.id))];
  for (const recipientId of unique) {
    notify({
      recipient_id: recipientId,
      sender_id: actor.id,
      type: 'LIVE_DEMO',
      title,
      message,
      entity_type: 'LEAD',
      entity_id: lead.id,
      action_url: `/pre-sales/leads/${lead.id}?tab=live-demo`,
      event_key: `${type}:${lead.id}:${recipientId}`,
      priority: 'HIGH',
    });
  }
}

function upsertLeadTask(
  lead: Lead,
  actor: User,
  assigneeId: string,
  title: string,
  dueDate: string | undefined,
  description: string,
  existingId?: string,
  liveDemoId?: string,
  pendingAction?: boolean
) {
  const assignee = store.findUserById(assigneeId);
  if (!assignee || !isActivePmsUser(assignee)) return existingId;
  const tasks = store.getTasks();
  const match =
    (existingId ? tasks.find((item) => item.id === existingId) : undefined) ||
    (liveDemoId && pendingAction
      ? tasks.find(
          (item) =>
            item.live_demonstration_id === liveDemoId &&
            item.task_type === 'LEAD_TASK' &&
            item.pending_action === true
        )
      : undefined) ||
    tasks.find(
      (item) =>
        item.lead_id === lead.id &&
        item.task_type === 'LEAD_TASK' &&
        item.title === title &&
        item.assigned_to_id === assignee.id &&
        Boolean(item.pending_action) === Boolean(pendingAction)
    );
  const stamp = nowIso();
  if (match) {
    match.due_date = dueDate || match.due_date;
    match.assigned_to_id = assignee.id;
    match.assigned_to = assignee.name;
    match.title = title;
    match.description = description;
    match.lead_id = lead.id;
    if (liveDemoId) match.live_demonstration_id = liveDemoId;
    if (pendingAction) match.pending_action = true;
    match.updated_at = stamp;
    if (['COMPLETED', 'VERIFIED'].includes(lead.status) === false) {
      /* keep existing task status unless cancelled via demo */
    }
    store.saveTasks(tasks);
    return match.id;
  }
  const task: Task = {
    id: newId('task'),
    lead_id: lead.id,
    live_demonstration_id: liveDemoId,
    lead_name: lead.title,
    lead_stage_at_creation: 'Live Case Demonstration',
    customer_name: lead.customer_name,
    title,
    description,
    status: 'IN_PROGRESS',
    priority: lead.priority,
    due_date: dueDate,
    assigned_to: assignee.name,
    assigned_to_id: assignee.id,
    created_by: actor.name,
    created_by_id: actor.id,
    assigned_by: actor.name,
    assigned_by_id: actor.id,
    task_type: 'LEAD_TASK',
    pending_action: pendingAction || undefined,
    acceptance_status: assignee.id === actor.id ? 'ACCEPTED' : 'REQUESTED',
    progress_percent: 10,
    created_at: stamp,
    updated_at: stamp,
  };
  tasks.unshift(task);
  store.saveTasks(tasks);
  return task.id;
}

function ensureAssignedTasks(lead: Lead, demo: LiveDemonstration, actor: User) {
  const description = [
    demo.customer_requirement || demo.demonstration_requirements || demo.reason || demo.next_action,
    demo.support_user_names.length ? `Support: ${demo.support_user_names.join(' / ')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  let next = demo;
  if (demo.coordinator_id) {
    const taskId = upsertLeadTask(
      lead,
      actor,
      demo.coordinator_id,
      'Arrange Customer LIVE Care Yu Demonstration',
      demo.scheduled_date || demo.preferred_date,
      description,
      demo.task_id
    );
    if (taskId && taskId !== demo.task_id) next = { ...next, task_id: taskId };
  }
  if (demo.demonstrator_id && demo.demonstrator_id !== demo.coordinator_id) {
    const taskId = upsertLeadTask(
      lead,
      actor,
      demo.demonstrator_id,
      'Conduct Customer LIVE Care Yu Demonstration',
      demo.scheduled_date || demo.preferred_date,
      description
    );
    if (!next.task_id && taskId) next = { ...next, task_id: taskId };
  }
  const supportIds: string[] = [];
  for (const userId of demo.support_user_ids) {
    const taskId = upsertLeadTask(
      lead,
      actor,
      userId,
      'Support Customer LIVE Care Yu Demonstration',
      demo.scheduled_date || demo.preferred_date,
      description
    );
    if (taskId) supportIds.push(taskId);
  }
  next = { ...next, support_task_ids: supportIds };
  if (demo.status === 'COMPLETED' || demo.status === 'VERIFIED' || demo.status === 'CANCELLED') {
    const tasks = store.getTasks();
    const ids = [next.task_id, ...(next.support_task_ids || [])].filter(Boolean) as string[];
    for (const task of tasks) {
      if (!ids.includes(task.id)) continue;
      if (demo.status === 'CANCELLED') task.status = 'HOLD';
      else {
        task.status = 'DONE';
        task.progress_percent = 100;
      }
      task.updated_at = nowIso();
    }
    store.saveTasks(tasks);
  }
  if (next.task_id !== demo.task_id || JSON.stringify(next.support_task_ids) !== JSON.stringify(demo.support_task_ids || [])) {
    return persistDemo(next);
  }
  return next;
}

function ensureCoordinatorTask(lead: Lead, demo: LiveDemonstration, actor: User) {
  return ensureAssignedTasks(lead, demo, actor);
}

export function activateAfterCostingApproved(lead: Lead, actor: User): Lead {
  if (lead.status === 'LIVE_CASE_DEMONSTRATION') return hydrateLead(lead);
  return hydrateLead(
    transitionLead(lead, 'LIVE_CASE_DEMONSTRATION', actor, 'Solution & Costing completed — LIVE demonstration required')
  );
}

export function eligibleLeadsForRequest(user: User) {
  if (!canCreateLiveDemoRequest(user) && !hasPermission(user, 'view:leads')) return [];
  return store
    .getLeads()
    .map((lead) => hydrateLead(lead))
    .filter((lead) => {
      if (!solutionCostingCompleted(lead)) return false;
      if (liveDemoHasPassedProcurement(lead) && lead.status !== 'LIVE_CASE_DEMONSTRATION') return false;
      if (!canViewLiveDemo(user, lead) && !canCreateLiveDemoRequest(user)) return false;
      const demo = findDemoByLead(lead.id);
      if (hasActiveRequest(demo)) return false;
      return true;
    })
    .map((lead) => ({
      id: lead.id,
      lead_number: lead.lead_number,
      title: lead.title,
      customer_name: lead.customer_name,
      customer_contact: lead.customer_contact,
      sales_owner: lead.sales_owner,
      current_owner_name: lead.current_owner_name,
      lead_owner: lead.current_owner_name || lead.responsible_user_name,
      status: lead.status,
      required_solution: lead.required_solution,
      costing_status: lead.costing?.status,
    }));
}

export function createLiveDemoRequest(lead: Lead, actor: User, body: Record<string, unknown>) {
  requireCostingComplete(lead);
  if (!canCreateLiveDemoRequest(actor)) {
    throw new LeadWorkflowError('You are not authorized to request a LIVE demonstration.', 403);
  }
  const existing = findDemoByLead(lead.id);
  if (hasActiveRequest(existing)) {
    throw new LeadWorkflowError('A LIVE demonstration request already exists for this lead.', 409);
  }
  const source = String(body.request_source || '').toUpperCase() as LiveDemoRequestSource;
  if (!REQUEST_SOURCES.includes(source)) {
    throw new LeadWorkflowError('Select who requested the LIVE demonstration.', 400);
  }
  const reason = String(body.reason || '').trim();
  if (!reason) throw new LeadWorkflowError('Reason for LIVE Demonstration is required.', 400);
  const customerRequirement = String(body.customer_requirement || body.demonstration_requirements || '').trim();
  if (!customerRequirement) {
    throw new LeadWorkflowError('Describe what the customer wants to see during the LIVE demonstration.', 400);
  }
  const supportIds = asIdList(body.requested_support_user_ids ?? body.support_user_ids);
  assertActiveUserIds(supportIds);
  const demonstratorId = String(body.demonstrator_id || '').trim() || undefined;
  if (demonstratorId) assertActiveUserIds([demonstratorId]);
  const coordinatorId = String(body.coordinator_id || '').trim() || undefined;
  if (coordinatorId) assertActiveUserIds([coordinatorId]);
  let requestedById = String(body.requested_by_id || '').trim() || undefined;
  let requestedByName = String(body.requested_by_name || '').trim();
  if (source === 'CUSTOMER') {
    requestedByName = requestedByName || lead.customer_contact || lead.customer_name;
    requestedById = undefined;
  } else if (source === 'OTHER') {
    if (!requestedByName) throw new LeadWorkflowError('Enter requester details for Other.', 400);
  } else {
    requestedById = requestedById || actor.id;
    const requester = store.findUserById(requestedById);
    if (!requester || !isActivePmsUser(requester)) {
      throw new LeadWorkflowError('Requested By must be an active PMS user.', 400);
    }
    requestedByName = requester.name;
  }
  const selectedStatus = parseLiveDemoFormStatus(body.status) || 'REQUESTED';
  const stamp = nowIso();
  const base = existing && (isPlaceholderWaiting(existing) || ['CANCELLED', 'REJECTED'].includes(existing.status))
    ? existing
    : emptyDemo(lead, actor);
  const draft: LiveDemonstration = {
    ...base,
    ...emptyDemo(lead, actor),
    id: base.id,
    created_at: existing && !isPlaceholderWaiting(existing) && existing.status === 'CANCELLED' ? stamp : base.created_at,
    created_by: actor.name,
    created_by_id: actor.id,
    status: 'REQUESTED',
    request_source: source,
    requested_by_id: requestedById,
    requested_by_name: requestedByName,
    requested_by_role: source === 'CUSTOMER' ? 'Customer' : source === 'OTHER' ? String(body.requested_by_role || 'Other') : store.findUserById(requestedById || actor.id)?.role_name,
    reason,
    customer_requirement: customerRequirement,
    demonstration_requirements: String(body.demonstration_requirements || customerRequirement).trim(),
    additional_notes: String(body.additional_notes || '').trim() || undefined,
    preferred_date: String(body.preferred_date || '').trim() || undefined,
    preferred_time: String(body.preferred_time || '').trim() || undefined,
    mode: ['ON_SITE', 'ONLINE', 'HYBRID'].includes(String(body.mode || '').toUpperCase())
      ? (String(body.mode).toUpperCase() as LiveDemoMode)
      : undefined,
    location: String(body.location || '').trim() || undefined,
    meeting_link: String(body.meeting_link || '').trim() || undefined,
    support_user_ids: supportIds,
    support_user_names: namesFor(supportIds),
    demonstrator_id: demonstratorId,
    demonstrator_name: demonstratorId ? userName(demonstratorId) : undefined,
    coordinator_id: coordinatorId,
    coordinator_name: coordinatorId ? userName(coordinatorId) : undefined,
    internal_participant_ids: asIdList(body.internal_participant_ids),
    customer_participants: Array.isArray(body.customer_participants)
      ? asParticipants(body.customer_participants, lead)
      : [],
    next_action: String(body.next_action || '').trim() || 'Review the LIVE demonstration request.',
    cancellation_reason: undefined,
    cancelled_at: undefined,
    cancelled_by: undefined,
    cancelled_by_id: undefined,
    live_case_reference: String(body.live_case_reference || '').trim() || undefined,
    reference_status: 'NOT_ENTERED',
    checklist: defaultChecklist(),
    updated_by: actor.name,
    updated_by_id: actor.id,
  };
  const statusPatch = applyFormStatusPatch(draft, actor, body, selectedStatus);
  let demo = persistDemo({
    ...draft,
    ...statusPatch,
    status_history: appendStatusHistory(draft, actor, undefined, statusPatch.status || selectedStatus, statusPatch.pending_reason),
  });
  let working = lead;
  if (lead.status !== 'LIVE_CASE_DEMONSTRATION' && !liveDemoHasPassedProcurement(lead)) {
    working = transitionLead(lead, 'LIVE_CASE_DEMONSTRATION', actor, 'Customer LIVE demonstration requested');
  }
  syncLeadParticipants(working, demo);
  demo = ensureAssignedTasks(working, demo, actor);
  if (isLiveDemoPendingStatus(demo.status)) {
    demo = applyPendingWork(working, actor, demo, stamp);
  }
  audit(actor, working, 'LIVE_DEMO_REQUEST_CREATED', `${actor.name} created a LIVE demonstration request for ${working.lead_number}.`);
  if ((statusPatch.status || selectedStatus) !== 'REQUESTED') {
    audit(
      actor,
      working,
      'LIVE_DEMO_STATUS_CHANGED',
      `${actor.name} set LIVE demonstration status to ${liveDemoStatusLabel(statusPatch.status || selectedStatus)} for ${working.lead_number}.`
    );
  }
  if (selectedStatus === 'REQUESTED') {
    notifyTargets(
      [working.pm_id, working.current_owner_id],
      actor,
      working,
      'LIVE_DEMO_REQUEST_CREATED',
      `${working.lead_number} requires a Customer LIVE Care Yu demonstration.`,
      `${working.lead_number} requires a Customer LIVE Care Yu demonstration.`
    );
  }
  notifyTargets(
    [...supportIds, demonstratorId],
    actor,
    working,
    'LIVE_DEMO_SUPPORT_REQUESTED',
    `You have been requested to support the LIVE demonstration for ${working.lead_number}.`,
    `${actor.name} requested your support for the LIVE Care Yu demonstration on ${working.lead_number} — ${working.title}.`
  );
  return { lead: hydrateLead(findLead(working.id) || working), demo };
}

export function reviewLiveDemoRequest(lead: Lead, actor: User, body: Record<string, unknown>) {
  if (!canReviewLiveDemo(actor)) throw new LeadWorkflowError('You are not authorized to review this request.', 403);
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE demonstration request was not found.', 404);
  mutateGuard(demo, ['REQUESTED', 'REQUEST', 'UNDER_REVIEW']);
  const action = String(body.action || '').toLowerCase();
  if (action === 'reject') {
    const reason = String(body.reason || body.review_message || '').trim();
    if (!reason) throw new LeadWorkflowError('A rejection reason is required.', 400);
    const next = persistDemo({
      ...demo,
      status: 'REJECTED',
      review_message: reason,
      next_action: 'Request was rejected. Create a new request if the customer still requires a LIVE demonstration.',
      updated_by: actor.name,
      updated_by_id: actor.id,
    });
    audit(actor, lead, 'LIVE_DEMO_REQUEST_REJECTED', `${actor.name} rejected the LIVE demonstration request for ${lead.lead_number}.`);
    notifyTargets([demo.created_by_id, lead.sales_owner_id], actor, lead, 'LIVE_DEMO_REQUEST_REJECTED', `LIVE demonstration request rejected for ${lead.lead_number}`, reason);
    return { lead: hydrateLead(lead), demo: next };
  }
  if (action === 'more_info' || action === 'request_more_information') {
    const required = String(body.required_information || '').trim();
    const message = String(body.review_message || body.message || '').trim();
    if (!required && !message) throw new LeadWorkflowError('Specify the information required from the requester.', 400);
    const next = persistDemo({
      ...demo,
      status: 'UNDER_REVIEW',
      required_information: required || undefined,
      review_message: message || undefined,
      next_action: 'Requester must provide the additional information.',
      updated_by: actor.name,
      updated_by_id: actor.id,
    });
    notifyTargets([demo.created_by_id], actor, lead, 'LIVE_DEMO_MORE_INFO', `Additional information required for ${lead.lead_number} LIVE demonstration`, message || required);
    return { lead: hydrateLead(lead), demo: next };
  }
  const next = persistDemo({
    ...demo,
    status: 'APPROVED',
    approved_by: actor.name,
    approved_by_id: actor.id,
    approved_at: nowIso(),
    next_action: 'Assign coordinator, demonstrator and support users.',
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  audit(actor, lead, 'LIVE_DEMO_REQUEST_APPROVED', `${actor.name} approved the LIVE demonstration request for ${lead.lead_number}.`);
  notifyTargets([demo.created_by_id, lead.sales_owner_id], actor, lead, 'LIVE_DEMO_REQUEST_APPROVED', `LIVE demonstration request approved for ${lead.lead_number}`, `The LIVE demonstration request for ${lead.lead_number} was approved.`);
  return { lead: hydrateLead(lead), demo: next };
}

export function assignLiveDemonstration(lead: Lead, actor: User, body: Record<string, unknown>) {
  if (!canAssignLiveDemo(actor)) throw new LeadWorkflowError('You are not authorized to assign this demonstration.', 403);
  let demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE demonstration request was not found.', 404);
  mutateGuard(demo, ['APPROVED', 'ASSIGNED']);
  const coordinatorId = String(body.coordinator_id || actor.id).trim();
  const demonstratorId = String(body.demonstrator_id || demo.demonstrator_id || '').trim();
  if (!demonstratorId) throw new LeadWorkflowError('Select a demonstrator.', 400);
  const supportIds = body.support_user_ids != null ? asIdList(body.support_user_ids) : demo.support_user_ids;
  assertActiveUserIds([coordinatorId, demonstratorId, ...supportIds]);
  demo = persistDemo({
    ...demo,
    status: 'ASSIGNED',
    coordinator_id: coordinatorId,
    coordinator_name: userName(coordinatorId),
    demonstrator_id: demonstratorId,
    demonstrator_name: userName(demonstratorId),
    support_user_ids: supportIds,
    support_user_names: namesFor(supportIds),
    internal_participant_ids: body.internal_participant_ids != null ? asIdList(body.internal_participant_ids) : demo.internal_participant_ids,
    assigned_by: actor.name,
    assigned_by_id: actor.id,
    assigned_at: nowIso(),
    next_action: 'Schedule the LIVE Care Yu demonstration.',
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  demo = ensureAssignedTasks(lead, demo, actor);
  syncLeadParticipants(lead, demo);
  audit(actor, lead, 'LIVE_DEMO_ASSIGNED', `${actor.name} assigned the LIVE demonstration for ${lead.lead_number}.`);
  notifyTargets(
    [demo.coordinator_id, demo.demonstrator_id, ...demo.support_user_ids],
    actor,
    lead,
    'LIVE_DEMO_ASSIGNED',
    `You have been assigned to support the LIVE demonstration for ${lead.lead_number}.`,
    `You have been assigned to the LIVE demonstration for ${lead.lead_number}.`
  );
  return { lead: hydrateLead(lead), demo };
}

function parsePendingWith(value: unknown): LiveDemoPendingWith | undefined {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[/\s-]+/g, '_')
    .replace(/_+/g, '_');
  if (raw === 'CARE_YU' || raw === 'CARE_YU_INTERNAL' || raw.includes('INTERNAL')) return 'INTERNAL';
  if (raw === 'CUSTOMER' || raw === 'BOTH' || raw === 'NONE' || raw === 'NOT_APPLICABLE') {
    return raw === 'NOT_APPLICABLE' ? 'NONE' : (raw as LiveDemoPendingWith);
  }
  return undefined;
}

function assertPendingPayload(pendingWith: LiveDemoPendingWith, body: Record<string, unknown>, nextAction: string) {
  if (pendingWith === 'NONE') {
    throw new LeadWorkflowError('Select who the LIVE demonstration is pending with.', 400);
  }
  const pendingReason = String(body.pending_reason || '').trim();
  if (!pendingReason) throw new LeadWorkflowError('Pending Reason is required when status is PENDING.', 400);
  if (!nextAction) throw new LeadWorkflowError('Next Action is required when status is PENDING.', 400);
  const customerAction = String(body.customer_action_required || '').trim();
  const internalAction = String(body.internal_action_required || '').trim();
  const actionOwnerId = String(body.action_owner_id || '').trim();
  const customerOwnerId = String(body.customer_action_owner_id || '').trim();
  if (pendingWith === 'CUSTOMER' || pendingWith === 'BOTH') {
    if (!customerAction) throw new LeadWorkflowError('Customer Action Required is needed when pending with the customer.', 400);
  }
  if (pendingWith === 'INTERNAL' || pendingWith === 'BOTH') {
    if (!internalAction) throw new LeadWorkflowError('Internal Action Required is needed when pending with Care Yu.', 400);
    if (!actionOwnerId) throw new LeadWorkflowError('Select an Action Owner for internal pending work.', 400);
    assertActiveUserIds([actionOwnerId]);
  }
  if (pendingWith === 'BOTH') {
    if (!customerOwnerId) throw new LeadWorkflowError('Select the customer-facing PMS user.', 400);
    assertActiveUserIds([customerOwnerId]);
  }
  return {
    pendingReason,
    customerAction,
    internalAction,
    actionOwnerId: actionOwnerId || undefined,
    customerOwnerId: customerOwnerId || undefined,
  };
}

function canonicalPendingStatus(pendingWith: LiveDemoPendingWith): LiveDemoStatus {
  if (pendingWith === 'CUSTOMER') return 'PENDING_CUSTOMER';
  if (pendingWith === 'BOTH') return 'PENDING_BOTH';
  return 'PENDING_INTERNAL';
}

function appendStatusHistory(
  demo: LiveDemonstration,
  actor: User,
  from: string | undefined,
  to: string,
  detail?: string
) {
  if (from === to) return demo.status_history || [];
  return [
    {
      id: newId('sthist'),
      from,
      to,
      detail,
      changed_by: actor.name,
      changed_by_id: actor.id,
      created_at: nowIso(),
    },
    ...(demo.status_history || []),
  ];
}

function applyFormStatusPatch(
  demo: LiveDemonstration,
  actor: User,
  body: Record<string, unknown>,
  selected: LiveDemoStatus
): Partial<LiveDemonstration> {
  const stamp = nowIso();
  const patch: Partial<LiveDemonstration> = { status: selected };
  if (selected === 'PENDING') {
    const pendingWith = parsePendingWith(body.pending_with);
    if (!pendingWith || pendingWith === 'NONE') {
      throw new LeadWorkflowError('Select Pending with Customer, Internal Team, or Both.', 400);
    }
    selected = canonicalPendingStatus(pendingWith);
    patch.status = selected;
  }
  if (isLiveDemoPendingStatus(selected)) {
    const pendingWith = pendingWithForStatus(selected) === 'NONE' ? parsePendingWith(body.pending_with) : pendingWithForStatus(selected);
    if (!pendingWith || pendingWith === 'NONE') {
      throw new LeadWorkflowError('Select Pending with Customer, Internal Team, or Both.', 400);
    }
    patch.status = canonicalPendingStatus(pendingWith);
    const nextAction = String(body.next_action || '').trim();
    const parsed = assertPendingPayload(pendingWith, body, nextAction);
    patch.pending_with = pendingWith;
    patch.pending_reason = parsed.pendingReason;
    patch.next_action = nextAction;
    patch.customer_action_required = pendingWith === 'INTERNAL' ? undefined : parsed.customerAction;
    patch.internal_action_required = pendingWith === 'CUSTOMER' ? undefined : parsed.internalAction;
    patch.action_owner_id = parsed.actionOwnerId;
    patch.action_owner_name = parsed.actionOwnerId ? userName(parsed.actionOwnerId) : undefined;
    patch.customer_action_owner_id = parsed.customerOwnerId;
    patch.customer_action_owner_name = parsed.customerOwnerId ? userName(parsed.customerOwnerId) : undefined;
    patch.pending_since = isLiveDemoPendingStatus(demo.status) && !demo.pending_resolved_at ? demo.pending_since || stamp : stamp;
    patch.pending_resolved_at = undefined;
    patch.pending_resolved_by = undefined;
    patch.pending_resolved_by_id = undefined;
    patch.pending_resolution_note = undefined;
  } else {
    patch.pending_with = demo.pending_with && isLiveDemoPendingStatus(demo.status) ? 'NONE' : demo.pending_with;
  }

  if (selected === 'SCHEDULED') {
    const date = String(body.preferred_date || body.scheduled_date || demo.scheduled_date || demo.preferred_date || '').trim();
    const time = String(body.preferred_time || body.scheduled_time || demo.scheduled_time || demo.preferred_time || '').trim();
    const mode = String(body.mode || demo.mode || '').toUpperCase() as LiveDemoMode;
    if (!date) throw new LeadWorkflowError('Demonstration Date is required when status is Scheduled.', 400);
    if (!time) throw new LeadWorkflowError('Demonstration Time is required when status is Scheduled.', 400);
    if (!['ON_SITE', 'ONLINE', 'HYBRID'].includes(mode)) {
      throw new LeadWorkflowError('Select demonstration mode: On-site, Online, or Hybrid.', 400);
    }
    const location = String(body.location || demo.location || '').trim();
    const meetingLink = String(body.meeting_link || demo.meeting_link || '').trim();
    if ((mode === 'ON_SITE' || mode === 'HYBRID') && !location) {
      throw new LeadWorkflowError('Location is required for on-site or hybrid demonstrations.', 400);
    }
    if ((mode === 'ONLINE' || mode === 'HYBRID') && !meetingLink) {
      throw new LeadWorkflowError('Meeting link is required for online or hybrid demonstrations.', 400);
    }
    patch.scheduled_date = date;
    patch.scheduled_time = time;
    patch.preferred_date = date;
    patch.preferred_time = time;
    patch.mode = mode;
    patch.location = location || undefined;
    patch.meeting_link = meetingLink || undefined;
  }

  if (selected === 'APPROVED' || selected === 'ASSIGNED') {
    const demonstratorId = String(body.demonstrator_id || demo.demonstrator_id || '').trim();
    if (!demonstratorId) throw new LeadWorkflowError('Select a Demonstrator.', 400);
    assertActiveUserIds([demonstratorId]);
    patch.demonstrator_id = demonstratorId;
    patch.demonstrator_name = userName(demonstratorId);
    if (selected === 'APPROVED' && !demo.approved_at) {
      patch.approved_at = stamp;
      patch.approved_by = actor.name;
      patch.approved_by_id = actor.id;
    }
    if (selected === 'ASSIGNED') {
      patch.assigned_at = demo.assigned_at || stamp;
      patch.assigned_by = demo.assigned_by || actor.name;
      patch.assigned_by_id = demo.assigned_by_id || actor.id;
    }
  }

  if (selected === 'COMPLETED') {
    const outcome = String(body.outcome || demo.outcome || '').trim();
    const demonstrated = String(body.what_was_demonstrated || demo.what_was_demonstrated || '').trim();
    const feedback = String(body.customer_feedback || demo.customer_feedback || '').trim();
    if (!outcome) throw new LeadWorkflowError('Demonstration Outcome is required when status is Completed.', 400);
    if (!demonstrated) throw new LeadWorkflowError('What Was Demonstrated is required when status is Completed.', 400);
    if (!feedback) throw new LeadWorkflowError('Customer Feedback is required when status is Completed.', 400);
    patch.outcome = outcome as LiveDemoOutcome;
    patch.what_was_demonstrated = demonstrated;
    patch.customer_feedback = feedback;
    if (body.customer_questions != null) patch.customer_questions = String(body.customer_questions);
    if (body.issues != null) patch.issues = String(body.issues);
    patch.follow_up_required =
      body.follow_up_required === true || String(body.follow_up_required || '').toUpperCase() === 'YES' || demo.follow_up_required;
    if (body.follow_up_details != null) patch.follow_up_details = String(body.follow_up_details);
    patch.completed_at = demo.completed_at || stamp;
    patch.completed_by = demo.completed_by || actor.name;
    patch.started_at = demo.started_at || stamp;
  }

  if (selected === 'CASE_REFERENCE_PENDING') {
    const reference = String(body.live_case_reference || demo.live_case_reference || '').trim();
    if (reference) {
      patch.live_case_reference = reference;
      patch.reference_status = 'PENDING_VERIFICATION';
    }
  }

  if (selected === 'VERIFICATION_PENDING') {
    const reference = String(body.live_case_reference || demo.live_case_reference || '').trim();
    if (!reference) throw new LeadWorkflowError('Enter the LIVE Case Reference before moving to Verification Pending.', 400);
    patch.live_case_reference = reference;
    patch.reference_status = 'PENDING_VERIFICATION';
  }

  if (selected === 'VERIFIED') {
    const reference = String(body.live_case_reference || demo.live_case_reference || '').trim();
    if (!reference) throw new LeadWorkflowError('A LIVE Case Reference is required before verification.', 400);
    patch.live_case_reference = reference;
    patch.reference_status = 'VERIFIED';
    patch.verified_at = demo.verified_at || stamp;
    patch.verified_by = demo.verified_by || actor.name;
    patch.verified_by_id = demo.verified_by_id || actor.id;
  }

  if (selected === 'IN_PROGRESS') {
    patch.started_at = demo.started_at || stamp;
    patch.started_by = demo.started_by || actor.name;
    patch.started_by_id = demo.started_by_id || actor.id;
  }

  if (selected === 'CANCELLED') {
    const reason = String(body.cancellation_reason || body.reschedule_reason || '').trim();
    if (!reason) throw new LeadWorkflowError('Enter a cancellation reason.', 400);
    patch.cancellation_reason = reason;
    patch.cancelled_at = stamp;
    patch.cancelled_by = actor.name;
    patch.cancelled_by_id = actor.id;
  }

  return patch;
}

function applyPendingWork(lead: Lead, actor: User, demo: LiveDemonstration, stamp: string) {
  if (!isLiveDemoPendingStatus(demo.status)) return demo;
  const pendingWith = demo.pending_with || pendingWithForStatus(demo.status);
  if (demo.action_owner_id && (pendingWith === 'INTERNAL' || pendingWith === 'BOTH')) {
    upsertLeadTask(
      lead,
      actor,
      demo.action_owner_id,
      'Arrange Customer LIVE Care Yu Demonstration',
      demo.scheduled_date || demo.preferred_date,
      [`Lead: ${lead.lead_number}`, demo.pending_reason, demo.internal_action_required, demo.next_action].filter(Boolean).join('\n'),
      undefined,
      demo.id,
      true
    );
  }
  const customerFacingId =
    demo.customer_action_owner_id ||
    (pendingWith === 'CUSTOMER' ? demo.action_owner_id : undefined) ||
    lead.sales_owner_id ||
    lead.current_owner_id ||
    demo.created_by_id;
  if (pendingWith === 'INTERNAL') {
    notifyTargets(
      [demo.action_owner_id],
      actor,
      lead,
      `LIVE_DEMO_PENDING:${lead.id}:${demo.action_owner_id}:${stamp}`,
      `LIVE Demonstration for ${lead.lead_number} requires your action.`,
      demo.internal_action_required || demo.pending_reason || ''
    );
  } else if (pendingWith === 'CUSTOMER') {
    notifyTargets(
      [customerFacingId],
      actor,
      lead,
      `LIVE_DEMO_PENDING:${lead.id}:CUSTOMER:${stamp}`,
      `LIVE Demonstration for ${lead.lead_number} is waiting on the customer.`,
      demo.customer_action_required || demo.pending_reason || ''
    );
  } else if (pendingWith === 'BOTH') {
    notifyTargets(
      [demo.action_owner_id, customerFacingId],
      actor,
      lead,
      `LIVE_DEMO_PENDING:${lead.id}:BOTH:${stamp}`,
      `LIVE Demonstration for ${lead.lead_number} has customer and internal actions pending.`,
      demo.next_action || ''
    );
  }
  return demo;
}

export function markLiveDemoPending(lead: Lead, actor: User, body: Record<string, unknown>) {
  if (!canScheduleLiveDemo(actor) && !canReviewLiveDemo(actor) && !canCreateLiveDemoRequest(actor)) {
    throw new LeadWorkflowError('You are not authorized to update pending status.', 403);
  }
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE demonstration request was not found.', 404);
  if (['COMPLETED', 'VERIFIED', 'CANCELLED', 'REJECTED'].includes(demo.status)) {
    throw new LeadWorkflowError('Pending status cannot be applied to this demonstration.', 409);
  }
  mutateGuard(demo, [
    'REQUESTED',
    'REQUEST',
    'PENDING',
    'PENDING_CUSTOMER',
    'PENDING_INTERNAL',
    'PENDING_BOTH',
    'UNDER_REVIEW',
    'APPROVED',
    'ASSIGNED',
    'SCHEDULED',
    'RESCHEDULED',
  ]);
  const pendingWith = parsePendingWith(body.pending_with);
  if (!pendingWith || pendingWith === 'NONE') {
    throw new LeadWorkflowError('Select Pending With: Customer, Care Yu / Internal, or Both.', 400);
  }
  const nextAction = String(body.next_action || '').trim();
  const parsed = assertPendingPayload(pendingWith, body, nextAction);
  const nextStatus = canonicalPendingStatus(pendingWith);
  const unchanged =
    formStatusValue(demo.status, demo.pending_with) === nextStatus &&
    demo.pending_with === pendingWith &&
    demo.pending_reason === parsed.pendingReason &&
    demo.next_action === nextAction &&
    (demo.customer_action_required || '') === parsed.customerAction &&
    (demo.internal_action_required || '') === parsed.internalAction &&
    (demo.action_owner_id || '') === (parsed.actionOwnerId || '') &&
    (demo.customer_action_owner_id || '') === (parsed.customerOwnerId || '');
  if (unchanged) return { lead: hydrateLead(lead), demo };

  const stamp = nowIso();
  const history = [
    {
      id: newId('pend'),
      pending_with: pendingWith,
      pending_reason: parsed.pendingReason,
      next_action: nextAction,
      customer_action_required: parsed.customerAction || undefined,
      internal_action_required: parsed.internalAction || undefined,
      action_owner_id: parsed.actionOwnerId,
      action_owner_name: parsed.actionOwnerId ? userName(parsed.actionOwnerId) : undefined,
      resolved: false,
      changed_by: actor.name,
      changed_by_id: actor.id,
      created_at: stamp,
    },
    ...(demo.pending_history || []),
  ];
  let next = persistDemo({
    ...demo,
    status: nextStatus,
    pending_with: pendingWith,
    pending_reason: parsed.pendingReason,
    customer_action_required: pendingWith === 'INTERNAL' ? undefined : parsed.customerAction || undefined,
    internal_action_required: pendingWith === 'CUSTOMER' ? undefined : parsed.internalAction || undefined,
    next_action: nextAction,
    action_owner_id: parsed.actionOwnerId,
    action_owner_name: parsed.actionOwnerId ? userName(parsed.actionOwnerId) : undefined,
    customer_action_owner_id: parsed.customerOwnerId,
    customer_action_owner_name: parsed.customerOwnerId ? userName(parsed.customerOwnerId) : undefined,
    pending_since: isLiveDemoPendingStatus(demo.status) && !demo.pending_resolved_at ? demo.pending_since || stamp : stamp,
    pending_resolved_at: undefined,
    pending_resolved_by: undefined,
    pending_resolved_by_id: undefined,
    pending_resolution_note: undefined,
    pending_history: history,
    status_history: appendStatusHistory(demo, actor, demo.status, nextStatus, parsed.pendingReason),
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  next = applyPendingWork(lead, actor, next, stamp);
  audit(
    actor,
    lead,
    'LIVE_DEMO_PENDING_UPDATED',
    `${actor.name} set LIVE demonstration to ${liveDemoStatusLabel(nextStatus)} for ${lead.lead_number}.`
  );
  return { lead: hydrateLead(lead), demo: findDemoByLead(lead.id)! };
}

export function resolveLiveDemoPending(lead: Lead, actor: User, body: Record<string, unknown>) {
  if (!canScheduleLiveDemo(actor) && !canReviewLiveDemo(actor)) {
    throw new LeadWorkflowError('You are not authorized to resolve pending status.', 403);
  }
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE demonstration request was not found.', 404);
  mutateGuard(demo, ['PENDING', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'PENDING_BOTH']);
  const note = String(body.pending_resolution_note || body.resolution || '').trim();
  if (!note) throw new LeadWorkflowError('Enter the resolution / update before clearing pending status.', 400);
  const resume = String(body.resume_status || '').toUpperCase() as LiveDemoStatus;
  let nextStatus: LiveDemoStatus = 'UNDER_REVIEW';
  if (resume === 'SCHEDULED') {
    if (!demo.scheduled_date) {
      throw new LeadWorkflowError('Schedule the demonstration before moving to SCHEDULED.', 400);
    }
    nextStatus = 'SCHEDULED';
  } else if (resume === 'APPROVED' && (demo.approved_at || demo.status === 'PENDING')) nextStatus = demo.approved_at ? 'APPROVED' : 'UNDER_REVIEW';
  else if (resume === 'ASSIGNED' && demo.demonstrator_id) nextStatus = 'ASSIGNED';
  else if (resume === 'UNDER_REVIEW') nextStatus = 'UNDER_REVIEW';
  else if (demo.demonstrator_id) nextStatus = 'ASSIGNED';
  else if (demo.approved_at) nextStatus = 'APPROVED';
  else nextStatus = demo.request_source ? 'REQUESTED' : 'UNDER_REVIEW';

  const stamp = nowIso();
  const history = [
    {
      id: newId('pend'),
      pending_with: demo.pending_with || 'NONE',
      pending_reason: demo.pending_reason || '',
      next_action: note,
      resolved: true,
      resolution_note: note,
      changed_by: actor.name,
      changed_by_id: actor.id,
      created_at: stamp,
    },
    ...(demo.pending_history || []),
  ];
  const next = persistDemo({
    ...demo,
    status: nextStatus,
    pending_with: 'NONE',
    pending_resolved_at: stamp,
    pending_resolved_by: actor.name,
    pending_resolved_by_id: actor.id,
    pending_resolution_note: note,
    pending_history: history,
    status_history: appendStatusHistory(demo, actor, demo.status, nextStatus, note),
    next_action:
      nextStatus === 'SCHEDULED'
        ? 'Conduct the scheduled LIVE Care Yu system demonstration.'
        : nextStatus === 'ASSIGNED'
          ? 'Schedule the LIVE Care Yu demonstration.'
          : 'Continue the LIVE demonstration workflow.',
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  audit(actor, lead, 'LIVE_DEMO_PENDING_RESOLVED', `${actor.name} resolved pending status for ${lead.lead_number}.`);
  return { lead: hydrateLead(lead), demo: next };
}

export function scheduleDemonstration(lead: Lead, actor: User, body: Record<string, unknown>) {
  requireCostingComplete(lead);
  if (!canScheduleLiveDemo(actor)) throw new LeadWorkflowError('You are not authorized to schedule a LIVE demonstration.', 403);
  let working = lead;
  if (lead.status !== 'LIVE_CASE_DEMONSTRATION' && !liveDemoHasPassedProcurement(lead)) {
    working = transitionLead(lead, 'LIVE_CASE_DEMONSTRATION', actor, 'LIVE Case Demonstration scheduled');
  }
  let demo = findDemoByLead(working.id);
  if (!demo || isPlaceholderWaiting(demo)) {
    throw new LeadWorkflowError('Create and approve a LIVE demonstration request before scheduling.', 400);
  }
  if (['COMPLETED', 'VERIFIED'].includes(demo.status)) {
    throw new LeadWorkflowError('LIVE Case Demonstration is already completed for this lead.', 409);
  }
  mutateGuard(demo, [
    'APPROVED',
    'ASSIGNED',
    'SCHEDULED',
    'RESCHEDULED',
    'PENDING',
    'PENDING_CUSTOMER',
    'PENDING_INTERNAL',
    'PENDING_BOTH',
  ]);
  const date = String(body.preferred_date || body.scheduled_date || '').trim();
  const time = String(body.preferred_time || body.scheduled_time || '').trim();
  if (!date) throw new LeadWorkflowError('Demo date is required.', 400);
  const mode = String(body.mode || demo.mode || '').toUpperCase() as LiveDemoMode;
  if (!['ON_SITE', 'ONLINE', 'HYBRID'].includes(mode)) {
    throw new LeadWorkflowError('Select demonstration mode: On-site, Online, or Hybrid.', 400);
  }
  const location = String(body.location || '').trim() || demo.location;
  const meetingLink = String(body.meeting_link || '').trim() || demo.meeting_link;
  if ((mode === 'ON_SITE' || mode === 'HYBRID') && !location) {
    throw new LeadWorkflowError('Location is required for on-site or hybrid demonstrations.', 400);
  }
  if ((mode === 'ONLINE' || mode === 'HYBRID') && !meetingLink) {
    throw new LeadWorkflowError('Meeting link is required for online or hybrid demonstrations.', 400);
  }
  const coordinatorId = String(body.coordinator_id || demo.coordinator_id || actor.id);
  const demonstratorId = String(body.demonstrator_id || demo.demonstrator_id || '').trim();
  if (!demonstratorId) throw new LeadWorkflowError('Select a demonstrator.', 400);
  const supportIds = body.support_user_ids != null ? asIdList(body.support_user_ids) : demo.support_user_ids;
  assertActiveUserIds([coordinatorId, demonstratorId, ...supportIds]);
  const internalIds = body.internal_participant_ids != null ? asIdList(body.internal_participant_ids) : demo.internal_participant_ids;
  const participants = body.customer_participants != null ? asParticipants(body.customer_participants, working) : demo.customer_participants;
  const reschedule = Boolean(demo.scheduled_date) && (demo.scheduled_date !== date || demo.scheduled_time !== time);
  if (reschedule && !String(body.reschedule_reason || body.reason || '').trim()) {
    throw new LeadWorkflowError('A reschedule reason is required.', 400);
  }
  const history = reschedule
    ? [
        {
          id: newId('rsched'),
          old_date: demo.scheduled_date,
          old_time: demo.scheduled_time,
          new_date: date,
          new_time: time,
          reason: String(body.reschedule_reason || body.reason || 'Schedule updated').trim(),
          changed_by: actor.name,
          changed_by_id: actor.id,
          created_at: nowIso(),
        },
        ...demo.schedule_history,
      ]
    : demo.schedule_history;

  demo = persistDemo({
    ...demo,
    status: 'SCHEDULED',
    scheduled_date: date,
    scheduled_time: time || undefined,
    timezone: String(body.timezone || demo.timezone || ORG_TIMEZONE),
    mode,
    location: location || undefined,
    meeting_link: meetingLink || undefined,
    purpose: body.purpose != null ? String(body.purpose).trim() || undefined : demo.purpose,
    scope: body.scope != null ? String(body.scope).trim() || undefined : demo.scope,
    coordinator_id: coordinatorId,
    coordinator_name: userName(coordinatorId),
    demonstrator_id: demonstratorId,
    demonstrator_name: userName(demonstratorId),
    support_user_ids: supportIds,
    support_user_names: namesFor(supportIds),
    internal_participant_ids: internalIds,
    customer_participants: participants,
    next_action: 'Conduct the scheduled LIVE Care Yu system demonstration.',
    cancellation_reason: undefined,
    scheduled_by: actor.name,
    scheduled_by_id: actor.id,
    updated_by: actor.name,
    updated_by_id: actor.id,
    schedule_history: history,
    checklist: demo.checklist?.length ? demo.checklist : defaultChecklist(),
    pending_with: isLiveDemoPendingStatus(demo.status) ? 'NONE' : demo.pending_with,
    pending_resolved_at: isLiveDemoPendingStatus(demo.status) ? nowIso() : demo.pending_resolved_at,
    pending_resolved_by: isLiveDemoPendingStatus(demo.status) ? actor.name : demo.pending_resolved_by,
    pending_resolved_by_id: isLiveDemoPendingStatus(demo.status) ? actor.id : demo.pending_resolved_by_id,
    pending_history:
      isLiveDemoPendingStatus(demo.status)
        ? [
            {
              id: newId('pend'),
              pending_with: demo.pending_with || 'NONE',
              pending_reason: demo.pending_reason || '',
              resolved: true,
              resolution_note: 'Resolved by scheduling the demonstration.',
              changed_by: actor.name,
              changed_by_id: actor.id,
              created_at: nowIso(),
            },
            ...(demo.pending_history || []),
          ]
        : demo.pending_history || [],
    status_history: appendStatusHistory(demo, actor, demo.status, 'SCHEDULED'),
  });
  demo = ensureCoordinatorTask(working, demo, actor);
  syncLeadParticipants(working, demo);
  audit(
    actor,
    working,
    reschedule ? 'LIVE_DEMO_RESCHEDULED' : 'LIVE_DEMO_SCHEDULED',
    reschedule
      ? `${actor.name} rescheduled LIVE demonstration for ${working.lead_number} to ${date}.`
      : `${actor.name} scheduled LIVE demonstration for ${working.lead_number} on ${date}.`
  );
  notifyTargets(
    [demo.coordinator_id, demo.demonstrator_id, working.current_owner_id, working.sales_owner_id],
    actor,
    working,
    reschedule ? 'LIVE_DEMO_RESCHEDULED' : 'LIVE_DEMO_SCHEDULED',
    reschedule
      ? `${working.lead_number} LIVE demonstration rescheduled`
      : `${working.lead_number} requires a Customer LIVE Care Yu demonstration.`,
    `Customer LIVE demonstration scheduled for ${date}${time ? ` ${time}` : ''}.`
  );
  notifyTargets(
    demo.support_user_ids,
    actor,
    working,
    'LIVE_DEMO_SUPPORT',
    `Support required for LIVE demonstration ${working.lead_number}`,
    `Your support is required for the LIVE Care Yu demonstration for ${working.lead_number}.`
  );
  return { lead: hydrateLead(findLead(working.id) || working), demo };
}

export function updateDemonstrationDetails(lead: Lead, actor: User, body: Record<string, unknown>) {
  if (!canScheduleLiveDemo(actor) && !canCreateLiveDemoRequest(actor)) {
    throw new LeadWorkflowError('You are not authorized to update this demonstration.', 403);
  }
  requireCostingComplete(lead);
  let demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE demonstration request was not found.', 404);
  if (['COMPLETED', 'VERIFIED'].includes(demo.status) && parseLiveDemoFormStatus(body.status) == null) {
    throw new LeadWorkflowError('Completed demonstrations cannot be edited.', 409);
  }
  if (['REQUESTED', 'REQUEST', 'UNDER_REVIEW'].includes(demo.status) && demo.created_by_id !== actor.id && !canReviewLiveDemo(actor)) {
    throw new LeadWorkflowError('Only the requester or a reviewer can update this request.', 403);
  }
  const supportIds = body.support_user_ids || body.requested_support_user_ids ? asIdList(body.support_user_ids ?? body.requested_support_user_ids) : demo.support_user_ids;
  if (body.support_user_ids || body.requested_support_user_ids) assertActiveUserIds(supportIds);
  const selectedStatus = parseLiveDemoFormStatus(body.status);
  const statusPatch = selectedStatus ? applyFormStatusPatch(demo, actor, body, selectedStatus) : {};
  const nextStatus = statusPatch.status || demo.status;
  const statusChanged = Boolean(selectedStatus && formStatusValue(demo.status, demo.pending_with) !== formStatusValue(nextStatus, statusPatch.pending_with || demo.pending_with));
  demo = persistDemo({
    ...demo,
    reason: body.reason != null ? String(body.reason).trim() : demo.reason,
    customer_requirement: body.customer_requirement != null ? String(body.customer_requirement).trim() : demo.customer_requirement,
    demonstration_requirements:
      body.demonstration_requirements != null ? String(body.demonstration_requirements).trim() : demo.demonstration_requirements,
    additional_notes: body.additional_notes != null ? String(body.additional_notes).trim() : demo.additional_notes,
    purpose: body.purpose != null ? String(body.purpose) : demo.purpose,
    scope: body.scope != null ? String(body.scope) : demo.scope,
    location: body.location != null ? String(body.location) : demo.location,
    meeting_link: body.meeting_link != null ? String(body.meeting_link) : demo.meeting_link,
    timezone: body.timezone != null ? String(body.timezone) : demo.timezone,
    preferred_date: body.preferred_date != null ? String(body.preferred_date) : demo.preferred_date,
    preferred_time: body.preferred_time != null ? String(body.preferred_time) : demo.preferred_time,
    customer_participants: body.customer_participants ? asParticipants(body.customer_participants, lead) : demo.customer_participants,
    support_user_ids: supportIds,
    support_user_names: namesFor(supportIds),
    coordinator_id: body.coordinator_id ? String(body.coordinator_id) : demo.coordinator_id,
    coordinator_name: body.coordinator_id ? userName(String(body.coordinator_id)) : demo.coordinator_name,
    demonstrator_id: body.demonstrator_id ? String(body.demonstrator_id) : demo.demonstrator_id,
    demonstrator_name: body.demonstrator_id ? userName(String(body.demonstrator_id)) : demo.demonstrator_name,
    ...statusPatch,
    status_history: statusChanged
      ? appendStatusHistory(demo, actor, demo.status, nextStatus, statusPatch.pending_reason)
      : demo.status_history,
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  if (statusChanged && isLiveDemoPendingStatus(demo.status)) {
    applyPendingWork(lead, actor, demo, nowIso());
  }
  if (statusChanged) {
    audit(
      actor,
      lead,
      'LIVE_DEMO_STATUS_CHANGED',
      `${actor.name} changed LIVE demonstration status to ${liveDemoStatusLabel(nextStatus)} for ${lead.lead_number}.`
    );
  }
  syncLeadParticipants(lead, demo);
  return { lead: hydrateLead(lead), demo };
}

export function updateChecklist(lead: Lead, actor: User, body: Record<string, unknown>) {
  if (!canScheduleLiveDemo(actor)) throw new LeadWorkflowError('You are not authorized to update the checklist.', 403);
  let demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE Case Demonstration was not found.', 404);
  if (Array.isArray(body.checklist)) {
    demo = persistDemo({
      ...demo,
      checklist: (body.checklist as LiveDemoChecklistItem[]).map((item) => ({
        id: String(item.id || newId('chk')),
        label: String(item.label || '').trim(),
        done: Boolean(item.done),
      })).filter((item) => item.label),
      updated_by: actor.name,
      updated_by_id: actor.id,
    });
  }
  return { lead: hydrateLead(lead), demo };
}

export function startDemonstration(lead: Lead, actor: User) {
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE Case Demonstration was not found.', 404);
  if (!canOperateScheduledDemo(actor, demo)) {
    throw new LeadWorkflowError('Only assigned users can start this demonstration.', 403);
  }
  if (demo.status === 'IN_PROGRESS' && demo.started_at) {
    return { lead: hydrateLead(lead), demo };
  }
  mutateGuard(demo, ['SCHEDULED', 'RESCHEDULED']);
  const next = persistDemo({
    ...demo,
    status: 'IN_PROGRESS',
    started_at: nowIso(),
    started_by: actor.name,
    started_by_id: actor.id,
    updated_by: actor.name,
    updated_by_id: actor.id,
    next_action: 'Complete the LIVE demonstration and capture customer feedback.',
  });
  audit(actor, lead, 'LIVE_DEMO_STARTED', `${actor.name} started the LIVE demonstration for ${lead.lead_number}.`);
  return { lead: hydrateLead(lead), demo: next };
}

export function completeDemonstration(lead: Lead, actor: User, body: Record<string, unknown>) {
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE Case Demonstration was not found.', 404);
  if (!canOperateScheduledDemo(actor, demo)) {
    throw new LeadWorkflowError('You are not authorized to complete this demonstration.', 403);
  }
  mutateGuard(demo, ['IN_PROGRESS', 'SCHEDULED', 'DEMONSTRATED', 'CASE_REFERENCE_PENDING']);
  const outcome = String(body.outcome || '').toUpperCase() as LiveDemoOutcome;
  if (!['SUCCESSFUL', 'SUCCESSFUL_WITH_FOLLOW_UP', 'PARTIALLY_SUCCESSFUL', 'CUSTOMER_REQUESTED_CHANGES', 'NOT_SUCCESSFUL'].includes(outcome)) {
    throw new LeadWorkflowError('Select a demonstration outcome.', 400);
  }
  const followUpRequired =
    body.follow_up_required === true ||
    body.follow_up_required === 'true' ||
    MANDATORY_FOLLOW_UP.includes(outcome);
  const next = persistDemo({
    ...demo,
    status: outcome === 'NOT_SUCCESSFUL' ? 'DEMONSTRATED' : 'CASE_REFERENCE_PENDING',
    completed_at: demo.completed_at || nowIso(),
    completed_by: demo.completed_by || actor.name,
    completed_by_id: demo.completed_by_id || actor.id,
    started_at: demo.started_at || nowIso(),
    started_by: demo.started_by || actor.name,
    started_by_id: demo.started_by_id || actor.id,
    outcome,
    what_was_demonstrated: String(body.what_was_demonstrated || '').trim() || undefined,
    customer_feedback: String(body.customer_feedback || '').trim() || undefined,
    customer_questions: String(body.customer_questions || '').trim() || undefined,
    customer_concerns: String(body.customer_concerns || '').trim() || undefined,
    requested_changes: String(body.requested_changes || '').trim() || undefined,
    issues: String(body.issues || '').trim() || undefined,
    interest_level: parseInterest(body.interest_level ?? body.customer_interested),
    customer_decision: parseCustomerDecision(body.customer_decision),
    follow_up_required: followUpRequired,
    follow_up_details: String(body.follow_up_details || '').trim() || undefined,
    follow_up_owner_id: body.follow_up_owner_id ? String(body.follow_up_owner_id) : demo.follow_up_owner_id,
    follow_up_owner_name: body.follow_up_owner_id ? userName(String(body.follow_up_owner_id)) : demo.follow_up_owner_name,
    follow_up_date: body.follow_up_date ? String(body.follow_up_date) : demo.follow_up_date,
    follow_up_status: followUpRequired ? demo.follow_up_status || 'OPEN' : demo.follow_up_status,
    next_action:
      outcome === 'NOT_SUCCESSFUL'
        ? 'Demonstration was not successful. Resolve issues before requesting a LIVE Case Reference.'
        : 'Enter the actual customer LIVE Case Reference.',
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  audit(actor, lead, 'LIVE_DEMO_COMPLETED', `${actor.name} completed the LIVE demonstration for ${lead.lead_number}.`);
  return { lead: hydrateLead(lead), demo: next };
}

export function saveLiveCaseReference(lead: Lead, actor: User, raw: unknown) {
  if (!canScheduleLiveDemo(actor)) throw new LeadWorkflowError('You are not authorized to add a LIVE Case Reference.', 403);
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE Case Demonstration was not found.', 404);
  if (!demo.completed_at) throw new LeadWorkflowError('The LIVE demonstration must be completed before a Case Reference can be saved.', 400);
  if (!demo.outcome || !ACCEPTABLE_OUTCOMES.includes(demo.outcome)) {
    throw new LeadWorkflowError('A LIVE Case Reference can be saved only after an acceptable demonstration outcome.', 400);
  }
  const reference = String(raw ?? '').trim();
  if (!reference) throw new LeadWorkflowError('LIVE Case Reference cannot be empty.', 400);
  if (demo.live_case_reference && demo.reference_status !== 'REJECTED' && demo.live_case_reference !== reference) {
    throw new LeadWorkflowError('A LIVE Case Reference is already attached to this lead.', 409);
  }
  if (demo.live_case_reference === reference && demo.reference_status === 'PENDING_VERIFICATION') {
    return { lead: hydrateLead(lead), demo };
  }
  const next = persistDemo({
    ...demo,
    live_case_reference: reference,
    reference_status: 'PENDING_VERIFICATION',
    status: 'VERIFICATION_PENDING',
    next_action: 'Verify the LIVE Case Reference to unlock Procurement.',
    updated_by_id: actor.id,
  });
  audit(actor, lead, 'LIVE_CASE_REFERENCE_ADDED', `${actor.name} added LIVE Case Reference for ${lead.lead_number}.`);
  notifyTargets(
    [lead.pm_id, lead.current_owner_id, lead.sales_owner_id],
    actor,
    lead,
    'LIVE_CASE_REFERENCE_ADDED',
    `LIVE Case Reference has been added for ${lead.lead_number}.`,
    `LIVE Case Reference has been added for ${lead.lead_number}.`
  );
  return { lead: hydrateLead(lead), demo: next };
}

export function verifyLiveCaseReference(lead: Lead, actor: User, body: Record<string, unknown>) {
  if (!canVerifyLiveDemo(actor)) throw new LeadWorkflowError('You are not authorized to verify the LIVE Case Reference.', 403);
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE Case Demonstration was not found.', 404);
  const reject = body.action === 'reject' || body.rejected === true;
  if (reject) {
    const reason = String(body.reason || body.verification_notes || '').trim();
    if (!reason) throw new LeadWorkflowError('A rejection reason is required.', 400);
    const next = persistDemo({
      ...demo,
      reference_status: 'REJECTED',
      verification_notes: reason,
      verified_by: actor.name,
      verified_by_id: actor.id,
      verified_at: nowIso(),
      live_case_reference: undefined,
      status: 'CASE_REFERENCE_PENDING',
      next_action: 'Enter a valid LIVE Case Reference after rejection.',
      updated_by: actor.name,
      updated_by_id: actor.id,
    });
    audit(actor, lead, 'LIVE_CASE_REFERENCE_REJECTED', `${actor.name} rejected the LIVE Case Reference for ${lead.lead_number}.`);
    return { lead: hydrateLead(lead), demo: next };
  }
  if (!String(demo.live_case_reference || '').trim()) {
    throw new LeadWorkflowError('Enter the LIVE Case Reference before verification.', 400);
  }
  if (MANDATORY_FOLLOW_UP.includes(demo.outcome as LiveDemoOutcome) && demo.follow_up_status !== 'COMPLETED') {
    throw new LeadWorkflowError('Complete the mandatory follow-up before verifying the LIVE Case Reference.', 400);
  }
  if (demo.status === 'VERIFIED' && demo.reference_status === 'VERIFIED') {
    return { lead: hydrateLead(lead), demo };
  }
  if (demo.status === 'COMPLETED' && demo.reference_status === 'VERIFIED') {
    return { lead: hydrateLead(lead), demo };
  }
  persistDemo({
    ...demo,
    reference_status: 'VERIFIED',
    verified_by: actor.name,
    verified_by_id: actor.id,
    verified_at: nowIso(),
    verification_notes: String(body.verification_notes || '').trim() || demo.verification_notes,
    status: 'VERIFIED',
    next_action: 'Procurement is unlocked.',
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  ensureCoordinatorTask(lead, findDemoByLead(lead.id)!, actor);
  let nextLead = lead;
  if (lead.status === 'LIVE_CASE_DEMONSTRATION') {
    nextLead = transitionLead(lead, 'QUOTATION', actor, 'LIVE Case Demonstration completed — Procurement unlocked');
  }
  audit(actor, nextLead, 'LIVE_CASE_REFERENCE_VERIFIED', `${actor.name} verified the LIVE Case Reference for ${lead.lead_number}.`);
  audit(actor, nextLead, 'LIVE_DEMO_GATE_COMPLETED', `LIVE Case Demonstration completed for ${lead.lead_number}.`);
  audit(actor, nextLead, 'PROCUREMENT_UNLOCKED', `Procurement is now unlocked for ${lead.lead_number}.`);
  notifyTargets(
    [nextLead.current_owner_id, nextLead.sales_owner_id, nextLead.created_by_id, nextLead.pm_id],
    actor,
    nextLead,
    'LIVE_CASE_REFERENCE_VERIFIED',
    `LIVE Case Reference verified. Procurement is now unlocked.`,
    `LIVE Case Reference verified. Procurement is now unlocked for ${lead.lead_number}.`
  );
  return { lead: hydrateLead(findLead(nextLead.id) || nextLead), demo: findDemoByLead(lead.id)! };
}

export function cancelDemonstration(lead: Lead, actor: User, reasonRaw: unknown) {
  if (!canScheduleLiveDemo(actor)) throw new LeadWorkflowError('You are not authorized to cancel this demonstration.', 403);
  const reason = String(reasonRaw || '').trim();
  if (!reason) throw new LeadWorkflowError('Cancellation reason is required.', 400);
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE Case Demonstration was not found.', 404);
  if (demo.status === 'COMPLETED' || demo.status === 'VERIFIED') throw new LeadWorkflowError('A completed demonstration cannot be cancelled.', 409);
  const next = persistDemo({
    ...demo,
    status: 'CANCELLED',
    cancellation_reason: reason,
    cancelled_at: nowIso(),
    cancelled_by: actor.name,
    cancelled_by_id: actor.id,
    next_action: 'Reschedule the LIVE Care Yu system demonstration.',
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  ensureCoordinatorTask(lead, next, actor);
  audit(actor, lead, 'LIVE_DEMO_CANCELLED', `${actor.name} cancelled the LIVE demonstration for ${lead.lead_number}.`);
  return { lead: hydrateLead(lead), demo: next };
}

export function updateFollowUp(lead: Lead, actor: User, body: Record<string, unknown>) {
  if (!canScheduleLiveDemo(actor)) throw new LeadWorkflowError('You are not authorized to update follow-up.', 403);
  const demo = findDemoByLead(lead.id);
  if (!demo) throw new LeadWorkflowError('LIVE Case Demonstration was not found.', 404);
  const status = String(body.status || demo.follow_up_status || 'OPEN').toUpperCase() as LiveDemoFollowUpStatus;
  if (!['OPEN', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
    throw new LeadWorkflowError('Follow-up status must be Open, In Progress, or Completed.', 400);
  }
  const next = persistDemo({
    ...demo,
    follow_up_required: true,
    follow_up_status: status,
    follow_up_details: body.description != null ? String(body.description) : demo.follow_up_details,
    follow_up_owner_id: body.owner_id ? String(body.owner_id) : demo.follow_up_owner_id,
    follow_up_owner_name: body.owner_id ? userName(String(body.owner_id)) : demo.follow_up_owner_name,
    follow_up_date: body.date ? String(body.date) : demo.follow_up_date,
    updated_by: actor.name,
    updated_by_id: actor.id,
  });
  return { lead: hydrateLead(lead), demo: next };
}

export function proceedToProcurement(lead: Lead, actor: User) {
  assertProcurementAllowed(lead);
  if (!canScheduleLiveDemo(actor) && !canVerifyLiveDemo(actor)) {
    throw new LeadWorkflowError('You are not authorized to proceed to Procurement.', 403);
  }
  if (lead.status === 'LIVE_CASE_DEMONSTRATION') {
    const updated = transitionLead(lead, 'QUOTATION', actor, 'Proceed to Procurement');
    audit(actor, updated, 'PROCUREMENT_UNLOCKED', `${actor.name} opened Procurement for ${lead.lead_number}.`);
    return { lead: hydrateLead(updated), demo: findDemoByLead(lead.id) };
  }
  return { lead: hydrateLead(lead), demo: findDemoByLead(lead.id) };
}

export function summarizeLiveDemonstrations() {
  const today = nowIso().slice(0, 10);
  const rows = store.getLiveDemonstrations().filter((item) => !isPlaceholderWaiting(item));
  const leads = store.getLeads();
  const leadMap = new Map(leads.map((item) => [item.id, item]));
  return {
    requests: rows.filter((item) => item.status === 'REQUESTED' || item.status === 'REQUEST').length,
    waitingForReview: rows.filter((item) => ['REQUESTED', 'REQUEST', 'UNDER_REVIEW'].includes(item.status)).length,
    scheduledToday: rows.filter((item) => item.status === 'SCHEDULED' && item.scheduled_date === today).length,
    inProgress: rows.filter((item) => item.status === 'IN_PROGRESS').length,
    completed: rows.filter((item) => ['COMPLETED', 'VERIFIED'].includes(item.status)).length,
    cancelled: rows.filter((item) => item.status === 'CANCELLED').length,
    caseReferencePending: rows.filter((item) => item.status === 'CASE_REFERENCE_PENDING').length,
    verificationPending: rows.filter(
      (item) => item.status === 'VERIFICATION_PENDING' || item.reference_status === 'PENDING_VERIFICATION'
    ).length,
    pendingCustomer: rows.filter((item) => formStatusValue(item.status, item.pending_with) === 'PENDING_CUSTOMER').length,
    pendingInternal: rows.filter((item) => formStatusValue(item.status, item.pending_with) === 'PENDING_INTERNAL').length,
    pendingBoth: rows.filter((item) => formStatusValue(item.status, item.pending_with) === 'PENDING_BOTH').length,
    procurementUnlocked: leads.filter((lead) => isLiveDemoGateComplete(lead)).length,
    pending: rows.filter((item) =>
      [
        'PENDING',
        'PENDING_CUSTOMER',
        'PENDING_INTERNAL',
        'PENDING_BOTH',
        'REQUESTED',
        'REQUEST',
        'UNDER_REVIEW',
        'APPROVED',
        'ASSIGNED',
        'SCHEDULED',
        'IN_PROGRESS',
        'CASE_REFERENCE_PENDING',
        'VERIFICATION_PENDING',
      ].includes(item.status)
    ).length,
    items: rows.map((demo) => {
      const lead = leadMap.get(demo.lead_id);
      return {
        ...demo,
        lead_number: lead?.lead_number,
        lead_title: lead?.title,
        customer_name: lead?.customer_name,
        procurement_unlocked: lead ? isLiveDemoGateComplete(lead, demo) : false,
        current_owner_name: lead?.current_owner_name,
        sales_owner: lead?.sales_owner,
      };
    }),
  };
}

export function listLiveDemonstrations(query: Record<string, unknown>) {
  const summary = summarizeLiveDemonstrations();
  const search = String(query.search || '').trim().toLowerCase();
  const status = String(query.status || '').trim().toUpperCase();
  const demonstrator = String(query.demonstrator || '').trim().toLowerCase();
  const date = String(query.date || '').trim();
  let items = summary.items;
  if (status) {
    if (status === 'REQUEST') items = items.filter((item) => item.status === 'REQUESTED' || item.status === 'REQUEST');
    else if (status === 'PENDING_CUSTOMER') {
      items = items.filter((item) => formStatusValue(item.status, item.pending_with) === 'PENDING_CUSTOMER');
    } else if (status === 'PENDING_INTERNAL') {
      items = items.filter((item) => formStatusValue(item.status, item.pending_with) === 'PENDING_INTERNAL');
    } else if (status === 'PENDING_BOTH') {
      items = items.filter((item) => formStatusValue(item.status, item.pending_with) === 'PENDING_BOTH');
    } else if (status === 'PENDING') {
      items = items.filter((item) => isLiveDemoPendingStatus(item.status));
    } else if (status === 'VERIFICATION_PENDING') {
      items = items.filter((item) => item.status === 'VERIFICATION_PENDING' || item.reference_status === 'PENDING_VERIFICATION');
    } else items = items.filter((item) => item.status === status);
  }
  if (date) items = items.filter((item) => item.scheduled_date === date);
  if (demonstrator) {
    items = items.filter(
      (item) =>
        (item.demonstrator_name || '').toLowerCase().includes(demonstrator) ||
        item.demonstrator_id === query.demonstrator
    );
  }
  if (search) {
    items = items.filter((item) =>
      [
        item.lead_number,
        item.lead_title,
        item.customer_name,
        item.demonstrator_name,
        item.live_case_reference,
        item.requested_by_name,
        item.reason,
        item.pending_reason,
        item.action_owner_name,
        item.next_action,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }
  return { ...summary, items };
}

export function publicDemoPayload(lead: Lead, demo?: LiveDemonstration | null) {
  const record = demo || findDemoByLead(lead.id) || null;
  const costingDone = solutionCostingCompleted(lead);
  const unlocked = isLiveDemoGateComplete(lead, record || undefined);
  return {
    available: costingDone,
    procurement_locked: !unlocked,
    solution_costing_completed: costingDone,
    live_demo_completed: record?.status === 'COMPLETED' || record?.status === 'VERIFIED',
    live_case_reference: record?.live_case_reference || null,
    live_case_reference_verified: record?.reference_status === 'VERIFIED',
    demonstration: record,
  };
}

function seedCustomerParticipants(lead: Lead): LiveDemoCustomerParticipant[] {
  if (!lead.customer_contact?.trim()) return [];
  return [
    {
      id: newId('cpart'),
      name: lead.customer_contact.trim(),
      designation: lead.customer_designation,
      company: lead.customer_name,
      email: lead.customer_email,
      phone: lead.customer_phone,
    },
  ];
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function asParticipants(value: unknown, lead: Lead): LiveDemoCustomerParticipant[] {
  if (!Array.isArray(value)) return seedCustomerParticipants(lead);
  const rows: LiveDemoCustomerParticipant[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const item = raw as Record<string, unknown>;
    const name = String(item.name || '').trim();
    if (!name) continue;
    const email = String(item.email || '').trim().toLowerCase();
    const key = `${name.toLowerCase()}|${email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: String(item.id || newId('cpart')),
      name,
      designation: String(item.designation || '').trim() || undefined,
      company: String(item.company || lead.customer_name).trim() || lead.customer_name,
      email: email || undefined,
      phone: String(item.phone || '').trim() || undefined,
    });
  }
  return rows;
}

function parseCustomerDecision(value: unknown): LiveDemoCustomerDecision | undefined {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (['PROCEEDING', 'INTERNAL_REVIEW', 'CHANGES_REQUIRED', 'NOT_PROCEEDING', 'UNKNOWN'].includes(raw)) {
    return raw as LiveDemoCustomerDecision;
  }
  if (raw === 'YES') return 'PROCEEDING';
  if (raw === 'NO') return 'NOT_PROCEEDING';
  if (raw === 'NEEDS_INTERNAL_REVIEW') return 'INTERNAL_REVIEW';
  return undefined;
}

function parseInterest(value: unknown): LiveDemonstration['interest_level'] | undefined {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '_');
  if (raw === 'YES' || raw === 'NO' || raw === 'NEEDS_INTERNAL_REVIEW') return raw;
  return undefined;
}

function backupLeadsSnapshot() {
  const dir = path.join(process.cwd(), 'data', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = nowIso().replace(/[:.]/g, '-');
  const file = path.join(dir, `backup_live_demo_gate_${stamp}.json`);
  const leads = store.getLeads().map((lead) => ({
    id: lead.id,
    lead_number: lead.lead_number,
    status: lead.status,
    pipeline_stage: lead.pipeline_stage,
    costing_status: lead.costing?.status,
    quotation_sent_at: lead.quotation?.sent_at,
  }));
  fs.writeFileSync(file, JSON.stringify({ created_at: nowIso(), leads }, null, 2), 'utf8');
  return file;
}

/**
 * v1: exempt leads already past procurement; do not fabricate demo requests.
 * v2: remove canned WAITING placeholders created by the earlier auto-gate.
 * Does not write audit logs or notifications.
 */
export function migrateLiveDemoGate(): { activated: number; exempt: number; removedPlaceholders: number; backup?: string } {
  const systemMeta = store.getSystemMeta();
  let backup: string | undefined;
  let activated = 0;
  let exempt = 0;
  let removedPlaceholders = 0;

  if (!systemMeta.some((item) => item.id === MIGRATION_META_ID)) {
    try {
      backup = backupLeadsSnapshot();
    } catch {
      backup = undefined;
    }
    for (const lead of store.getLeads()) {
      if (!solutionCostingCompleted(lead)) continue;
      if (liveDemoHasPassedProcurement(lead) && lead.status !== 'LIVE_CASE_DEMONSTRATION' && lead.status !== 'QUOTATION') {
        if (!lead.live_demo_gate_exempt) saveLead({ ...lead, live_demo_gate_exempt: true });
        exempt += 1;
        continue;
      }
      if (lead.status === 'QUOTATION' && lead.quotation?.sent_at) {
        if (!lead.live_demo_gate_exempt) saveLead({ ...lead, live_demo_gate_exempt: true });
        exempt += 1;
        continue;
      }
      if (
        (lead.status === 'QUOTATION' && !lead.quotation?.sent_at) ||
        (lead.status === 'COSTING_SUBMITTED' && lead.costing?.status === 'APPROVED')
      ) {
        saveLead({
          ...lead,
          status: 'LIVE_CASE_DEMONSTRATION',
          pipeline_stage: 'LIVE_DEMO',
          next_action: WAITING_NEXT_ACTION,
          action_required: WAITING_REASON,
        });
        activated += 1;
      }
    }
    store.saveSystemMeta([...store.getSystemMeta(), { id: MIGRATION_META_ID, payloadType: 'live-demo-gate' }]);
  }

  if (!store.getSystemMeta().some((item) => item.id === MIGRATION_REQUEST_FLOW_ID)) {
    try {
      backup = backup || backupLeadsSnapshot();
    } catch {
      /* keep prior backup */
    }
    const kept = store.getLiveDemonstrations().filter((demo) => {
      if (!isPlaceholderWaiting(demo)) return true;
      removedPlaceholders += 1;
      if (demo.task_id) {
        const tasks = store.getTasks().filter((task) => {
          if (task.id !== demo.task_id) return true;
          return !(task.title.includes('LIVE Care Yu Demonstration') && (task.progress_percent || 0) <= 10);
        });
        store.saveTasks(tasks);
      }
      return false;
    });
    store.saveLiveDemonstrations(kept);
    store.saveSystemMeta([...store.getSystemMeta(), { id: MIGRATION_REQUEST_FLOW_ID, payloadType: 'live-demo-request-flow' }]);
  }

  return { activated, exempt, removedPlaceholders, backup };
}

export function liveDemoActivity(demo: LiveDemonstration | null | undefined) {
  if (!demo || isPlaceholderWaiting(demo)) return [];
  const events: Array<{ at: string; label: string; detail?: string }> = [];
  if (demo.request_source) {
    events.push({
      at: demo.created_at,
      label: 'LIVE Demo Request Created',
      detail: demo.requested_by_name || demo.reason,
    });
  }
  if (demo.approved_at) events.push({ at: demo.approved_at, label: 'Request Approved', detail: demo.approved_by });
  if (demo.status === 'REJECTED') events.push({ at: demo.updated_at, label: 'Request Rejected', detail: demo.review_message });
  if (demo.assigned_at) {
    events.push({
      at: demo.assigned_at,
      label: 'Demonstrator Assigned',
      detail: [demo.demonstrator_name, demo.support_user_names.join(', ')].filter(Boolean).join(' / '),
    });
  }
  for (const item of [...(demo.status_history || [])].reverse()) {
    events.push({
      at: item.created_at,
      label: liveDemoStatusLabel(item.to),
      detail: [item.from ? liveDemoStatusLabel(item.from) : undefined, item.detail].filter(Boolean).join(' — '),
    });
  }
  for (const item of [...(demo.pending_history || [])].reverse()) {
    events.push({
      at: item.created_at,
      label: item.resolved ? 'Pending Resolved' : `Pending With: ${item.pending_with}`,
      detail: item.resolution_note || item.pending_reason,
    });
  }
  for (const item of [...demo.schedule_history].reverse()) {
    events.push({
      at: item.created_at,
      label: 'Rescheduled',
      detail: `${item.old_date || '—'} → ${item.new_date || '—'}. ${item.reason}`,
    });
  }
  if (demo.scheduled_date && demo.scheduled_by_id) {
    events.push({
      at: demo.updated_at,
      label: 'Demonstration Scheduled',
      detail: `${demo.scheduled_date}${demo.scheduled_time ? ` ${demo.scheduled_time}` : ''}`,
    });
  } else if (demo.scheduled_date) {
    events.push({
      at: demo.updated_at,
      label: 'Demonstration Scheduled',
      detail: `${demo.scheduled_date}${demo.scheduled_time ? ` ${demo.scheduled_time}` : ''}`,
    });
  }
  if (demo.started_at) events.push({ at: demo.started_at, label: 'Demonstration Started', detail: demo.started_by });
  if (demo.completed_at) events.push({ at: demo.completed_at, label: 'Demonstration Completed', detail: demo.outcome });
  if (demo.live_case_reference) {
    events.push({ at: demo.updated_at, label: 'LIVE Case Reference Added', detail: demo.live_case_reference });
  }
  if (demo.reference_status === 'VERIFIED' && demo.verified_at) {
    events.push({ at: demo.verified_at, label: 'LIVE Case Reference Verified', detail: demo.verified_by });
  }
  if (demo.status === 'COMPLETED' || demo.status === 'VERIFIED') {
    events.push({ at: demo.verified_at || demo.updated_at, label: 'Procurement Unlocked' });
  }
  return events.sort((a, b) => a.at.localeCompare(b.at));
}
