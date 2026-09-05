'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { MonitorPlay } from 'lucide-react';
import { LiveDemoApi } from '@/lib/liveDemoApi';
import KPIStatCard from '@/components/work/KPIStatCard';

export default function LiveDemoWidgets() {
  const [counts, setCounts] = useState({
    waitingForReview: 0,
    pendingCustomer: 0,
    pendingInternal: 0,
    pendingBoth: 0,
    scheduledToday: 0,
    caseReferencePending: 0,
    verificationPending: 0,
  });

  useEffect(() => {
    void (async () => {
      const result = await LiveDemoApi.summary();
      if (result.ok) {
        setCounts({
          waitingForReview: result.data.waitingForReview || result.data.pending || 0,
          pendingCustomer: result.data.pendingCustomer || 0,
          pendingInternal: result.data.pendingInternal || 0,
          pendingBoth: result.data.pendingBoth || 0,
          scheduledToday: result.data.scheduledToday || 0,
          caseReferencePending: result.data.caseReferencePending || 0,
          verificationPending: result.data.verificationPending || 0,
        });
      }
    })();
  }, []);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <MonitorPlay className="h-4 w-4 text-violet-400" /> LIVE Case Demonstration
        </h2>
        <Link href="/pre-sales/live-demonstrations" className="text-xs text-cyan-400 hover:underline">
          Open module
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPIStatCard label="Waiting for review" value={counts.waitingForReview} hint="Requested or under review" />
        <KPIStatCard label="Pending – Customer" value={counts.pendingCustomer} hint="Waiting for customer" tone="warning" />
        <KPIStatCard label="Pending – Internal" value={counts.pendingInternal} hint="Care Yu action required" tone="warning" />
        <KPIStatCard label="Pending – Both" value={counts.pendingBoth} hint="Customer and internal" tone="warning" />
        <KPIStatCard label="Today" value={counts.scheduledToday} hint="Scheduled today" />
        <KPIStatCard label="Reference pending" value={counts.caseReferencePending} tone="warning" />
        <KPIStatCard label="Awaiting verification" value={counts.verificationPending} tone="warning" />
      </div>
    </section>
  );
}
