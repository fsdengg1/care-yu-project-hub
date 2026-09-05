import { Lead, LiveDemonstration, PipelineStage } from '@/lib/types';
import { formStatusValue, isLiveDemoPendingStatus } from '@/lib/liveDemoStatus';

export type ProjectStageFlowKey =
  | 'lead'
  | 'feasibility'
  | 'costing'
  | 'live_demo'
  | 'procurement'
  | 'po'
  | 'project';

export const PROJECT_STAGE_FLOW: Array<{ key: ProjectStageFlowKey; label: string }> = [
  { key: 'lead', label: 'Lead' },
  { key: 'feasibility', label: 'Feasibility Study' },
  { key: 'costing', label: 'Solution & Costing' },
  { key: 'live_demo', label: 'Live Case Demonstration' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'po', label: 'PO Conversion' },
  { key: 'project', label: 'Project' },
];

function pipelineOf(lead: Pick<Lead, 'status' | 'pipeline_stage'>): PipelineStage | string {
  return lead.pipeline_stage || '';
}

export function projectStageFlowIndex(lead: Pick<Lead, 'status' | 'pipeline_stage'>): number {
  const status = lead.status;
  const pipeline = pipelineOf(lead);

  if (status === 'ORDER_CONVERTED' || status === 'WON' || pipeline === 'CONVERTED') return 6;
  if (status === 'NEGOTIATION' || pipeline === 'NEGOTIATION') return 5;
  if (status === 'QUOTATION' || pipeline === 'QUOTATION') return 4;
  if (status === 'LIVE_CASE_DEMONSTRATION' || pipeline === 'LIVE_DEMO') return 3;
  if (
    status === 'COSTING_IN_PROGRESS' ||
    status === 'COSTING_SUBMITTED' ||
    status === 'COSTING_RETURNED' ||
    status === 'COSTING_REJECTED' ||
    pipeline === 'COSTING'
  ) {
    return 2;
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

export type ProjectStageFlowNodeState = 'completed' | 'current' | 'pending' | 'locked' | 'waiting';

export interface ProjectStageFlowNode {
  key: ProjectStageFlowKey;
  label: string;
  state: ProjectStageFlowNodeState;
  caption: string;
  detail?: string;
  date?: string;
}

export function projectStageFlowNodes(lead: Lead, demo?: LiveDemonstration | null): ProjectStageFlowNode[] {
  const current = projectStageFlowIndex(lead);
  const closed = lead.status === 'LOST' || lead.status === 'CANCELLED' || lead.status === 'FEASIBILITY_REJECTED' || lead.status === 'COSTING_REJECTED';
  const demoComplete = demo?.status === 'COMPLETED' || demo?.status === 'VERIFIED' || Boolean(lead.live_demo_gate_exempt);
  const costingComplete = lead.costing?.status === 'APPROVED';

  const dates: Array<string | undefined> = [
    lead.submitted_at || lead.created_at,
    lead.feasibility_study?.pm_approved_at || lead.feasibility_study?.submitted_at,
    lead.costing?.pm_approved_at || lead.costing?.submitted_at,
    demo?.completed_at || demo?.scheduled_date,
    lead.quotation?.sent_at,
    lead.quotation?.sent_at,
    lead.converted_at,
  ];

  return PROJECT_STAGE_FLOW.map((step, index) => {
    let state: ProjectStageFlowNodeState = 'pending';
    if (index < current) state = 'completed';
    else if (index === current) {
      if (step.key === 'live_demo' && isLiveDemoPendingStatus(demo?.status)) state = 'waiting';
      else if (step.key === 'live_demo' && (demo?.status === 'WAITING' || demo?.status === 'REQUESTED' || demo?.status === 'REQUEST' || !demo) && costingComplete) state = 'waiting';
      else state = closed && (lead.status === 'LOST' || lead.status === 'CANCELLED') ? 'pending' : 'current';
    }
    if (step.key === 'costing' && costingComplete && current >= 3) state = 'completed';
    if (step.key === 'live_demo' && demoComplete && current >= 4) state = 'completed';
    if (step.key === 'procurement' && current < 4 && costingComplete) state = 'locked';
    if (step.key === 'po' && current < 5) state = current < 4 ? 'locked' : 'pending';
    if (step.key === 'project' && current < 6 && current < 4) state = 'locked';
    if (index === 6 && current === 6) state = 'completed';

    const caption =
      step.key === 'live_demo' && isLiveDemoPendingStatus(demo?.status)
        ? formStatusValue(demo?.status, demo?.pending_with) === 'PENDING_CUSTOMER'
          ? 'Waiting for Customer'
          : formStatusValue(demo?.status, demo?.pending_with) === 'PENDING_INTERNAL'
            ? 'Internal Action Pending'
            : formStatusValue(demo?.status, demo?.pending_with) === 'PENDING_BOTH'
              ? 'Customer + Internal Pending'
              : 'PENDING'
        : state === 'completed'
        ? 'Completed'
        : state === 'current'
          ? 'Current Stage'
          : state === 'waiting'
            ? 'Waiting'
            : state === 'locked'
              ? 'Locked'
              : 'Pending';

    const detail =
      step.key === 'live_demo' && isLiveDemoPendingStatus(demo?.status)
        ? [demo?.pending_reason, demo?.next_action].filter(Boolean).join(' · ')
        : undefined;

    return {
      ...step,
      state,
      caption,
      detail,
      date: state === 'completed' ? dates[index] : undefined,
    };
  });
}

export function projectStageFlowSummary(lead: Lead, demo?: LiveDemonstration | null) {
  const nodes = projectStageFlowNodes(lead, demo);
  const current = nodes.find((node) => node.state === 'current' || node.state === 'waiting') || nodes[nodes.length - 1];
  return {
    stageLabel: current.label,
    owner: lead.current_owner_name || lead.responsible_user_name || 'Not assigned',
    assignedBy: lead.assigned_by_name || lead.pm_name || lead.created_by || '—',
    actionRequired: lead.action_required || '—',
    nextAction: demo?.next_action || lead.next_action || '—',
    dueDate: demo?.scheduled_date || lead.due_date || lead.customer_target_date || lead.expected_project_timeline,
  };
}
