'use client';

import React from 'react';
import { User } from '@/lib/types';
import { ShoppingCart, Inbox } from 'lucide-react';

export default function ProcurementDashboard({ user }: { user: User }) {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 via-amber-950/30 to-slate-900 p-6 rounded-xl border border-slate-800 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs uppercase tracking-wider">
            <ShoppingCart className="w-4 h-4" /> Procurement & BOM Costing Hub
          </div>
          <h1 className="text-2xl font-bold text-slate-100 mt-1">Procurement Management — {user.name}</h1>
          <p className="text-xs text-slate-400 mt-1">
            Receive costing requests from PM (Arivan), coordinate vendor RFQs for cameras, robots, PLCs, and track material status.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Pending PM Costing Requests</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">0</div>
          <div className="text-[11px] text-slate-500 mt-1">No pending requests</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Active Vendor RFQs</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">0</div>
          <div className="text-[11px] text-slate-500 mt-1">No active vendor RFQs</div>
        </div>

        <div className="p-4 bg-slate-900/90 rounded-xl border border-slate-800">
          <div className="text-xs text-slate-400 font-medium">Material Receipts</div>
          <div className="text-2xl font-bold text-slate-100 mt-2">0</div>
          <div className="text-[11px] text-slate-500 mt-1">No materials tracked</div>
        </div>
      </div>

      <div className="bg-slate-900/90 p-8 rounded-xl border border-slate-800 text-center space-y-2">
        <Inbox className="w-6 h-6 text-slate-600 mx-auto" />
        <p className="text-xs text-slate-300 font-medium">No procurement requests logged yet.</p>
      </div>
    </div>
  );
}
