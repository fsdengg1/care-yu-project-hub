'use client';

import React, { Suspense, useEffect, useState } from 'react';
import GanttPlanner from '@/components/planning/GanttPlanner';
import { StorageService } from '@/lib/storage';
import { canAccessGanttPlanning } from '@/lib/rbac';
import { User } from '@/lib/types';

function PlanningGate() {
  const [user, setUser] = useState<User | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (!canAccessGanttPlanning(current)) {
      setDenied(true);
      setUser(current);
      return;
    }
    setUser(current);
  }, []);

  if (denied) {
    return (
      <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-8 text-center">
        <h1 className="text-base font-bold text-rose-200">You do not have permission to view this project&apos;s Gantt plan.</h1>
        <p className="mt-2 text-xs text-rose-300">The Gantt chart is available to the assigned Project Manager and authorized viewers of the project.</p>
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
