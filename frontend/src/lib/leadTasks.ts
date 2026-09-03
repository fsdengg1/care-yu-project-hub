import { Task, WorkAssignment, WorkTaskType } from './types';

export function isLeadTaskType(type?: WorkTaskType | string) {
  return type === 'LEAD_TASK';
}

export function isLeadTask(item: Pick<WorkAssignment, 'task_type'> | Pick<Task, 'task_type'>) {
  return isLeadTaskType(item.task_type);
}

export function leadWorkLabel(item: Pick<WorkAssignment, 'lead_number' | 'lead_name' | 'project_name'>) {
  const parts = [item.lead_number, item.lead_name].filter(Boolean);
  return parts.join(' – ') || item.project_name || 'Lead task';
}

export function assignmentStatusLabel(item: Pick<WorkAssignment, 'acceptance_status' | 'current_status'>) {
  if (item.acceptance_status === 'REQUESTED') return 'Pending Acceptance';
  if (item.acceptance_status === 'REJECTED') return 'Declined';
  if (item.current_status === 'COMPLETED' || item.current_status === 'DONE') return 'Completed';
  if (item.current_status === 'IN_PROGRESS') return 'In Progress';
  if (item.current_status === 'HOLD') return 'Hold';
  if (item.current_status === 'WAITING' || item.current_status === 'BLOCKED') return 'Waiting';
  return 'Yet to Start';
}
