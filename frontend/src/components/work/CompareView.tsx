'use client';

import React, { useState } from 'react';
import { ArrowDown } from 'lucide-react';
import StatusBadge from './StatusBadge';
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
  const [openId, setOpenId] = useState<string | null>(null);
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
      <div className="text-xs text-slate-400">Comparison for {date}</div>
      {items.map((item) => {
        const open = openId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenId(open ? null : item.id)}
            className="w-full rounded-xl border border-slate-800 bg-slate-900 p-4 text-left hover:border-cyan-700"
          >
            <div className="text-sm font-semibold text-slate-100">{item.taskDescription}</div>
            <div className="mt-1 text-xs text-slate-400">
              {item.person} · {item.project}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
              <div>
                <div className="text-[10px] uppercase text-slate-500">Morning</div>
                <StatusBadge status={item.morningStatus} />
              </div>
              <ArrowDown className="h-4 w-4 text-slate-500" />
              <div>
                <div className="text-[10px] uppercase text-slate-500">Evening</div>
                <StatusBadge status={item.eveningStatus} />
              </div>
              <div className="ml-auto flex flex-wrap gap-1">
                {(() => {
                  const kinds =
                    item.kinds.includes('Improved') && item.kinds.includes('Completed')
                      ? ['✓ Improved / Completed', ...item.kinds.filter((kind) => kind !== 'Improved' && kind !== 'Completed')]
                      : item.kinds.map((kind) => (kind === 'Improved' ? '✓ Improved' : kind));
                  return kinds.map((kind) => (
                    <span key={kind} className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-200">
                      {kind}
                    </span>
                  ));
                })()}
              </div>
            </div>
            {open && (
              <div className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300 sm:grid-cols-2">
                <div>Morning deadline: {item.morningDeadline || '—'}</div>
                <div>Evening deadline: {item.eveningDeadline || '—'}</div>
                <div>Morning dependencies: {item.morningDependencies || '—'}</div>
                <div>Evening dependencies: {item.eveningDependencies || '—'}</div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
