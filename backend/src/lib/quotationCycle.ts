import { Lead, QuotationRecord, QuotationRevision, QuotationSubmissionMethod, QuotationWorkflowStatus, User } from '../types.js';
import { audit, emptyQuotation, newId, notify, saveLead, transitionLead } from './leadWorkflow.js';
import { LeadWorkflowError } from './leadValidation.js';

export function revisionLabel(revision: number): string {
  return `R${Math.max(0, Math.trunc(revision))}`;
}

export function snapshotQuotation(quotation: QuotationRecord, extra: Partial<QuotationRevision> = {}): QuotationRevision {
  const revision = quotation.revision ?? 0;
  return {
    id: quotation.revision_id || extra.id || newId('qr'),
    revision,
    revision_label: quotation.revision_label || revisionLabel(revision),
    quotation: { ...quotation },
    created_at: quotation.created_at || extra.created_at || new Date().toISOString(),
    created_by: quotation.created_by || extra.created_by,
    created_by_id: quotation.created_by_id || extra.created_by_id,
    status: quotation.workflow_status || extra.status || 'PENDING_INTERNAL',
    submitted_at: quotation.submitted_to_customer_at || quotation.sent_at,
    submitted_by: quotation.submitted_to_customer_by || quotation.sent_by,
    submitted_by_id: quotation.submitted_to_customer_by_id || quotation.sent_by_id,
    submission_method: quotation.submission_method,
    remarks: quotation.submission_remarks,
    reason: quotation.revision_reason || extra.reason,
  };
}

export function normalizeQuotation(lead: Lead, actor?: User): QuotationRecord | undefined {
  if (!lead.quotation) return undefined;
  const revision = lead.quotation.revision ?? 0;
  const submitted = Boolean(lead.quotation.submitted_to_customer_at || lead.quotation.sent_at);
  const workflow: QuotationWorkflowStatus =
    lead.quotation.workflow_status ||
    (submitted ? 'SUBMITTED_TO_CUSTOMER' : lead.status === 'QUOTATION' ? 'PENDING_INTERNAL' : 'DRAFT');
  return emptyQuotation({
    ...lead.quotation,
    revision,
    revision_label: lead.quotation.revision_label || revisionLabel(revision),
    revision_id: lead.quotation.revision_id || newId('qr'),
    workflow_status: workflow,
    created_at: lead.quotation.created_at || lead.updated_at,
    created_by: lead.quotation.created_by || actor?.name,
    created_by_id: lead.quotation.created_by_id || actor?.id,
  });
}

export function quotationPipelineCaption(lead: Pick<Lead, 'status' | 'quotation' | 'quotation_revisions'>): string | null {
  const quotation = lead.quotation;
  if (!quotation && lead.status !== 'QUOTATION' && lead.status !== 'NEGOTIATION') return null;
  const revision = quotation?.revision_label || revisionLabel(quotation?.revision ?? 0);
  const status = quotation?.workflow_status;
  if (status === 'REVISION_REQUESTED' || status === 'REVISION_IN_PROGRESS') {
    return `Quotation — ${revision} · ${status === 'REVISION_REQUESTED' ? 'Revision Requested' : 'Revision in Progress'}`;
  }
  if (status === 'SUBMITTED_TO_CUSTOMER' || status === 'CUSTOMER_REVIEW' || lead.status === 'NEGOTIATION') {
    return `Quotation — ${revision} · Submitted to Customer`;
  }
  if (lead.status === 'QUOTATION' || status === 'PENDING_INTERNAL' || status === 'DRAFT') {
    return `Quotation — ${revision} · Pending with Internal Team`;
  }
  return `Quotation — ${revision}`;
}

export function prepareWorkingQuotation(lead: Lead, incoming: Partial<QuotationRecord>, user: User): QuotationRecord {
  const current = normalizeQuotation(lead, user) || emptyQuotation({
    revision: 0,
    revision_label: 'R0',
    revision_id: newId('qr'),
    workflow_status: 'PENDING_INTERNAL',
    created_at: new Date().toISOString(),
    created_by: user.name,
    created_by_id: user.id,
  });
  const locked = current.workflow_status === 'SUBMITTED_TO_CUSTOMER' || current.workflow_status === 'CUSTOMER_REVIEW';
  if (locked) {
    return current;
  }
  return emptyQuotation({
    ...current,
    ...incoming,
    revision: current.revision ?? 0,
    revision_label: current.revision_label || revisionLabel(current.revision ?? 0),
    revision_id: current.revision_id,
    workflow_status: current.workflow_status === 'REVISION_REQUESTED' ? 'REVISION_IN_PROGRESS' : current.workflow_status || 'PENDING_INTERNAL',
    created_at: current.created_at,
    created_by: current.created_by || user.name,
    created_by_id: current.created_by_id || user.id,
  });
}

export function submitQuotationToCustomer(
  lead: Lead,
  user: User,
  body: { method?: QuotationSubmissionMethod; submitted_date?: string; remarks?: string }
): Lead {
  if (!['QUOTATION', 'NEGOTIATION'].includes(lead.status)) {
    throw new LeadWorkflowError('Quotation can be submitted to the customer only after it is prepared.', 400);
  }
  const working = normalizeQuotation(lead, user);
  if (!working || !(working.quotation_value > 0 || working.document_name || working.commercial_terms)) {
    throw new LeadWorkflowError('Save the quotation before marking it as submitted to the customer.', 400);
  }
  const method = body.method;
  if (!method || !['EMAIL', 'WHATSAPP', 'EMAIL_AND_WHATSAPP', 'OTHER'].includes(method)) {
    throw new LeadWorkflowError('Select a submission method.', 400);
  }
  const now = body.submitted_date ? new Date(body.submitted_date).toISOString() : new Date().toISOString();
  if (Number.isNaN(+new Date(now))) {
    throw new LeadWorkflowError('Enter a valid submitted date.', 400);
  }
  const quotation = emptyQuotation({
    ...working,
    workflow_status: 'SUBMITTED_TO_CUSTOMER',
    submission_method: method,
    submission_remarks: body.remarks || '',
    submitted_to_customer_at: now,
    submitted_to_customer_by: user.name,
    submitted_to_customer_by_id: user.id,
    sent_at: working.sent_at || now,
    sent_by: working.sent_by || user.name,
    sent_by_id: working.sent_by_id || user.id,
  });
  const history = [...(lead.quotation_revisions || [])];
  const snapshot = snapshotQuotation(quotation, { status: 'SUBMITTED_TO_CUSTOMER' });
  const index = history.findIndex((item) => item.revision === quotation.revision);
  if (index >= 0) history[index] = snapshot;
  else history.push(snapshot);
  const nextStatus = lead.status === 'NEGOTIATION' ? 'NEGOTIATION' : 'NEGOTIATION';
  const updated = transitionLead(lead, nextStatus, user, `Quotation ${quotation.revision_label} submitted to customer via ${method}`, {
    quotation,
    quotation_revisions: history,
  });
  audit(
    user,
    updated,
    'QUOTATION_SUBMITTED_TO_CUSTOMER',
    `${user.name} submitted ${lead.lead_number} ${quotation.revision_label} to the customer via ${method}.`
  );
  if (updated.pm_id) {
    notify({
      recipient_id: updated.pm_id,
      sender_id: user.id,
      type: 'QUOTATION_READY',
      title: `${lead.lead_number} ${quotation.revision_label} submitted to customer`,
      message: `${user.name} submitted the quotation via ${method.replace(/_/g, ' ')}.`,
      entity_type: 'LEAD',
      entity_id: lead.id,
    });
  }
  return updated;
}

export function requestQuotationRevision(lead: Lead, user: User, reason: string): Lead {
  if (!['QUOTATION', 'NEGOTIATION'].includes(lead.status)) {
    throw new LeadWorkflowError('Customer revision is available after a quotation is submitted to the customer.', 400);
  }
  const current = normalizeQuotation(lead, user);
  if (!current) {
    throw new LeadWorkflowError('No quotation exists to revise.', 400);
  }
  if (current.workflow_status !== 'SUBMITTED_TO_CUSTOMER' && current.workflow_status !== 'CUSTOMER_REVIEW') {
    throw new LeadWorkflowError('Mark the quotation as submitted to the customer before recording a customer revision.', 400);
  }
  const note = reason.trim();
  if (!note) {
    throw new LeadWorkflowError('Enter the customer revision reason.', 400);
  }
  const history = [...(lead.quotation_revisions || [])];
  if (!history.some((item) => item.revision === (current.revision ?? 0))) {
    history.push(snapshotQuotation(current, { status: 'SUBMITTED_TO_CUSTOMER' }));
  }
  const nextRevision = (current.revision ?? 0) + 1;
  const next = emptyQuotation({
    ...current,
    revision: nextRevision,
    revision_label: revisionLabel(nextRevision),
    revision_id: newId('qr'),
    workflow_status: 'REVISION_IN_PROGRESS',
    revision_reason: note,
    submitted_to_customer_at: undefined,
    submitted_to_customer_by: undefined,
    submitted_to_customer_by_id: undefined,
    submission_method: undefined,
    submission_remarks: undefined,
    sent_at: undefined,
    sent_by: undefined,
    sent_by_id: undefined,
    created_at: new Date().toISOString(),
    created_by: user.name,
    created_by_id: user.id,
  });
  history.push(snapshotQuotation(next, { status: 'REVISION_IN_PROGRESS', reason: note }));
  const working = lead.status === 'QUOTATION' ? lead : transitionLead(lead, 'QUOTATION', user, `Customer requested ${next.revision_label}`);
  const updated = saveLead({
    ...working,
    quotation: next,
    quotation_revisions: history,
  });
  audit(
    user,
    updated,
    'QUOTATION_REVISION_REQUESTED',
    `${user.name} recorded a customer revision. ${lead.lead_number} ${next.revision_label} is now in progress.`,
    { old_value: current.revision_label, new_value: next.revision_label }
  );
  return updated;
}
