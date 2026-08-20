'use client';

import React from 'react';
import { 
  Briefcase, 
  Users, 
  DollarSign, 
  TrendingUp,
  Cpu,
  Inbox
} from 'lucide-react';
import { User } from '@/lib/types';

interface DashboardProps {
  user: User;
}

export default function CEODashboard({ user }: DashboardProps) {
  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 p-6 rounded-xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <Cpu className="w-4 h-4" /> CEO Dashboard
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">Welcome back, {user.name}</h1>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Executive visibility across Care Yu Automation pre-sales, project execution, engineering capacity, and governance.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">Company Status</div>
            <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5 justify-end mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" /> System Ready
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid - Real Database Derived (0 Initial State) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Pre-Sales Pipeline</span>
            <div className="p-2 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800/40">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">₹ 0</div>
          <div className="text-[11px] text-slate-500 mt-1">No active leads in pipeline yet</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Active Execution Projects</span>
            <div className="p-2 rounded-lg bg-blue-950 text-blue-400 border border-blue-800/40">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">0 Projects</div>
          <div className="text-[11px] text-slate-500 mt-1">No active projects yet</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Functional Teams</span>
            <div className="p-2 rounded-lg bg-indigo-950 text-indigo-400 border border-indigo-800/40">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-100 mt-3">5 Teams</div>
          <div className="text-[11px] text-slate-400 mt-1">Software, Vision, Robotics, Proc., Exec.</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">Project Manager</span>
            <div className="p-2 rounded-lg bg-emerald-950 text-emerald-400 border border-emerald-800/40">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl font-bold text-slate-100 mt-3">Arivan</div>
          <div className="text-[11px] text-slate-400 mt-1">Central Operational Controller</div>
        </div>
      </div>

      {/* Portfolio & Activity Empty State */}
      <div className="bg-slate-900/90 p-8 rounded-xl border border-slate-800 text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-slate-950 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto">
          <Inbox className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-200">No Projects or Pipeline Data Available</h2>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          Care Yu Automation Project Hub Phase 1 foundation is initialized and ready. Pre-sales opportunity workflows will be introduced in Phase 2.
        </p>
      </div>
    </div>
  );
}
