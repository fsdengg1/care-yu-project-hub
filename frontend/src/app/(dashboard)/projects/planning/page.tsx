'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import GanttPlanner from '@/components/planning/GanttPlanner';
import { StorageService } from '@/lib/storage';
import { canAccessGanttPlanning } from '@/lib/rbac';
import { User } from '@/lib/types';

function PlanningGate() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (current?.role_code === 'ENG_DIRECTOR') {
      router.replace('/dashboard/engineering');
      return;
    }
    if (!canAccessGanttPlanning(current)) {
      setDenied(true);
      setUser(current);
      return;
    }
    setUser(current);
  }, [router]);

  if (denied) {
    return (
      <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-8 text-center">
        <h1 className="text-base font-bold text-rose-200">You do not have permission to view this project's Gantt plan.</h1>
        <p className="mt-2 text-xs text-rose-300">Gantt planning is limited to the assigned Project Manager, assigned Team Lead, and management.</p>
      </div>
    );
  }

  if (!user) return null;
  return <GanttPlanner user={user} />;
}

export default function ProjectPlanningPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">Loading plan…</div>}>
      <PlanningGate />
    </Suspense>
  );
}
