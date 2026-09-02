'use client';

import React from 'react';
import { CompareItem } from '@/lib/dailyStatus';

export default function CompareView({
  items,
  available,
  date,
}: {
  items: CompareItem[];
  available: boolean;
  date?: string;
}) {
  if (!available) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
        Morning and evening updates are not yet available.
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
        No tasks found.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-400">Comparison for {date} (Yesterday AM / PM vs current)</div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[960px] border-collapse text-left text-[11px]">
          <thead className="bg-slate-950 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="border-b border-slate-800 px-2 py-2">Person</th>
              <th className="border-b border-slate-800 px-2 py-2">Project</th>
              <th className="border-b border-slate-800 px-2 py-2">Task</th>
              <th className="border-b border-slate-800 px-2 py-2">Yesterday AM</th>
              <th className="border-b border-slate-800 px-2 py-2">Yesterday PM</th>
              <th className="border-b border-slate-800 px-2 py-2">Current Update</th>
              <th className="border-b border-slate-800 px-2 py-2">On-Time/Delay</th>
              <th className="border-b border-slate-800 px-2 py-2">Progress</th>
              <th className="border-b border-slate-800 px-2 py-2">Reason</th>
              <th className="border-b border-slate-800 px-2 py-2">Logged Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-slate-300">
            {items.map((item) => (
              <tr key={item.id} className="align-top hover:bg-slate-950/40">
                <td className="px-2 py-2 font-semibold text-slate-100">{item.person}</td>
                <td className="px-2 py-2">{item.project}</td>
                <td className="px-2 py-2 text-slate-100">{item.taskDescription}</td>
                <td className="px-2 py-2">{item.morningStatus}</td>
                <td className="px-2 py-2">{item.eveningStatus}</td>
                <td className="px-2 py-2">{item.currentUpdate || '—'}</td>
                <td className="px-2 py-2">{item.onTimeDelay || '—'}</td>
                <td className="px-2 py-2">{item.progressPercent ?? 0}%</td>
                <td className="px-2 py-2">{item.reasonForDelay || '—'}</td>
                <td className="px-2 py-2 whitespace-nowrap">{item.loggedHours || '0h 00m'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
