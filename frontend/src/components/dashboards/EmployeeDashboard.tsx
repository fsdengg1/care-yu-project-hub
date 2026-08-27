'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { User, WorkAssignment, DailyUpdateSummary } from '@/lib/types';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { formatLongDate, WORK_STATUS_LABELS } from '@/lib/format';
import { CheckSquare, Inbox, Plus } from 'lucide-react';
import PendingActionsCard from '@/components/work/PendingActionsCard';
import LeadPipelinePanel from '@/components/dashboards/LeadPipelinePanel';

export default function EmployeeDashboard({ user }: { user: User }) {
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [summary, setSummary] = useState<DailyUpdateSummary | null>(null);

  useEffect(() => {
    void (async () => {
      setAssignments(await DailyUpdatesApi.assignments(true));
      setSummary(await DailyUpdatesApi.summary());
    })();
  }, []);

  const nextDue = [...assignments]
    .filter((item) => item.due_date && item.current_status !== 'COMPLETED')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];
  const submittedToday = (summary?.submittedToday ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <CheckSquare className="h-4 w-4" /> Team Member Dashboard
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Hello, {user.name}</h1>
          <p className="mt-1 text-xs text-slate-400">
            Work assigned to you from live projects and allocations. Log daily progress and report blockers.
          </p>
        </div>
        <Link href="/daily-updates" className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500">
          Daily Work Updates
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Assigned Active Tasks</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{assignments.filter((item) => item.current_status !== 'COMPLETED').length}</div>
          <div className="mt-1 text-[11px] text-slate-500">From your project and team assignments</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Next Deadline</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{nextDue ? formatLongDate(nextDue.due_date) : 'None'}</div>
          <div className="mt-1 text-[11px] text-slate-500">{nextDue?.task_title || 'No scheduled task deadlines'}</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Today&apos;s Daily Log</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{submittedToday ? 'Submitted' : 'Pending'}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {summary?.blocked ? `${summary.blocked} blocked` : 'No blocked items in your last updates'}
          </div>
        </div>
      </div>

      <PendingActionsCard />
      <LeadPipelinePanel />

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-slate-100">My Assigned Work</h2>
          <Link href="/my-work" className="text-xs text-cyan-400 hover:underline">View all</Link>
        </div>
        {assignments.length === 0 ? (
          <div className="space-y-2 p-8 text-center">
            <Inbox className="mx-auto h-6 w-6 text-slate-600" />
            <p className="text-xs font-medium text-slate-300">No assigned tasks found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {assignments.slice(0, 8).map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-semibold text-slate-100">{item.project_name}</div>
                  <div className="text-[11px] text-slate-400">
                    {item.task_title} · {WORK_STATUS_LABELS[item.current_status] || item.current_status} · {item.progress_percent}%
                  </div>
                </div>
                <Link
                  href={`/daily-updates/new?assignment=${encodeURIComponent(item.id)}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-cyan-500"
                >
                  <Plus className="h-3 w-3" /> Add Daily Update
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
