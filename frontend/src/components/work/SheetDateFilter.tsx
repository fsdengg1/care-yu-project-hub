'use client';

import React from 'react';
import { CalendarDays, RotateCcw } from 'lucide-react';
import { appTodayIso, formatSheetDate } from '@/lib/dailyStatus';

export default function SheetDateFilter({
  value,
  onChange,
  variant = 'sheet',
}: {
  value: string;
  onChange: (date: string) => void;
  variant?: 'sheet' | 'dark';
}) {
  const today = appTodayIso();
  const isSheet = variant === 'sheet';
  const labelClass = isSheet ? 'text-[11px] font-bold uppercase tracking-wider text-[#475569]' : 'text-[11px] font-bold uppercase tracking-wider text-slate-400';
  const wrapClass = isSheet
    ? 'inline-flex items-center gap-1.5 rounded-md border border-[#cbd5e1] bg-white px-2 py-1'
    : 'inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5';
  const inputClass = isSheet
    ? 'w-[9.5rem] border-0 bg-transparent p-0 text-xs font-semibold text-[#0f172a] outline-none'
    : 'w-[9.5rem] border-0 bg-transparent p-0 text-xs font-semibold text-slate-100 outline-none';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={labelClass}>Date</span>
      <div className={wrapClass} title={formatSheetDate(value)}>
        <CalendarDays className={`h-3.5 w-3.5 ${isSheet ? 'text-[#64748b]' : 'text-cyan-400'}`} />
        <input
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value || today)}
          className={inputClass}
          aria-label="Filter by date"
        />
      </div>
      <button
        type="button"
        onClick={() => onChange(today)}
        className={
          isSheet
            ? 'inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] px-2 py-1 text-[11px] font-bold text-[#0f172a] hover:border-[#0f172a]'
            : 'inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-[11px] font-bold text-slate-200 hover:border-cyan-600'
        }
        title="Reset to today"
      >
        <RotateCcw className="h-3 w-3" /> {value === today ? 'Today' : 'Reset'}
      </button>
    </div>
  );
}
