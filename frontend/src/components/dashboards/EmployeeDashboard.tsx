'use client';

import React from 'react';
import { User } from '@/lib/types';
import { CheckSquare, Inbox } from 'lucide-react';

export default function EmployeeDashboard({ user }: { user: User }) {
  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-cyan-950/20 to-slate-900 p-6 rounded-xl border border-slate-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <CheckSquare className="w-4 h-4" /> Team Member Dashboard
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">Hello, {user.name}</h1>
          <p className="text-xs text-slate-400 mt-1">
            View active tasks assigned by Project Manager (Arivan), log daily work progress, and report technical blockers.
          </p>
        </div>
      </div>

      {/* Task Summary Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Assigned Active Tasks</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">0</div>
          <div className="text-[11px] text-slate-500 mt-1">No active tasks assigned</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Next Deadline</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">None</div>
          <div className="text-[11px] text-slate-500 mt-1">No scheduled task deadlines</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Today&apos;s Daily Log</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">Pending</div>
          <div className="text-[11px] text-slate-500 mt-1">No daily log submitted</div>
        </div>
      </div>

      <div className="bg-slate-900/90 p-8 rounded-xl border border-slate-800 text-center space-y-2">
        <Inbox className="w-6 h-6 text-slate-600 mx-auto" />
        <p className="text-xs text-slate-300 font-medium">No assigned tasks found.</p>
      </div>
    </div>
  );
}
