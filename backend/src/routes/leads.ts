import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../middleware/auth.js';
import { requirePermission } from '../lib/rbac.js';
import { resolvePipelineStage } from '../lib/ceoDashboard.js';
import { store } from '../store/db.js';
import { Lead, LeadStatus, PipelineStage } from '../types.js';

const router = Router();

function parseValue(raw: unknown): number {
  const numeric = Number(String(raw ?? '').replace(/[₹,\s]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function stageFromStatus(status: LeadStatus): PipelineStage {
  if (status === 'DRAFT') return 'PROJECT_INPUT';
  if (
    status === 'SUBMITTED_TO_PM' ||
    status === 'UNDER_PM_REVIEW' ||
    status === 'RETURNED_TO_SALES' ||
    status === 'ADDITIONAL_INFORMATION_REQUIRED' ||
    status === 'RESUBMITTED_TO_PM'
  ) {
    return 'PM_REVIEW';
  }
  if (status === 'ACCEPTED_FOR_FEASIBILITY' || status === 'FEASIBILITY_IN_PROGRESS') return 'FEASIBILITY';
  if (status === 'WON') return 'CONVERTED';
  if (status === 'LOST') return 'REJECTED';
  return 'PROJECT_INPUT';
}

router.get('/', requireAuth, requirePermission('view:leads', 'create:lead'), (_req, res) => {
  const leads = store.getLeads().map((lead) => ({
    ...lead,
    pipeline_stage: resolvePipelineStage(lead),
  }));
  res.json({ leads });
});

router.get('/:id', requireAuth, requirePermission('view:leads', 'create:lead'), (req, res) => {
  const lead = store.getLeads().find((item) => item.id === req.params.id || item.lead_number === req.params.id);
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  res.json({ lead: { ...lead, pipeline_stage: resolvePipelineStage(lead) } });
});

router.post('/', requireAuth, requirePermission('create:lead'), (req: AuthedRequest, res) => {
  const user = req.user!;
  const body = req.body ?? {};
  const status: LeadStatus = body.status === 'SUBMITTED_TO_PM' ? 'SUBMITTED_TO_PM' : 'DRAFT';
  const expectedValue = parseValue(body.expected_value ?? body.estimated_opportunity_value);
  const now = new Date().toISOString();
  const leads = store.getLeads();
  const nextNumber = `LD-${String(leads.length + 1).padStart(3, '0')}`;

  const lead: Lead = {
    id: `lead-${Date.now()}`,
    lead_number: body.lead_number || nextNumber,
    title: body.title || 'Untitled Lead',
    customer_name: body.customer_name || 'Unspecified Customer',
    customer_type: body.customer_type || 'Other',
    business_vertical: body.business_vertical || 'Business Head',
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
    created_at: now,
    updated_at: now,
    submitted_at: status === 'SUBMITTED_TO_PM' ? now : undefined,
  };

  leads.unshift(lead);
  store.saveLeads(leads);
  store.appendAudit({
    user_id: user.id,
    user_name: user.name,
    user_role: user.role_name,
    entity_type: 'LEAD',
    entity_id: lead.id,
    action: 'LEAD_CREATED',
    description: `${user.name} created lead ${lead.lead_number}`,
  });

  return res.status(201).json({ lead });
});

router.post('/:id/assign', requireAuth, requirePermission('assign:lead'), (req: AuthedRequest, res) => {
  const lead = store.getLeads().find((item) => item.id === req.params.id);
  if (!lead) return res.status(404).json({ message: 'Lead not found.' });
  return res.json({ ok: true, lead_id: lead.id, assigned_to: req.body?.assigned_to });
});

export default router;
