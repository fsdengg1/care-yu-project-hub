'use client';

import React from 'react';

export default function KPIStatCard({
  label,
  value,
  hint,
  active,
  onClick,
  tone = 'default',
}: {
  label: string;
  value: number | string;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClass =
    tone === 'danger'
      ? 'hover:border-rose-400'
      : tone === 'warning'
        ? 'hover:border-amber-400'
        : tone === 'success'
          ? 'hover:border-emerald-400'
          : 'hover:border-cyan-500';
  const valueClass =
    tone === 'danger'
      ? 'text-rose-400'
      : tone === 'warning'
        ? 'text-amber-400'
        : tone === 'success'
          ? 'text-emerald-400'
          : 'text-slate-100';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-xl border bg-slate-900/90 p-4 text-left shadow-sm transition ${
        active ? 'border-cyan-500 ring-1 ring-cyan-500/40' : `border-slate-800 ${toneClass}`
      } ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''}`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] text-slate-500">{hint}</div> : null}
    </Tag>
  );
}
