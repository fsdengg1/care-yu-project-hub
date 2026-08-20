'use client';

import React, { useEffect, useState } from 'react';
import { User } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { GanttChartSquare, Scan, ShieldAlert, MessageSquare, Inbox, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function PMDashboard({ user }: { user: User }) {
  const [assignments, setAssignments] = useState(StorageService.getFeasibilityTeamAssignments());
  const [suggestions, setSuggestions] = useState(StorageService.getFeasibilitySuggestions());

  const pendingTL = assignments.filter(a => a.status === 'PENDING_TEAM_LEAD_REVIEW');
  const inProgress = assignments.filter(a => a.status === 'IN_PROGRESS' || a.status === 'ALLOCATED_TO_TEAM_MEMBER');
  const critical = assignments.filter(a => a.assignment_type === 'CRITICAL_DIRECT');
  const pendingSugg = suggestions.filter(s => s.status === 'PENDING');

  return (
    <div className="space-y-6 text-xs">
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/30 to-slate-900 p-6 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold uppercase tracking-wider text-xs"><GanttChartSquare className="w-4 h-4" /> PM Dashboard</div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">{user.name}</h1>
          <p className="text-slate-400 text-xs mt-0.5">Lead-centric feasibility assignments. Open a Lead to add teams.</p>
        </div>
        <Link href="/pre-sales/leads" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center gap-2 text-xs shrink-0">
          <Scan className="w-4 h-4" /> Open Leads & Assign Feasibility
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pending TL Review', value: pendingTL.length, color: 'text-amber-400' },
          { label: 'Feasibility In Progress', value: inProgress.length, color: 'text-emerald-400' },
          { label: 'Critical Direct', value: critical.length, color: 'text-rose-400' },
          { label: 'Pending Suggestions', value: pendingSugg.length, color: 'text-orange-400' },
        ].map(m => (
          <div key={m.label} className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
            <div className="text-slate-400 font-medium">{m.label}</div>
            <div className={`text-2xl font-bold mt-2 ${m.color}`}>{m.value}</div>
          </div>
        ))}
      </div>

      {pendingSugg.length > 0 && (
        <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-100 text-sm border-b border-slate-800 pb-2">
            <MessageSquare className="w-4 h-4 text-amber-400" /> Team Lead Suggestions — Pending ({pendingSugg.length})
          </div>
          {pendingSugg.map(s => (
            <div key={s.id} className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
              <div>
                <span className="font-bold text-slate-200">{s.created_by}</span>
                <span className="text-amber-400 ml-2">{s.suggestion_type}</span>
                <div className="text-slate-400 italic text-[11px] mt-0.5">&quot;{s.comment}&quot;</div>
              </div>
              <Link href={`/pre-sales/leads/${s.lead_id}`} className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[11px] font-medium">Resolve</Link>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-900/90 p-5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="font-bold text-slate-100 text-sm">All Feasibility Team Assignments</h2>
          <Link href="/pre-sales/feasibility" className="text-cyan-400 hover:underline text-xs">View All</Link>
        </div>
        {assignments.length === 0 ? (
          <div className="p-8 text-center text-slate-500"><Inbox className="w-6 h-6 mx-auto mb-2 text-slate-600" />No assignments yet. Open a Lead and use + ADD TEAM.</div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {assignments.slice(0, 8).map(a => (
              <div key={a.id} className="py-2 flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-cyan-400 mr-2">{a.lead_id}</span>
                  <span className="font-semibold text-slate-100">{a.team_name}</span>
                  {a.assignment_type === 'CRITICAL_DIRECT' && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-rose-950 text-rose-300 font-bold">CRITICAL</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">{a.status}</span>
                  <Link href={`/pre-sales/leads/${a.lead_id}`} className="text-slate-400 hover:text-slate-200"><ArrowRight className="w-3.5 h-3.5" /></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
