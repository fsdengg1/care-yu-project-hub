'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import { FeasibilityTeamAssignment, Lead, User } from '@/lib/types';
import { Scan, ArrowRight, ShieldAlert, Inbox, Clock, CheckCircle2 } from 'lucide-react';

export default function FeasibilityStudiesPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [assignments, setAssignments] = useState<FeasibilityTeamAssignment[]>([]);
  const [leadsMap, setLeadsMap] = useState<Record<string, Lead>>({});

  useEffect(() => {
    const u = StorageService.getCurrentUser();
    setCurrentUser(u);
    const all = StorageService.getFeasibilityTeamAssignments();
    setAssignments(all);
    const leads = StorageService.getLeads();
    const map: Record<string, Lead> = {};
    leads.forEach(l => { map[l.id] = l; });
    setLeadsMap(map);
  }, []);

  if (!currentUser) return null;

  const isPM = currentUser.role_code === 'PROJECT_MANAGER' || currentUser.role_code === 'CEO' || currentUser.role_code === 'SYSTEM_ADMIN';
  const isTL = currentUser.role_code === 'TEAM_LEAD';

  const visible = assignments.filter(a => {
    if (isPM) return true;
    if (isTL) return a.team_lead_id === currentUser.id || a.team_id === currentUser.team_id;
    // Employee: show allocations via my-work page
    return false;
  });

  const tlPending = visible.filter(a => a.status === 'PENDING_TEAM_LEAD_REVIEW' || a.status === 'CLARIFICATION_REQUIRED');

  const statusColor = (s: string) => {
    if (s === 'PENDING_TEAM_LEAD_REVIEW') return 'text-amber-300 bg-amber-950 border-amber-800';
    if (s === 'ALLOCATED_TO_TEAM_MEMBER' || s === 'READY_TO_START') return 'text-emerald-300 bg-emerald-950 border-emerald-800';
    if (s === 'IN_PROGRESS') return 'text-cyan-300 bg-cyan-950 border-cyan-800';
    if (s === 'COMPLETED') return 'text-slate-300 bg-slate-800 border-slate-700';
    if (s === 'CRITICAL_DIRECT_ASSIGNED') return 'text-rose-300 bg-rose-950 border-rose-800';
    if (s === 'CHANGE_SUGGESTED' || s === 'CLARIFICATION_REQUIRED') return 'text-orange-300 bg-orange-950 border-orange-800';
    return 'text-slate-300 bg-slate-800 border-slate-700';
  };

  return (
    <div className="space-y-6 text-xs">
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold uppercase tracking-wider text-xs">
            <Scan className="w-4 h-4" /> Phase 3A Pre-Sales
          </div>
          <h1 className="text-xl font-bold text-slate-100 mt-1">Feasibility Studies</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            All feasibility team assignments across Leads. Assignments are always started from the Lead.
          </p>
        </div>
      </div>

      {/* TL Pending Queue */}
      {isTL && tlPending.length > 0 && (
        <div className="bg-cyan-950/40 border border-cyan-800/80 rounded-xl p-4 space-y-3">
          <div className="font-bold text-cyan-300 flex items-center gap-2 text-xs">
            <Clock className="w-4 h-4 text-cyan-400" />
            ASSIGNMENTS AWAITING YOUR REVIEW — {tlPending.length} pending
          </div>
          {tlPending.map(a => (
            <div key={a.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-2 border-t border-cyan-900/40">
              <div>
                <span className="font-mono text-cyan-400 font-bold mr-2">{leadsMap[a.lead_id]?.lead_number || a.lead_id}</span>
                <span className="font-bold text-slate-100">{leadsMap[a.lead_id]?.title || '—'}</span>
                <div className="text-slate-400 mt-0.5">PM Instructions: &quot;{a.pm_instructions}&quot;</div>
              </div>
              <Link href={`/pre-sales/leads/${a.lead_id}?tab=feasibility`} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded text-[11px] flex items-center gap-1 shrink-0">
                Open Lead <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Main Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="font-bold text-slate-200 text-xs">All Team Assignments ({visible.length})</h2>
          <p className="text-[11px] text-slate-400">Assignments are created from Lead → Feasibility Teams tab.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">Lead</th>
                <th className="p-3">Team</th>
                <th className="p-3">Type</th>
                <th className="p-3">Team Lead</th>
                <th className="p-3">Priority / Due</th>
                <th className="p-3">Employees</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    No feasibility assignments yet. Open a Lead and use + ADD TEAM.
                  </td>
                </tr>
              ) : (
                visible.map(a => {
                  const allocs = StorageService.getFeasibilityAllocationsByAssignmentId(a.id);
                  const isCritical = a.assignment_type === 'CRITICAL_DIRECT';
                  return (
                    <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="p-3">
                        <div className="font-mono font-bold text-cyan-400">{leadsMap[a.lead_id]?.lead_number || a.lead_id}</div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[120px]">{leadsMap[a.lead_id]?.title || '—'}</div>
                      </td>
                      <td className="p-3 font-bold text-slate-100">{a.team_name}</td>
                      <td className="p-3">
                        {isCritical ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1 w-fit">
                            <ShieldAlert className="w-3 h-3" /> CRITICAL
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800 w-fit">NORMAL</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-200">{a.team_lead_name || '—'}</td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-200">{a.priority}</div>
                        <div className="text-[11px] font-mono text-slate-400">{a.due_date}</div>
                      </td>
                      <td className="p-3 text-center font-bold text-slate-100">{allocs.length}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusColor(a.status)}`}>{a.status}</span>
                      </td>
                      <td className="p-3 text-right">
                        <Link href={`/pre-sales/leads/${a.lead_id}`} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1">
                          Open Lead <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
