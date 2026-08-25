'use client';

import React from 'react';
import { passwordChecks } from '@/lib/passwordPolicy';

export default function PasswordRequirements({ password }: { password: string }) {
  const checks = passwordChecks(password);
  return (
    <div className="mt-2 rounded-xl border border-slate-200/80 bg-slate-50/80 px-3 py-2">
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
        Password must contain
      </p>
      <ul className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2" aria-live="polite">
        {checks.map((item) => (
          <li
            key={item.label}
            className={`flex items-center gap-1.5 text-[11.5px] leading-tight ${
              item.ok ? 'text-[color:var(--auth-success)]' : 'text-slate-400'
            }`}
          >
            <span className="w-3 shrink-0 text-center" aria-hidden="true">
              {item.ok ? '✓' : '○'}
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
