import { Lead, PipelineStage } from '@/lib/types';

export type ProjectStageFlowKey =
  | 'lead'
  | 'feasibility'
  | 'costing'
  | 'procurement'
  | 'po'
  | 'project';

export const PROJECT_STAGE_FLOW: Array<{ key: ProjectStageFlowKey; label: string }> = [
  { key: 'lead', label: 'Lead' },
  { key: 'feasibility', label: 'Feasibility Study' },
  { key: 'costing', label: 'Solution & Costing' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'po', label: 'PO Conversion' },
  { key: 'project', label: 'Project' },
];

function pipelineOf(lead: Pick<Lead, 'status' | 'pipeline_stage'>): PipelineStage | string {
  return lead.pipeline_stage || '';
}

/** Visual index of the highlighted stage in the 6-step flow. */
export function projectStageFlowIndex(lead: Pick<Lead, 'status' | 'pipeline_stage'>): number {
  const status = lead.status;
  const pipeline = pipelineOf(lead);

  if (status === 'ORDER_CONVERTED' || status === 'WON' || pipeline === 'CONVERTED') return 5;
  if (status === 'QUOTATION' || status === 'NEGOTIATION' || pipeline === 'QUOTATION' || pipeline === 'NEGOTIATION') {
    return 4;
  }
  if (
    status === 'COSTING_IN_PROGRESS' ||
    status === 'COSTING_SUBMITTED' ||
    status === 'COSTING_RETURNED' ||
    status === 'COSTING_REJECTED' ||
    pipeline === 'COSTING'
  ) {
    return 3;
  }
  if (
    status === 'ACCEPTED_FOR_FEASIBILITY' ||
    status === 'FEASIBILITY_IN_PROGRESS' ||
    status === 'FEASIBILITY_SUBMITTED' ||
    status === 'FEASIBILITY_RETURNED' ||
    status === 'FEASIBILITY_REJECTED' ||
    pipeline === 'FEASIBILITY'
  ) {
    return 1;
  }
  return 0;
}

export type ProjectStageFlowNodeState = 'completed' | 'current' | 'pending';

export interface ProjectStageFlowNode {
  key: ProjectStageFlowKey;
  label: string;
  state: ProjectStageFlowNodeState;
  caption: string;
  date?: string;
}

export function projectStageFlowNodes(lead: Lead): ProjectStageFlowNode[] {
  const current = projectStageFlowIndex(lead);
  const closed = lead.status === 'LOST' || lead.status === 'CANCELLED' || lead.status === 'FEASIBILITY_REJECTED' || lead.status === 'COSTING_REJECTED';

  const dates: Array<string | undefined> = [
    lead.submitted_at || lead.created_at,
    lead.feasibility_study?.pm_approved_at || lead.feasibility_study?.submitted_at,
    lead.feasibility_study?.pm_approved_at || lead.costing?.submitted_at,
    lead.costing?.pm_approved_at || lead.costing?.submitted_at,
    lead.quotation?.sent_at,
    lead.converted_at,
  ];

  return PROJECT_STAGE_FLOW.map((step, index) => {
    let state: ProjectStageFlowNodeState = 'pending';
    if (index < current) state = 'completed';
    else if (index === current) state = closed && (lead.status === 'LOST' || lead.status === 'CANCELLED') ? 'pending' : 'current';
    if (index === 5 && current === 5) state = 'completed';

    const caption =
      state === 'completed'
        ? 'Completed'
        : state === 'current'
          ? 'Current Stage'
          : 'Pending';

    return {
      ...step,
      state,
      caption,
      date: state === 'completed' ? dates[index] : undefined,
    };
  });
}

export function projectStageFlowSummary(lead: Lead) {
  const nodes = projectStageFlowNodes(lead);
  const current = nodes.find((node) => node.state === 'current') || nodes[nodes.length - 1];
  return {
    stageLabel: current.label,
    owner: lead.current_owner_name || lead.responsible_user_name || 'Not assigned',
    assignedBy: lead.assigned_by_name || lead.pm_name || lead.created_by || '—',
    actionRequired: lead.action_required || '—',
    nextAction: lead.next_action || '—',
    dueDate: lead.due_date || lead.customer_target_date || lead.expected_project_timeline,
  };
}
