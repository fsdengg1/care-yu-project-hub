'use client';

import React, { useState, useEffect } from 'react';
import { StorageService } from '@/lib/storage';
import { AuditLog } from '@/lib/types';
import { History, Shield, Filter, Clock, User } from 'lucide-react';

export default function AuditTrailPage() {
  const [audits, setAudits] = useState<AuditLog[]>([]);

  useEffect(() => {
    setAudits(StorageService.getAudits());
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
          <History className="w-4 h-4" /> System Audit Trail & History Log
        </div>
        <h1 className="text-xl font-bold text-slate-100 mt-1">Audit Trail Foundation</h1>
        <p className="text-xs text-slate-400 mt-1">
          Complete activity logging for user creation, role changes, task assignments, TL feedback, lead updates, and system events.
        </p>
      </div>

      {/* Audit Trail List */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">Logged Events ({audits.length})</h2>
          <span className="text-xs text-slate-400">Showing recent system activity</span>
        </div>

        <div className="space-y-3">
          {audits.map(log => (
            <div key={log.id} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs space-y-1.5 hover:border-slate-700 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100">{log.user_name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
                    {log.user_role}
                  </span>
                </div>
                <span className="text-[11px] text-slate-500 font-mono">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                  {log.action}
                </span>
                <span className="text-slate-400">{log.description}</span>
              </div>

              {log.old_value && (
                <div className="text-[11px] text-slate-500 pt-1 font-mono">
                  Old: <span className="text-rose-400">{log.old_value}</span> → New: <span className="text-emerald-400">{log.new_value}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
