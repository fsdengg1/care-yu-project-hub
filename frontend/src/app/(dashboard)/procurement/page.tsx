'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { ProcurementRequest } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { isCeoViewOnly } from '@/lib/rbac';

const STATUS_STYLE: Record<ProcurementRequest['status'], string> = {
  DELAYED: 'text-amber-300 bg-amber-950 border-amber-800',
  IN_PROGRESS: 'text-cyan-300 bg-cyan-950 border-cyan-800',
  ON_HOLD: 'text-slate-300 bg-slate-800 border-slate-700',
  COMPLETED: 'text-emerald-300 bg-emerald-950 border-emerald-800',
};

export default function ProcurementPage() {
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);
  const [viewOnly, setViewOnly] = useState(false);

  useEffect(() => {
    setViewOnly(isCeoViewOnly(StorageService.getCurrentUser()));
    (async () => {
      const result = await apiRequest<{ requests: ProcurementRequest[] }>('/api/procurement');
      if (result.ok) setRequests(result.data.requests);
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <ShoppingCart className="h-4 w-4" /> Execution & Workload
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Procurement Requests</h1>
        <p className="mt-1 text-xs text-slate-400">
          {viewOnly
            ? 'Read-only visibility of what is being procured, current status, project impact, and owner. Purchasing actions are handled by Procurement and PM.'
            : 'Procurement-linked requests and project impact.'}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-800 bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="p-3">Request</th>
                <th className="p-3">Project</th>
                <th className="p-3">Status</th>
                <th className="p-3">Impact</th>
                <th className="p-3">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-500">
                    No procurement requests visible.
                  </td>
                </tr>
              ) : (
                requests.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="p-3 font-semibold text-slate-100">{item.request}</td>
                    <td className="p-3">
                      <Link href="/projects/active" className="font-medium text-cyan-300 hover:underline">
                        {item.customer_name} – {item.project_name}
                      </Link>
                    </td>
                    <td className="p-3">
                      <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLE[item.status]}`}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">{item.impact}</td>
                    <td className="p-3">
                      <div className="font-medium text-slate-100">{item.owner_name}</div>
                      <div className="text-[11px] text-slate-500">{item.owner_team}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
