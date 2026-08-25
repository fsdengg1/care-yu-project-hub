'use client';

import React from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Navbar from '@/components/layout/Navbar';
import CareyuLogo from '@/components/brand/CareyuLogo';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import NotificationToastHost from '@/components/notifications/NotificationToastHost';
import { AuthProvider, useAuth } from '@/components/auth/AuthProvider';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-xs text-slate-400 theme-app">
        <CareyuLogo />
        Loading Care Yu Automation Project Hub...
      </div>
    );
  }

  return (
    <div className="theme-app flex min-h-screen bg-slate-950 text-slate-100">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <NotificationProvider user={user}>
          <Navbar user={user} />
          <NotificationToastHost />
          <main className="flex-1 overflow-y-auto bg-slate-950 p-6">{children}</main>
        </NotificationProvider>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
