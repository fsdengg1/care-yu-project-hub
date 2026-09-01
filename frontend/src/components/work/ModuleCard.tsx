'use client';

import React from 'react';
import StatusBadge from './StatusBadge';
import { formatEmployeeDisplayName } from '@/lib/people';

export default function ModuleCard({
  name,
  assignee,
  progress,
  status,
  onClick,
}: {
  name: string;
  assignee?: string;
  progress: number;
  status: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-600 hover:shadow-md"
    >
      <div className="text-sm font-bold text-slate-100">{name}</div>
      <div className="mt-2 text-[11px] uppercase tracking-wider text-slate-500">Assigned</div>
      <div className="text-xs text-slate-300">{assignee ? formatEmployeeDisplayName(assignee) : '—'}</div>
      <div className="mt-3 text-[11px] uppercase tracking-wider text-slate-500">Progress</div>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-cyan-500" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
        <span className="text-xs font-bold text-slate-100">{progress}%</span>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <StatusBadge status={status} />
        <span className="text-xs font-bold text-cyan-400">View Module →</span>
      </div>
    </button>
  );
}
