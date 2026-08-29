'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { User, WorkAssignment, DailyUpdateSummary } from '@/lib/types';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { formatLongDate } from '@/lib/format';
import { CheckSquare, Inbox } from 'lucide-react';
import PendingActionsCard from '@/components/work/PendingActionsCard';
import LeadPipelinePanel from '@/components/dashboards/LeadPipelinePanel';
import LeadWorkflowTimeline from '@/components/dashboards/LeadWorkflowTimeline';
import ProjectGanttPanel from '@/components/planning/ProjectGanttPanel';
import MemberTaskCard from '@/components/work/MemberTaskCard';

export default function EmployeeDashboard({ user }: { user: User }) {
  const [assignments, setAssignments] = useState<WorkAssignment[]>([]);
  const [summary, setSummary] = useState<DailyUpdateSummary | null>(null);

  const load = useCallback(async () => {
    setAssignments(await DailyUpdatesApi.assignments(true));
    setSummary(await DailyUpdatesApi.summary());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nextDue = [...assignments]
    .filter((item) => item.due_date && item.current_status !== 'COMPLETED' && item.review_status !== 'PENDING_TL_REVIEW')
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];
  const submittedToday = (summary?.submittedToday ?? 0) > 0;
  const ganttProjectId = assignments.find((item) => item.project_id)?.project_id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <CheckSquare className="h-4 w-4" /> Team Member Dashboard
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Hello, {user.name}</h1>
          <p className="mt-1 text-xs text-slate-400">
            Only work assigned to you from live projects. Start tasks, update progress, submit daily updates, and raise issues here.
          </p>
        </div>
        <Link href="/daily-updates" className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500">
          Daily Work Updates
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Assigned Active Tasks</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">
            {assignments.filter((item) => item.current_status !== 'COMPLETED' && item.review_status !== 'PENDING_TL_REVIEW').length}
          </div>
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
          <div className="space-y-4">
            {assignments.map((item) => (
              <MemberTaskCard key={item.id} assignment={item} onChanged={load} />
            ))}
          </div>
        )}
      </div>

      <ProjectGanttPanel user={user} projectId={ganttProjectId} lockLabel="Gantt — Read Only" />

      <PendingActionsCard />
      <LeadPipelinePanel />
      <LeadWorkflowTimeline />
    </div>
  );
}
