'use client';

import React, { useEffect, useState } from 'react';
import { User } from '@/lib/types';
import { ShoppingCart, Inbox } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { ProcurementRequest } from '@/lib/types';
import LeadPipelinePanel from '@/components/dashboards/LeadPipelinePanel';

export default function ProcurementDashboard({ user }: { user: User }) {
  const [requests, setRequests] = useState<ProcurementRequest[]>([]);

  useEffect(() => {
    void (async () => {
      const result = await apiRequest<{ requests: ProcurementRequest[] }>('/api/procurement');
      if (result.ok) setRequests(result.data.requests);
    })();
  }, []);

  const pending = requests.filter((item) => item.status === 'IN_PROGRESS' || item.status === 'ON_HOLD').length;
  const delayed = requests.filter((item) => item.status === 'DELAYED').length;
  const completed = requests.filter((item) => item.status === 'COMPLETED').length;

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 p-6 rounded-xl border border-slate-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <ShoppingCart className="w-4 h-4" /> Procurement & BOM Costing Hub
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">Procurement Management — {user.name}</h1>
          <p className="text-xs text-slate-400 mt-1">
            Receive costing requests from PM, coordinate vendor RFQs, and track material status.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Pending PM Costing Requests</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{pending}</div>
          <div className="text-[11px] text-slate-500 mt-1">{pending ? 'Open procurement items' : 'No pending requests'}</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Delayed Items</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{delayed}</div>
          <div className="text-[11px] text-slate-500 mt-1">{delayed ? 'Items flagged delayed' : 'No delayed items'}</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Completed Receipts</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">{completed}</div>
          <div className="text-[11px] text-slate-500 mt-1">{completed ? 'Closed procurement items' : 'No materials tracked'}</div>
        </div>
      </div>

      <LeadPipelinePanel />
      <div className="bg-slate-900/90 p-8 rounded-xl border border-slate-800 text-center space-y-2">
        <Inbox className="w-6 h-6 text-slate-600 mx-auto" />
        <p className="text-xs text-slate-300 font-medium">
          {requests.length === 0 ? 'No procurement requests found.' : `${requests.length} procurement request${requests.length === 1 ? '' : 's'} currently tracked.`}
        </p>
      </div>
    </div>
  );
}
