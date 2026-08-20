'use client';

import React, { useEffect, useState } from 'react';
import { GanttChartSquare } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Project } from '@/lib/types';

export default function ProjectPlanningPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    (async () => {
      const result = await apiRequest<{ projects: Project[] }>('/api/projects');
      if (result.ok) setProjects(result.data.projects.filter((p) => p.status === 'ACTIVE'));
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <GanttChartSquare className="h-4 w-4" /> Project Visibility
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Project Gantt & Planning</h1>
        <p className="mt-1 text-xs text-slate-400">Read-only progress view across active execution projects.</p>
      </div>

      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        {projects.map((project) => (
          <div key={project.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-100">
                {project.customer_name} – {project.name}
              </span>
              <span className="text-slate-400">{project.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-800">
              <div
                className={`h-full ${
                  project.health === 'CRITICAL' ? 'bg-rose-500' : project.health === 'AT_RISK' ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
                style={{ width: `${project.progress}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
