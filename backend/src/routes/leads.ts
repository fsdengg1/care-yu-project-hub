import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { store } from '../store/db.js';
import {
  CostingRecord,
  FeasibilityStudy,
  Lead,
  LeadStatus,
  QuotationRecord,
  User,
} from '../types.js';
import {
  addDocument,
  appendNegotiation,
  assignSubmittedLeadToPm,
  assignTeamToLead,
  audit,
  buildMyWork,
  canEditProjectInput,
  canHandleLeadCommercial,
  canOwnLead,
  canPrepareCosting,
  canPrepareFeasibility,
  handLeadToBusinessHead,
  convertLeadToProject,
  costingTotal,
  emptyCosting,
  emptyFeasibility,
  emptyQuotation,
  findLead,
  findPm,
  hydrateLead,
  isProcurementUser,
  newId,
  notify,
  parseMoney,
  removeDocument,
  saveLead,
  stageFromStatus,
  transitionLead,
} from '../lib/leadWorkflow.js';
import {
  assertLeadValidForSubmit,
  LeadValidationError,
  LeadWorkflowError,
  leadOwnerId,
  PM_REVIEW_STATUSES,
  sanitizeLeadPatch,
  validateLeadPayload,
} from '../lib/leadValidation.js';
import { transact } from '../store/db.js';
import { dispatchHandover } from '../lib/lifecycleNotify.js';
import { fileTypeError, isAllowedFileType, MAX_FILE_SIZE } from '../config/files.js';
import { canAccessEntity } from '../lib/documents.js';
import { notificationService } from '../lib/notificationService.js';
import {
  isCurrentResponsible,
  NOT_RESPONSIBLE_MESSAGE,
  resolveResponsibleUser,
  transferLeadResponsibility,
} from '../lib/responsibility.js';

const router = Router();

function paramId(req: AuthedRequest): string {
  const value = req.params.id;
  return Array.isArray(value) ? value[0] : value;
}

function payloadFor(lead: Lead) {
  const hydrated = hydrateLead(lead);
  return {
    lead: hydrated,
    documents: store.getLeadDocuments().filter((item) => item.lead_id === hydrated.id),
    additionalDocuments: store
      .getEntityDocuments()
      .filter((item) => item.entity_id === hydrated.id && (item.entity_type === 'ADDITIONAL_INPUT' || item.entity_type === 'LEAD'))
      .map((item) => {
        const { file_url: _ignored, ...rest } = item;
        return rest;
      }),
    comments: store.getLeadComments().filter((item) => item.lead_id === hydrated.id),
    activities: store.getLeadActivities().filter((item) => item.lead_id === hydrated.id),
    history: store.getLeadStatusHistory().filter((item) => item.lead_id === hydrated.id),
    assignments: store.getFeasibilityTeamAssignments().filter((item) => item.lead_id === hydrated.id),
    allocations: store.getFeasibilityEmployeeAllocations().filter((item) => item.lead_id === hydrated.id),
    teams: store.getTeams().filter((team) => team.status === 'ACTIVE'),
    users: store.getUsers().filter((user) => user.status === 'ACTIVE'),
    assignmentHistory: store
      .getAssignmentHistory()
      .filter((item) => item.entity_type === 'LEAD' && item.entity_id === hydrated.id),
  };
}

function forbidden(
  res: import('express').Response,
  message = 'Forbidden. This action is not permitted for your role.'
) {
  return res.status(403).json({ message });
}

function recordPmSubmissionNotification(lead: Lead, actor: User, pmId: string) {
  dispatchHandover({
    recipientIds: [pmId],
    actor,
    entityType: 'LEAD',
    entityId: lead.id,
    entityName: lead.title,
    customer: lead.customer_name,
    title: `Project Submitted for PM Review – ${lead.title}`,
    message: `${actor.name} submitted ${lead.lead_number} – ${lead.customer_name} for PM review.`,
    actionRequired: 'Review Project',
    ctaLabel: 'Open Project',
    actionUrl: `/pre-sales/leads/${lead.id}`,
    type: 'NEW_LEAD_TO_PM',
    status: 'Submitted to PM',
    dueDate: lead.customer_target_date || lead.expected_project_timeline,
    assignedBy: actor.name,
    details: [
      ['Project name', lead.title],
      ['Requirements', lead.requirement_summary || lead.detailed_requirement || lead.required_solution || ''],
      ['Priority', String(lead.priority || 'Medium')],
      ['Timeline', lead.expected_project_timeline || lead.customer_target_date || ''],
    ],
    priority: lead.priority === 'Critical' ? 'CRITICAL' : 'HIGH',
    eventKey: `LEAD_SUBMITTED_PM:${lead.id}:${pmId}:${lead.submitted_at || lead.assigned_at}`,
  });
}

function workflowError(res: import('express').Response, error: unknown) {
  if (error instanceof LeadValidationError) {
    return res.status(400).json({ message: error.message, errors: error.errors, warnings: error.warnings });
  }
  if (error instanceof LeadWorkflowError) {
    return res.status(error.status).json({ message: error.message });
  }
  const err = error as Error & { status?: number };
  return res.status(err.status || 500).json({
    message: err.message || 'Unable to complete this lead action.',
  });
}

function submitExistingLead(lead: Lead, user: User, body: Record<string, unknown> = {}): Lead {
  if (PM_REVIEW_STATUSES.includes(lead.status)) {
    throw Object.assign(new Error('This lead has already been submitted to the Project Manager.'), { status: 409 });
  }
  const merged = { ...lead, ...sanitizeLeadPatch(body) } as unknown as Record<string, unknown>;
  const validation = assertLeadValidForSubmit(merged);
  const next: LeadStatus = ['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)
    ? 'RESUBMITTED_TO_PM'
    : 'SUBMITTED_TO_PM';
  const now = new Date().toISOString();
  const withFields = saveLead({
    ...lead,
    ...sanitizeLeadPatch(body),
    id: lead.id,
    lead_number: lead.lead_number,
    created_by: lead.created_by,
    created_by_id: lead.created_by_id,
    created_by_role: lead.created_by_role,
    status: lead.status,
    priority: validation.normalized.priority || lead.priority,
    expected_value: validation.normalized.expected_value ?? lead.expected_value,
    estimated_opportunity_value:
      validation.normalized.expected_value != null
        ? String(validation.normalized.expected_value)
        : lead.estimated_opportunity_value,
  });
  const updated = transitionLead(withFields, next, user, 'Submitted to PM for review', {
    submitted_at: now,
    submitted_by: user.name,
    submitted_by_id: user.id,
    pm_return_reason: undefined,
  });
  const assigned = assignSubmittedLeadToPm(
    updated,
    user,
    next === 'RESUBMITTED_TO_PM' ? 'Lead resubmitted to Project Manager' : 'Lead submitted to Project Manager'
  );
  if (!PM_REVIEW_STATUSES.includes(assigned.status) || leadOwnerId(assigned) !== assigned.pm_id) {
    throw Object.assign(new Error('Lead owner and status did not stay consistent. Submission was rolled back.'), {
      status: 500,
    });
  }
  recordPmSubmissionNotification(assigned, user, assigned.pm_id!);
  audit(user, assigned, next, `${user.name} submitted ${lead.lead_number} to PM.`);
  return assigned;
}

async function notifyPmAssignment(lead: Lead, user: User) {
  if (!lead.pm_id) return;
  try {
    await notificationService.notifyAssignment({
      entityType: 'LEAD',
      entityId: lead.id,
      entityName: `${lead.lead_number} – ${lead.customer_name}`,
      recipientUserId: lead.pm_id,
      assignedByUserId: user.id,
      priority: lead.priority,
      createdOn: lead.created_at,
      eventKey: `LEAD_ASSIGNED:${lead.id}:${lead.pm_id}:${lead.assigned_at}`,
    });
  } catch (error) {
    console.error('[leads] notification failed', error);
  }
}

function isPm(user: User) {
  return user.role_code === 'PROJECT_MANAGER' || user.role_code === 'SYSTEM_ADMIN';
}

function comment(
  lead: Lead,
  user: User,
  text: string,
  type: 'PM Review' | 'Information Request' | 'Sales Response' | 'Internal Comment' | 'General'
) {
  const comments = store.getLeadComments();
  comments.unshift({
    id: newId('comm'),
    lead_id: lead.id,
    author_id: user.id,
    author_name: user.name,
    author_role: user.role_name,
    comment: text,
    comment_type: type,
    created_at: new Date().toISOString(),
  });
  store.saveLeadComments(comments);
}

router.get('/', requireAuth, requirePermission('view:leads', 'create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const leads = store.getLeads().map(hydrateLead).filter((lead) => {
    if (['CEO', 'CTO', 'SYSTEM_ADMIN'].includes(user.role_code)) return true;
    return canOwnLead(user, lead);
  });
  const leadIds = new Set(leads.map((lead) => lead.id));
  res.json({
    leads,
    assignments: store.getFeasibilityTeamAssignments().filter((item) => leadIds.has(item.lead_id)),
  });
});

router.get(
  '/my-work',
  requireAuth,
  requirePermission('view:leads', 'create:lead', 'create:feasibility', 'create:costing'),
  (req: AuthedRequest, res) => {
    res.json(buildMyWork(req.user!));
  }
);

router.get('/:id', requireAuth, requirePermission('view:leads', 'create:lead', 'create:feasibility', 'create:costing'), (req: AuthedRequest, res) => {
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  const user = req.user!;
  if (!canOwnLead(user, lead) && user.role_code !== 'CEO' && user.role_code !== 'CTO') {
    const assigned =
      lead.assigned_team_lead_id === user.id ||
      user.team_id === lead.assigned_team_id ||
      isProcurementUser(user);
    if (!assigned) return forbidden(res);
  }
  return res.json(payloadFor(lead));
});

router.post('/', requireAuth, requirePermission('create:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)) {
    return forbidden(res, 'Only Business Head and Engineering Director can create leads.');
  }
  const body = req.body ?? {};
  if (body.status && body.status !== 'DRAFT' && body.status !== 'SUBMITTED_TO_PM') {
    return res.status(403).json({ message: 'Status cannot be set directly. Use the workflow actions.' });
  }
  const wantsSubmit = body.status === 'SUBMITTED_TO_PM';
  const validation = validateLeadPayload(body, { submit: wantsSubmit });
  if (validation.errors.length) {
    return res.status(400).json({ message: validation.errors[0].message, errors: validation.errors, warnings: validation.warnings });
  }
  const status: LeadStatus = 'DRAFT';
  const expectedValue = validation.normalized.expected_value ?? parseMoney(body.expected_value ?? body.estimated_opportunity_value);
  const now = new Date().toISOString();
  const leads = store.getLeads();
  const nextNumber = `LD-${String(leads.length + 1).padStart(3, '0')}`;

  const lead: Lead = {
    id: body.id && String(body.id).startsWith('lead-') ? body.id : newId('lead'),
    lead_number: body.lead_number || nextNumber,
    title: body.title || '',
    customer_name: body.customer_name || '',
    customer_type: body.customer_type || 'Other',
    business_vertical:
      body.business_vertical || (user.role_code === 'ENG_DIRECTOR' ? 'Engineering Director' : 'Business Head'),
    created_by: user.name,
    created_by_id: user.id,
    created_by_role: user.role_name,
    sales_owner: body.sales_owner || user.name,
    sales_owner_id: body.sales_owner_id || user.id,
    lead_date: now,
    expected_decision_date: body.expected_decision_date,
    priority: validation.normalized.priority || body.priority || 'Medium',
    status,
    customer_contact: body.customer_contact || '',
    customer_designation: body.customer_designation,
    customer_email: body.customer_email,
    customer_phone: body.customer_phone,
    customer_location: body.customer_location,
    plant_location: body.plant_location,
    requirement_summary: body.requirement_summary || '',
    detailed_requirement: body.detailed_requirement || '',
    application: body.application || '',
    industry_process: body.industry_process,
    current_process: body.current_process,
    expected_automation: body.expected_automation,
    customer_objective: body.customer_objective,
    expected_project_timeline: body.expected_project_timeline,
    customer_target_date: body.customer_target_date,
    production_quantity: body.production_quantity,
    production_rate: body.production_rate,
    cycle_time: body.cycle_time,
    shift_pattern: body.shift_pattern,
    operating_hours: body.operating_hours,
    existing_equipment: body.existing_equipment,
    existing_automation: body.existing_automation,
    integration_requirements: body.integration_requirements,
    technical_requirements: body.technical_requirements,
    machine_dimensions: body.machine_dimensions,
    payload: body.payload,
    accuracy_requirement: body.accuracy_requirement,
    environment_conditions: body.environment_conditions,
    technical_specifications: body.technical_specifications,
    technical_assumptions: body.technical_assumptions,
    customer_dependencies: body.customer_dependencies,
    customer_budget: body.customer_budget,
    estimated_opportunity_value: body.estimated_opportunity_value,
    expected_value: expectedValue,
    pipeline_stage: stageFromStatus(status),
    currency: body.currency || 'INR',
    expected_po_date: body.expected_po_date,
    commercial_remarks: body.commercial_remarks,
    additional_notes: body.additional_notes,
    required_documents: body.required_documents,
    competitor_information: body.competitor_information,
    customer_challenge: body.customer_challenge,
    required_solution: body.required_solution,
    project_description: body.project_description,
    custom_fields: Array.isArray(body.custom_fields) ? body.custom_fields : [],
    created_at: now,
    updated_at: now,
    submitted_at: undefined,
    submitted_by: undefined,
    submitted_by_id: undefined,
    current_owner_id: user.id,
    current_owner_name: user.name,
    responsible_user_id: user.id,
    responsible_user_name: user.name,
    responsible_role_code: user.role_code,
  };

  try {
    const created = await transact(() => {
      const current = store.getLeads();
      current.unshift(lead);
      store.saveLeads(current);
      audit(user, lead, 'LEAD_CREATED', `${user.name} created lead ${lead.lead_number}`);
      if (!wantsSubmit) return lead;
      return submitExistingLead(lead, user, body);
    });
    return res.status(201).json(payloadFor(created));
  } catch (error) {
    return workflowError(res, error);
  }
});

router.patch('/:id', requireAuth, requirePermission('edit:lead', 'create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canEditProjectInput(user, lead)) return forbidden(res, 'Only draft or returned leads can be edited by the owner.');
  const body = sanitizeLeadPatch((req.body ?? {}) as Record<string, unknown>);
  const validation = validateLeadPayload({ ...lead, ...body } as Record<string, unknown>, { submit: false });
  if (validation.errors.length) {
    return res.status(400).json({ message: validation.errors[0].message, errors: validation.errors, warnings: validation.warnings });
  }
  const expectedValue =
    validation.normalized.expected_value ??
    (body.expected_value != null || body.estimated_opportunity_value != null
      ? parseMoney(body.expected_value ?? body.estimated_opportunity_value)
      : lead.expected_value);
  const updated = saveLead({
    ...lead,
    ...body,
    id: lead.id,
    lead_number: lead.lead_number,
    created_by: lead.created_by,
    created_by_id: lead.created_by_id,
    created_by_role: lead.created_by_role,
    status: lead.status,
    pipeline_stage: lead.pipeline_stage,
    priority: validation.normalized.priority || lead.priority,
    expected_value: expectedValue,
  });
  audit(user, updated, 'LEAD_DRAFT_UPDATED', `${user.name} updated draft ${updated.lead_number}.`);
  return res.json(payloadFor(updated));
});

router.post('/:id/submit', requireAuth, requirePermission('create:lead', 'edit:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (PM_REVIEW_STATUSES.includes(lead.status)) {
    return res.status(409).json({ message: 'This lead has already been submitted to the Project Manager.' });
  }
  if (!canEditProjectInput(user, lead)) return forbidden(res);
  try {
    const assigned = await transact(() => submitExistingLead(lead, user, (req.body ?? {}) as Record<string, unknown>));
    return res.json(payloadFor(assigned));
  } catch (error) {
    return workflowError(res, error);
  }
});

router.post('/:id/accept', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!isPm(user) && user.role_code !== 'SYSTEM_ADMIN') return forbidden(res);
  if (!isCurrentResponsible(user, lead) && user.role_code !== 'SYSTEM_ADMIN') {
    const ownerId = leadOwnerId(lead);
    const fallbackOwner = resolveResponsibleUser({ lead, roleCode: 'PROJECT_MANAGER' });
    if (ownerId && ownerId !== user.id) {
      return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
    }
    if (!lead.responsible_user_id && fallbackOwner?.id === user.id) {
      // legacy leads without responsible_user_id
    } else if (ownerId && ownerId !== user.id) {
      return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
    }
  }
  if (!PM_REVIEW_STATUSES.includes(lead.status) && lead.status !== 'ACCEPTED_FOR_FEASIBILITY') {
    return res.status(400).json({ message: 'This lead is not awaiting acceptance.' });
  }
  const teamId = String(req.body?.team_id || '').trim();
  if (!teamId) {
    return res.status(400).json({
      message: 'Select a functional team to accept this lead and start feasibility.',
    });
  }
  try {
    const result = assignTeamToLead(lead, user, teamId, req.body?.team_lead_id, req.body?.notes);
    comment(result.lead, user, req.body?.notes || 'Accepted and assigned to team.', 'PM Review');
    if (result.lead.responsible_user_id && result.lead.responsible_user_id !== user.id) {
      try {
        await notificationService.notifyForward({
          entityType: 'LEAD',
          entityId: result.lead.id,
          entityName: result.lead.title,
          recipientUserId: result.lead.responsible_user_id,
          assignedByUserId: user.id,
          previousUserId: result.previousResponsibleUserId,
          reason: req.body?.notes || `Assigned to ${result.lead.assigned_team_name}`,
          eventKey: `LEAD_FORWARDED:${result.lead.id}:${result.lead.responsible_user_id}:${result.lead.assigned_at}`,
        });
      } catch (error) {
        console.error('[leads] accept assignment notification failed', error);
      }
    }
    audit(
      user,
      result.lead,
      'LEAD_ACCEPTED',
      `${user.name} accepted ${lead.lead_number} and assigned ${result.lead.assigned_team_name}.`
    );
    return res.json({ ...payloadFor(result.lead), assignment: result.assignment });
  } catch (error) {
    return workflowError(res, error);
  }
});

router.post('/:id/cancel', requireAuth, requirePermission('review:lead', 'assign:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!isPm(user)) return forbidden(res);
  if (user.role_code !== 'SYSTEM_ADMIN' && leadOwnerId(lead) !== user.id) {
    return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
  }
  if (!PM_REVIEW_STATUSES.includes(lead.status) && lead.status !== 'ACCEPTED_FOR_FEASIBILITY') {
    return res.status(400).json({ message: 'This lead cannot be cancelled in its current status.' });
  }
  const reason = String(req.body?.reason || '').trim();
  if (!reason) return res.status(400).json({ message: 'A rejection reason is required.' });
  const now = new Date().toISOString();
  const updated = transitionLead(lead, 'CANCELLED', user, reason, {
    cancel_reason: reason,
    cancelled_at: now,
    cancelled_by_id: user.id,
    cancelled_by_name: user.name,
    pending_action: false,
    last_action_at: now,
  });
  comment(updated, user, reason, 'PM Review');
  audit(user, updated, 'LEAD_CANCELLED', `${user.name} cancelled ${lead.lead_number}: ${reason}`);
  notify({
    recipient_id: lead.created_by_id,
    type: 'STATUS_CHANGED',
    title: `Lead cancelled: ${lead.lead_number}`,
    message: `${user.name} cancelled "${lead.title}". Reason: ${reason}`,
    entity_type: 'LEAD',
    entity_id: lead.id,
  });
  return res.json(payloadFor(updated));
});

router.post('/:id/forward', requireAuth, async (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!isCurrentResponsible(user, lead)) {
    return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
  }
  const targetId = String(req.body?.responsible_user_id || req.body?.user_id || '').trim();
  const target = store.findUserById(targetId);
  if (!target || target.status !== 'ACTIVE') {
    return res.status(400).json({ message: 'Select an active employee as the next responsible person.' });
  }
  if (target.id === lead.responsible_user_id) {
    return res.status(409).json({ message: 'That employee is already the current responsible person.' });
  }
  const reason = String(req.body?.reason || '').trim() || undefined;
  const transferred = transferLeadResponsibility(lead, target, user, reason);
  const saved = saveLead(transferred.lead);
  try {
    await notificationService.notifyForward({
      entityType: 'LEAD',
      entityId: saved.id,
      entityName: saved.title,
      recipientUserId: target.id,
      assignedByUserId: user.id,
      previousUserId: transferred.previous?.id,
      reason,
      eventKey: `LEAD_FORWARDED:${saved.id}:${target.id}:${saved.assigned_at}`,
    });
  } catch (error) {
    console.error('[leads] forward notification failed', error);
  }
  audit(
    user,
    saved,
    'LEAD_FORWARDED',
    `${user.name} forwarded ${saved.lead_number} to ${target.name}${reason ? `: ${reason}` : '.'}`
  );
  return res.json(payloadFor(saved));
});

router.post('/:id/pm-review', requireAuth, requirePermission('review:lead', 'assign:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!isPm(user)) return forbidden(res);
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (user.role_code !== 'SYSTEM_ADMIN' && leadOwnerId(lead) !== user.id && lead.pm_id !== user.id) {
    return forbidden(res, NOT_RESPONSIBLE_MESSAGE);
  }
  if (!['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM', 'ACCEPTED_FOR_FEASIBILITY'].includes(lead.status)) {
    return res.status(400).json({ message: 'This lead is not awaiting PM review.' });
  }
  const action = req.body?.action as string;
  if (action === 'return') {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'A return reason is required.' });
    const creator = store.findUserById(lead.created_by_id);
    let updated = transitionLead(lead, 'RETURNED_TO_SALES', user, reason, {
      pm_return_reason: reason,
      pm_review_notes: req.body?.notes,
    });
    if (creator) {
      const transferred = transferLeadResponsibility(updated, creator, user, reason);
      updated = saveLead({ ...transferred.lead, pending_action: true });
      try {
        await notificationService.notifyAssignment({
          entityType: 'LEAD',
          entityId: updated.id,
          entityName: updated.title,
          recipientUserId: creator.id,
          assignedByUserId: user.id,
          priority: updated.priority,
          createdOn: updated.created_at,
          eventKey: `LEAD_RETURNED:${updated.id}:${creator.id}:${updated.assigned_at}`,
        });
      } catch (error) {
        console.error('[leads] return notification failed', error);
      }
    }
    comment(updated, user, reason, 'Information Request');
    audit(user, updated, 'LEAD_RETURNED_TO_SALES', `${user.name} returned ${lead.lead_number}: ${reason}`);
    return res.json(payloadFor(updated));
  }

  if (action !== 'approve_assign') {
    return res.status(400).json({ message: 'Action must be approve_assign or return.' });
  }
  const teamId = String(req.body?.team_id || '').trim();
  if (!teamId) return res.status(400).json({ message: 'Select a functional team from Organization Management.' });
  try {
    const result = assignTeamToLead(lead, user, teamId, req.body?.team_lead_id, req.body?.notes);
    comment(result.lead, user, req.body?.notes || 'Approved and assigned to team.', 'PM Review');
    if (result.lead.responsible_user_id && result.lead.responsible_user_id !== user.id) {
      try {
        await notificationService.notifyForward({
          entityType: 'LEAD',
          entityId: result.lead.id,
          entityName: result.lead.title,
          recipientUserId: result.lead.responsible_user_id,
          assignedByUserId: user.id,
          previousUserId: result.previousResponsibleUserId,
          reason: req.body?.notes || `Assigned to ${result.lead.assigned_team_name}`,
          eventKey: `LEAD_FORWARDED:${result.lead.id}:${result.lead.responsible_user_id}:${result.lead.assigned_at}`,
        });
      } catch (error) {
        console.error('[leads] assign notification failed', error);
      }
    }
    audit(
      user,
      result.lead,
      'LEAD_ASSIGNED_TO_TEAM',
      `${user.name} assigned ${lead.lead_number} to ${result.lead.assigned_team_name}.`
    );
    return res.json({ ...payloadFor(result.lead), assignment: result.assignment });
  } catch (error) {
    const err = error as Error & { status?: number };
    return res.status(err.status || 400).json({ message: err.message });
  }
});

router.post('/:id/assign', requireAuth, requirePermission('assign:lead'), async (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!isPm(user)) return forbidden(res);
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  const teamId = String(req.body?.team_id || req.body?.assigned_to || '').trim();
  if (!teamId) return res.status(400).json({ message: 'Select a functional team from Organization Management.' });
  try {
    const result = assignTeamToLead(
      lead,
      user,
      teamId,
      req.body?.team_lead_id,
      req.body?.notes || req.body?.pm_instructions
    );
    if (result.lead.responsible_user_id && result.lead.responsible_user_id !== user.id) {
      try {
        await notificationService.notifyForward({
          entityType: 'LEAD',
          entityId: result.lead.id,
          entityName: result.lead.title,
          recipientUserId: result.lead.responsible_user_id,
          assignedByUserId: user.id,
          previousUserId: result.previousResponsibleUserId,
          reason: req.body?.notes || req.body?.pm_instructions,
          eventKey: `LEAD_FORWARDED:${result.lead.id}:${result.lead.responsible_user_id}:${result.lead.assigned_at}`,
        });
      } catch (error) {
        console.error('[leads] assign notification failed', error);
      }
    }
    return res.json({ ...payloadFor(result.lead), assignment: result.assignment });
  } catch (error) {
    const err = error as Error & { status?: number };
    return res.status(err.status || 400).json({ message: err.message });
  }
});

router.post('/:id/feasibility', requireAuth, requirePermission('create:feasibility', 'view:leads'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canPrepareFeasibility(user, lead) && !isPm(user)) return forbidden(res, 'Only the assigned team can update feasibility.');
  const submit = Boolean(req.body?.submit);
  const current = lead.feasibility_study || emptyFeasibility();
  if (current.status === 'APPROVED' && !isPm(user)) {
    return forbidden(res, 'Approved feasibility is read-only.');
  }
  const study: FeasibilityStudy = emptyFeasibility({
    ...current,
    ...req.body?.study,
    documents: req.body?.study?.documents || current.documents || [],
    status: submit ? 'SUBMITTED' : 'DRAFT',
    submitted_by: submit ? user.name : current.submitted_by,
    submitted_by_id: submit ? user.id : current.submitted_by_id,
    submitted_at: submit ? new Date().toISOString() : current.submitted_at,
  });
  const nextStatus: LeadStatus = submit
    ? 'FEASIBILITY_SUBMITTED'
    : lead.status === 'FEASIBILITY_RETURNED'
      ? 'FEASIBILITY_RETURNED'
      : 'FEASIBILITY_IN_PROGRESS';
  let updated = transitionLead(lead, nextStatus, user, submit ? 'Feasibility submitted to PM' : 'Feasibility draft saved', {
    feasibility_study: study,
  });
  if (submit) {
    const pm = findPm(updated) || (updated.pm_id ? store.findUserById(updated.pm_id) : undefined);
    if (pm && pm.role_code === 'PROJECT_MANAGER') {
      const transferred = transferLeadResponsibility(updated, pm, user, 'Feasibility submitted to Project Manager');
      updated = saveLead({
        ...transferred.lead,
        current_owner_id: pm.id,
        current_owner_name: pm.name,
        pending_action: true,
      });
    }
    notify({
      recipient_id: pm?.id || findPm()?.id || '',
      type: 'FEASIBILITY_SUBMITTED_TO_PM',
      title: `Feasibility Submitted – Review Required – ${lead.title}`,
      message: `${user.name} submitted feasibility for "${lead.title}".`,
      entity_type: 'LEAD',
      entity_id: lead.id,
      action_url: `/pre-sales/leads/${lead.id}?tab=feasibility`,
    });
    audit(user, updated, 'FEASIBILITY_SUBMITTED', `${user.name} submitted feasibility for ${lead.lead_number}.`);
  } else {
    audit(user, updated, 'FEASIBILITY_SAVED', `${user.name} saved feasibility for ${lead.lead_number}.`);
    if (nextStatus === 'FEASIBILITY_IN_PROGRESS' && lead.status !== 'FEASIBILITY_IN_PROGRESS') {
      dispatchHandover({
        recipientIds: [updated.assigned_team_lead_id, updated.pm_id],
        actor: user,
        entityType: 'LEAD',
        entityId: updated.id,
        entityName: updated.title,
        customer: updated.customer_name,
        title: `Feasibility In Progress – ${updated.title}`,
        message: `${user.name} started feasibility for ${updated.lead_number}.`,
        actionRequired: 'Monitor feasibility progress',
        ctaLabel: 'Open Feasibility',
        actionUrl: `/pre-sales/leads/${updated.id}?tab=feasibility`,
        type: 'FEASIBILITY_READY_TO_START',
        status: 'Feasibility In Progress',
        eventKey: `FEASIBILITY_STARTED:${updated.id}`,
      });
    }
  }
  return res.json(payloadFor(updated));
});

router.post(
  '/:id/feasibility/review',
  requireAuth,
  requirePermission('review:lead', 'approve:feasibility'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!isPm(user)) return forbidden(res);
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (lead.status !== 'FEASIBILITY_SUBMITTED') {
      return res.status(400).json({ message: 'Feasibility is not awaiting PM approval.' });
    }
    const action = req.body?.action as string;
    if (action === 'return') {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ message: 'A return reason is required.' });
      const study = emptyFeasibility({ ...(lead.feasibility_study || {}), status: 'RETURNED', pm_return_reason: reason });
      const updated = transitionLead(lead, 'FEASIBILITY_RETURNED', user, reason, {
        feasibility_study: study,
        feasibility_return_reason: reason,
      });
      notify({
        recipient_id: lead.assigned_team_lead_id || '',
        type: 'FEASIBILITY_RETURNED_TO_TEAM',
        title: `Feasibility Correction Required – ${lead.title}`,
        message: `Feasibility requires correction. Please review the PM comments and resubmit.`,
        entity_type: 'LEAD',
        entity_id: lead.id,
        action_url: `/pre-sales/leads/${lead.id}?tab=feasibility`,
      });
      const allocations = store
        .getFeasibilityEmployeeAllocations()
        .filter((item) => item.lead_id === lead.id);
      for (const allocation of allocations) {
        if (allocation.employee_id && allocation.employee_id !== lead.assigned_team_lead_id) {
          notify({
            recipient_id: allocation.employee_id,
            type: 'FEASIBILITY_RETURNED_TO_TEAM',
            title: `Feasibility Correction Required – ${lead.title}`,
            message: `${user.name}: ${reason}`,
            entity_type: 'LEAD',
            entity_id: lead.id,
            action_url: `/pre-sales/leads/${lead.id}?tab=feasibility`,
          });
        }
      }
      audit(user, updated, 'FEASIBILITY_RETURNED', `${user.name} returned feasibility for ${lead.lead_number}.`);
      return res.json(payloadFor(updated));
    }
    const study = emptyFeasibility({
      ...(lead.feasibility_study || {}),
      status: 'APPROVED',
      pm_approved_by: user.name,
      pm_approved_at: new Date().toISOString(),
    });
    const updated = transitionLead(lead, 'COSTING_IN_PROGRESS', user, 'Feasibility approved', { feasibility_study: study });
    store
      .getUsers()
      .filter(isProcurementUser)
      .forEach((member) => {
        notify({
          recipient_id: member.id,
          type: 'COSTING_ASSIGNED',
          title: `Procurement Pending – ${lead.title}`,
          message: `Feasibility approved for "${lead.title}". Start vendor identification, costing, and procurement documentation.`,
          entity_type: 'LEAD',
          entity_id: lead.id,
        });
      });
    audit(user, updated, 'FEASIBILITY_APPROVED', `${user.name} approved feasibility for ${lead.lead_number}.`);
    return res.json(payloadFor(updated));
  }
);

router.post('/:id/costing', requireAuth, requirePermission('create:costing', 'view:leads'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canPrepareCosting(user, lead) && !isPm(user)) return forbidden(res, 'Only Procurement / Costing can update costing.');
  const current = lead.costing || emptyCosting();
  if (current.status === 'APPROVED' && !isPm(user)) {
    return forbidden(res, 'Approved costing is read-only.');
  }
  const submit = Boolean(req.body?.submit);
  const incoming = { ...current, ...(req.body?.costing || {}) } as CostingRecord;
  const record = emptyCosting({
    ...incoming,
    component_costs: parseMoney(incoming.component_costs),
    procurement_costs: parseMoney(incoming.procurement_costs),
    engineering_costs: parseMoney(incoming.engineering_costs),
    software_costs: parseMoney(incoming.software_costs),
    installation_costs: parseMoney(incoming.installation_costs),
    other_costs: parseMoney(incoming.other_costs),
    status: submit ? 'SUBMITTED' : 'DRAFT',
    submitted_by: submit ? user.name : current.submitted_by,
    submitted_by_id: submit ? user.id : current.submitted_by_id,
    submitted_at: submit ? new Date().toISOString() : current.submitted_at,
  });
  record.total_estimated_cost = costingTotal(record);
  const nextStatus: LeadStatus = submit
    ? 'COSTING_SUBMITTED'
    : lead.status === 'COSTING_RETURNED'
      ? 'COSTING_RETURNED'
      : 'COSTING_IN_PROGRESS';
  let updated = transitionLead(lead, nextStatus, user, submit ? 'Costing submitted to PM' : 'Costing draft saved', {
    costing: record,
  });
  if (submit) {
    const pm = findPm(updated) || (updated.pm_id ? store.findUserById(updated.pm_id) : undefined);
    if (pm && pm.role_code === 'PROJECT_MANAGER') {
      const transferred = transferLeadResponsibility(updated, pm, user, 'Costing submitted to Project Manager');
      updated = saveLead({
        ...transferred.lead,
        current_owner_id: pm.id,
        current_owner_name: pm.name,
        pending_action: true,
      });
    }
    notify({
      recipient_id: pm?.id || findPm()?.id || '',
      type: 'COSTING_SUBMITTED_TO_PM',
      title: `Procurement Submitted – Review Required – ${lead.title}`,
      message: `${user.name} submitted procurement/costing totalling ₹ ${record.total_estimated_cost.toLocaleString('en-IN')}.`,
      entity_type: 'LEAD',
      entity_id: lead.id,
    });
    audit(user, updated, 'COSTING_SUBMITTED', `${user.name} submitted costing for ${lead.lead_number}.`);
  }
  return res.json(payloadFor(updated));
});

router.post(
  '/:id/costing/review',
  requireAuth,
  requirePermission('review:lead', 'approve:costing'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    if (!isPm(user)) return forbidden(res);
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (lead.status !== 'COSTING_SUBMITTED') return res.status(400).json({ message: 'Costing is not awaiting PM approval.' });
    const action = req.body?.action as string;
    if (action === 'return') {
      const reason = String(req.body?.reason || '').trim();
      if (!reason) return res.status(400).json({ message: 'A return reason is required.' });
      const record = emptyCosting({ ...(lead.costing || {}), status: 'RETURNED', pm_return_reason: reason });
      const updated = transitionLead(lead, 'COSTING_RETURNED', user, reason, {
        costing: record,
        costing_return_reason: reason,
      });
      store
        .getUsers()
        .filter(isProcurementUser)
        .forEach((member) => {
          notify({
            recipient_id: member.id,
            type: 'COSTING_RETURNED',
            title: `Procurement Correction Required – ${lead.title}`,
            message: `${user.name} requested revision: "${reason}"`,
            entity_type: 'LEAD',
            entity_id: lead.id,
          });
        });
      audit(user, updated, 'COSTING_RETURNED', `${user.name} returned costing for ${lead.lead_number}.`);
      return res.json(payloadFor(updated));
    }
    const record = emptyCosting({
      ...(lead.costing || {}),
      status: 'APPROVED',
      pm_approved_by: user.name,
      pm_approved_at: new Date().toISOString(),
    });
    let updated = transitionLead(lead, 'QUOTATION', user, 'Costing approved', {
      costing: record,
      expected_value: record.total_estimated_cost || lead.expected_value,
    });
    updated = handLeadToBusinessHead(updated, user, 'Costing approved — ready for quotation');
    const commercialRecipients = new Set(
      [updated.current_owner_id, updated.responsible_user_id, lead.created_by_id].filter(Boolean) as string[]
    );
    commercialRecipients.forEach((recipientId) => {
      notify({
        recipient_id: recipientId,
        type: 'QUOTATION_READY',
        title: `Quotation Preparation Required – ${lead.title}`,
        message: `Costing approved for "${lead.title}". Prepare the customer quotation.`,
        entity_type: 'LEAD',
        entity_id: lead.id,
      });
    });
    audit(user, updated, 'COSTING_APPROVED', `${user.name} approved costing for ${lead.lead_number}.`);
    return res.json(payloadFor(updated));
  }
);

router.post(
  '/:id/quotation',
  requireAuth,
  requirePermission('create:quotation', 'edit:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (!canHandleLeadCommercial(user, lead)) {
      return forbidden(res);
    }
    if (lead.status !== 'QUOTATION' && lead.status !== 'NEGOTIATION') {
      return res.status(400).json({ message: 'Quotation can be prepared only after costing is approved.' });
    }
    const send = Boolean(req.body?.send);
    const incoming = { ...(lead.quotation || emptyQuotation()), ...(req.body?.quotation || {}) } as QuotationRecord;
    const quotation = emptyQuotation({
      ...incoming,
      quotation_value: parseMoney(incoming.quotation_value),
      sent_at: send ? new Date().toISOString() : incoming.sent_at,
      sent_by: send ? user.name : incoming.sent_by,
      sent_by_id: send ? user.id : incoming.sent_by_id,
    });
    const nextStatus: LeadStatus = send ? 'NEGOTIATION' : 'QUOTATION';
    const updated = transitionLead(lead, nextStatus, user, send ? 'Quotation sent to customer' : 'Quotation saved', {
      quotation,
      expected_value: quotation.quotation_value || lead.expected_value,
      estimated_opportunity_value: String(quotation.quotation_value || lead.estimated_opportunity_value || ''),
    });
    audit(
      user,
      updated,
      send ? 'QUOTATION_SENT' : 'QUOTATION_SAVED',
      `${user.name} ${send ? 'sent' : 'saved'} quotation for ${lead.lead_number}.`
    );
    if (send) {
      const pm = findPm(updated) || (updated.pm_id ? store.findUserById(updated.pm_id) : undefined);
      dispatchHandover({
        recipientIds: [pm?.id, updated.pm_id],
        actor: user,
        entityType: 'LEAD',
        entityId: updated.id,
        entityName: updated.title,
        customer: updated.customer_name,
        title: `Quotation Submitted – ${updated.title}`,
        message: `${user.name} submitted the quotation. Negotiation can now begin.`,
        actionRequired: 'Review quotation / follow negotiation',
        ctaLabel: 'Open Lead',
        actionUrl: `/pre-sales/leads/${updated.id}`,
        type: 'QUOTATION_READY',
        status: 'Quotation Submitted',
        eventKey: `QUOTATION_SUBMITTED:${updated.id}:${updated.quotation?.sent_at || Date.now()}`,
      });
    }
    return res.json(payloadFor(updated));
  }
);

router.post(
  '/:id/negotiation',
  requireAuth,
  requirePermission('create:quotation', 'edit:lead', 'create:lead'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (!canHandleLeadCommercial(user, lead)) {
      return forbidden(res);
    }
    if (lead.status !== 'NEGOTIATION' && lead.status !== 'QUOTATION') {
      return res.status(400).json({ message: 'Negotiation is available after a quotation is sent.' });
    }
    const action = (req.body?.action || 'UPDATE') as 'UPDATE' | 'REVISED_QUOTATION' | 'CONVERT' | 'LOST';
    if (action === 'CONVERT') {
      const working =
        lead.status === 'NEGOTIATION' ? lead : transitionLead(lead, 'NEGOTIATION', user, 'Moved to negotiation');
      const withHistory = appendNegotiation(working, user, { ...req.body, action: 'CONVERT' });
      const result = convertLeadToProject(withHistory, user);
      const teamIds = result.project.team_ids || [];
      const teamMembers = store
        .getUsers()
        .filter((item) => item.status === 'ACTIVE' && item.team_id && teamIds.includes(item.team_id))
        .map((item) => item.id);
      dispatchHandover({
        recipientIds: [result.project.pm_id, result.project.team_lead_id, ...teamMembers],
        actor: user,
        entityType: 'PROJECT',
        entityId: result.project.id,
        entityName: result.project.name,
        customer: result.project.customer_name,
        title: `Order Converted – ${result.project.name}`,
        message: `${user.name} converted ${lead.lead_number} to ${result.project.code}. Execution can begin.`,
        actionRequired: 'Open project and assign execution work',
        ctaLabel: 'Open Project',
        actionUrl: `/projects/${result.project.id}`,
        type: 'LEAD_CONVERTED',
        status: 'Order Converted',
        eventKey: `ORDER_CONVERTED:${result.project.id}`,
      });
      audit(user, result.lead, 'ORDER_CONVERTED', `${user.name} converted ${lead.lead_number} to ${result.project.code}.`);
      return res.json({ ...payloadFor(result.lead), project: result.project });
    }
    if (action === 'LOST') {
      const withHistory = appendNegotiation(lead, user, { ...req.body, action: 'LOST' });
      const updated = transitionLead(withHistory, 'LOST', user, req.body?.notes || 'Marked as lost');
      audit(user, updated, 'LEAD_LOST', `${user.name} marked ${lead.lead_number} as lost.`);
      return res.json(payloadFor(updated));
    }
    const working = lead.status === 'QUOTATION' ? transitionLead(lead, 'NEGOTIATION', user, 'Negotiation started') : lead;
    const updated = appendNegotiation(working, user, {
      ...req.body,
      action,
      revised_value: req.body?.revised_value != null ? parseMoney(req.body.revised_value) : undefined,
    });
    return res.json(payloadFor(updated));
  }
);

router.post('/:id/convert', requireAuth, requirePermission('convert:lead', 'create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canHandleLeadCommercial(user, lead)) {
    return forbidden(res);
  }
  if (!['NEGOTIATION', 'QUOTATION'].includes(lead.status)) {
    return res.status(400).json({ message: 'Only quoted opportunities can be converted to an order.' });
  }
  const result = convertLeadToProject(lead, user);
  const teamIds = result.project.team_ids || [];
  const teamMembers = store
    .getUsers()
    .filter((item) => item.status === 'ACTIVE' && item.team_id && teamIds.includes(item.team_id))
    .map((item) => item.id);
  dispatchHandover({
    recipientIds: [result.project.pm_id, result.project.team_lead_id, ...teamMembers],
    actor: user,
    entityType: 'PROJECT',
    entityId: result.project.id,
    entityName: result.project.name,
    customer: result.project.customer_name,
    title: `Order Converted – ${result.project.name}`,
    message: `${user.name} converted ${lead.lead_number} to ${result.project.code}. Execution can begin.`,
    actionRequired: 'Open project and assign execution work',
    ctaLabel: 'Open Project',
    actionUrl: `/projects/${result.project.id}`,
    type: 'LEAD_CONVERTED',
    status: 'Order Converted',
    eventKey: `ORDER_CONVERTED:${result.project.id}`,
  });
  return res.json({ ...payloadFor(result.lead), project: result.project });
});

router.post(
  '/:id/documents',
  requireAuth,
  requirePermission('create:lead', 'edit:lead', 'view:leads', 'create:feasibility', 'create:costing'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    const fileName = String(req.body?.file_name || '');
    const sizeBytes = req.body?.size_bytes != null ? Number(req.body.size_bytes) : undefined;
    if (fileName && !isAllowedFileType(fileName)) {
      return res.status(400).json({ message: fileTypeError() });
    }
    if (typeof sizeBytes === 'number' && !Number.isNaN(sizeBytes) && sizeBytes > MAX_FILE_SIZE) {
      return res.status(400).json({ message: fileTypeError() });
    }
    const doc = addDocument(lead, user, req.body ?? {});
    return res.status(201).json({ document: doc, ...payloadFor(lead) });
  }
);

router.get(
  '/:id/documents/:docId/file',
  requireAuth,
  requirePermission('view:leads', 'create:lead', 'create:feasibility', 'create:costing'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (!canAccessEntity(user, 'LEAD', lead.id) && !canOwnLead(user, lead)) {
      return forbidden(res, 'You do not have permission to view this project.');
    }
    const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
    const doc = store.getLeadDocuments().find((item) => item.id === docId && item.lead_id === lead.id);
    if (!doc) return res.status(404).json({ message: 'Document not found.' });
    return res.json({ document: doc });
  }
);

router.delete(
  '/:id/documents/:docId',
  requireAuth,
  requirePermission('create:lead', 'edit:lead'),
  (req: AuthedRequest, res) => {
    const user = req.user!;
    const lead = findLead(paramId(req));
    if (!lead) return res.status(404).json({ message: 'Lead not found.' });
    if (!canEditProjectInput(user, lead)) {
      return forbidden(res, 'Documents can only be deleted before the lead is submitted.');
    }
    const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
    const removed = removeDocument(lead, user, docId);
    if (!removed) return res.status(404).json({ message: 'Document not found.' });
    return res.json({ document: removed, ...payloadFor(lead) });
  }
);

export default router;
