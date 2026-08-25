'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  FileText,
  Inbox,
  Plus,
  Search,
} from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { canSubmitDailyUpdate } from '@/lib/rbac';
import { formatLongDate, PIPELINE_STAGE_LABELS, WORK_STATUS_LABELS } from '@/lib/format';
import {
  DailyUpdate,
  DailyUpdateSummary,
  DailyWorkStatus,
  User,
  WorkAssignment,
} from '@/lib/types';

function statusClass(status: string) {
  if (status === 'BLOCKED') return 'border-rose-800 bg-rose-950 text-rose-300';
  if (status === 'COMPLETED' || status === 'DONE') return 'border-emerald-800 bg-emerald-950 text-emerald-300';
  if (status === 'IN_PROGRESS') return 'border-cyan-800 bg-cyan-950 text-cyan-300';
  if (status === 'DRAFT') return 'border-slate-700 bg-slate-800 text-slate-300';
  return 'border-slate-700 bg-slate-800 text-slate-300';
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${statusClass(status)}`}>
      {WORK_STATUS_LABELS[status] || status.replace(/_/g, ' ')}
    </span>
  );
}

export default function DailyWorkUpdatesPage() {
  return (
    <Suspense fallback={<div className="text-xs text-slate-400">Loading daily work updates…</div>}>
      <DailyWorkUpdatesInner />
    </Suspense>
  );
}

function DailyWorkUpdatesInner() {
  const searchParams = useSearchParams();
  const [user, setUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [summary, setSummary] = useState<DailyUpdateSummary | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [project, setProject] = useState(searchParams.get('project') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const role = user?.role_code || '';
  const canSubmit = canSubmitDailyUpdate(user);
  const isCeo = role === 'CEO' || role === 'CTO';
  const isBh = role === 'BUSINESS_HEAD' || role === 'ENG_DIRECTOR';
  const isPm = role === 'PROJECT_MANAGER' || role === 'SYSTEM_ADMIN';
  const isTl = role === 'TEAM_LEAD';

  const load = async (current: User, filters?: { q?: string; status?: string; project?: string; from?: string; to?: string }) => {
    const params: Record<string, string> = {};
    if (filters?.q) params.q = filters.q;
    if (filters?.status) params.status = filters.status;
    if (filters?.project) params.project = filters.project;
    if (filters?.from) params.from = filters.from;
    if (filters?.to) params.to = filters.to;
    if (canSubmitDailyUpdate(current) && current.role_code !== 'TEAM_LEAD' && current.role_code !== 'SYSTEM_ADMIN') {
      params.mine = '1';
    }
    const [list, nextSummary, ownAssignments] = await Promise.all([
      DailyUpdatesApi.list(params),
      DailyUpdatesApi.summary(),
      DailyUpdatesApi.assignments(true),
    ]);
    setUpdates(list.updates);
    setAssignments(
      canSubmitDailyUpdate(current) && current.role_code !== 'SYSTEM_ADMIN' && current.role_code !== 'TEAM_LEAD'
        ? ownAssignments
        : list.assignments
    );
    if (canSubmitDailyUpdate(current) && (current.role_code === 'TEAM_LEAD' || current.role_code === 'SYSTEM_ADMIN')) {
      setAssignments(list.assignments);
    }
    setSummary(nextSummary);
  };

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (!current) return;
    setUser(current);
    void load(current, {
      q: '',
      status: searchParams.get('status') || '',
      project: searchParams.get('project') || '',
    }).catch((err) => setError(String(err)));
  }, [searchParams]);

  const applyFilters = () => {
    if (!user) return;
    void load(user, { q, status, project, from, to });
  };

  const projects = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of [...assignments, ...updates.map((update) => ({
      project_id: update.project_id,
      project_name: update.project_name,
    }))]) {
      if (item.project_id) map.set(item.project_id, item.project_name || item.project_id);
    }
    return [...map.entries()];
  }, [assignments, updates]);

  if (!user) return null;

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/30 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <FileText className="h-4 w-4" /> Daily Work Updates
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">
          {isCeo ? 'Executive work visibility' : isBh ? 'Management visibility' : isPm ? 'Project team updates' : isTl ? 'Team progress' : 'My daily work'}
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          {isCeo
            ? 'Read-only view of progress, stalled work, blockers, and team activity. Employee operational editing is not available here.'
            : isBh
              ? 'Read-only progress, delays, blockers, and support needs across your opportunities and projects.'
              : isPm
                ? 'Daily updates from employees on your projects. Submitted updates cannot be edited.'
                : 'Record progress against work assigned to you. Submitted updates stay linked to the same task and project.'}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</div>
      )}

      {summary && (isCeo || isBh || isPm || isTl) && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: isCeo ? 'Projects with recent progress' : 'Updates Today', value: isCeo ? (summary.projectsWithRecentProgress ?? summary.submittedToday) : summary.submittedToday, href: '?status=' },
            { label: isCeo ? 'No recent update' : 'Pending', value: isCeo ? (summary.projectsWithNoRecentUpdate ?? summary.staleAssignments) : summary.pendingToday, href: '?status=pending' },
            { label: 'Blocked', value: isCeo ? (summary.blockedTasks ?? summary.blocked) : summary.blocked, href: '?status=BLOCKED' },
            { label: isCeo ? 'Team activity' : 'Completed', value: isCeo ? (summary.teamActivity ?? summary.submittedToday) : summary.completed, href: isCeo ? '' : '?status=COMPLETED' },
            { label: 'Projects requiring attention', value: summary.projectsNeedingAttention, href: '?status=BLOCKED' },
          ].map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => {
                if (card.href.includes('BLOCKED')) setStatus('BLOCKED');
                if (card.href.includes('COMPLETED')) setStatus('COMPLETED');
                if (user) void load(user, { q, status: card.href.includes('BLOCKED') ? 'BLOCKED' : card.href.includes('COMPLETED') ? 'COMPLETED' : status, project, from, to });
              }}
              className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 text-left hover:border-cyan-800"
            >
              <div className="text-slate-400">{card.label}</div>
              <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
            </button>
          ))}
        </div>
      )}

      {isCeo && summary && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
            <h2 className="mb-3 text-sm font-bold text-slate-100">Major blockers</h2>
            {(summary.blockedUpdates.length ? summary.blockedUpdates : []).slice(0, 6).map((item) => (
              <Link key={item.id} href={`/daily-updates/${item.id}`} className="mb-2 block rounded-lg border border-rose-900/50 bg-rose-950/20 p-3 last:mb-0 hover:border-rose-700">
                <div className="font-semibold text-rose-300">BLOCKED — {item.blocker || item.task_title}</div>
                <div className="mt-0.5 text-slate-400">{item.customer_name} – {item.project_name}</div>
              </Link>
            ))}
            {summary.blockedUpdates.length === 0 && <p className="text-slate-500">No blocked work right now.</p>}
          </section>
          <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
            <h2 className="mb-3 text-sm font-bold text-slate-100">Projects with no recent update</h2>
            {summary.staleItems.slice(0, 6).map((item) => (
              <div key={item.id} className="mb-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-3 last:mb-0">
                <div className="font-semibold text-amber-200">{item.customer_name} – {item.project_name}</div>
                <div className="mt-0.5 text-slate-400">No recent update · {item.task_title}</div>
              </div>
            ))}
            {summary.staleItems.length === 0 && <p className="text-slate-500">All visible work has recent updates.</p>}
          </section>
        </div>
      )}

      {canSubmit && (
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-sm font-bold text-slate-100">My Assigned Work</h2>
            <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">
              {assignments.filter((item) => item.assigned_to_id === user.id).length}
            </span>
          </div>
          <AssignmentTable
            items={assignments.filter((item) => item.assigned_to_id === user.id)}
            showEmployee={false}
            allowUpdate
          />
        </section>
      )}

      {(isPm || isTl) && (
        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h2 className="text-sm font-bold text-slate-100">{isTl ? 'Team member updates' : 'Employee updates on managed projects'}</h2>
          </div>
          <ManagerTable updates={updates.filter((item) => item.submission_status === 'SUBMITTED')} />
        </section>
      )}

      {isBh && summary && (
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
            <h2 className="mb-3 text-sm font-bold text-slate-100">Blockers & support needed</h2>
            {summary.blockedUpdates.map((item) => (
              <Link key={item.id} href={`/daily-updates/${item.id}`} className="mb-2 block rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-cyan-800">
                <div className="font-semibold text-rose-300">BLOCKED — {item.blocker}</div>
                <div className="text-slate-400">{item.project_name} · {item.task_title}</div>
                {item.support_required && <div className="mt-1 text-slate-300">Support: {item.support_required}</div>}
              </Link>
            ))}
            {summary.blockedUpdates.length === 0 && <p className="text-slate-500">No blockers on your projects.</p>}
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
            <h2 className="mb-3 text-sm font-bold text-slate-100">Pending / no recent update</h2>
            {summary.pendingItems.slice(0, 8).map((item) => (
              <div key={item.id} className="mb-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                <div className="font-semibold text-slate-100">{item.project_name}</div>
                <div className="text-slate-400">{item.task_title} · {item.assigned_to}</div>
              </div>
            ))}
            {summary.pendingItems.length === 0 && <p className="text-slate-500">All assigned work has an update today.</p>}
          </div>
        </section>
      )}

      {!isCeo && (
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
          <h2 className="mr-auto text-sm font-bold text-slate-100">{canSubmit ? 'Update history' : 'Daily update history'}</h2>
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search project, task, work..."
              className="w-48 rounded-md border border-slate-800 bg-slate-950 py-1.5 pl-7 pr-3 text-slate-200 placeholder-slate-500"
            />
          </div>
          <select value={project} onChange={(e) => setProject(e.target.value)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200">
            <option value="">All projects</option>
            {projects.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200">
            <option value="">All statuses</option>
            {(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'] as DailyWorkStatus[]).map((item) => (
              <option key={item} value={item}>{WORK_STATUS_LABELS[item]}</option>
            ))}
            <option value="DRAFT">Draft</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200" />
          <button type="button" onClick={applyFilters} className="rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500">
            Apply
          </button>
        </div>

        {updates.length === 0 ? (
          <div className="space-y-2 p-10 text-center text-slate-500">
            <Inbox className="mx-auto h-8 w-8 text-slate-600" />
            <p>No daily updates match these filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {updates.map((item) => (
              <HistoryCard key={item.id} update={item} />
            ))}
          </div>
        )}
      </section>
      )}
    </div>
  );
}

function AssignmentTable({
  items,
  showEmployee,
  allowUpdate,
}: {
  items: WorkAssignment[];
  showEmployee?: boolean;
  allowUpdate?: boolean;
}) {
  if (!items.length) {
    return (
      <div className="p-8 text-center text-slate-500">
        <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-600" />
        No assigned work yet. New projects and allocations appear here automatically.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            {showEmployee && <th className="p-2">Employee</th>}
            <th className="p-2">Project / Lead</th>
            <th className="p-2">Customer</th>
            <th className="p-2">Task / Assignment</th>
            <th className="p-2">Stage</th>
            <th className="p-2">Due</th>
            <th className="p-2">Priority</th>
            <th className="p-2">Status</th>
            <th className="p-2">Last update</th>
            {allowUpdate && <th className="p-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-300">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-800/30">
              {showEmployee && <td className="p-2 font-semibold text-slate-100">{item.assigned_to}</td>}
              <td className="p-2 font-semibold text-slate-100">
                {item.lead_number ? <span className="mr-1 font-mono text-cyan-400">{item.lead_number}</span> : null}
                {item.project_name}
              </td>
              <td className="p-2">{item.customer_name}</td>
              <td className="p-2">{item.task_title}</td>
              <td className="p-2">{PIPELINE_STAGE_LABELS[item.workflow_stage] || item.workflow_stage}</td>
              <td className="p-2">{formatLongDate(item.due_date)}</td>
              <td className="p-2">{item.priority}</td>
              <td className="p-2">
                <StatusPill status={item.current_status} />
                {item.blocked && item.blocker ? (
                  <div className="mt-1 flex items-center gap-1 text-[10px] text-rose-300">
                    <AlertTriangle className="h-3 w-3" /> {item.blocker}
                  </div>
                ) : null}
              </td>
              <td className="p-2">{formatLongDate(item.last_update_at)}</td>
              {allowUpdate && (
                <td className="p-2 text-right">
                  <Link
                    href={`/daily-updates/new?assignment=${encodeURIComponent(item.id)}`}
                    className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 font-bold text-white hover:bg-cyan-500"
                  >
                    <Plus className="h-3 w-3" /> Add Daily Update
                  </Link>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManagerTable({ updates }: { updates: DailyUpdate[] }) {
  if (!updates.length) {
    return <p className="p-6 text-center text-slate-500">No submitted updates yet for your scope.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead className="border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="p-2">Employee</th>
            <th className="p-2">Project</th>
            <th className="p-2">Task</th>
            <th className="p-2 text-right">Progress</th>
            <th className="p-2">Status</th>
            <th className="p-2">Blocker</th>
            <th className="p-2">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 text-slate-300">
          {updates.map((item) => (
            <tr key={item.id} className="hover:bg-slate-800/30">
              <td className="p-2 font-semibold text-slate-100">{item.user_name}</td>
              <td className="p-2">{item.project_name}</td>
              <td className="p-2">{item.task_title}</td>
              <td className="p-2 text-right">{item.progress_percent}%</td>
              <td className="p-2"><StatusPill status={item.work_status} /></td>
              <td className="p-2 text-rose-300">{item.blocker || '—'}</td>
              <td className="p-2">
                <Link href={`/daily-updates/${item.id}`} className="inline-flex items-center gap-1 text-cyan-400 hover:underline">
                  {formatLongDate(item.work_date)} <ArrowRight className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoryCard({ update }: { update: DailyUpdate }) {
  return (
    <Link href={`/daily-updates/${update.id}`} className="block rounded-lg border border-slate-800 bg-slate-950/60 p-4 hover:border-cyan-800">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-100">{formatLongDate(update.work_date)}</div>
          <div className="mt-1 text-slate-200">Project: {update.project_name}</div>
          <div className="text-slate-400">Task: {update.task_title}</div>
        </div>
        <div className="flex items-center gap-2">
          {update.submission_status === 'DRAFT' && <StatusPill status="DRAFT" />}
          <StatusPill status={update.work_status} />
        </div>
      </div>
      <div className="mt-2 grid gap-1 text-slate-400 sm:grid-cols-2">
        <div>Progress: <span className="text-slate-200">{update.progress_percent}%</span></div>
        <div>Status: <span className="text-slate-200">{WORK_STATUS_LABELS[update.work_status]}</span></div>
        <div className="sm:col-span-2">Work Completed: <span className="text-slate-200">{update.work_completed || '—'}</span></div>
        <div className="sm:col-span-2">Next Step: <span className="text-slate-200">{update.next_plan || '—'}</span></div>
      </div>
    </Link>
  );
}
