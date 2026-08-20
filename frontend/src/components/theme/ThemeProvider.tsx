'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, applyAppearance, getStoredAppearance } from '@/lib/theme';

interface ThemeContextValue {
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  toggleAppearance: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>('dark');

  useEffect(() => {
    setAppearanceState(getStoredAppearance());
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      appearance,
      setAppearance: (next) => {
        setAppearanceState(next);
        applyAppearance(next);
      },
      toggleAppearance: () => {
        const next = appearance === 'dark' ? 'light' : 'dark';
        setAppearanceState(next);
        applyAppearance(next);
      },
    }),
    [appearance]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
