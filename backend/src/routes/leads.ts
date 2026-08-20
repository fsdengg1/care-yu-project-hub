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
  assignTeamToLead,
  audit,
  buildMyWork,
  canEditProjectInput,
  canOwnLead,
  canPrepareCosting,
  canPrepareFeasibility,
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
  saveLead,
  stageFromStatus,
  transitionLead,
} from '../lib/leadWorkflow.js';

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
    comments: store.getLeadComments().filter((item) => item.lead_id === hydrated.id),
    activities: store.getLeadActivities().filter((item) => item.lead_id === hydrated.id),
    history: store.getLeadStatusHistory().filter((item) => item.lead_id === hydrated.id),
    assignments: store.getFeasibilityTeamAssignments().filter((item) => item.lead_id === hydrated.id),
    allocations: store.getFeasibilityEmployeeAllocations().filter((item) => item.lead_id === hydrated.id),
    teams: store.getTeams().filter((team) => team.status === 'ACTIVE'),
    users: store.getUsers().filter((user) => user.status === 'ACTIVE'),
  };
}

function forbidden(res: import('express').Response, message = 'Forbidden. This action is not permitted for your role.') {
  return res.status(403).json({ message });
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
    if (['CEO', 'CTO', 'SYSTEM_ADMIN', 'PROJECT_MANAGER'].includes(user.role_code)) return true;
    return canOwnLead(user, lead);
  });
  res.json({ leads });
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
  if (!canOwnLead(user, lead) && !isPm(user) && user.role_code !== 'CEO' && user.role_code !== 'CTO') {
    const assigned =
      lead.assigned_team_lead_id === user.id ||
      user.team_id === lead.assigned_team_id ||
      isProcurementUser(user);
    if (!assigned) return forbidden(res);
  }
  return res.json(payloadFor(lead));
});

router.post('/', requireAuth, requirePermission('create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const body = req.body ?? {};
  const status: LeadStatus = body.status === 'SUBMITTED_TO_PM' ? 'SUBMITTED_TO_PM' : 'DRAFT';
  const expectedValue = parseMoney(body.expected_value ?? body.estimated_opportunity_value);
  const now = new Date().toISOString();
  const leads = store.getLeads();
  const nextNumber = `LD-${String(leads.length + 1).padStart(3, '0')}`;

  const lead: Lead = {
    id: body.id && String(body.id).startsWith('lead-') ? body.id : newId('lead'),
    lead_number: body.lead_number || nextNumber,
    title: body.title || 'Untitled Lead',
    customer_name: body.customer_name || 'Unspecified Customer',
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
    priority: body.priority || 'Medium',
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
    created_at: now,
    updated_at: now,
    submitted_at: status === 'SUBMITTED_TO_PM' ? now : undefined,
  };

  leads.unshift(lead);
  store.saveLeads(leads);
  audit(
    user,
    lead,
    status === 'SUBMITTED_TO_PM' ? 'LEAD_SUBMITTED_TO_PM' : 'LEAD_CREATED',
    `${user.name} created lead ${lead.lead_number}`
  );
  if (status === 'SUBMITTED_TO_PM') {
    const pm = findPm();
    notify({
      recipient_id: pm?.id || '',
      type: 'NEW_LEAD_TO_PM',
      title: `New Lead Submitted: ${lead.lead_number}`,
      message: `${user.name} submitted "${lead.title}" for ${lead.customer_name} for PM review.`,
      entity_type: 'LEAD',
      entity_id: lead.id,
    });
  }
  return res.status(201).json(payloadFor(lead));
});

router.patch('/:id', requireAuth, requirePermission('edit:lead', 'create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canEditProjectInput(user, lead)) return forbidden(res, 'Only draft or returned leads can be edited by the owner.');
  const body = req.body ?? {};
  const expectedValue =
    body.expected_value != null || body.estimated_opportunity_value != null
      ? parseMoney(body.expected_value ?? body.estimated_opportunity_value)
      : lead.expected_value;
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
    expected_value: expectedValue,
  });
  audit(user, updated, 'LEAD_DRAFT_UPDATED', `${user.name} updated draft ${updated.lead_number}.`);
  return res.json(payloadFor(updated));
});

router.post('/:id/submit', requireAuth, requirePermission('create:lead', 'edit:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!canEditProjectInput(user, lead)) return forbidden(res);
  const next: LeadStatus = ['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)
    ? 'RESUBMITTED_TO_PM'
    : 'SUBMITTED_TO_PM';
  const updated = transitionLead(lead, next, user, 'Submitted to PM for review', {
    submitted_at: new Date().toISOString(),
    pm_return_reason: undefined,
  });
  const pm = findPm();
  notify({
    recipient_id: pm?.id || '',
    type: next === 'RESUBMITTED_TO_PM' ? 'LEAD_RESUBMITTED_TO_PM' : 'NEW_LEAD_TO_PM',
    title: next === 'RESUBMITTED_TO_PM' ? `Lead resubmitted: ${lead.lead_number}` : `New Lead Submitted: ${lead.lead_number}`,
    message: `${user.name} submitted "${lead.title}" for PM review.`,
    entity_type: 'LEAD',
    entity_id: lead.id,
  });
  audit(user, updated, next, `${user.name} submitted ${lead.lead_number} to PM.`);
  return res.json(payloadFor(updated));
});

router.post('/:id/pm-review', requireAuth, requirePermission('review:lead', 'assign:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  if (!isPm(user)) return forbidden(res);
  const lead = findLead(paramId(req));
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  if (!['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM', 'ACCEPTED_FOR_FEASIBILITY'].includes(lead.status)) {
    return res.status(400).json({ message: 'This lead is not awaiting PM review.' });
  }
  const action = req.body?.action as string;
  if (action === 'return') {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ message: 'A return reason is required.' });
    const updated = transitionLead(lead, 'RETURNED_TO_SALES', user, reason, {
      pm_return_reason: reason,
      pm_review_notes: req.body?.notes,
    });
    comment(updated, user, reason, 'Information Request');
    notify({
      recipient_id: lead.created_by_id,
      type: 'LEAD_RETURNED_TO_SALES',
      title: `Lead ${lead.lead_number} returned by PM`,
      message: `${user.name} requested: "${reason}"`,
      entity_type: 'LEAD',
      entity_id: lead.id,
    });
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
    notify({
      recipient_id: lead.created_by_id,
      type: 'LEAD_ACCEPTED_FOR_FEASIBILITY',
      title: `Lead ${lead.lead_number} approved for feasibility`,
      message: `${user.name} assigned "${lead.title}" to ${result.lead.assigned_team_name}.`,
      entity_type: 'LEAD',
      entity_id: lead.id,
    });
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

router.post('/:id/assign', requireAuth, requirePermission('assign:lead'), (req: AuthedRequest, res) => {
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
  const updated = transitionLead(lead, nextStatus, user, submit ? 'Feasibility submitted to PM' : 'Feasibility draft saved', {
    feasibility_study: study,
  });
  if (submit) {
    notify({
      recipient_id: findPm()?.id || '',
      type: 'FEASIBILITY_SUBMITTED_TO_PM',
      title: `Feasibility submitted: ${lead.lead_number}`,
      message: `${user.name} submitted feasibility for "${lead.title}".`,
      entity_type: 'LEAD',
      entity_id: lead.id,
    });
    audit(user, updated, 'FEASIBILITY_SUBMITTED', `${user.name} submitted feasibility for ${lead.lead_number}.`);
  } else {
    audit(user, updated, 'FEASIBILITY_SAVED', `${user.name} saved feasibility for ${lead.lead_number}.`);
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
        title: `Feasibility returned: ${lead.lead_number}`,
        message: `${user.name} requested corrections: "${reason}"`,
        entity_type: 'LEAD',
        entity_id: lead.id,
      });
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
          title: `Costing required: ${lead.lead_number}`,
          message: `Feasibility approved for "${lead.title}". Prepare procurement and costing.`,
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
  const updated = transitionLead(lead, nextStatus, user, submit ? 'Costing submitted to PM' : 'Costing draft saved', {
    costing: record,
  });
  if (submit) {
    notify({
      recipient_id: findPm()?.id || '',
      type: 'COSTING_SUBMITTED_TO_PM',
      title: `Costing submitted: ${lead.lead_number}`,
      message: `${user.name} submitted costing totalling ₹ ${record.total_estimated_cost.toLocaleString('en-IN')}.`,
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
            title: `Costing returned: ${lead.lead_number}`,
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
    const updated = transitionLead(lead, 'QUOTATION', user, 'Costing approved', {
      costing: record,
      expected_value: record.total_estimated_cost || lead.expected_value,
    });
    notify({
      recipient_id: lead.created_by_id,
      type: 'QUOTATION_READY',
      title: `Ready for quotation: ${lead.lead_number}`,
      message: `Costing approved for "${lead.title}". Prepare the customer quotation.`,
      entity_type: 'LEAD',
      entity_id: lead.id,
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
    if (
      !['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'SYSTEM_ADMIN'].includes(user.role_code) ||
      !canOwnLead(user, lead)
    ) {
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
    if (
      !['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'SYSTEM_ADMIN'].includes(user.role_code) ||
      !canOwnLead(user, lead)
    ) {
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
      notify({
        recipient_id: findPm()?.id || '',
        type: 'LEAD_CONVERTED',
        title: `Order converted: ${lead.lead_number}`,
        message: `${user.name} converted "${lead.title}" to project ${result.project.code}.`,
        entity_type: 'PROJECT',
        entity_id: result.project.id,
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
  if (
    !['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'SYSTEM_ADMIN'].includes(user.role_code) ||
    !canOwnLead(user, lead)
  ) {
    return forbidden(res);
  }
  if (!['NEGOTIATION', 'QUOTATION'].includes(lead.status)) {
    return res.status(400).json({ message: 'Only quoted opportunities can be converted to an order.' });
  }
  const result = convertLeadToProject(lead, user);
  notify({
    recipient_id: findPm()?.id || '',
    type: 'LEAD_CONVERTED',
    title: `Order converted: ${lead.lead_number}`,
    message: `${user.name} converted "${lead.title}" to project ${result.project.code}.`,
    entity_type: 'PROJECT',
    entity_id: result.project.id,
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
    const doc = addDocument(lead, user, req.body ?? {});
    return res.status(201).json({ document: doc, ...payloadFor(lead) });
  }
);

export default router;
