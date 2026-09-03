'use client';

import React from 'react';
import { WorkAssignment } from '@/lib/types';
import { formatSheetDate } from '@/lib/dailyStatus';
import { isLeadTask, leadWorkLabel } from '@/lib/leadTasks';
import LeadTaskBadge from './LeadTaskBadge';

export default function PendingTaskAssignmentCard({
  item,
  busy,
  onAccept,
  onDecline,
}: {
  item: WorkAssignment;
  busy?: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const leadBased = isLeadTask(item);
  return (
    <div className={`rounded-xl border p-4 ${leadBased ? 'lead-task' : 'border-amber-800/60 bg-amber-950/20'}`}>
      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
        {leadBased ? 'New Task Assigned' : 'Dependency request'}
      </div>
      {leadBased && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <LeadTaskBadge />
          <span className="font-mono text-cyan-300">{leadWorkLabel(item)}</span>
        </div>
      )}
      {leadBased && item.lead_stage_at_creation && (
        <div className="mt-1 text-[11px] text-slate-400">{item.lead_stage_at_creation}</div>
      )}
      <div className="mt-2 font-semibold text-slate-100">{item.description || item.task_title}</div>
      <div className="mt-2 space-y-0.5 text-[11px] text-slate-400">
        {item.assigned_by && <div>Assigned by: {item.assigned_by}</div>}
        <div>Deadline: {formatSheetDate(item.due_date)}</div>
        {!leadBased && item.requested_by_name && <div>From: {item.requested_by_name}</div>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          Accept Task
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDecline}
          className="rounded-lg border border-rose-800 px-3 py-1.5 font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-60"
        >
          Decline
        </button>
      </div>
    </div>
  );
}
