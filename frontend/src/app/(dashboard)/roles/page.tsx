'use client';

import React, { useState, useEffect } from 'react';
import { StorageService } from '@/lib/storage';
import { Role } from '@/lib/types';
import { ShieldCheck, ShieldAlert, Check, Lock } from 'lucide-react';

export default function RolesPermissionsPage() {
  const [roles, setRoles] = useState<Role[]>([]);

  useEffect(() => {
    setRoles(StorageService.getRoles());
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
          <ShieldAlert className="w-4 h-4" /> Role-Based Access Control (RBAC)
        </div>
        <h1 className="text-xl font-bold text-slate-100 mt-1">10 System Roles & Permission Matrix</h1>
        <p className="text-xs text-slate-400 mt-1">
          Defined access boundaries for CEO, Business Head, Engineering Director, Project Manager, Project Engineer, Team Lead, Employee, Sales, Procurement, and System Admin.
        </p>
      </div>

      {/* Roles Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {roles.map(r => (
          <div key={r.id} className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-cyan-400" />
                <h3 className="font-bold text-slate-100 text-sm">{r.name}</h3>
              </div>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                {r.code}
              </span>
            </div>
            <p className="text-xs text-slate-400">{r.description}</p>
            <div className="pt-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Key Authority & Permissions</div>
              <div className="flex flex-wrap gap-1.5">
                {r.permissions.map((p, idx) => (
                  <span key={idx} className="text-[10px] px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 flex items-center gap-1">
                    <Check className="w-3 h-3 text-cyan-400" /> {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
