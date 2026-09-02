'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'careyu-sidebar-collapsed';

type SidebarContextValue = {
  collapsed: boolean;
  mobileOpen: boolean;
  isDesktop: boolean;
  toggleSidebar: () => void;
  closeMobile: () => void;
  openMobile: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function readStoredCollapsed() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => readStoredCollapsed());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      setIsDesktop(media.matches);
      if (media.matches) setMobileOpen(false);
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!mobileOpen || isDesktop) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [mobileOpen, isDesktop]);

  const toggleSidebar = useCallback(() => {
    if (isDesktop) {
      setCollapsed((current) => {
        const next = !current;
        try {
          window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        } catch {
          // ignore storage failures
        }
        return next;
      });
      return;
    }
    setMobileOpen((current) => !current);
  }, [isDesktop]);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);

  const value = useMemo(
    () => ({ collapsed, mobileOpen, isDesktop, toggleSidebar, closeMobile, openMobile }),
    [collapsed, mobileOpen, isDesktop, toggleSidebar, closeMobile, openMobile]
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) throw new Error('useSidebar must be used within SidebarProvider');
  return context;
}
