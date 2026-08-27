import { initStore, shutdownStore, store, transact } from '../src/store/db.js';
import {
  assertAllowedTransition,
  assertLeadValidForSubmit,
  LeadValidationError,
  leadOwnerId,
  validateLeadPayload,
} from '../src/lib/leadValidation.js';
import { assignSubmittedLeadToPm, buildMyWork, buildPmDashboard, hydrateLead, saveLead } from '../src/lib/leadWorkflow.js';
import { resolveProjectManagerForAssignment } from '../src/lib/responsibility.js';
import { Lead } from '../src/types.js';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Warehouse Automation',
    customer_name: 'ABC Industries Pvt Ltd',
    business_vertical: 'Business Head',
    sales_owner: 'Sales User',
    sales_owner_id: 'u-sales',
    priority: 'HIGH',
    customer_contact: 'Roca Teflon',
    customer_designation: 'Plant Manager',
    customer_email: 'name@company.com',
    customer_phone: '9876543210',
    requirement_summary: 'Automate inbound warehouse handling',
    detailed_requirement: 'Need palletizing and ASRS integration for the new plant.',
    application: 'Palletizing',
    production_quantity: '1500',
    estimated_opportunity_value: '600000',
    ...overrides,
  };
}

async function main() {
  await initStore();
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE');
  const pm = resolveProjectManagerForAssignment();
  const sales =
    users.find((user) => ['SALES', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'EMPLOYEE'].includes(user.role_code) && user.id !== pm?.id) ||
    users.find((user) => user.id !== pm?.id);
  const otherPm = users.find((user) => user.role_code === 'PROJECT_MANAGER' && user.id !== pm?.id);
  assert(pm, 'Expected an active Project Manager');
  assert(sales, 'Expected a sales / creator user');

  const phoneCases = [
    ['987654321', false],
    ['98765432101', false],
    ['abcdefghij', false],
    ['98765 43210', false],
    ['+919876543210', false],
    ['9876543210', true],
  ] as const;
  for (const [phone, ok] of phoneCases) {
    const result = validateLeadPayload(validBody({ customer_phone: phone }), { submit: true });
    assert(ok ? result.errors.length === 0 : result.errors.some((item) => item.field === 'customer_phone'), `Phone ${phone} expected ${ok ? 'valid' : 'invalid'}`);
  }

  const email = validateLeadPayload(validBody({ customer_email: 'abc@' }), { submit: true });
  assert(email.errors.some((item) => item.field === 'customer_email'), 'Invalid email must be blocked');

  for (const qty of ['abc', '-100', '0']) {
    const result = validateLeadPayload(validBody({ production_quantity: qty }), { submit: true });
    assert(result.errors.some((item) => item.field === 'production_quantity'), `Quantity ${qty} must be blocked`);
  }

  const amountInvalid = validateLeadPayload(validBody({ estimated_opportunity_value: 'abc' }), { submit: true });
  assert(amountInvalid.errors.some((item) => item.field === 'estimated_opportunity_value'), 'Invalid amount must be blocked');
  const amountNeg = validateLeadPayload(validBody({ estimated_opportunity_value: '-50000' }), { submit: true });
  assert(amountNeg.errors.some((item) => item.field === 'estimated_opportunity_value'), 'Negative amount must be blocked');
  const amountOk = validateLeadPayload(validBody({ estimated_opportunity_value: '600000' }), { submit: true });
  assert(amountOk.errors.length === 0, 'Valid amount 600000 must be accepted');
  assert(amountOk.normalized.expected_value === 600000, 'Amount must store as number');

  assertLeadValidForSubmit(validBody());

  let blockedStatus = false;
  try {
    assertAllowedTransition('DRAFT', 'ORDER_CONVERTED');
  } catch {
    blockedStatus = true;
  }
  assert(blockedStatus, 'Direct DRAFT → ORDER_CONVERTED must be forbidden');

  const now = new Date().toISOString();
  const draft: Lead = {
    id: `verify-lead-${Date.now()}`,
    lead_number: 'LD-VERIFY',
    title: 'Warehouse Automation',
    customer_name: 'ABC Industries Pvt Ltd',
    customer_type: 'Manufacturing',
    business_vertical: 'Business Head',
    created_by: sales!.name,
    created_by_id: sales!.id,
    created_by_role: sales!.role_name,
    sales_owner: sales!.name,
    sales_owner_id: sales!.id,
    lead_date: now,
    priority: 'High',
    status: 'DRAFT',
    customer_contact: 'Roca Teflon',
    customer_designation: 'Plant Manager',
    customer_email: 'name@company.com',
    customer_phone: '9876543210',
    requirement_summary: 'Automate inbound warehouse handling',
    detailed_requirement: 'Need palletizing and ASRS integration for the new plant.',
    application: 'Palletizing',
    production_quantity: '1500',
    estimated_opportunity_value: '600000',
    expected_value: 600000,
    currency: 'INR',
    created_at: now,
    updated_at: now,
    pipeline_stage: 'PROJECT_INPUT',
  };

  const submitted = await transact(() => {
    saveLead({ ...draft, status: 'SUBMITTED_TO_PM', submitted_at: now, submitted_by: sales!.name, submitted_by_id: sales!.id, pipeline_stage: 'PM_REVIEW' });
    const assigned = assignSubmittedLeadToPm(
      { ...draft, status: 'SUBMITTED_TO_PM', submitted_at: now, submitted_by: sales!.name, submitted_by_id: sales!.id, pipeline_stage: 'PM_REVIEW' },
      sales!,
      'Lead submitted to Project Manager'
    );
    return assigned;
  });

  assert(submitted.status === 'SUBMITTED_TO_PM', 'Submitted status must be SUBMITTED_TO_PM');
  assert(submitted.current_owner_id === pm!.id, 'current_owner_id must be the assigned PM');
  assert(submitted.responsible_user_id === pm!.id, 'responsible_user_id must match the PM');
  assert(submitted.pm_id === pm!.id, 'pm_id must match the PM');
  assert(leadOwnerId(submitted) === pm!.id, 'Owner helper must resolve to PM id');

  const pmDash = buildPmDashboard(pm!);
  assert(
    pmDash.pendingReviews.some((item) => item.id === submitted.id),
    'Assigned PM dashboard must include the submitted lead'
  );
  const pmWork = buildMyWork(pm!);
  assert(
    pmWork.items.some((item) => item.lead_id === submitted.id && item.category === 'PM_REVIEW'),
    'Assigned PM my-work queue must include the submitted lead'
  );

  if (otherPm) {
    const otherDash = buildPmDashboard(otherPm);
    assert(
      !otherDash.pendingReviews.some((item) => item.id === submitted.id),
      'A different PM must not see a lead assigned to another PM'
    );
  }

  const persisted = store.getLeads().find((item) => item.id === submitted.id);
  assert(persisted, 'Lead must exist in the store after submit');
  assert(hydrateLead(persisted!).current_owner_id === pm!.id, 'Hydrated lead must expose current_owner_id');

  const history = store.getAssignmentHistory().filter((item) => item.entity_id === submitted.id);
  assert(history.length >= 1, 'Assignment history must be created');
  assert(history[0].new_responsible_user_id === pm!.id, 'Assignment history must point to the PM');

  try {
    assertLeadValidForSubmit(validBody({ customer_name: '123456' }));
    throw new Error('Numeric-only customer name should fail');
  } catch (error) {
    assert(error instanceof LeadValidationError, 'Numeric-only name must throw LeadValidationError');
  }

  console.log('verify-lead-workflow ok', {
    pm: pm!.email,
    sales: sales!.email,
    lead: submitted.lead_number,
    owner: submitted.current_owner_id,
    pendingPmReview: pmDash.pendingPmReview,
  });
  const leads = store.getLeads().filter((item) => item.lead_number !== 'LD-VERIFY' && !item.id.startsWith('verify-lead-'));
  store.saveLeads(leads);
  store.saveAssignmentHistory(store.getAssignmentHistory().filter((item) => !item.entity_id.startsWith('verify-lead-')));
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore();
  process.exit(1);
});
