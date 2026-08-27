'use client';

import React, { useEffect, useState } from 'react';
import { DailyUpdateSummary, FeasibilityTeamAssignment, User } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { DailyUpdatesApi } from '@/lib/dailyUpdatesApi';
import { LeadApi } from '@/lib/leadApi';
import { Users, ArrowRight, Clock } from 'lucide-react';
import Link from 'next/link';
import PendingActionsCard from '@/components/work/PendingActionsCard';

export default function TeamLeadDashboard({ user }: { user: User }) {
  const [assignments, setAssignments] = useState<FeasibilityTeamAssignment[]>([]);
  const [summary, setSummary] = useState<DailyUpdateSummary | null>(null);

  useEffect(() => {
    void (async () => {
      await LeadApi.list();
      setAssignments(StorageService.getFeasibilityTeamAssignmentsForTeamLead(user.id));
      setSummary(await DailyUpdatesApi.summary());
    })();
  }, [user.id]);

  const pendingReview = assignments.filter(a => a.status === 'PENDING_TEAM_LEAD_REVIEW');
  const inProgress = assignments.filter(a => a.status === 'IN_PROGRESS' || a.status === 'ALLOCATED_TO_TEAM_MEMBER');
  const suggestions = assignments.filter(a => a.status === 'CHANGE_SUGGESTED');
  const clarifications = assignments.filter(a => a.status === 'CLARIFICATION_REQUIRED');

  return (
    <div className="space-y-6 text-xs">
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 p-6 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-indigo-400 font-semibold uppercase tracking-wider text-xs"><Users className="w-4 h-4" /> Team Lead Dashboard</div>
        <h1 className="text-2xl font-bold text-slate-100 mt-1">{user.name}</h1>
        <p className="text-slate-400 text-xs mt-0.5">Feasibility tasks assigned to your team. Open each Lead to review and allocate.</p>
      </div>

      <PendingActionsCard />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending Review', value: pendingReview.length, color: 'text-amber-400' },
          { label: 'In Progress', value: inProgress.length, color: 'text-emerald-400' },
          { label: 'Suggestions Sent', value: suggestions.length, color: 'text-orange-400' },
          { label: 'Awaiting Clarification', value: clarifications.length, color: 'text-cyan-400' },
        ].map(m => (
          <div key={m.label} className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
            <div className="text-slate-400">{m.label}</div>
            <div className={`text-2xl font-bold mt-2 ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Team updates today', value: summary?.submittedToday ?? 0 },
          { label: 'Pending today', value: summary?.pendingToday ?? 0 },
          { label: 'Blocked', value: summary?.blocked ?? 0 },
          { label: 'No recent update', value: summary?.staleAssignments ?? 0 },
        ].map((card) => (
          <Link key={card.label} href="/daily-updates" className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800">
            <div className="text-slate-400">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
          </Link>
        ))}
      </div>

      {pendingReview.length > 0 && (
        <div className="bg-amber-950/20 p-4 rounded-xl border border-amber-800/60 space-y-3">
          <div className="font-bold text-amber-300 flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4" /> URGENT — Feasibility Assignments Pending Your Review ({pendingReview.length})
          </div>
          {pendingReview.map(a => (
            <div key={a.id} className="flex items-center justify-between py-2 border-t border-amber-900/30">
              <div>
                <span className="font-mono font-bold text-cyan-400 mr-2">{a.lead_id}</span>
                <span className="font-bold text-slate-100">{a.team_name}</span>
                <div className="text-slate-400 text-[11px] mt-0.5">PM: &quot;{a.pm_instructions}&quot; — Due: <span className="font-mono">{a.due_date}</span></div>
              </div>
              <Link href={`/pre-sales/leads/${a.lead_id}`} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-[11px] flex items-center gap-1 shrink-0">
                Open Lead <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="font-bold text-slate-100 text-sm">All My Team Assignments</h2>
          <Link href="/pre-sales/feasibility" className="text-cyan-400 hover:underline text-xs flex items-center gap-1">View All <ArrowRight className="w-3 h-3" /></Link>
        </div>
        {assignments.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No feasibility work assigned to your team yet.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {assignments.map(a => {
              const allocs = StorageService.getFeasibilityAllocationsByAssignmentId(a.id);
              return (
                <div key={a.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-bold text-cyan-400 mr-2">{a.lead_id}</span>
                    <span className="font-semibold text-slate-100">{a.team_name}</span>
                    <span className="text-slate-400 ml-2">({allocs.length} employee{allocs.length !== 1 ? 's' : ''} allocated)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">{a.status}</span>
                    <Link href={`/pre-sales/leads/${a.lead_id}`} className="text-slate-400 hover:text-slate-200"><ArrowRight className="w-3.5 h-3.5" /></Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
