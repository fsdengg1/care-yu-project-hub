import { initStore, shutdownStore, store } from '../src/store/db.js';
import {
  assignSubmittedLeadToPm,
  assignTeamToLead,
  buildPmDashboard,
  canHandleLeadCommercial,
  canPrepareQuotation,
  convertLeadToProject,
  emptyCosting,
  emptyFeasibility,
  emptyQuotation,
  handLeadToBusinessHead,
  hydrateLead,
  isProcurementUser,
  saveLead,
  transitionLead,
} from '../src/lib/leadWorkflow.js';
import { Lead } from '../src/types.js';

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

async function main() {
  await initStore();
  const users = store.getUsers().filter((user) => user.status === 'ACTIVE');
  const sales = users.find((user) => user.role_code === 'ENG_DIRECTOR') || users.find((user) => ['BUSINESS_HEAD', 'SALES'].includes(user.role_code));
  const pm = users.find((user) => user.role_code === 'PROJECT_MANAGER');
  const teamLead = users.find((user) => user.role_code === 'TEAM_LEAD');
  const procurement = users.find((user) => isProcurementUser(user));
  const bh = users.find((user) => user.role_code === 'BUSINESS_HEAD');
  const team = store.getTeams().find((item) => item.status === 'ACTIVE' && item.team_lead_id);

  const report: Record<string, string> = {};
  report.users = users.map((user) => `${user.name} (${user.role_code})`).join(', ');
  report.sales = sales ? `${sales.name} / ${sales.role_code}` : 'MISSING';
  report.pm = pm ? `${pm.name} / ${pm.id}` : 'MISSING';
  report.teamLead = teamLead ? `${teamLead.name}` : 'MISSING';
  report.procurement = procurement ? `${procurement.name} / ${procurement.role_code}` : 'MISSING';
  report.commercial = bh ? `${bh.name} / ${bh.role_code}` : 'MISSING';
  report.team = team ? `${team.name}` : 'MISSING';

  assert(sales && pm && teamLead && team && bh, `Missing required demo actors: ${JSON.stringify(report)}`);

  const now = new Date().toISOString();
  const id = `lifecycle-${Date.now()}`;
  let lead: Lead = {
    id,
    lead_number: 'LD-LIFE',
    title: 'Warehouse Automation',
    customer_name: 'ABC Industries Pvt Ltd',
    customer_type: 'Manufacturing',
    business_vertical: sales!.role_code === 'ENG_DIRECTOR' ? 'Engineering Director' : 'Business Head',
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

  saveLead(lead);
  report.step1 = 'OK — Project Input draft created';

  lead = transitionLead(lead, 'SUBMITTED_TO_PM', sales!, 'Submitted to PM for review', {
    submitted_at: now,
    submitted_by: sales!.name,
    submitted_by_id: sales!.id,
  });
  lead = assignSubmittedLeadToPm(lead, sales!, 'Lead submitted to Project Manager');
  const dash = buildPmDashboard(pm!);
  assert(lead.current_owner_id === pm!.id, 'Step 2 owner must be PM');
  assert(dash.pendingReviews.some((item) => item.id === lead.id), 'Step 2 PM dashboard must list the lead');
  report.step2 = `OK — PM Review queue has ${lead.lead_number} for ${pm!.name}`;

  const assigned = assignTeamToLead(lead, pm!, team!.id, teamLead!.id, 'Prepare feasibility');
  lead = assigned.lead;
  assert(lead.status === 'FEASIBILITY_IN_PROGRESS', `Accept & assign must start feasibility, got ${lead.status}`);
  assert(lead.accepted_at, 'Accept & assign must record accepted_at');
  report.step2b = 'OK — Accept & Assign Team moved the lead straight into feasibility';
  report.step3 = `OK — Assigned to ${lead.assigned_team_name} / ${lead.assigned_team_lead_name}`;

  lead = transitionLead(lead, 'FEASIBILITY_SUBMITTED', teamLead!, 'Feasibility submitted to PM', {
    feasibility_study: emptyFeasibility({
      technical_feasibility: 'Feasible with standard robot cell',
      required_resources: 'Robotics team, 6 weeks',
      proposed_solution: 'Palletizing cell',
      status: 'SUBMITTED',
      submitted_by: teamLead!.name,
      submitted_by_id: teamLead!.id,
    }),
  });
  report.step4 = 'OK — Feasibility report submitted';

  lead = transitionLead(lead, 'COSTING_IN_PROGRESS', pm!, 'Feasibility approved', {
    feasibility_study: emptyFeasibility({ ...(lead.feasibility_study || {}), status: 'APPROVED', pm_approved_by: pm!.name }),
  });
  report.step5 = 'OK — PM approved feasibility';

  const costingActor = procurement || users.find((user) => user.role_code === 'SYSTEM_ADMIN');
  if (!costingActor) {
    report.step6 = 'BLOCKED — No Procurement user and no System Admin.';
  } else {
    lead = transitionLead(lead, 'COSTING_SUBMITTED', costingActor, 'Costing submitted to PM', {
      costing: emptyCosting({
        component_costs: 100000,
        procurement_costs: 50000,
        total_estimated_cost: 150000,
        status: 'SUBMITTED',
        submitted_by: costingActor.name,
        submitted_by_id: costingActor.id,
      }),
    });
    report.step6 = procurement
      ? `OK — Procurement costing submitted by ${procurement.name}`
      : `OK via System Admin workaround (${costingActor.name}). No PROCUREMENT user exists for a true actor demo.`;
  }

  if (lead.status === 'COSTING_SUBMITTED') {
    lead = transitionLead(lead, 'QUOTATION', pm!, 'Costing approved', {
      costing: emptyCosting({ ...(lead.costing || {}), status: 'APPROVED', pm_approved_by: pm!.name }),
    });
    lead = handLeadToBusinessHead(lead, pm!, 'Costing approved — ready for quotation');
    assert(bh, 'Business Head is required for quotation');
    assert(canHandleLeadCommercial(bh!, lead), 'Business Head must handle quotation even if Engineering Director created the lead');
    assert(canPrepareQuotation(bh!, lead), 'Business Head must see quotation actions');
    report.step7 = `OK — PM approved costing and handed quotation to ${lead.current_owner_name || bh!.name}`;
  } else {
    report.step7 = 'SKIPPED — waiting on costing submit';
  }

  if (lead.status === 'QUOTATION') {
    lead = transitionLead(lead, 'NEGOTIATION', bh!, 'Quotation sent to customer', {
      quotation: emptyQuotation({ quotation_value: 600000, sent_at: now, sent_by: bh!.name, sent_by_id: bh!.id }),
    });
    report.step8 = `OK — Quotation sent by ${bh!.name}`;
    report.step9 = 'OK — Moved to negotiation';
    const converted = convertLeadToProject(lead, bh!);
    lead = converted.lead;
    assert(lead.status === 'ORDER_CONVERTED', `Step 10 expected ORDER_CONVERTED, got ${lead.status}`);
    report.step10 = `OK — Converted to ${converted.project.code}`;
  } else {
    report.step8 = 'SKIPPED';
    report.step9 = 'SKIPPED';
    report.step10 = 'SKIPPED';
  }

  const leftover = store.getLeads().filter((item) => item.id !== id);
  store.saveLeads(leftover);
  if (lead.project_id) {
    store.saveProjects(store.getProjects().filter((item) => item.id !== lead.project_id));
  }
  store.saveAssignmentHistory(store.getAssignmentHistory().filter((item) => item.entity_id !== id));
  store.saveLeadStatusHistory(store.getLeadStatusHistory().filter((item) => item.lead_id !== id));
  store.saveFeasibilityTeamAssignments(store.getFeasibilityTeamAssignments().filter((item) => item.lead_id !== id));

  console.log(JSON.stringify({ hydrated: hydrateLead(lead).status, report }, null, 2));
  await shutdownStore();
}

main().catch(async (error) => {
  console.error(error);
  await shutdownStore();
  process.exit(1);
});
