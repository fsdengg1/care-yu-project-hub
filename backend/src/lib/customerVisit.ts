import { Lead, User, VisitActivity, VisitRequirement, VisitStatus } from '../types.js';
import { CAREYU_OFFICE_ADDRESS } from './company.js';
import { LeadWorkflowError } from './leadValidation.js';
import { audit, newId, notify, saveLead } from './leadWorkflow.js';

export function visitFieldsFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'visit_requirement',
    'visit_site_name',
    'visit_site_address',
    'visit_city',
    'visit_state',
    'visit_country',
    'visit_contact_name',
    'visit_contact_phone',
    'visit_contact_email',
    'visit_preferred_date',
    'visit_preferred_time',
    'visit_remarks',
    'visit_visitor_name',
    'visit_visitor_designation',
    'visit_visitor_count',
    'visit_purpose',
    'visit_special_requirements',
  ];
  const next: Record<string, unknown> = {};
  for (const key of keys) {
    if (body[key] !== undefined) next[key] = body[key];
  }
  return next;
}

export function defaultVisitStatus(requirement?: VisitRequirement | string): VisitStatus {
  if (!requirement || requirement === 'NONE') return 'NOT_REQUIRED';
  return 'PENDING_PM_ASSIGNMENT';
}

export function appendVisitActivity(lead: Lead, user: User, action: string, detail: string): VisitActivity[] {
  const entry: VisitActivity = {
    id: newId('va'),
    at: new Date().toISOString(),
    actor: user.name,
    actor_id: user.id,
    action,
    detail,
  };
  return [entry, ...(lead.visit_activity || [])];
}

export function hydrateVisit(lead: Lead): Partial<Lead> {
  const requirement = (lead.visit_requirement || 'NONE') as VisitRequirement;
  return {
    visit_requirement: requirement,
    visit_status: lead.visit_status || defaultVisitStatus(requirement),
    visit_office_address: lead.visit_office_address || CAREYU_OFFICE_ADDRESS,
    visit_assigned_user_ids: lead.visit_assigned_user_ids || [],
    visit_assigned_user_names: lead.visit_assigned_user_names || [],
    visit_activity: lead.visit_activity || [],
  };
}

export function assignVisitTeam(lead: Lead, user: User, members: User[]): Lead {
  if (!['PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code)) {
    throw new LeadWorkflowError('Only the Project Manager can assign the CareYu visit team.', 403);
  }
  if (!lead.visit_requirement || lead.visit_requirement === 'NONE') {
    throw new LeadWorkflowError('This lead does not require a customer visit.', 400);
  }
  if (!members.length) {
    throw new LeadWorkflowError('Select at least one CareYu team member for the visit.', 400);
  }
  const names = members.map((item) => item.name);
  const updated = saveLead({
    ...lead,
    visit_assigned_user_ids: members.map((item) => item.id),
    visit_assigned_user_names: names,
    visit_assigned_by: user.name,
    visit_assigned_by_id: user.id,
    visit_assigned_at: new Date().toISOString(),
    visit_status: lead.visit_scheduled_date ? 'SCHEDULED' : 'TEAM_ASSIGNED',
    visit_activity: appendVisitActivity(lead, user, 'VISIT_TEAM_ASSIGNED', `Assigned ${names.join(', ')} for the visit.`),
  });
  audit(user, updated, 'VISIT_TEAM_ASSIGNED', `${user.name} assigned ${names.join(', ')} for ${lead.lead_number} visit.`);
  for (const member of members) {
    notify({
      recipient_id: member.id,
      sender_id: user.id,
      type: 'LEAD_ASSIGNED',
      title: `Visit assignment — ${lead.lead_number}`,
      message: `${user.name} assigned you to the customer visit for ${lead.customer_name}.`,
      entity_type: 'LEAD',
      entity_id: lead.id,
    });
  }
  return updated;
}

export function updateVisitSchedule(
  lead: Lead,
  user: User,
  body: { scheduled_date?: string; scheduled_time?: string; status?: VisitStatus }
): Lead {
  if (!['PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code)) {
    throw new LeadWorkflowError('Only the Project Manager can update visit scheduling.', 403);
  }
  if (!lead.visit_requirement || lead.visit_requirement === 'NONE') {
    throw new LeadWorkflowError('This lead does not require a customer visit.', 400);
  }
  const nextStatus = body.status || (lead.visit_scheduled_date ? 'RESCHEDULED' : 'SCHEDULED');
  const allowed: VisitStatus[] = ['SCHEDULED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED', 'TEAM_ASSIGNED'];
  if (!allowed.includes(nextStatus)) {
    throw new LeadWorkflowError('Invalid visit status.', 400);
  }
  if ((nextStatus === 'SCHEDULED' || nextStatus === 'RESCHEDULED') && !body.scheduled_date && !lead.visit_scheduled_date) {
    throw new LeadWorkflowError('Enter the scheduled visit date.', 400);
  }
  const detail =
    nextStatus === 'COMPLETED'
      ? 'Visit marked completed.'
      : nextStatus === 'CANCELLED'
        ? 'Visit cancelled.'
        : `Visit ${nextStatus === 'RESCHEDULED' ? 'rescheduled' : 'scheduled'} for ${body.scheduled_date || lead.visit_scheduled_date}${body.scheduled_time ? ` ${body.scheduled_time}` : ''}.`;
  const updated = saveLead({
    ...lead,
    visit_scheduled_date: body.scheduled_date || lead.visit_scheduled_date,
    visit_scheduled_time: body.scheduled_time ?? lead.visit_scheduled_time,
    visit_status: nextStatus,
    visit_activity: appendVisitActivity(lead, user, `VISIT_${nextStatus}`, detail),
  });
  audit(user, updated, `VISIT_${nextStatus}`, `${user.name} ${detail}`);
  return updated;
}
