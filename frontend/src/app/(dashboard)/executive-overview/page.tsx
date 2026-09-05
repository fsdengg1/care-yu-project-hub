'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Search, X } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { canAccessExecutiveOverview } from '@/lib/rbac';
import { formatLongDate } from '@/lib/format';
import {
  ExecutiveOverviewApi,
  ExecutiveOverviewPayload,
  ExecutiveOverviewQuery,
  ExecutiveProjectDetail,
  ExecutiveProjectRow,
  ExecutiveSortKey,
  ExecutiveStatusFilter,
} from '@/lib/executiveOverviewApi';

const selectClass =
  'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-600';

function statusTone(status: string) {
  if (status === 'Completed') return 'border-emerald-800 bg-emerald-950 text-emerald-300';
  if (status === 'Blocked' || status === 'At Risk') return 'border-rose-800 bg-rose-950 text-rose-300';
  if (status === 'Delayed') return 'border-amber-800 bg-amber-950 text-amber-300';
  if (status === 'Pending') return 'border-slate-600 bg-slate-800 text-slate-300';
  return 'border-cyan-800 bg-cyan-950 text-cyan-300';
}

function SkeletonCard() {
  return <div className="h-24 animate-pulse rounded-xl border border-slate-800 bg-slate-900" />;
}

function ProgressBar({ value }: { value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-cyan-500" style={{ width: `${width}%` }} />
      </div>
      <span className="w-10 text-right text-xs text-slate-300">{width}%</span>
    </div>
  );
}

function Donut({ items }: { items: Array<{ label: string; count: number }> }) {
  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
  const colors = ['#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#94a3b8', '#818cf8'];
  let cursor = 0;
  const stops = items.map((item, index) => {
    const start = cursor;
    cursor += (item.count / total) * 100;
    return `${colors[index % colors.length]} ${start}% ${cursor}%`;
  });
  return (
    <div className="flex items-center gap-4">
      <div
        className="h-32 w-32 shrink-0 rounded-full"
        style={{
          background: `conic-gradient(${stops.join(', ')})`,
          mask: 'radial-gradient(circle, transparent 52%, black 54%)',
          WebkitMask: 'radial-gradient(circle, transparent 52%, black 54%)',
        }}
      />
      <ul className="space-y-1 text-xs text-slate-300">
        {items.map((item, index) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: colors[index % colors.length] }} />
            {item.label} <span className="text-slate-100">{item.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ExecutiveOverviewPage() {
  const { user, loading: authLoading } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('');
  const [status, setStatus] = useState<ExecutiveStatusFilter>('ALL');
  const [projectManager, setProjectManager] = useState('');
  const [stage, setStage] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ExecutiveSortKey>('last_activity');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [payload, setPayload] = useState<ExecutiveOverviewPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ExecutiveProjectDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [taskFilter, setTaskFilter] = useState<'ALL' | 'DONE' | 'IN_PROGRESS' | 'TODO' | 'BLOCKED'>('ALL');
  const [exporting, setExporting] = useState('');

  const allowed = canAccessExecutiveOverview(user);

  const query = useMemo<ExecutiveOverviewQuery>(
    () => ({
      month,
      year,
      search,
      department: department || undefined,
      status,
      projectManager: projectManager || undefined,
      stage: stage || undefined,
      page,
      limit: 20,
      sort,
      sortDir,
    }),
    [month, year, search, department, status, projectManager, stage, page, sort, sortDir]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (authLoading || !allowed) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      const result = await ExecutiveOverviewApi.load(query);
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) {
        setPayload(null);
        setError(result.status === 403 ? result.message : 'Unable to load Executive Overview. Please try again.');
        return;
      }
      setPayload(result.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, authLoading, query]);

  useEffect(() => {
    if (!detailId || !allowed) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    void (async () => {
      const result = await ExecutiveOverviewApi.detail(detailId, month, year);
      if (cancelled) return;
      setDetailLoading(false);
      setDetail(result.ok ? result.data : null);
      setTaskFilter('ALL');
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, detailId, month, year]);

  function changeSort(next: ExecutiveSortKey) {
    if (sort === next) {
      setSortDir((current) => (current === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(next);
      setSortDir(next === 'name' || next === 'status' ? 'asc' : 'desc');
    }
    setPage(1);
  }

  async function exportReport(format: 'excel' | 'pdf') {
    setExporting(format);
    const result = await ExecutiveOverviewApi.exportReport(query, format);
    setExporting('');
    if (!result.ok) setError(result.message);
  }

  if (authLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
        <h1 className="text-lg font-semibold text-slate-100">Unauthorized</h1>
        <p className="mt-2 text-sm text-slate-400">
          Executive Overview is available only to CEO, Business Head, Engineering Director, CTO, and Project Manager.
        </p>
      </div>
    );
  }

  const months = payload?.availableMonths?.length
    ? payload.availableMonths
    : [{ month, year, label: payload?.month_label || `${year}-${month}` }];
  const summary = payload?.summary;
  const maxTrend = Math.max(1, ...(payload?.activityTrend || []).map((item) => item.projectsWorked));
  const startRow = payload ? (payload.pagination.page - 1) * payload.pagination.limit + 1 : 0;
  const endRow = payload ? Math.min(payload.pagination.page * payload.pagination.limit, payload.pagination.total) : 0;
  const filteredTasks =
    taskFilter === 'ALL'
      ? detail?.taskList || []
      : (detail?.taskList || []).filter((task) => {
          if (taskFilter === 'DONE') return task.status === 'DONE';
          if (taskFilter === 'TODO') return task.status === 'TODO' || task.status === 'WAITING' || task.status === 'HOLD';
          return task.status === taskFilter;
        });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Executive Overview</h1>
          <p className="mt-1 text-sm text-slate-400">Organization-wide Project Performance & Monthly Insights</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectClass}
            value={`${year}-${month}`}
            onChange={(event) => {
              const [nextYear, nextMonth] = event.target.value.split('-').map(Number);
              setYear(nextYear);
              setMonth(nextMonth);
              setPage(1);
            }}
            aria-label="Month"
          >
            {months.map((item) => (
              <option key={`${item.year}-${item.month}`} value={`${item.year}-${item.month}`}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => exportReport('excel')}
            disabled={Boolean(exporting)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-cyan-700"
          >
            <Download className="h-4 w-4" />
            {exporting === 'excel' ? 'Exporting…' : 'Export Excel'}
          </button>
          <button
            type="button"
            onClick={() => exportReport('pdf')}
            disabled={Boolean(exporting)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-cyan-700"
          >
            <Download className="h-4 w-4" />
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {loading || !payload ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <SkeletonCard key={index} />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ['Total Projects', summary?.totalProjects],
            ['Active Projects', summary?.activeProjects],
            ['Completed', summary?.completedProjects],
            ['Delayed / At Risk', summary?.delayedProjects],
            ['Pending', summary?.pendingProjects],
            ['Team Members', summary?.teamMembers],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-100">{value ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-100">Department Performance</h2>
          {loading ? (
            <div className="mt-4 h-40 animate-pulse rounded-lg bg-slate-800" />
          ) : payload?.departments.length ? (
            <ul className="mt-3 space-y-2">
              {payload.departments.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setDepartment(item.name);
                      setPage(1);
                    }}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-800 px-3 py-2 text-left text-sm text-slate-200 hover:border-cyan-700"
                  >
                    <span>{item.name}</span>
                    <span className="text-slate-400">{item.projects} Projects</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-400">No department activity for this month.</p>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-100">Project Status</h2>
          {loading ? (
            <div className="mt-4 h-40 animate-pulse rounded-lg bg-slate-800" />
          ) : (
            <div className="mt-4">
              <Donut items={payload?.statusDistribution || []} />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-100">Monthly Project Activity</h2>
          {loading ? (
            <div className="mt-4 h-40 animate-pulse rounded-lg bg-slate-800" />
          ) : (
            <div className="mt-4 space-y-2">
              {(payload?.activityTrend || []).map((item) => (
                <div key={`${item.year}-${item.month}`} className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="w-8">{item.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded bg-slate-800">
                    <div
                      className="h-full rounded bg-cyan-500"
                      style={{ width: `${(item.projectsWorked / maxTrend) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 text-right">{item.projectsWorked}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Projects Requiring Attention
        </h2>
        {loading ? (
          <div className="mt-4 h-24 animate-pulse rounded-lg bg-slate-800" />
        ) : payload?.attentionRequired.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {payload.attentionRequired.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setDetailId(item.id)}
                className="rounded-lg border border-slate-800 p-3 text-left hover:border-amber-700"
              >
                <p className="text-sm font-medium text-slate-100">{item.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {item.code} · Deadline {formatLongDate(item.deadline)} · Progress {item.progress}%
                </p>
                <p className="mt-2 text-xs text-amber-300">
                  {item.status}
                  {item.pending_tasks ? ` · Pending ${item.pending_tasks}` : ''}
                  {item.blocked_tasks ? ` · Blocked ${item.blocked_tasks}` : ''}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-400">No delayed, at-risk, or blocked projects in this month.</p>
        )}
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Monthly Project Overview</h2>
          <button
            type="button"
            className="text-xs text-cyan-400 lg:hidden"
            onClick={() => setFiltersOpen((open) => !open)}
          >
            {filtersOpen ? 'Hide filters' : 'Show filters'}
          </button>
        </div>
        <div className={`mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5 ${filtersOpen ? '' : 'hidden lg:grid'}`}>
          <label className="relative xl:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search projects..."
              className={`${selectClass} w-full pl-9`}
            />
          </label>
          <select
            className={selectClass}
            value={department}
            onChange={(event) => {
              setDepartment(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All Departments</option>
            {(payload?.departments || []).map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ExecutiveStatusFilter);
              setPage(1);
            }}
          >
            <option value="ALL">All Status</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
            <option value="PENDING">Pending</option>
            <option value="DELAYED">Delayed</option>
            <option value="AT_RISK">At Risk</option>
            <option value="BLOCKED">Blocked</option>
          </select>
          <select
            className={selectClass}
            value={projectManager}
            onChange={(event) => {
              setProjectManager(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All Project Managers</option>
            {(payload?.projectManagers || []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={stage}
            onChange={(event) => {
              setStage(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All Stages</option>
            {(payload?.stages || []).map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 overflow-x-auto">
          {loading ? (
            <div className="h-48 animate-pulse rounded-lg bg-slate-800" />
          ) : !payload || !payload.projects.length ? (
            <div className="rounded-lg border border-slate-800 px-4 py-10 text-center">
              <p className="font-medium text-slate-100">No project activity found</p>
              <p className="mt-1 text-sm text-slate-400">
                {!payload || payload.summary.totalProjects === 0
                  ? `There were no projects with recorded activity for ${payload?.month_label || 'the selected month'}.`
                  : 'No projects match the current search and filters for this month.'}
              </p>
            </div>
          ) : (
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  {[
                    ['name', 'Project'],
                    ['', 'Department'],
                    ['', 'Project Manager'],
                    ['', 'Team'],
                    ['start_date', 'Start Date'],
                    ['deadline', 'Deadline'],
                    ['progress', 'Progress'],
                    ['', 'Stage'],
                    ['completed_tasks', 'Tasks'],
                    ['status', 'Status'],
                    ['last_activity', 'Last Activity'],
                    ['', 'Actions'],
                  ].map(([key, label]) => (
                    <th key={label} className="border-b border-slate-800 px-2 py-2 font-medium">
                      {key ? (
                        <button type="button" className="hover:text-cyan-300" onClick={() => changeSort(key as ExecutiveSortKey)}>
                          {label}
                          {sort === key ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''}
                        </button>
                      ) : (
                        label
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payload.projects.map((row) => (
                  <ProjectRow key={row.id} row={row} onView={() => setDetailId(row.id)} />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {payload && payload.pagination.total > 0 ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
            <span>
              Showing {startRow}–{endRow} of {payload.pagination.total} projects
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={payload.pagination.page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <span>
                {payload.pagination.page} / {payload.pagination.pages}
              </span>
              <button
                type="button"
                disabled={payload.pagination.page >= payload.pagination.pages}
                onClick={() => setPage((current) => current + 1)}
                className="rounded border border-slate-700 px-2 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {detailId ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70">
          <aside className="h-full w-full max-w-2xl overflow-y-auto border-l border-slate-800 bg-slate-900 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Project Details</h2>
                <p className="text-xs text-slate-400">Read-only executive view</p>
              </div>
              <button type="button" onClick={() => setDetailId(null)} className="rounded-lg border border-slate-700 p-1 text-slate-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            {detailLoading || !detail ? (
              <div className="mt-6 space-y-3">
                <div className="h-24 animate-pulse rounded-lg bg-slate-800" />
                <div className="h-40 animate-pulse rounded-lg bg-slate-800" />
              </div>
            ) : (
              <div className="mt-5 space-y-6 text-sm">
                <section className="grid gap-2 sm:grid-cols-2">
                  <Info label="Project Name" value={detail.project.name} />
                  <Info label="Project ID" value={detail.project.code} />
                  <Info label="Customer" value={detail.customer_name} />
                  <Info label="Project Manager" value={detail.project.pm_name} />
                  <Info label="Department" value={detail.project.department} />
                  <Info label="Start Date" value={formatLongDate(detail.project.start_date)} />
                  <Info label="Deadline" value={formatLongDate(detail.project.deadline)} />
                  <Info label="Current Stage" value={detail.project.current_stage} />
                  <Info label="Overall Status" value={detail.project.status} />
                  <Info label="Team Lead" value={detail.team_lead_name || '—'} />
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-slate-100">Project Progress</h3>
                  <ProgressBar value={detail.progress} />
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-slate-100">Project Lifecycle</h3>
                  <ol className="space-y-1 text-xs">
                    {detail.lifecycle.map((step) => (
                      <li key={step.step} className="flex items-center gap-2 text-slate-300">
                        <span>
                          {step.state === 'completed' ? '✓' : step.state === 'current' ? '→' : '○'}
                        </span>
                        <span className={step.state === 'current' ? 'font-semibold text-cyan-300' : ''}>{step.stage}</span>
                      </li>
                    ))}
                  </ol>
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-slate-100">Task Summary</h3>
                  <div className="flex flex-wrap gap-2">
                    {[
                      ['ALL', `Total ${detail.tasks.total}`],
                      ['DONE', `Completed ${detail.tasks.completed}`],
                      ['IN_PROGRESS', `In Progress ${detail.tasks.in_progress}`],
                      ['TODO', `Pending ${detail.tasks.pending}`],
                      ['BLOCKED', `Blocked ${detail.tasks.blocked}`],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setTaskFilter(key as typeof taskFilter)}
                        className={`rounded-full border px-3 py-1 text-xs ${
                          taskFilter === key ? 'border-cyan-600 text-cyan-300' : 'border-slate-700 text-slate-300'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-slate-100">{detail.monthly.label} Activity</h3>
                  <ul className="space-y-1 text-slate-300">
                    <li>✓ {detail.monthly.completed} Tasks Completed</li>
                    <li>✓ {detail.monthly.started} Tasks Started</li>
                    <li>→ {detail.monthly.in_progress} Tasks In Progress</li>
                    <li>⚠ {detail.monthly.blocked} Tasks Blocked</li>
                  </ul>
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-slate-100">Team Members</h3>
                  {detail.team.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="text-slate-400">
                          <tr>
                            <th className="py-1">Member</th>
                            <th className="py-1">Assigned</th>
                            <th className="py-1">Completed</th>
                            <th className="py-1">Pending</th>
                            {detail.team.some((member) => member.hours > 0) ? <th className="py-1">Hours</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {detail.team.map((member) => (
                            <tr key={member.user_id} className="border-t border-slate-800">
                              <td className="py-1 text-slate-200">{member.name}</td>
                              <td>{member.assigned}</td>
                              <td>{member.completed}</td>
                              <td>{member.pending}</td>
                              {detail.team.some((item) => item.hours > 0) ? <td>{member.hours ? `${member.hours}h` : '—'}</td> : null}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-slate-400">No team members recorded.</p>
                  )}
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-slate-100">Tasks</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-[640px] w-full text-left text-xs">
                      <thead className="text-slate-400">
                        <tr>
                          <th className="py-1">Task</th>
                          <th>Assigned To</th>
                          <th>Department</th>
                          <th>Status</th>
                          <th>Due Date</th>
                          <th>Last Update</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredTasks.map((task) => (
                          <tr key={task.id} className="border-t border-slate-800 text-slate-300">
                            <td className="py-1 text-slate-100">{task.title}</td>
                            <td>{task.assigned_to || '—'}</td>
                            <td>{task.department}</td>
                            <td>{task.status}</td>
                            <td>{formatLongDate(task.due_date)}</td>
                            <td>{formatLongDate(task.last_update)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section>
                  <h3 className="mb-2 font-medium text-slate-100">Activity Timeline</h3>
                  {detail.timeline.length ? (
                    <ol className="space-y-3">
                      {detail.timeline.map((item) => (
                        <li key={item.id} className="border-l border-slate-700 pl-3">
                          <p className="text-xs text-slate-400">{formatLongDate(item.at)}</p>
                          <p className="text-slate-100">{item.title}</p>
                          {item.detail ? <p className="text-xs text-slate-400">{item.detail}</p> : null}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-slate-400">No recorded activity for the selected month.</p>
                  )}
                </section>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-slate-100">{value || '—'}</p>
    </div>
  );
}

function ProjectRow({ row, onView }: { row: ExecutiveProjectRow; onView: () => void }) {
  return (
    <tr className="border-b border-slate-800 text-slate-300">
      <td className="px-2 py-3">
        <p className="font-medium text-slate-100">{row.code}</p>
        <p>{row.name}</p>
        {row.customer_name ? <p className="text-xs text-slate-500">{row.customer_name}</p> : null}
      </td>
      <td className="px-2 py-3">{row.department}</td>
      <td className="px-2 py-3">{row.pm_name || '—'}</td>
      <td className="px-2 py-3 text-xs">{row.team_names.slice(0, 3).join(', ') || '—'}</td>
      <td className="px-2 py-3">{formatLongDate(row.start_date)}</td>
      <td className="px-2 py-3">{formatLongDate(row.deadline)}</td>
      <td className="px-2 py-3 min-w-[120px]">
        <ProgressBar value={row.progress} />
      </td>
      <td className="px-2 py-3">{row.current_stage}</td>
      <td className="px-2 py-3 text-xs">
        C {row.completed_tasks} · P {row.pending_tasks} · B {row.blocked_tasks}
      </td>
      <td className="px-2 py-3">
        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusTone(row.status)}`}>{row.status}</span>
      </td>
      <td className="px-2 py-3">{formatLongDate(row.last_activity)}</td>
      <td className="px-2 py-3">
        <button type="button" onClick={onView} className="text-cyan-400 hover:text-cyan-300">
          View Details
        </button>
      </td>
    </tr>
  );
}
