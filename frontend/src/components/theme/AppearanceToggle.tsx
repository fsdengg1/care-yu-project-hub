'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';

export default function AppearanceToggle() {
  const { appearance, setAppearance } = useTheme();

  return (
    <div
      className="flex items-center rounded-md border border-slate-700/80 bg-slate-800/80 p-0.5"
      role="group"
      aria-label="Appearance"
    >
      <button
        type="button"
        onClick={() => setAppearance('light')}
        className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
          appearance === 'light'
            ? 'bg-white text-black shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        aria-pressed={appearance === 'light'}
        title="Light appearance"
      >
        <Sun className="h-3.5 w-3.5" />
        Light
      </button>
      <button
        type="button"
        onClick={() => setAppearance('dark')}
        className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors ${
          appearance === 'dark'
            ? 'bg-slate-950 text-cyan-300 shadow-sm'
            : 'text-slate-400 hover:text-slate-200'
        }`}
        aria-pressed={appearance === 'dark'}
        title="Dark appearance"
      >
        <Moon className="h-3.5 w-3.5" />
        Dark
      </button>
    </div>
  );
}
