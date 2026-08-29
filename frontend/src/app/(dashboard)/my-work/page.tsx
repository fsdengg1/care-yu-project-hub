'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { LeadApi } from '@/lib/leadApi';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { TasksApi } from '@/lib/tasksApi';
import { UsersApi } from '@/lib/usersApi';
import { ProjectsApi } from '@/lib/projectsApi';
import { StorageService } from '@/lib/storage';
import { MyWorkItem, Project, User, WorkAssignment } from '@/lib/types';
import { formatLongDate, LEAD_STATUS_LABELS, PIPELINE_STAGE_LABELS, TASK_STATUS_LABELS, WORK_STATUS_LABELS } from '@/lib/format';
import { canCreateLead, canCreateWorkTask, canSubmitDailyUpdate } from '@/lib/rbac';
import {
  CheckSquare, ArrowRight, Inbox, Plus, RotateCcw, FileText, Handshake, Scan, Calculator, Building2, AlertTriangle
} from 'lucide-react';

const GROUP_META: Record<string, { title: string; icon: React.ReactNode }> = {
  CREATE: { title: 'Project Input', icon: <Plus className="h-4 w-4" /> },
  DRAFT: { title: 'Drafts to complete', icon: <FileText className="h-4 w-4" /> },
  RETURNED: { title: 'Returned Items', icon: <RotateCcw className="h-4 w-4" /> },
  PM_REVIEW: { title: 'PM Review', icon: <Scan className="h-4 w-4" /> },
  ASSIGN: { title: 'Assign to Team', icon: <Scan className="h-4 w-4" /> },
  FEASIBILITY: { title: 'Feasibility', icon: <Scan className="h-4 w-4" /> },
  FEASIBILITY_APPROVAL: { title: 'PM Approval — Feasibility', icon: <Scan className="h-4 w-4" /> },
  COSTING: { title: 'Procurement / Costing', icon: <Calculator className="h-4 w-4" /> },
  COSTING_APPROVAL: { title: 'PM Approval — Costing', icon: <Calculator className="h-4 w-4" /> },
  QUOTATION: { title: 'Quotation', icon: <Building2 className="h-4 w-4" /> },
  NEGOTIATION: { title: 'Negotiation', icon: <Handshake className="h-4 w-4" /> },
  EXECUTION: { title: 'Project Execution', icon: <CheckSquare className="h-4 w-4" /> },
  TASK: { title: 'Assigned Tasks', icon: <CheckSquare className="h-4 w-4" /> },
  TASK_REVIEW: { title: 'Task Review', icon: <Scan className="h-4 w-4" /> },
  ESCALATION: { title: 'Escalations', icon: <AlertTriangle className="h-4 w-4" /> },
};

const ORDER = [
  'CREATE',
  'DRAFT',
  'RETURNED',
  'PM_REVIEW',
  'ASSIGN',
  'FEASIBILITY',
  'FEASIBILITY_APPROVAL',
  'COSTING',
  'COSTING_APPROVAL',
  'QUOTATION',
  'NEGOTIATION',
  'EXECUTION',
  'TASK_REVIEW',
  'TASK',
  'ESCALATION',
];

type WorkFilter = 'ALL' | 'PROJECT' | 'NON_PROJECT' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'COMPLETED';

function assignmentType(item: WorkAssignment) {
  return item.task_type || (item.project_id ? 'PROJECT_TASK' : 'NON_PROJECT_TASK');
}

function matchesFilter(item: WorkAssignment, filter: WorkFilter) {
  const today = new Date().toISOString().slice(0, 10);
  const type = assignmentType(item);
  const done = item.current_status === 'COMPLETED' || item.current_status === 'DONE';
  if (filter === 'PROJECT') return type === 'PROJECT_TASK';
  if (filter === 'NON_PROJECT') return type === 'NON_PROJECT_TASK';
  if (filter === 'COMPLETED') return done;
  if (filter === 'OVERDUE') return Boolean(item.due_date && item.due_date < today && !done && item.current_status !== 'PENDING_TL_REVIEW');
  if (filter === 'TODAY') return item.due_date === today;
  if (filter === 'UPCOMING') return Boolean(item.due_date && item.due_date > today && !done);
  return true;
}

export default function MyAssignedWorkPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [groups, setGroups] = useState<Record<string, MyWorkItem[]>>({});
  const [items, setItems] = useState<MyWorkItem[]>([]);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [filter, setFilter] = useState<WorkFilter>('ALL');
  const [showCreate, setShowCreate] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [taskBusy, setTaskBusy] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    task_type: 'PROJECT_TASK' as 'PROJECT_TASK' | 'NON_PROJECT_TASK',
    project_id: '',
    assigned_to_id: '',
    start_date: '',
    due_date: '',
    priority: 'Medium',
  });

  const loadAssignments = async () => {
    setAssignments(await DailyUpdatesApi.assignments(true));
  };

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    if (!user) return;
    setCurrentUser(user);
    setFocusTaskId(new URLSearchParams(window.location.search).get('task'));
    void (async () => {
      const result = await LeadApi.myWork();
      setGroups(result.groups);
      setItems(result.items);
      await loadAssignments();
      if (canCreateWorkTask(user)) {
        const listed = await UsersApi.list();
        setUsers(
          listed.users.filter((item) => {
            if (item.status !== 'ACTIVE') return false;
            if (user.role_code === 'TEAM_LEAD') return item.team_id === user.team_id || item.id === user.id;
            return true;
          })
        );
        const projectResult = await ProjectsApi.list('ALL');
        setProjects(projectResult.projects);
      }
    })();
  }, []);

  const visibleAssignments = useMemo(
    () => assignments.filter((item) => matchesFilter(item, filter)),
    [assignments, filter]
  );

  const refreshWork = async () => {
    const result = await LeadApi.myWork();
    setGroups(result.groups);
    setItems(result.items);
    await loadAssignments();
  };

  const updateTask = async (
    assignment: WorkAssignment,
    body: { status?: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED'; blocked_reason?: string; review_action?: 'approve' | 'return' | 'resubmit'; review_comments?: string }
  ) => {
    const taskId = assignment.task_id || (assignment.source === 'TASK' ? assignment.id : '');
    if (!taskId) return;
    setTaskBusy(taskId);
    await TasksApi.update(taskId, body);
    await refreshWork();
    setTaskBusy(null);
  };

  if (!currentUser) return null;

  const actionable = items.filter((item) => item.category !== 'CREATE');
  const isCommercial = ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES'].includes(currentUser.role_code);
  const canCreateLeads = canCreateLead(currentUser);
  const canCreate = canCreateWorkTask(currentUser);

  const createTask = async () => {
    setCreateError(null);
    if (!form.title.trim()) {
      setCreateError('Task title is required.');
      return;
    }
    if (form.task_type === 'PROJECT_TASK' && !form.project_id) {
      setCreateError('Select a project.');
      return;
    }
    if (!form.assigned_to_id) {
      setCreateError('Select a team member.');
      return;
    }
    if (!form.due_date) {
      setCreateError('Due date is required.');
      return;
    }
    const result = await TasksApi.create({
      title: form.title,
      description: form.description,
      task_type: form.task_type,
      project_id: form.task_type === 'PROJECT_TASK' ? form.project_id : undefined,
      assigned_to_id: form.assigned_to_id || currentUser.id,
      start_date: form.start_date || undefined,
      due_date: form.due_date || undefined,
      priority: form.priority,
    });
    if (!result.ok) {
      setCreateError(result.message);
      return;
    }
    setShowCreate(false);
    setForm({ title: '', description: '', task_type: 'PROJECT_TASK', project_id: '', assigned_to_id: '', start_date: '', due_date: '', priority: 'Medium' });
    await refreshWork();
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <CheckSquare className="h-4 w-4" /> My Work
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">My Assigned Work</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Tasks for <span className="font-semibold text-cyan-300">{currentUser.name}</span> based on role, workflow state, and assignment.
        </p>
      </div>

      {(assignments.length > 0 || canCreate) && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="font-bold text-slate-100">Assigned execution work</h2>
            <div className="flex flex-wrap items-center gap-2">
              {canCreate && (
                <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white">
                  <Plus className="h-3 w-3" /> Create Task
                </button>
              )}
              <Link href="/daily-updates" className="text-cyan-400 hover:underline">Daily Work Updates</Link>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              ['ALL', 'All'],
              ['PROJECT', 'Project Tasks'],
              ['NON_PROJECT', 'Non-Project Tasks'],
              ['OVERDUE', 'Overdue'],
              ['TODAY', 'Today'],
              ['UPCOMING', 'Upcoming'],
              ['COMPLETED', 'Completed'],
            ] as Array<[WorkFilter, string]>).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  filter === key ? 'border-cyan-600 bg-cyan-600 text-white' : 'border-slate-700 text-slate-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="p-2">Task</th>
                  <th className="p-2">Project</th>
                  <th className="p-2">Due Date</th>
                  <th className="p-2">Priority</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Last update</th>
                  <th className="p-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {visibleAssignments.map((item) => {
                  const today = new Date().toISOString().slice(0, 10);
                  const overdue = Boolean(item.due_date && item.due_date < today && item.current_status !== 'DONE' && item.current_status !== 'COMPLETED');
                  const taskId = item.task_id || (item.source === 'TASK' ? item.id : '');
                  const busy = taskBusy === taskId;
                  const isAssignee = item.assigned_to_id === currentUser.id;
                  const isReviewer = currentUser.role_code === 'TEAM_LEAD' && item.review_status === 'PENDING_TL_REVIEW';
                  return (
                  <tr
                    key={item.id}
                    className={
                      focusTaskId && (item.task_id === focusTaskId || item.id === focusTaskId)
                        ? 'bg-cyan-950/40'
                        : overdue
                          ? 'bg-rose-950/20'
                          : undefined
                    }
                  >
                    <td className="p-2 font-semibold text-slate-100">{item.task_title}</td>
                    <td className="p-2">
                      {item.lead_number && <span className="mr-1 font-mono text-cyan-400">{item.lead_number}</span>}
                      {assignmentType(item) === 'NON_PROJECT_TASK' ? 'No Project' : item.project_name}
                    </td>
                    <td className={`p-2 ${overdue ? 'font-semibold text-rose-300' : ''}`}>
                      {overdue && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                      {formatLongDate(item.due_date)}
                    </td>
                    <td className="p-2">{item.priority}</td>
                    <td className="p-2">
                      {WORK_STATUS_LABELS[item.current_status] || TASK_STATUS_LABELS[item.current_status] || item.current_status}
                      {item.blocked && item.blocker && (
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-rose-300">
                          <AlertTriangle className="h-3 w-3" /> {item.blocker}
                        </div>
                      )}
                    </td>
                    <td className="p-2">{formatLongDate(item.last_update_at)}</td>
                    <td className="p-2 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        {taskId && isAssignee && item.current_status === 'TODO' && (
                          <button
                            disabled={busy}
                            onClick={() => void updateTask(item, { status: 'IN_PROGRESS' })}
                            className="rounded-lg border border-slate-700 px-2.5 py-1 font-bold text-slate-100 hover:border-cyan-700 disabled:opacity-60"
                          >
                            Work in Progress
                          </button>
                        )}
                        {taskId && isAssignee && item.review_status !== 'PENDING_TL_REVIEW' && item.current_status !== 'DONE' && item.current_status !== 'COMPLETED' && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const reason = window.prompt('Describe the issue or doubt') || '';
                                if (!reason.trim()) return;
                                void updateTask(item, { status: 'BLOCKED', blocked_reason: reason.trim() });
                              }}
                              className="rounded-lg border border-amber-800 px-2.5 py-1 font-bold text-amber-100 hover:bg-amber-950 disabled:opacity-60"
                            >
                              Issue / Doubt
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => void updateTask(item, { status: 'DONE', review_action: item.review_status === 'CORRECTION_REQUIRED' ? 'resubmit' : undefined })}
                              className="rounded-lg bg-emerald-700 px-2.5 py-1 font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                            >
                              {item.review_status === 'CORRECTION_REQUIRED' ? 'Resubmit' : 'Completed'}
                            </button>
                          </>
                        )}
                        {taskId && isReviewer && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => void updateTask(item, { review_action: 'approve' })}
                              className="rounded-lg bg-emerald-700 px-2.5 py-1 font-bold text-white hover:bg-emerald-600 disabled:opacity-60"
                            >
                              Approve
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                const comments = window.prompt('Comments for send-back (required)') || '';
                                if (!comments.trim()) return;
                                void updateTask(item, { review_action: 'return', review_comments: comments.trim() });
                              }}
                              className="rounded-lg border border-rose-800 px-2.5 py-1 font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-60"
                            >
                              Send Back
                            </button>
                          </>
                        )}
                        {currentUser && canSubmitDailyUpdate(currentUser) && (
                          <Link
                            href={`/daily-updates/new?assignment=${encodeURIComponent(item.id)}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-500"
                          >
                            <Plus className="h-3 w-3" /> Add Daily Update
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {visibleAssignments.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-500">No tasks in this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs">
            <h3 className="text-sm font-bold text-slate-100">Create task</h3>
            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 font-medium text-slate-400">Task Type</div>
                <label className="mr-4 text-slate-200">
                  <input type="radio" className="mr-1" checked={form.task_type === 'PROJECT_TASK'} onChange={() => setForm({ ...form, task_type: 'PROJECT_TASK' })} />
                  Project Task
                </label>
                <label className="text-slate-200">
                  <input type="radio" className="mr-1" checked={form.task_type === 'NON_PROJECT_TASK'} onChange={() => setForm({ ...form, task_type: 'NON_PROJECT_TASK', project_id: '' })} />
                  Non-Project Task
                </label>
              </div>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
              {form.task_type === 'PROJECT_TASK' && (
                <select value={form.project_id} onChange={(e) => setForm({ ...form, project_id: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
                  <option value="">Project *</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              )}
              <select value={form.assigned_to_id} onChange={(e) => setForm({ ...form, assigned_to_id: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
                <option value="">Assigned To</option>
                {users.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
                <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
              </div>
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
                {['Low', 'Medium', 'High', 'Critical'].map((item) => <option key={item}>{item}</option>)}
              </select>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" rows={3} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
              {createError && <div className="rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{createError}</div>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded border border-slate-700 px-3 py-1.5">Cancel</button>
              <button onClick={() => void createTask()} className="rounded bg-cyan-600 px-3 py-1.5 font-bold text-white">Create</button>
            </div>
          </div>
        </div>
      )}

      {isCommercial && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ...(canCreateLeads ? [{ label: 'Create New Lead', value: 'Open form', href: '/pre-sales/leads/create' }] : [{ label: 'Lead pipeline', value: 'View', href: '/pre-sales/leads' }]),
            { label: 'Ready for quotation', value: String((groups.QUOTATION || []).length), href: '/pre-sales/leads' },
            { label: 'Active negotiations', value: String((groups.NEGOTIATION || []).length), href: '/pre-sales/leads' },
            { label: 'Returned by PM', value: String((groups.RETURNED || []).length), href: '/pre-sales/leads' },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800">
              <div className="text-slate-400">{card.label}</div>
              <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
            </Link>
          ))}
        </div>
      )}

      {ORDER.filter((key) => (groups[key] || []).length > 0).map((key) => {
        const meta = GROUP_META[key];
        const list = groups[key] || [];
        return (
          <div key={key} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 font-bold text-slate-100">
              <span className="text-cyan-400">{meta?.icon}</span>
              {meta?.title || key}
              <span className="ml-auto rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{list.length}</span>
            </div>
            {list.map((item) => (
              <Link
                key={`${item.category}-${item.lead_id}`}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-cyan-800"
              >
                <div>
                  <div className="font-bold text-slate-100">
                    {item.category === 'CREATE' ? item.title : (
                      <>
                        <span className="mr-2 font-mono text-cyan-400">{item.lead_number}</span>
                        {item.title}
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 text-slate-400">{item.summary}</div>
                  {item.category !== 'CREATE' && (
                    <div className="mt-1 text-[11px] text-slate-500">{item.customer_name} · {LEAD_STATUS_LABELS[item.status] || item.status}</div>
                  )}
                </div>
                <span className="flex items-center gap-1 text-cyan-400">
                  Open <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        );
      })}

      {actionable.length === 0 && assignments.length === 0 && !isCommercial && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/90 p-12 text-center text-slate-500">
          <Inbox className="mx-auto h-8 w-8 text-slate-600" />
          <p>No work assigned to you yet. New project and team allocations appear here automatically.</p>
        </div>
      )}

      {actionable.length === 0 && isCommercial && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center">
          <p className="text-slate-300">No returned items or commercial follow-ups right now.</p>
          {canCreateLeads ? (
            <Link href="/pre-sales/leads/create" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500">
              <Plus className="h-4 w-4" /> Create New Lead
            </Link>
          ) : (
            <Link href="/pre-sales/leads" className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 font-bold text-slate-100 hover:border-cyan-700">
              View lead pipeline
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
