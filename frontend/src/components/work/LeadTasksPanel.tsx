'use client';

import React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Task, User } from '@/lib/types';
import { toSheetStatus, sheetStatusClass } from '@/lib/dailyStatus';
import { canCreateLeadTask } from '@/lib/rbac';
import LeadTaskBadge from './LeadTaskBadge';
import TaskAccessBadges from './TaskAccessBadges';

function taskStatusLabel(task: Task) {
  if (task.acceptance_status === 'REQUESTED') return 'Pending Acceptance';
  if (task.acceptance_status === 'REJECTED') return 'Declined';
  if (task.acceptance_status === 'ACCEPTED') return 'Accepted';
  return toSheetStatus(task.status);
}

function canManageLeadTask(user: User | null, task: Task) {
  if (!user) return false;
  if (canCreateLeadTask(user)) return true;
  if (task.created_by_id === user.id || task.assigned_by_id === user.id) return true;
  if (['TEAM_LEAD', 'PROJECT_MANAGER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN'].includes(user.role_code)) return true;
  const acceptedAssignee = task.assigned_to_id === user.id && task.acceptance_status !== 'REQUESTED';
  return acceptedAssignee;
}

export default function LeadTasksPanel({
  tasks,
  canCreate,
  currentUser,
  busyId,
  onCreate,
  onEdit,
  onDelete,
}: {
  tasks: Task[];
  canCreate: boolean;
  currentUser: User | null;
  busyId?: string | null;
  onCreate: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
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
        <div className="space-y-3">
          <p className="py-6 text-center text-xs text-slate-500">No tasks have been created for this lead yet.</p>
          {canCreate && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500"
              >
                <Plus className="h-3 w-3" /> Create Task
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="p-2">Task</th>
                <th className="p-2">Assigned</th>
                <th className="p-2">Status</th>
                <th className="p-2">Type</th>
                <th className="p-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {tasks.map((task) => {
                const manage = canManageLeadTask(currentUser, task);
                const pendingAssignee =
                  task.acceptance_status === 'REQUESTED' &&
                  task.assigned_to_id === currentUser?.id &&
                  task.created_by_id !== currentUser?.id;
                const canEdit = manage && !pendingAssignee;
                const busy = busyId === task.id;
                return (
                  <tr key={task.id} className="lead-task">
                    <td className="p-2 font-semibold text-slate-100">
                      <div>{task.description || task.title}</div>
                      <div className="mt-1">
                        <TaskAccessBadges
                          leadTask
                          acceptanceStatus={task.acceptance_status}
                          createdByName={task.created_by || task.assigned_by}
                          viewOnly={pendingAssignee}
                        />
                      </div>
                    </td>
                    <td className="p-2 text-slate-300">{task.assigned_to}</td>
                    <td className="p-2">
                      <span className={`inline-flex rounded border px-2 py-0.5 text-[10px] font-bold ${sheetStatusClass(toSheetStatus(task.status))}`}>
                        {taskStatusLabel(task)}
                      </span>
                    </td>
                    <td className="p-2">
                      <LeadTaskBadge />
                    </td>
                    <td className="p-2">
                      {canEdit ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onEdit(task)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-60"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => onDelete(task)}
                            className="inline-flex items-center gap-1 rounded-md border border-rose-800 px-2 py-1 font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-60"
                          >
                            <Trash2 className="h-3 w-3" /> Delete
                          </button>
                        </div>
                      ) : (
                        <div className="text-right text-[10px] text-slate-500">View only</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {canCreate && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={onCreate}
                className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500"
              >
                <Plus className="h-3 w-3" /> Create Task
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
