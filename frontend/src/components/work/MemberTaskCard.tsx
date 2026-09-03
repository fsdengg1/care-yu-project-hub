'use client';

import React, { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { TasksApi } from '@/lib/tasksApi';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { WorkAssignment } from '@/lib/types';
import { PROJECT_ACTION_SUCCESS } from '@/lib/format';
import { DailyStatusPerson, DailyStatusRow } from '@/lib/dailyStatus';
import { isLeadTask, leadWorkLabel } from '@/lib/leadTasks';
import SmartEmailNotificationPanel from '@/components/notifications/SmartEmailNotificationPanel';
import AddSubtaskForm, { EditableSubtask } from '@/components/work/AddSubtaskForm';
import LeadTaskBadge from './LeadTaskBadge';

function fmt(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined });
}

function dateOnly(value?: string) {
  if (!value) return '—';
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(assignment: WorkAssignment) {
  if (assignment.blocked || assignment.current_status === 'BLOCKED') return 'Issue / Blocked';
  if (assignment.review_status === 'PENDING_TL_REVIEW' || assignment.current_status === 'PENDING_TL_REVIEW') {
    return 'Completed / Pending Team Lead Review';
  }
  if (assignment.current_status === 'COMPLETED' || assignment.current_status === 'DONE') return 'Completed / Pending Team Lead Review';
  if (assignment.current_status === 'IN_PROGRESS') return 'In Progress';
  if (assignment.current_status === 'CORRECTION_REQUIRED') return 'Correction Required';
  return 'Assigned';
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-200">{value || '—'}</div>
    </div>
  );
}

export default function MemberTaskCard({
  assignment,
  onChanged,
  parents = [],
  people = [],
  canAssignOthers = false,
}: {
  assignment: WorkAssignment;
  onChanged: () => Promise<void>;
  parents?: DailyStatusRow[];
  people?: DailyStatusPerson[];
  canAssignOthers?: boolean;
}) {
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [progressOpen, setProgressOpen] = useState(false);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [editSubtaskOpen, setEditSubtaskOpen] = useState(false);
  const [editingSubtask, setEditingSubtask] = useState<EditableSubtask | null>(null);
  const [progress, setProgress] = useState({
    percent: assignment.progress_percent || 0,
    completed: '',
    current: assignment.remarks || '',
    next: assignment.next_plan || '',
    eta: assignment.due_date || '',
  });
  const [daily, setDaily] = useState({
    completed: '',
    percent: assignment.progress_percent || 0,
    blocker: '',
    dependency: assignment.dependency || '',
    next: '',
    eta: assignment.due_date || '',
  });
  const [issue, setIssue] = useState({ title: '', description: '', priority: 'High' });

  const blocked = assignment.blocked || assignment.current_status === 'BLOCKED';
  const reviewPending = assignment.review_status === 'PENDING_TL_REVIEW' || assignment.current_status === 'PENDING_TL_REVIEW';
  const completed = reviewPending || assignment.current_status === 'COMPLETED' || assignment.current_status === 'DONE';
  const inProgress =
    !blocked &&
    !completed &&
    (assignment.current_status === 'IN_PROGRESS' || assignment.current_status === 'CORRECTION_REQUIRED');
  const assigned = !blocked && !completed && !inProgress;
  const viewOnly = completed;

  async function run(key: string, work: () => Promise<void>, success: string) {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await work();
      setNotice(success);
      await onChanged();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
      return false;
    } finally {
      setBusy('');
    }
  }

  async function requireOk(result: { ok: true } | { ok: false; message: string }) {
    if (!result.ok) throw new Error(result.message);
  }

  return (
    <article className={`rounded-xl border p-4 ${isLeadTask(assignment) ? 'lead-task' : 'border-slate-800 bg-slate-950/80'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {isLeadTask(assignment) ? <LeadTaskBadge /> : <div className="text-xs uppercase tracking-wider text-slate-500">{assignment.project_code || 'No project'}</div>}
          </div>
          <h3 className="text-lg font-bold text-white">
            {assignment.task_title}
            {assignment.parent_task_id ? (
              <span className="ml-2 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                Subtask
              </span>
            ) : null}
          </h3>
          <p className="text-sm text-slate-400">{isLeadTask(assignment) ? leadWorkLabel(assignment) : assignment.project_name}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${blocked ? 'bg-rose-500/15 text-rose-300' : inProgress ? 'bg-cyan-500/15 text-cyan-300' : completed ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>
          {statusLabel(assignment)}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={isLeadTask(assignment) ? 'Lead' : 'Project Name'} value={isLeadTask(assignment) ? leadWorkLabel(assignment) : assignment.project_name} />
        <Field label={isLeadTask(assignment) ? 'Lead Stage' : 'Project ID'} value={isLeadTask(assignment) ? assignment.lead_stage_at_creation || assignment.workflow_stage : assignment.project_code} />
        <Field label="Task Name" value={assignment.task_title} />
        <Field label="Task Description" value={assignment.description} />
        <Field label="Assigned By" value={assignment.assigned_by} />
        <Field label="Team Lead" value={assignment.team_lead_name} />
        <Field label="Priority" value={assignment.priority} />
        <Field label="Start Date" value={dateOnly(assignment.start_date)} />
        <Field label="Due Date" value={dateOnly(assignment.due_date)} />
        <Field label="Dependency" value={assignment.depends_on_title} />
        <Field label="Current Status" value={statusLabel(assignment)} />
        <Field label="Progress %" value={`${assignment.progress_percent || 0}%`} />
        <Field label="Last Updated" value={fmt(assignment.last_update_at)} />
      </div>

      {blocked ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          Issue / Blocked{assignment.blocker ? `: ${assignment.blocker}` : ''}. Wait for the Team Lead to resolve this before continuing work.
        </p>
      ) : null}

      {notice ? <p className="mt-3 text-sm text-emerald-300">{notice}</p> : null}
      {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}

      {assignment.task_id ? (
        <div className="mt-4">
          <SmartEmailNotificationPanel entityType="TASK" entityId={assignment.task_id} compact />
        </div>
      ) : assignment.lead_id ? (
        <div className="mt-4">
          <SmartEmailNotificationPanel entityType="LEAD" entityId={assignment.lead_id} compact />
        </div>
      ) : null}

      {!viewOnly && !blocked ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {assignment.parent_task_id && assignment.task_id ? (
            <>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  setEditingSubtask({
                    id: assignment.task_id!,
                    parentId: assignment.parent_task_id || '',
                    title: assignment.task_title || '',
                    description: assignment.description || assignment.task_title || '',
                    assignedToId: assignment.assigned_to_id,
                    dueDate: assignment.due_date ? String(assignment.due_date).slice(0, 10) : '',
                    status:
                      assignment.current_status === 'DONE' || assignment.current_status === 'COMPLETED'
                        ? 'DONE'
                        : assignment.current_status === 'IN_PROGRESS'
                          ? 'IN_PROGRESS'
                          : assignment.current_status === 'BLOCKED' || assignment.current_status === 'WAITING'
                            ? 'WAITING'
                            : assignment.current_status === 'HOLD'
                              ? 'HOLD'
                              : 'TODO',
                  });
                  setEditSubtaskOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit Subtask
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => {
                  if (!window.confirm('Delete this subtask?')) return;
                  void run(
                    'delete-subtask',
                    async () => {
                      await requireOk(await TasksApi.bulkDelete([assignment.task_id!]));
                    },
                    'Subtask deleted.',
                  );
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-200"
              >
                <Trash2 className="h-3.5 w-3.5" /> {busy === 'delete-subtask' ? 'Deleting…' : 'Delete Subtask'}
              </button>
            </>
          ) : null}
          {assigned && assignment.task_id ? (
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                run(
                  'start',
                  async () => {
                    await requireOk(
                      await TasksApi.update(assignment.task_id!, {
                        status: 'IN_PROGRESS',
                        progress_percent: Math.max(assignment.progress_percent || 0, 10),
                      }),
                    );
                  },
                  PROJECT_ACTION_SUCCESS.taskStarted,
                )
              }
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === 'start' ? 'Starting…' : 'Start Task'}
            </button>
          ) : null}
          {inProgress ? (
            <>
              <button onClick={() => setProgressOpen(true)} className="rounded-lg border border-cyan-500/40 px-4 py-2 text-sm font-semibold text-cyan-200">
                Update Progress
              </button>
              <button onClick={() => setDailyOpen(true)} className="rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200">
                Submit Daily Update
              </button>
              <button onClick={() => setIssueOpen(true)} className="rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-200">
                Raise Issue / Doubt
              </button>
              <button
                disabled={Boolean(busy)}
                onClick={() => {
                  if (!window.confirm('Are you sure you want to mark this task as completed?')) return;
                  void run(
                    'done',
                    async () => {
                      await requireOk(await TasksApi.update(assignment.task_id!, { status: 'DONE', progress_percent: 100 }));
                    },
                    PROJECT_ACTION_SUCCESS.taskCompleted,
                  );
                }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy === 'done' ? 'Saving…' : 'Mark Task Completed'}
              </button>
            </>
          ) : null}
        </div>
      ) : completed ? (
        <p className="mt-3 text-xs text-slate-500">This task is completed and waiting for Team Lead review. It is view-only.</p>
      ) : null}

      {progressOpen ? (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-3">
          <div className="text-sm font-bold text-white">Update Progress</div>
          <label className="block text-xs text-slate-400">Progress %</label>
          <input type="number" min={0} max={100} value={progress.percent} onChange={(e) => setProgress((c) => ({ ...c, percent: Number(e.target.value) }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <textarea placeholder="Work completed" value={progress.completed} onChange={(e) => setProgress((c) => ({ ...c, completed: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <textarea placeholder="Current work" value={progress.current} onChange={(e) => setProgress((c) => ({ ...c, current: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input placeholder="Next action" value={progress.next} onChange={(e) => setProgress((c) => ({ ...c, next: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input type="date" value={progress.eta} onChange={(e) => setProgress((c) => ({ ...c, eta: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <div className="flex gap-2">
            <button
              disabled={Boolean(busy)}
              onClick={() =>
                run(
                  'progress',
                  async () => {
                    await requireOk(
                      await TasksApi.update(assignment.task_id!, {
                        progress_percent: progress.percent,
                        remarks: [progress.completed && `Work completed: ${progress.completed}`, progress.current && `Current work: ${progress.current}`, progress.next && `Next action: ${progress.next}`, progress.eta && `ETA: ${progress.eta}`]
                          .filter(Boolean)
                          .join('\n'),
                      }),
                    );
                  },
                  PROJECT_ACTION_SUCCESS.progressUpdated,
                ).then((ok) => {
                  if (ok) setProgressOpen(false);
                })
              }
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white"
            >
              Save Progress
            </button>
            <button onClick={() => setProgressOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
          </div>
        </div>
      ) : null}

      {dailyOpen ? (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-3">
          <div className="text-sm font-bold text-white">Submit Daily Update</div>
          <textarea placeholder="Work completed" value={daily.completed} onChange={(e) => setDaily((c) => ({ ...c, completed: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input type="number" min={0} max={100} value={daily.percent} onChange={(e) => setDaily((c) => ({ ...c, percent: Number(e.target.value) }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <textarea placeholder="Issues / blockers" value={daily.blocker} onChange={(e) => setDaily((c) => ({ ...c, blocker: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input placeholder="Dependencies" value={daily.dependency} onChange={(e) => setDaily((c) => ({ ...c, dependency: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input placeholder="Next action" value={daily.next} onChange={(e) => setDaily((c) => ({ ...c, next: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <input type="date" value={daily.eta} onChange={(e) => setDaily((c) => ({ ...c, eta: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <div className="flex gap-2">
            <button
              disabled={!daily.completed.trim() || !daily.next.trim() || Boolean(busy)}
              onClick={() =>
                run(
                  'daily',
                  async () => {
                    await requireOk(
                      await DailyUpdatesApi.save({
                        assignment_id: assignment.id,
                        work_completed: daily.completed,
                        progress_percent: daily.percent,
                        blocker: daily.blocker,
                        dependency: daily.dependency,
                        next_plan: daily.eta ? `${daily.next} (ETA ${daily.eta})` : daily.next,
                        work_status: 'IN_PROGRESS',
                        submission_status: 'SUBMITTED',
                      }),
                    );
                  },
                  PROJECT_ACTION_SUCCESS.dailyUpdate,
                ).then((ok) => {
                  if (ok) setDailyOpen(false);
                })
              }
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Submit Daily Update
            </button>
            <button onClick={() => setDailyOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
          </div>
        </div>
      ) : null}

      {issueOpen ? (
        <div className="mt-4 space-y-2 rounded-lg border border-rose-500/20 bg-slate-900 p-3">
          <div className="text-sm font-bold text-white">Raise Issue / Doubt</div>
          <input placeholder="Issue / doubt title" value={issue.title} onChange={(e) => setIssue((c) => ({ ...c, title: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <textarea placeholder="Description" value={issue.description} onChange={(e) => setIssue((c) => ({ ...c, description: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <select value={issue.priority} onChange={(e) => setIssue((c) => ({ ...c, priority: e.target.value }))} className="w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
          <div className="flex gap-2">
            <button
              disabled={!issue.title.trim() || Boolean(busy)}
              onClick={() =>
                run(
                  'issue',
                  async () => {
                    await requireOk(
                      await TasksApi.update(assignment.task_id!, {
                        status: 'BLOCKED',
                        blocked_reason: `[${issue.priority}] ${issue.title}: ${issue.description}`.trim(),
                      }),
                    );
                  },
                  PROJECT_ACTION_SUCCESS.issueRaised,
                ).then((ok) => {
                  if (ok) setIssueOpen(false);
                })
              }
              className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Raise Issue
            </button>
            <button onClick={() => setIssueOpen(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300">Cancel</button>
          </div>
        </div>
      ) : null}

      {assignment.parent_task_id && assignment.task_id && (viewOnly || blocked) ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => {
              setEditingSubtask({
                id: assignment.task_id!,
                parentId: assignment.parent_task_id || '',
                title: assignment.task_title || '',
                description: assignment.description || assignment.task_title || '',
                assignedToId: assignment.assigned_to_id,
                dueDate: assignment.due_date ? String(assignment.due_date).slice(0, 10) : '',
                status:
                  assignment.current_status === 'DONE' || assignment.current_status === 'COMPLETED'
                    ? 'DONE'
                    : assignment.current_status === 'IN_PROGRESS'
                      ? 'IN_PROGRESS'
                      : assignment.current_status === 'BLOCKED' || assignment.current_status === 'WAITING'
                        ? 'WAITING'
                        : assignment.current_status === 'HOLD'
                          ? 'HOLD'
                          : 'TODO',
              });
              setEditSubtaskOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit Subtask
          </button>
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => {
              if (!window.confirm('Delete this subtask?')) return;
              void run(
                'delete-subtask',
                async () => {
                  await requireOk(await TasksApi.bulkDelete([assignment.task_id!]));
                },
                'Subtask deleted.',
              );
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-500/40 px-4 py-2 text-sm font-semibold text-rose-200"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete Subtask
          </button>
        </div>
      ) : null}

      {editSubtaskOpen && editingSubtask ? (
        <AddSubtaskForm
          parents={parents.length ? parents : [{ id: editingSubtask.parentId, personId: assignment.assigned_to_id, person: assignment.assigned_to, project: assignment.project_name, projectId: assignment.project_id, taskDescription: assignment.task_title, dependencyIds: [], dependencies: '', status: 'In Progress', currentDate: '', startDate: '', deadline: '', reasonForDelay: '', isAdditional: false, progressPercent: 0 }]}
          people={people.length ? people : [{ id: assignment.assigned_to_id, name: assignment.assigned_to, displayName: assignment.assigned_to, email: '', role_name: '' }]}
          currentUserId={assignment.assigned_to_id}
          canAssignOthers={canAssignOthers}
          editing={editingSubtask}
          onCancel={() => {
            setEditSubtaskOpen(false);
            setEditingSubtask(null);
          }}
          onCreated={(message) => {
            setNotice(message);
            setEditSubtaskOpen(false);
            setEditingSubtask(null);
            void onChanged();
          }}
        />
      ) : null}
    </article>
  );
}
