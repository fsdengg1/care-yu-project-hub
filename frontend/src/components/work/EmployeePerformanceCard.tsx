'use client';

import React from 'react';

export default function EmployeePerformanceCard({
  name,
  total,
  completed,
  inProgress,
  hold,
  overdue,
  progress,
  onClick,
}: {
  name: string;
  total: number;
  completed: number;
  inProgress: number;
  hold?: number;
  overdue: number;
  progress: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-2xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:-translate-y-0.5 hover:border-cyan-600 hover:shadow-md"
    >
      <div className="text-sm font-bold text-slate-100">{name}</div>
      <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-slate-400">
        <div>{total} Tasks</div>
        <div>{completed} Completed</div>
        <div>{inProgress} In Progress</div>
        <div>{overdue} Overdue</div>
        {hold != null && <div>{hold} Hold</div>}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="font-bold text-slate-100">{progress}%</span>
        <span className="font-bold text-cyan-400">View Tasks →</span>
      </div>
    </button>
  );
}
