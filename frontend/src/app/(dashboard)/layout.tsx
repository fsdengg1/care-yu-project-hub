'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import { StorageService } from '@/lib/storage';
import { ensureAuthSession } from '@/lib/auth';
import { User } from '@/lib/types';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const u = StorageService.getCurrentUser();
    if (!u) {
      router.replace('/login');
      return;
    }

    let cancelled = false;
    (async () => {
      const ok = await ensureAuthSession();
      if (cancelled) return;
      if (!ok) {
        StorageService.clearCurrentUser();
        router.replace('/login');
        return;
      }
      setCurrentUser(StorageService.getCurrentUser() ?? u);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!currentUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-xs text-slate-400 theme-app">
        Loading Careyu Project Hub...
      </div>
    );
  }

  return (
    <div className="theme-app flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar user={currentUser} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Navbar user={currentUser} onUserChange={(u) => setCurrentUser(u)} />
        <main className="flex-1 overflow-y-auto bg-slate-950 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
