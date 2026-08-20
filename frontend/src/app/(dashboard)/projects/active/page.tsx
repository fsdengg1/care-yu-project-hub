'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bot } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Project } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { isCeoViewOnly } from '@/lib/rbac';

export default function ActiveProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [viewOnly, setViewOnly] = useState(false);

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    setViewOnly(isCeoViewOnly(user));
    (async () => {
      const result = await apiRequest<{ projects: Project[] }>('/api/projects');
      if (result.ok) setProjects(result.data.projects.filter((p) => p.status === 'ACTIVE'));
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <Bot className="h-4 w-4" /> Project Visibility
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Active Projects</h1>
        <p className="mt-1 text-xs text-slate-400">
          {viewOnly
            ? 'Management view of execution health, owners, and blockers. Operational updates are handled by PM and teams.'
            : 'Active execution projects across Care Yu Automation.'}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="p-3">Project</th>
              <th className="p-3">Customer</th>
              <th className="p-3">PM</th>
              <th className="p-3">Progress</th>
              <th className="p-3">Health</th>
              <th className="p-3">Issue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {projects.map((project) => (
              <tr key={project.id} className="hover:bg-slate-800/40">
                <td className="p-3 font-semibold text-slate-100">{project.name}</td>
                <td className="p-3">{project.customer_name}</td>
                <td className="p-3">{project.pm_name}</td>
                <td className="p-3">{project.progress}%</td>
                <td className="p-3">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                      project.health === 'CRITICAL'
                        ? 'border-rose-800 bg-rose-950 text-rose-300'
                        : project.health === 'AT_RISK'
                          ? 'border-amber-800 bg-amber-950 text-amber-300'
                          : 'border-emerald-800 bg-emerald-950 text-emerald-300'
                    }`}
                  >
                    {project.health.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-3 text-slate-400">{project.issue || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
