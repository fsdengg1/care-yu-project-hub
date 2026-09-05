import { Lead } from './types';

export function quotationRevisionLabel(lead: Pick<Lead, 'quotation'>): string {
  return lead.quotation?.revision_label || `R${lead.quotation?.revision ?? 0}`;
}

export function leadPipelineDisplay(lead: Pick<Lead, 'status' | 'pipeline_stage' | 'quotation'>): {
  stage: string;
  quotation: string | null;
} {
  const status = lead.status;
  const pipeline = lead.pipeline_stage || '';
  const revision = quotationRevisionLabel(lead);
  const qStatus = lead.quotation?.workflow_status;
  if (status === 'ORDER_CONVERTED' || status === 'WON' || pipeline === 'CONVERTED') {
    return { stage: 'Project', quotation: null };
  }
  if (qStatus === 'REVISION_REQUESTED' || qStatus === 'REVISION_IN_PROGRESS') {
    return { stage: qStatus === 'REVISION_REQUESTED' ? 'Revision Requested' : 'Revision in Progress', quotation: `Quotation — ${revision}` };
  }
  if (qStatus === 'SUBMITTED_TO_CUSTOMER' || qStatus === 'CUSTOMER_REVIEW' || status === 'NEGOTIATION' || pipeline === 'NEGOTIATION') {
    return { stage: 'Submitted to Customer', quotation: `Quotation — ${revision}` };
  }
  if (status === 'QUOTATION' || pipeline === 'QUOTATION' || qStatus === 'PENDING_INTERNAL') {
    return { stage: 'Pending with Internal Team', quotation: `Quotation — ${revision}` };
  }
  if (['COSTING_IN_PROGRESS', 'COSTING_SUBMITTED', 'COSTING_RETURNED', 'COSTING_REJECTED'].includes(status) || pipeline === 'COSTING') {
    return { stage: 'Solution & Costing', quotation: null };
  }
  if (['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_SUBMITTED', 'FEASIBILITY_RETURNED', 'FEASIBILITY_REJECTED'].includes(status) || pipeline === 'FEASIBILITY') {
    return { stage: 'Pre-Sales Activities', quotation: null };
  }
  if (['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM'].includes(status) || pipeline === 'PM_REVIEW') {
    return { stage: 'Pending with PM', quotation: null };
  }
  return { stage: 'Lead', quotation: null };
}
