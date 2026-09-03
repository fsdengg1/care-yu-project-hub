'use client';

import React from 'react';
import { Plus } from 'lucide-react';
import { Task } from '@/lib/types';
import { toSheetStatus, sheetStatusClass } from '@/lib/dailyStatus';
import LeadTaskBadge from './LeadTaskBadge';

function taskStatusLabel(task: Task) {
  if (task.acceptance_status === 'REQUESTED') return 'Pending';
  if (task.acceptance_status === 'REJECTED') return 'Declined';
  return toSheetStatus(task.status);
}

export default function LeadTasksPanel({
  tasks,
  canCreate,
  onCreate,
}: {
  tasks: Task[];
  canCreate: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-slate-100">Lead Tasks</h2>
          <p className="text-[11px] text-slate-400">Work created against this lead. Completing a task does not change the lead stage.</p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={onCreate}
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500"
          >
            <Plus className="h-3 w-3" /> Create Task
          </button>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">No tasks have been created for this lead yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="p-2">Task</th>
                <th className="p-2">Assigned</th>
                <th className="p-2">Status</th>
                <th className="p-2">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tasks.map((task) => (
                <tr key={task.id} className="lead-task">
                  <td className="p-2 font-semibold text-slate-100">{task.description || task.title}</td>
                  <td className="p-2 text-slate-300">{task.assigned_to}</td>
                  <td className="p-2">
                    <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${sheetStatusClass(toSheetStatus(task.status))}`}>
                      {taskStatusLabel(task)}
                    </span>
                  </td>
                  <td className="p-2">
                    <LeadTaskBadge />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
