'use client';

import React from 'react';

export default function AuthField({
  id,
  label,
  icon: Icon,
  error,
  hint,
  trailing,
  className = '',
  ...inputProps
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  error?: string;
  hint?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13.5px] font-medium text-[color:var(--auth-text)]">
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          className={`auth-input ${trailing ? 'auth-input--with-trailing' : ''}`}
          {...inputProps}
        />
        {trailing}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-[12.5px] text-[color:var(--auth-error)]">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[12.5px] text-[color:var(--auth-muted)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
