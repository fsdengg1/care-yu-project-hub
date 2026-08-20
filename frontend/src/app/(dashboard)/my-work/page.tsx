'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { StorageService } from '@/lib/storage';
import {
  FeasibilityEmployeeAllocation,
  FeasibilityTeamAssignment,
  LeadEngineeringView,
  User
} from '@/lib/types';
import {
  CheckSquare, Play, CheckCircle2, ShieldAlert, ArrowRight, Inbox
} from 'lucide-react';

interface AllocWithContext {
  allocation: FeasibilityEmployeeAllocation;
  assignment: FeasibilityTeamAssignment | undefined;
  engView: LeadEngineeringView | null;
}

export default function MyAssignedWorkPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [items, setItems] = useState<AllocWithContext[]>([]);

  const load = (u: User) => {
    const allocs = StorageService.getFeasibilityAllocationsByEmployeeId(u.id);
    const assignments = StorageService.getFeasibilityTeamAssignments();
    const enriched: AllocWithContext[] = allocs.map(al => ({
      allocation: al,
      assignment: assignments.find(a => a.id === al.feasibility_team_assignment_id),
      engView: StorageService.getLeadEngineeringView(al.lead_id),
    }));
    setItems(enriched);
  };

  useEffect(() => {
    const u = StorageService.getCurrentUser();
    if (!u) return;
    setCurrentUser(u);
    load(u);
  }, []);

  const handleStartWork = (alloc: FeasibilityEmployeeAllocation, assignment: FeasibilityTeamAssignment) => {
    StorageService.updateFeasibilityEmployeeAllocation(alloc.id, { started_at: new Date().toISOString() });
    StorageService.updateFeasibilityTeamAssignment(assignment.id, { status: 'IN_PROGRESS' });
    StorageService.logAudit({
      user_id: currentUser!.id,
      user_name: currentUser!.name,
      user_role: currentUser!.role_name,
      entity_type: 'FEASIBILITY',
      entity_id: assignment.id,
      action: 'WORK_STARTED_BY_MEMBER',
      description: `${currentUser!.name} started Feasibility work for Lead ${alloc.lead_id} (${assignment.team_name}).`
    });
    load(currentUser!);
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-6 text-xs">
      {/* Header */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold uppercase tracking-wider text-xs">
          <CheckSquare className="w-4 h-4" /> My Work
        </div>
        <h1 className="text-xl font-bold text-slate-100 mt-1">My Feasibility Assignments</h1>
        <p className="text-slate-400 text-xs mt-0.5">
          Tasks allocated to <span className="font-semibold text-cyan-300">{currentUser.name}</span>. Engineering input is shown — customer contact and commercial data are not shown.
        </p>
      </div>

      {/* Assignment Cards */}
      <div className="space-y-5">
        {items.length === 0 ? (
          <div className="bg-slate-900/90 p-12 rounded-xl border border-slate-800 text-center text-slate-500 space-y-2">
            <Inbox className="w-8 h-8 mx-auto text-slate-600" />
            <p>No feasibility assignments allocated to you yet.</p>
          </div>
        ) : (
          items.map(({ allocation: al, assignment, engView }) => {
            if (!assignment || !engView) return null;
            const isCritical = al.approval_status === 'BYPASSED_CRITICAL';
            const isStarted = !!al.started_at;
            const canStart = al.approval_status === 'APPROVED' || al.approval_status === 'BYPASSED_CRITICAL';

            return (
              <div key={al.id} className={`rounded-xl border overflow-hidden shadow-sm ${isCritical ? 'border-rose-900 bg-rose-950/10' : 'border-slate-800 bg-slate-900/90'}`}>
                {/* Card Header */}
                <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-cyan-400 text-sm">{engView.lead_number}</span>
                    <span className="font-bold text-slate-100">{engView.title}</span>
                    {isCritical ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-rose-400" /> Critical Direct Assignment
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                        Approved by TL: {assignment.team_lead_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isStarted && canStart ? (
                      <button onClick={() => handleStartWork(al, assignment)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg flex items-center gap-1.5 text-xs">
                        <Play className="w-3.5 h-3.5 fill-current" /> Start Work
                      </button>
                    ) : isStarted ? (
                      <div className="flex items-center gap-2">
                        <span className="px-3 py-1 rounded text-xs font-bold bg-cyan-950 text-cyan-300 border border-cyan-800 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> IN PROGRESS
                        </span>
                        <Link href={`/pre-sales/leads/${al.lead_id}`} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-xs font-medium flex items-center gap-1">
                          Open Lead <ArrowRight className="w-3 h-3" />
                        </Link>
                      </div>
                    ) : (
                      <span className="px-3 py-1 text-xs text-amber-400 bg-amber-950/40 border border-amber-800 rounded font-semibold">Pending TL Allocation</span>
                    )}
                  </div>
                </div>

                {/* Engineering Input Package (no contact, no commercial) */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left — Customer & Requirement */}
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Customer & Application</div>
                      <div className="font-bold text-slate-100">{engView.customer_name}</div>
                      <div className="text-slate-400">{engView.application}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Requirement</div>
                      <p className="text-slate-300 leading-relaxed">{engView.requirement_summary}</p>
                    </div>
                    {engView.technical_specifications && (
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Technical Specs</div>
                        <div className="text-slate-400 font-mono text-[11px] bg-slate-950 p-2 rounded border border-slate-800">{engView.technical_specifications}</div>
                      </div>
                    )}
                  </div>

                  {/* Right — My Assignment */}
                  <div className="space-y-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">My Assignment</div>
                      <div className="space-y-1 text-slate-300">
                        <div>Team: <span className="font-bold text-cyan-400">{assignment.team_name}</span></div>
                        <div>Priority: <span className="font-semibold text-amber-400">{assignment.priority}</span></div>
                        <div>Due: <span className="font-mono text-slate-200">{assignment.due_date}</span></div>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">My Responsibility</div>
                      <p className="text-slate-200 font-medium">{al.responsibility}</p>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-semibold mb-1">PM Instructions</div>
                      <div className="text-slate-400 font-mono text-[11px] bg-slate-950 p-2 rounded border border-slate-800">&quot;{assignment.pm_instructions}&quot;</div>
                    </div>
                    {/* Key technical params */}
                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
                      {engView.cycle_time && <div>Cycle Time: <span className="font-medium text-slate-100">{engView.cycle_time}</span></div>}
                      {engView.production_rate && <div>Prod. Rate: <span className="font-medium text-slate-100">{engView.production_rate}</span></div>}
                      {engView.accuracy_requirement && <div>Accuracy: <span className="font-medium text-slate-100">{engView.accuracy_requirement}</span></div>}
                      {engView.payload && <div>Payload: <span className="font-medium text-slate-100">{engView.payload}</span></div>}
                    </div>
                  </div>
                </div>

                {/* Engineering documents if any */}
                {engView.documents.length > 0 && (
                  <div className="px-4 pb-4 border-t border-slate-800/60 pt-3">
                    <div className="text-[10px] text-slate-500 uppercase font-semibold mb-2">Engineering Documents</div>
                    <div className="flex flex-wrap gap-2">
                      {engView.documents.map(d => (
                        <span key={d.id} className="px-2 py-1 bg-slate-800 border border-slate-700 text-slate-300 rounded text-[11px] font-medium">{d.file_name} <span className="text-slate-500">({d.category})</span></span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
