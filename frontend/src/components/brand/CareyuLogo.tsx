import React from 'react';

interface CareyuLogoProps {
  variant?: 'light' | 'dark';
  compact?: boolean;
}

export default function CareyuLogo({ variant = 'dark', compact = false }: CareyuLogoProps) {
  const isLight = variant === 'light';

  return (
    <div className="flex items-center gap-3">
      <div
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${
          isLight
            ? 'bg-white/10 ring-1 ring-white/20'
            : 'bg-[#0B1F3A] ring-1 ring-[#1B4F8A]/40'
        }`}
      >
        <svg viewBox="0 0 40 40" className="h-7 w-7" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2.5" fill={isLight ? '#93C5FD' : '#2563EB'} />
          <rect x="22" y="6" width="12" height="12" rx="2.5" fill={isLight ? '#60A5FA' : '#1D4ED8'} opacity="0.9" />
          <rect x="6" y="22" width="12" height="12" rx="2.5" fill={isLight ? '#3B82F6' : '#1E3A8A'} />
          <path
            d="M24 24h8a4 4 0 0 1 4 4v4h-6a6 6 0 0 1-6-6v-2z"
            fill={isLight ? '#BFDBFE' : '#93C5FD'}
          />
        </svg>
      </div>
      <div className="min-w-0">
        <div
          className={`font-semibold tracking-tight leading-tight ${
            compact ? 'text-sm' : 'text-base'
          } ${isLight ? 'text-white' : 'text-[#0B1F3A]'}`}
        >
          Careyu Automation
        </div>
        {!compact && (
          <div className={`text-[11px] font-medium tracking-wide ${isLight ? 'text-blue-200' : 'text-slate-500'}`}>
            Industrial Vision · Robotics · Automation
          </div>
        )}
      </div>
    </div>
  );
}
