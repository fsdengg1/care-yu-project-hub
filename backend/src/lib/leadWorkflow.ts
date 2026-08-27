import { store } from '../store/db.js';
import {
  CostingRecord,
  FeasibilityStudy,
  FeasibilityTeamAssignment,
  Lead,
  LeadDocument,
  LeadStatus,
  LeadStatusHistory,
  MyWorkItem,
  NegotiationEntry,
  NotificationItem,
  PipelineStage,
  Project,
  QuotationRecord,
  Team,
  User,
} from '../types.js';
import {
  findBusinessHead,
  findPm as resolveProjectManager,
  resolveProjectManagerForAssignment,
  transferLeadResponsibility,
} from './responsibility.js';
import { assertAllowedTransition, leadOwnerId, PM_REVIEW_STATUSES } from './leadValidation.js';

export function parseMoney(raw: unknown): number {
  const numeric = Number(String(raw ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function stageFromStatus(status: LeadStatus): PipelineStage {
  switch (status) {
    case 'DRAFT':
      return 'PROJECT_INPUT';
    case 'SUBMITTED_TO_PM':
    case 'UNDER_PM_REVIEW':
    case 'RETURNED_TO_SALES':
    case 'ADDITIONAL_INFORMATION_REQUIRED':
    case 'RESUBMITTED_TO_PM':
      return 'PM_REVIEW';
    case 'ACCEPTED_FOR_FEASIBILITY':
    case 'FEASIBILITY_IN_PROGRESS':
    case 'FEASIBILITY_SUBMITTED':
    case 'FEASIBILITY_RETURNED':
      return 'FEASIBILITY';
    case 'COSTING_IN_PROGRESS':
    case 'COSTING_SUBMITTED':
    case 'COSTING_RETURNED':
      return 'COSTING';
    case 'QUOTATION':
      return 'QUOTATION';
    case 'NEGOTIATION':
      return 'NEGOTIATION';
    case 'ORDER_CONVERTED':
    case 'WON':
      return 'CONVERTED';
    case 'LOST':
      return 'REJECTED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'ON_HOLD':
      return 'PROJECT_INPUT';
    default:
      return 'PROJECT_INPUT';
  }
}

export function alignSeedLead(lead: Lead): Lead {
  const stage = lead.pipeline_stage;
  if (lead.status === 'WON') {
    return { ...lead, status: 'ORDER_CONVERTED', pipeline_stage: 'CONVERTED' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && stage === 'COSTING') {
    return { ...lead, status: 'COSTING_IN_PROGRESS' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && stage === 'QUOTATION') {
    return { ...lead, status: 'QUOTATION' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && stage === 'NEGOTIATION') {
    return { ...lead, status: 'NEGOTIATION' };
  }
  return { ...lead, pipeline_stage: lead.pipeline_stage || stageFromStatus(lead.status) };
}

export function hydrateLead(lead: Lead): Lead {
  const aligned = alignSeedLead(lead);
  const ownerId = aligned.current_owner_id || aligned.responsible_user_id;
  const ownerName = aligned.current_owner_name || aligned.responsible_user_name;
  return {
    ...aligned,
    pipeline_stage: stageFromStatus(aligned.status) || aligned.pipeline_stage,
    current_owner_id: ownerId,
    current_owner_name: ownerName,
    responsible_user_id: aligned.responsible_user_id || ownerId,
    responsible_user_name: aligned.responsible_user_name || ownerName,
  };
}

export function findLead(id: string): Lead | undefined {
  return store.getLeads().find((item) => item.id === id || item.lead_number === id);
}

export function saveLead(lead: Lead): Lead {
  const leads = store.getLeads();
  const index = leads.findIndex((item) => item.id === lead.id);
  const next = { ...lead, updated_at: new Date().toISOString() };
  if (index === -1) leads.unshift(next);
  else leads[index] = next;
  store.saveLeads(leads);
  return next;
}

export function recordHistory(
  lead: Lead,
  oldStatus: LeadStatus,
  newStatus: LeadStatus,
  user: User,
  reason?: string
): LeadStatusHistory {
  const history = store.getLeadStatusHistory();
  const entry: LeadStatusHistory = {
    id: newId('hist'),
    lead_id: lead.id,
    old_status: oldStatus,
    new_status: newStatus,
    changed_by: user.name,
    changed_by_id: user.id,
    reason,
    created_at: new Date().toISOString(),
  };
  history.unshift(entry);
  store.saveLeadStatusHistory(history);
  return entry;
}

export function audit(
  user: User,
  lead: Lead,
  action: string,
  description: string,
  extra?: { old_value?: string; new_value?: string }
) {
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'LEAD',
    entity_id: lead.id,
    entity_name: lead.lead_number,
    action,
    description,
    old_value: extra?.old_value,
    new_value: extra?.new_value,
  });
}

export function notify(partial: Omit<NotificationItem, 'id' | 'created_at' | 'read_status'>) {
  if (!partial.recipient_id) return;
  store.appendNotification(partial);
}

export function transitionLead(
  lead: Lead,
  nextStatus: LeadStatus,
  user: User,
  reason?: string,
  extra: Partial<Lead> = {}
): Lead {
  const oldStatus = lead.status;
  if (oldStatus !== nextStatus) {
    assertAllowedTransition(oldStatus, nextStatus);
  }
  const updated = saveLead({
    ...lead,
    ...extra,
    status: nextStatus,
    pipeline_stage: stageFromStatus(nextStatus),
  });
  if (oldStatus !== nextStatus) {
    recordHistory(updated, oldStatus, nextStatus, user, reason);
  }
  return hydrateLead(updated);
}

export function findPm(lead?: Lead): User | undefined {
  return resolveProjectManager(lead);
}

export function isProcurementTeam(team: Team): boolean {
  const hay = `${team.code} ${team.name}`.toLowerCase();
  return hay.includes('procurement') || hay.includes('costing');
}

export function isProcurementUser(user: User): boolean {
  if (user.role_code === 'PROCUREMENT') return true;
  const team = store.getTeams().find((item) => item.id === user.team_id);
  return team ? isProcurementTeam(team) : false;
}

export function canOwnLead(user: User, lead: Lead): boolean {
  if (['SYSTEM_ADMIN', 'CEO', 'CTO', 'BUSINESS_HEAD'].includes(user.role_code)) return true;
  const ownerId = leadOwnerId(lead);
  if (ownerId === user.id) return true;
  if (lead.created_by_id === user.id || lead.sales_owner_id === user.id) return true;
  if (user.role_code === 'PROJECT_MANAGER' && lead.pm_id === user.id) return true;
  if (user.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director') return true;
  if (lead.assigned_team_lead_id === user.id) return true;
  if (lead.assigned_team_id && user.team_id === lead.assigned_team_id) return true;
  if (isProcurementUser(user) && ['COSTING_IN_PROGRESS', 'COSTING_SUBMITTED', 'COSTING_RETURNED'].includes(lead.status)) {
    return true;
  }
  return false;
}

export function canHandleLeadCommercial(user: User, lead: Lead): boolean {
  if (['SYSTEM_ADMIN', 'BUSINESS_HEAD'].includes(user.role_code)) return true;
  if (!['ENG_DIRECTOR', 'SALES'].includes(user.role_code)) return false;
  if (lead.created_by_id === user.id || lead.sales_owner_id === user.id) return true;
  if (user.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director') return true;
  return false;
}

export function canEditProjectInput(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['DRAFT', 'RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)) return false;
  const canCaptureRequirement = [
    'BUSINESS_HEAD',
    'ENG_DIRECTOR',
    'SALES',
    'PROJECT_MANAGER',
    'TEAM_LEAD',
    'EMPLOYEE',
    'PROJECT_ENGINEER',
    'CTO',
  ].includes(user.role_code);
  if (!canCaptureRequirement) return false;
  if (lead.created_by_id === user.id || lead.sales_owner_id === user.id) return true;
  if (user.role_code === 'BUSINESS_HEAD' && lead.business_vertical === 'Business Head') return true;
  if (user.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director') return true;
  return false;
}

export function canPrepareFeasibility(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_RETURNED'].includes(lead.status)) return false;
  if (user.role_code === 'TEAM_LEAD' && (lead.assigned_team_lead_id === user.id || user.team_id === lead.assigned_team_id)) {
    return true;
  }
  if (user.team_id && user.team_id === lead.assigned_team_id) return true;
  return false;
}

export function canPrepareCosting(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['COSTING_IN_PROGRESS', 'COSTING_RETURNED'].includes(lead.status)) return false;
  return isProcurementUser(user);
}

export function canPrepareQuotation(user: User, lead: Lead): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (!['QUOTATION', 'NEGOTIATION'].includes(lead.status)) return false;
  return canHandleLeadCommercial(user, lead);
}

export function handLeadToBusinessHead(lead: Lead, actor: User, reason = 'Ready for quotation'): Lead {
  const businessHead = findBusinessHead(lead);
  if (!businessHead || businessHead.id === leadOwnerId(lead)) return saveLead(lead);
  const transferred = transferLeadResponsibility(lead, businessHead, actor, reason);
  return saveLead(transferred.lead);
}

export function emptyFeasibility(partial: Partial<FeasibilityStudy> = {}): FeasibilityStudy {
  return {
    technical_feasibility: '',
    required_resources: '',
    proposed_solution: '',
    major_constraints: '',
    estimated_timeline: '',
    technical_assumptions: '',
    required_equipment: '',
    team_remarks: '',
    documents: [],
    status: 'DRAFT',
    ...partial,
  };
}

export function emptyCosting(partial: Partial<CostingRecord> = {}): CostingRecord {
  return {
    bom_components: '',
    vendor_requirements: '',
    vendor_quotations: '',
    component_costs: 0,
    procurement_costs: 0,
    engineering_costs: 0,
    software_costs: 0,
    installation_costs: 0,
    other_costs: 0,
    total_estimated_cost: 0,
    commercial_assumptions: '',
    documents: [],
    status: 'DRAFT',
    ...partial,
  };
}

export function costingTotal(record: CostingRecord): number {
  return (
    Number(record.component_costs || 0) +
    Number(record.procurement_costs || 0) +
    Number(record.engineering_costs || 0) +
    Number(record.software_costs || 0) +
    Number(record.installation_costs || 0) +
    Number(record.other_costs || 0)
  );
}

export function assignTeamToLead(
  lead: Lead,
  user: User,
  teamId: string,
  teamLeadId?: string,
  notes?: string
): { lead: Lead; assignment: FeasibilityTeamAssignment; previousResponsibleUserId?: string } {
  const team = store.getTeams().find((item) => item.id === teamId && item.status === 'ACTIVE');
  if (!team) {
    throw Object.assign(new Error('Selected team was not found in Organization Management.'), { status: 400 });
  }
  const users = store.getUsers();
  const requestedLead = teamLeadId ? users.find((item) => item.id === teamLeadId) : undefined;
  const fallbackLead = team.team_lead_id ? users.find((item) => item.id === team.team_lead_id) : undefined;
  const assignedLead = requestedLead || fallbackLead;
  const due = new Date();
  due.setDate(due.getDate() + 7);

  const assignment: FeasibilityTeamAssignment = {
    id: newId('fta'),
    lead_id: lead.id,
    team_id: team.id,
    team_name: team.name,
    team_lead_id: assignedLead?.id,
    team_lead_name: assignedLead?.name || team.team_lead_name,
    assignment_type: 'NORMAL',
    priority: lead.priority,
    due_date: due.toISOString().slice(0, 10),
    pm_instructions: notes || 'Prepare technical feasibility for this opportunity.',
    status: 'PENDING_TEAM_LEAD_REVIEW',
    created_by: user.name,
    created_by_id: user.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const assignments = store.getFeasibilityTeamAssignments().filter(
    (item) => !(item.lead_id === lead.id && item.team_id === team.id && item.status !== 'CANCELLED')
  );
  assignments.unshift(assignment);
  store.saveFeasibilityTeamAssignments(assignments);

  const now = new Date().toISOString();
  const updatedBase = transitionLead(lead, 'FEASIBILITY_IN_PROGRESS', user, 'Accepted and assigned to functional team', {
    assigned_team_id: team.id,
    assigned_team_name: team.name,
    assigned_team_lead_id: assignedLead?.id,
    assigned_team_lead_name: assignedLead?.name || team.team_lead_name,
    pm_id: user.role_code === 'PROJECT_MANAGER' ? user.id : lead.pm_id || findPm()?.id,
    pm_name: user.role_code === 'PROJECT_MANAGER' ? user.name : lead.pm_name || findPm()?.name,
    pm_review_notes: notes || lead.pm_review_notes,
    reviewed_at: now,
    accepted_at: lead.accepted_at || now,
    accepted_by_id: lead.accepted_by_id || user.id,
    accepted_by_name: lead.accepted_by_name || user.name,
  });

  let updated = updatedBase;
  let previousId = updatedBase.responsible_user_id;
  if (assignedLead?.id) {
    const transferred = transferLeadResponsibility(
      updatedBase,
      assignedLead,
      user,
      notes || `Assigned to ${team.name}`
    );
    updated = saveLead(transferred.lead);
    previousId = transferred.previous?.id;
  }

  return { lead: updated, assignment, previousResponsibleUserId: previousId };
}

export function convertLeadToProject(lead: Lead, user: User): { lead: Lead; project: Project } {
  const projects = store.getProjects();
  const existing = projects.find((project) => project.lead_id === lead.id);
  const quotationValue = lead.quotation?.revised_value || lead.quotation?.quotation_value || lead.expected_value || 0;
  const now = new Date().toISOString();
  const pm = findPm();

  const project: Project = existing
    ? {
        ...existing,
        name: existing.name || lead.title,
        customer_name: lead.customer_name,
        pm_id: lead.pm_id || existing.pm_id || pm?.id || user.id,
        pm_name: lead.pm_name || existing.pm_name || pm?.name || user.name,
        status: existing.status === 'CANCELLED' ? 'ACTIVE' : existing.status,
        value: existing.value ?? quotationValue,
        start_date: existing.start_date || existing.created_at.slice(0, 10),
        current_phase: existing.current_phase || 'EXECUTION',
        team_ids: existing.team_ids?.length
          ? existing.team_ids
          : lead.assigned_team_id
            ? [lead.assigned_team_id]
            : existing.team_ids,
        team_lead_id: existing.team_lead_id || lead.assigned_team_lead_id,
        team_lead_name: existing.team_lead_name || lead.assigned_team_lead_name,
        updated_at: now,
      }
    : {
        id: newId('prj'),
        code: `PRJ-${String(projects.length + 1).padStart(3, '0')}`,
        name: lead.title,
        customer_name: lead.customer_name,
        pm_id: lead.pm_id || pm?.id || user.id,
        pm_name: lead.pm_name || pm?.name || user.name,
        progress: 0,
        health: 'ON_TRACK',
        status: 'ACTIVE',
        lead_id: lead.id,
        team_ids: lead.assigned_team_id ? [lead.assigned_team_id] : [],
        team_lead_id: lead.assigned_team_lead_id,
        team_lead_name: lead.assigned_team_lead_name,
        value: quotationValue,
        start_date: now.slice(0, 10),
        target_completion: new Date(Date.now() + 90 * 24 * 3600000).toISOString().slice(0, 10),
        current_phase: 'EXECUTION',
        last_update_at: now,
        created_at: now,
        updated_at: now,
      };

  if (existing) {
    const index = projects.findIndex((item) => item.id === existing.id);
    projects[index] = project;
  } else {
    projects.unshift(project);
  }
  store.saveProjects(projects);

  const updated = transitionLead(lead, 'ORDER_CONVERTED', user, 'Customer accepted proposal', {
    project_id: project.id,
    converted_at: now,
    expected_value: quotationValue || lead.expected_value,
    estimated_opportunity_value: String(quotationValue || lead.expected_value || ''),
  });

  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'PROJECT',
    entity_id: project.id,
    entity_name: project.code,
    action: 'PROJECT_CREATED_FROM_LEAD',
    description: `${user.name} converted ${lead.lead_number} into project ${project.code}.`,
  });

  return { lead: updated, project };
}

function workItem(lead: Lead, category: MyWorkItem['category'], summary: string): MyWorkItem {
  return {
    lead_id: lead.id,
    lead_number: lead.lead_number,
    title: lead.title,
    customer_name: lead.customer_name,
    status: lead.status,
    pipeline_stage: hydrateLead(lead).pipeline_stage || stageFromStatus(lead.status),
    category,
    summary,
    href: `/pre-sales/leads/${lead.id}`,
    priority: lead.priority,
  };
}

export function buildMyWork(user: User): { items: MyWorkItem[]; groups: Record<string, MyWorkItem[]> } {
  const leads = store.getLeads().map(hydrateLead);
  const items: MyWorkItem[] = [];
  const seen = new Set<string>();

  const add = (lead: Lead, category: MyWorkItem['category'], summary: string) => {
    const key = `${lead.id}:${category}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push(workItem(lead, category, summary));
  };

  const canCapture =
    ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'EMPLOYEE', 'PROJECT_ENGINEER', 'TEAM_LEAD'].includes(user.role_code);
  if (canCapture) {
    items.push({
      lead_id: 'new',
      lead_number: 'NEW',
      title: 'Create New Lead',
      customer_name: '',
      status: 'DRAFT',
      pipeline_stage: 'PROJECT_INPUT',
      category: 'CREATE',
      summary: 'Capture a new customer opportunity on the Pre-Sales Lead Form.',
      href: '/pre-sales/leads/create',
      priority: 'High',
    });
  }

  for (const lead of leads) {
    const ownerId = leadOwnerId(lead);
    const isOwner = ownerId === user.id;
    const isCreator = lead.created_by_id === user.id || lead.sales_owner_id === user.id;
    const isSalesRole = ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'EMPLOYEE', 'PROJECT_ENGINEER'].includes(user.role_code);
    const salesVisible =
      isCreator ||
      (user.role_code === 'BUSINESS_HEAD' && lead.business_vertical === 'Business Head') ||
      (user.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director');

    if (isSalesRole && salesVisible) {
      if (lead.status === 'DRAFT') {
        add(lead, 'DRAFT', 'Finish and submit this draft to PM.');
      }
      if (['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)) {
        add(lead, 'RETURNED', lead.pm_return_reason || 'PM returned this lead for correction.');
      }
    }
    if (canHandleLeadCommercial(user, lead)) {
      if (lead.status === 'QUOTATION') {
        add(lead, 'QUOTATION', 'Approved costing is ready. Prepare and send the quotation.');
      }
      if (lead.status === 'NEGOTIATION') {
        add(lead, 'NEGOTIATION', 'Active commercial follow-up. Update negotiation or convert to order.');
      }
    }

    const pmSeesLead =
      user.role_code === 'SYSTEM_ADMIN' ||
      ((user.role_code === 'PROJECT_MANAGER' || user.role_code === 'SYSTEM_ADMIN') &&
        (isOwner || lead.pm_id === user.id));

    if (pmSeesLead) {
      if (PM_REVIEW_STATUSES.includes(lead.status) && (isOwner || user.role_code === 'SYSTEM_ADMIN')) {
        add(lead, 'PM_REVIEW', 'Review project input, then accept and assign a team to start feasibility.');
      }
      if (lead.status === 'ACCEPTED_FOR_FEASIBILITY' && !lead.assigned_team_id) {
        add(lead, 'ASSIGN', 'Assign a functional team from Organization Management.');
      }
      if (lead.status === 'FEASIBILITY_SUBMITTED' && (isOwner || lead.pm_id === user.id || user.role_code === 'SYSTEM_ADMIN')) {
        add(lead, 'FEASIBILITY_APPROVAL', 'Review submitted feasibility and approve or return to the team.');
      }
      if (lead.status === 'COSTING_SUBMITTED' && (isOwner || lead.pm_id === user.id || user.role_code === 'SYSTEM_ADMIN')) {
        add(lead, 'COSTING_APPROVAL', 'Review submitted costing and approve or return for revision.');
      }
    }

    if (
      canPrepareFeasibility(user, lead) ||
      (user.role_code === 'TEAM_LEAD' &&
        ['FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_RETURNED'].includes(lead.status) &&
        (lead.assigned_team_lead_id === user.id || user.team_id === lead.assigned_team_id))
    ) {
      add(
        lead,
        'FEASIBILITY',
        lead.status === 'FEASIBILITY_RETURNED'
          ? lead.feasibility_return_reason || 'PM returned feasibility for correction.'
          : 'Prepare and submit the feasibility study.'
      );
    }

    if (isProcurementUser(user) && ['COSTING_IN_PROGRESS', 'COSTING_RETURNED'].includes(lead.status)) {
      add(
        lead,
        'COSTING',
        lead.status === 'COSTING_RETURNED'
          ? lead.costing_return_reason || 'PM returned costing for revision.'
          : 'Prepare BOM, vendor quotations, and project costing.'
      );
    }
  }

  const groups: Record<string, MyWorkItem[]> = {};
  for (const item of items) {
    groups[item.category] = groups[item.category] || [];
    groups[item.category].push(item);
  }
  return { items, groups };
}

export function buildPmDashboard(user: User) {
  const leads = store.getLeads().map(hydrateLead);
  const assigned = leads.filter((lead) => {
    if (user.role_code === 'SYSTEM_ADMIN') return true;
    const ownerId = leadOwnerId(lead);
    return ownerId === user.id || lead.pm_id === user.id;
  });

  const pendingReviews = assigned.filter(
    (lead) => PM_REVIEW_STATUSES.includes(lead.status) && (leadOwnerId(lead) === user.id || user.role_code === 'SYSTEM_ADMIN')
  );
  const feasibilityPending = assigned.filter((lead) =>
    ['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_SUBMITTED', 'FEASIBILITY_RETURNED'].includes(
      lead.status
    )
  );
  const procurementPending = assigned.filter((lead) =>
    ['COSTING_IN_PROGRESS', 'COSTING_SUBMITTED', 'COSTING_RETURNED'].includes(lead.status)
  );
  const returnedToSales = leads.filter((lead) =>
    ['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)
  );

  return {
    pendingPmReview: pendingReviews.length,
    feasibilityPending: feasibilityPending.length,
    procurementPending: procurementPending.length,
    returnedToSales: returnedToSales.length,
    pendingReviews: pendingReviews
      .slice()
      .sort((a, b) => +new Date(b.submitted_at || b.updated_at) - +new Date(a.submitted_at || a.updated_at))
      .map((lead) => ({
        id: lead.id,
        lead_number: lead.lead_number,
        customer_name: lead.customer_name,
        title: lead.title,
        business_vertical: lead.business_vertical,
        sales_owner: lead.sales_owner,
        sales_owner_id: lead.sales_owner_id,
        priority: lead.priority,
        lead_date: lead.lead_date,
        submitted_at: lead.submitted_at,
        status: lead.status,
        current_owner_id: leadOwnerId(lead),
        current_owner_name: lead.current_owner_name || lead.responsible_user_name,
        href: `/pre-sales/leads/${lead.id}`,
      })),
    myWork: buildMyWork(user),
  };
}

export function assignSubmittedLeadToPm(lead: Lead, actor: User, reason: string): Lead {
  const pm = resolveProjectManagerForAssignment(lead, actor);
  if (!pm || pm.role_code !== 'PROJECT_MANAGER' || pm.status !== 'ACTIVE') {
    throw Object.assign(new Error('No active Project Manager is available to receive this lead.'), { status: 409 });
  }
  const transferred = transferLeadResponsibility(lead, pm, actor, reason);
  const saved = saveLead({
    ...transferred.lead,
    pm_id: pm.id,
    pm_name: pm.name,
    current_owner_id: pm.id,
    current_owner_name: pm.name,
    responsible_user_id: pm.id,
    responsible_user_name: pm.name,
    responsible_role_code: pm.role_code,
    pending_action: true,
  });
  const ownerId = leadOwnerId(saved);
  if (ownerId !== pm.id || saved.responsible_user_id !== pm.id) {
    throw Object.assign(new Error('Lead assignment did not persist consistently. Submission was rolled back.'), {
      status: 500,
    });
  }
  return hydrateLead(saved);
}

export function buildBusinessHeadDashboard(user: User) {
  const leads = store
    .getLeads()
    .map(hydrateLead)
    .filter((lead) => canOwnLead(user, lead) || user.role_code === 'SYSTEM_ADMIN');

  const closed = new Set(['CONVERTED', 'REJECTED', 'CANCELLED']);
  const active = leads.filter(
    (lead) => !closed.has(lead.pipeline_stage || '') && lead.status !== 'LOST' && lead.status !== 'ON_HOLD' && lead.status !== 'ORDER_CONVERTED'
  );
  const pipelineValue = active.reduce((sum, lead) => {
    if (typeof lead.expected_value === 'number' && Number.isFinite(lead.expected_value)) return sum + lead.expected_value;
    return sum + parseMoney(lead.estimated_opportunity_value);
  }, 0);

  const technicalReview = leads.filter((lead) =>
    ['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_SUBMITTED', 'FEASIBILITY_RETURNED'].includes(lead.status)
  );
  const commercial = leads.filter((lead) => ['QUOTATION', 'NEGOTIATION'].includes(lead.status));
  const returned = leads.filter((lead) =>
    ['RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(lead.status)
  );
  const drafts = leads.filter((lead) => lead.status === 'DRAFT');

  return {
    pipelineValue,
    activeOpportunities: active.length,
    technicalReview: technicalReview.length,
    commercialProposals: commercial.length,
    returned: returned.length,
    drafts: drafts.length,
    quotationReady: leads.filter((lead) => lead.status === 'QUOTATION').length,
    negotiations: leads.filter((lead) => lead.status === 'NEGOTIATION').length,
    leads: leads
      .slice()
      .sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at))
      .slice(0, 8),
  };
}

export function addDocument(lead: Lead, user: User, body: Partial<LeadDocument> & { file_data?: string; mime_type?: string }): LeadDocument {
  const docs = store.getLeadDocuments();
  const existing = docs.find(
    (item) => item.lead_id === lead.id && item.file_name.toLowerCase() === String(body.file_name || '').toLowerCase()
  );
  if (existing) return existing;
  const doc: LeadDocument = {
    id: newId('doc'),
    lead_id: lead.id,
    file_name: body.file_name || 'Untitled document',
    file_type: body.file_type || 'Document',
    file_size: body.file_size || '—',
    uploaded_by: user.name,
    uploaded_by_id: user.id,
    upload_date: new Date().toISOString(),
    category: (body.category as LeadDocument['category']) || 'Other',
    file_url: body.file_url || body.file_data,
    mime_type: body.mime_type,
    upload_status: 'UPLOADED',
  };
  docs.unshift(doc);
  store.saveLeadDocuments(docs);
  audit(user, lead, 'DOCUMENT_ADDED', `${user.name} attached ${doc.file_name} to ${lead.lead_number}.`);
  notify({
    recipient_id: findPm()?.id || '',
    type: 'DOCUMENT_ADDED',
    title: `Document added: ${lead.lead_number}`,
    message: `${user.name} uploaded ${doc.file_name}.`,
    entity_type: 'LEAD',
    entity_id: lead.id,
  });
  return doc;
}

export function removeDocument(lead: Lead, user: User, documentId: string) {
  const docs = store.getLeadDocuments();
  const index = docs.findIndex((item) => item.id === documentId && item.lead_id === lead.id);
  if (index === -1) return null;
  const removed = docs[index];
  docs.splice(index, 1);
  store.saveLeadDocuments(docs);
  audit(user, lead, 'DOCUMENT_REMOVED', `${user.name} removed ${removed.file_name} from ${lead.lead_number}.`);
  return removed;
}

export function appendNegotiation(lead: Lead, user: User, body: Partial<NegotiationEntry>): Lead {
  const entry: NegotiationEntry = {
    id: newId('neg'),
    customer_feedback: body.customer_feedback || '',
    notes: body.notes || '',
    revised_value: body.revised_value != null ? Number(body.revised_value) : undefined,
    customer_requests: body.customer_requests || '',
    commercial_changes: body.commercial_changes || '',
    follow_up_date: body.follow_up_date,
    document_name: body.document_name,
    action: body.action || 'UPDATE',
    created_by: user.name,
    created_by_id: user.id,
    created_at: new Date().toISOString(),
  };
  const history = [...(lead.negotiation_history || [])];
  history.unshift(entry);
  const extra: Partial<Lead> = { negotiation_history: history };
  if (entry.revised_value && lead.quotation) {
    extra.quotation = { ...lead.quotation, revised_value: entry.revised_value };
    extra.expected_value = entry.revised_value;
    extra.estimated_opportunity_value = String(entry.revised_value);
  }
  const updated = saveLead({ ...lead, ...extra });
  audit(
    user,
    updated,
    entry.action === 'REVISED_QUOTATION' ? 'REVISED_QUOTATION_SENT' : 'NEGOTIATION_UPDATED',
    `${user.name} recorded a negotiation update on ${lead.lead_number}.`,
    { new_value: entry.revised_value != null ? String(entry.revised_value) : entry.notes }
  );
  return updated;
}

export function emptyQuotation(partial: Partial<QuotationRecord> = {}): QuotationRecord {
  return {
    quotation_value: 0,
    commercial_terms: '',
    validity: '',
    payment_terms: '',
    delivery_terms: '',
    ...partial,
  };
}
