'use client';

import React, { useState, useEffect } from 'react';
import { StorageService } from '@/lib/storage';
import { apiRequest } from '@/lib/api';
import { AuditLog } from '@/lib/types';
import { History } from 'lucide-react';

export default function AuditTrailPage() {
  const [audits, setAudits] = useState<AuditLog[]>([]);

  useEffect(() => {
    (async () => {
      const result = await apiRequest<{ audits: AuditLog[] }>('/api/audit-logs');
      setAudits(result.ok ? result.data.audits : StorageService.getAudits());
    })();
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

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="pb-2 pr-3">Time</th>
                <th className="pb-2 pr-3">User</th>
                <th className="pb-2 pr-3">Action</th>
                <th className="pb-2 pr-3">Entity</th>
                <th className="pb-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {audits.map((log) => (
                <tr key={log.id} className="align-top">
                  <td className="py-3 pr-3 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-bold text-slate-100">{log.user_name}</div>
                    <div className="text-[10px] text-slate-500">{log.user_role}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                      {log.action}
                    </span>
                  </td>
                  <td className="py-3 pr-3 text-slate-200">
                    {log.entity_name || log.entity_type.replace(/_/g, ' ')}
                  </td>
                  <td className="py-3 text-slate-400">
                    {log.description}
                    {log.old_value && (
                      <div className="mt-1 font-mono text-[11px] text-slate-500">
                        Old: <span className="text-rose-400">{log.old_value}</span> → New:{' '}
                        <span className="text-emerald-400">{log.new_value}</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
