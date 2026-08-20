'use client';

import React from 'react';
import { User } from '@/lib/types';
import { Building2, DollarSign, Plus, Inbox } from 'lucide-react';

export default function SalesDashboard({ user }: { user: User }) {
  const isBH = user.role_code === 'BUSINESS_HEAD';
  const verticalName = isBH ? 'Business Head' : 'Sales';

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-blue-950/30 to-slate-900 p-6 rounded-xl border border-slate-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs uppercase tracking-wider">
            <Building2 className="w-4 h-4" /> {isBH ? 'Business Head Dashboard' : 'Sales Dashboard'}
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">Welcome back, {user.name}</h1>
          <p className="text-xs text-slate-400 mt-1">
            Track customer opportunities under <span className="text-cyan-300 font-semibold">{verticalName}</span> vertical.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Pipeline Value</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">₹ 0</div>
          <div className="text-[11px] text-slate-500 mt-1">No opportunities recorded yet</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Leads in Technical Review</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">0</div>
          <div className="text-[11px] text-slate-500 mt-1">No leads submitted to PM yet</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Commercial Proposals</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">0</div>
          <div className="text-[11px] text-slate-500 mt-1">No proposals active</div>
        </div>
      </div>

      <div className="bg-slate-900/90 p-8 rounded-xl border border-slate-800 text-center space-y-2">
        <Inbox className="w-6 h-6 text-slate-600 mx-auto" />
        <p className="text-xs text-slate-300 font-medium">No sales leads recorded yet.</p>
        <p className="text-[11px] text-slate-500">Lead creation workflow will be introduced in Phase 2.</p>
      </div>
    </div>
  );
}
