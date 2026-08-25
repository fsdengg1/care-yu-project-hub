'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bot, Inbox, Search } from 'lucide-react';
import { ProjectsApi } from '@/lib/projectsApi';
import { Project, ProjectHealth, User } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { canOpenProjectGantt, canPerformPmOperations, isCeoViewOnly } from '@/lib/rbac';
import { formatLongDate } from '@/lib/format';

type SortKey = 'progress' | 'health' | 'target' | 'updated';

const HEALTH_ORDER: Record<string, number> = { CRITICAL: 0, AT_RISK: 1, ON_TRACK: 2 };

function healthClass(health: string) {
  if (health === 'CRITICAL') return 'border-rose-800 bg-rose-950 text-rose-300';
  if (health === 'AT_RISK') return 'border-amber-800 bg-amber-950 text-amber-300';
  return 'border-emerald-800 bg-emerald-950 text-emerald-300';
}

export default function ActiveProjectsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [health, setHealth] = useState('');
  const [pm, setPm] = useState('');
  const [team, setTeam] = useState('');
  const [status, setStatus] = useState<'ACTIVE' | 'ON_HOLD' | 'ALL'>('ACTIVE');
  const [sort, setSort] = useState<SortKey>('health');
  const [summary, setSummary] = useState<{ total: number; onTrack: number; atRisk: number; critical: number } | null>(null);

  const viewOnly = isCeoViewOnly(user) || ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'CTO'].includes(user?.role_code || '');
  const isPm = canPerformPmOperations(user);

  const load = async (nextStatus: 'ACTIVE' | 'ON_HOLD' | 'ALL' = status) => {
    const result = await ProjectsApi.list(nextStatus === 'ALL' ? 'ALL' : nextStatus);
    if (!result.ok) {
      setError(result.message);
      setProjects([]);
      return;
    }
    setError(null);
    const rows = result.projects.filter((project) => nextStatus === 'ALL' ? project.status === 'ACTIVE' || project.status === 'ON_HOLD' : true);
    setProjects(rows.filter((project) => project.status !== 'COMPLETED' && project.status !== 'CANCELLED'));
    setSummary(result.summary);
  };

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    setUser(current);
    void load('ACTIVE');
  }, []);

  const managers = useMemo(() => [...new Set(projects.map((item) => item.pm_name).filter(Boolean))], [projects]);
  const teams = useMemo(() => StorageService.getTeams().filter((item) => item.status === 'ACTIVE'), []);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    let rows = [...projects];
    if (query) {
      rows = rows.filter((item) =>
        [item.name, item.customer_name, item.code, item.pm_name, item.issue]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      );
    }
    if (health) rows = rows.filter((item) => item.health === health);
    if (pm) rows = rows.filter((item) => item.pm_name === pm);
    if (team) rows = rows.filter((item) => (item.team_ids || []).includes(team));
    rows.sort((a, b) => {
      if (sort === 'progress') return b.progress - a.progress;
      if (sort === 'health') return (HEALTH_ORDER[a.health] ?? 9) - (HEALTH_ORDER[b.health] ?? 9);
      if (sort === 'target') return (a.target_completion || '').localeCompare(b.target_completion || '');
      return (b.last_update_at || b.updated_at).localeCompare(a.last_update_at || a.updated_at);
    });
    return rows;
  }, [projects, q, health, pm, team, sort]);

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <Bot className="h-4 w-4" /> Project Visibility
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Active Projects</h1>
        <p className="mt-1 text-xs text-slate-400">
          {viewOnly
            ? 'Management view of execution health, owners, and blockers. Operational updates are handled by PM and teams.'
            : isPm
              ? 'Execution projects assigned to you after order conversion. Open a project to review teams, daily updates, and blockers.'
              : 'Active execution projects linked to your assignments and teams.'}
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'On Track', value: summary.onTrack, color: 'text-emerald-300' },
            { label: 'At Risk', value: summary.atRisk, color: 'text-amber-300' },
            { label: 'Critical', value: summary.critical, color: 'text-rose-300' },
            { label: 'Active projects', value: summary.total, color: 'text-slate-100' },
          ].map((card) => (
            <button
              key={card.label}
              type="button"
              onClick={() => {
                if (card.label === 'On Track') setHealth('ON_TRACK');
                if (card.label === 'At Risk') setHealth('AT_RISK');
                if (card.label === 'Critical') setHealth('CRITICAL');
                if (card.label === 'Active projects') setHealth('');
              }}
              className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 text-left hover:border-cyan-800"
            >
              <div className="text-slate-400">{card.label}</div>
              <div className={`mt-2 text-2xl font-bold ${card.color}`}>{card.value}</div>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/90 p-3">
        <div className="relative">
          <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search project / customer"
            className="w-52 rounded-md border border-slate-800 bg-slate-950 py-1.5 pl-7 pr-3 text-slate-200 placeholder-slate-500"
          />
        </div>
        <select value={pm} onChange={(e) => setPm(e.target.value)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200">
          <option value="">All PMs</option>
          {managers.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
        <select value={health} onChange={(e) => setHealth(e.target.value as ProjectHealth | '')} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200">
          <option value="">All health</option>
          <option value="ON_TRACK">On Track</option>
          <option value="AT_RISK">At Risk</option>
          <option value="CRITICAL">Critical</option>
        </select>
        <select
          value={status}
          onChange={(e) => {
            const next = e.target.value as 'ACTIVE' | 'ON_HOLD' | 'ALL';
            setStatus(next);
            void load(next);
          }}
          className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200"
        >
          <option value="ACTIVE">In execution</option>
          <option value="ON_HOLD">On hold</option>
          <option value="ALL">Active + on hold</option>
        </select>
        <select value={team} onChange={(e) => setTeam(e.target.value)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200">
          <option value="">All teams</option>
          {teams.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-200">
          <option value="health">Sort: Health</option>
          <option value="progress">Sort: Progress</option>
          <option value="target">Sort: Target completion</option>
          <option value="updated">Sort: Latest update</option>
        </select>
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
              <th className="p-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {filtered.map((project) => (
              <tr key={project.id} className="hover:bg-slate-800/40">
                <td className="p-3">
                  <Link href={`/projects/${project.id}`} className="font-semibold text-slate-100 hover:text-cyan-300">
                    {project.name}
                  </Link>
                  <div className="font-mono text-[10px] text-slate-500">{project.code}</div>
                </td>
                <td className="p-3">{project.customer_name}</td>
                <td className="p-3">{project.pm_name}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded bg-slate-800">
                      <div
                        className={`h-full ${project.health === 'CRITICAL' ? 'bg-rose-500' : project.health === 'AT_RISK' ? 'bg-amber-400' : 'bg-emerald-500'}`}
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span>{project.progress}%</span>
                  </div>
                </td>
                <td className="p-3">
                  <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${healthClass(project.health)}`}>
                    {project.health.replace('_', ' ')}
                  </span>
                </td>
                <td className="p-3 text-slate-400">{project.issue || '—'}</td>
                <td className="p-3 text-right space-x-3">
                  <Link href={`/projects/${project.id}`} className="text-cyan-400 hover:underline">
                    Open
                  </Link>
                  {canOpenProjectGantt(user, project) && (
                    <Link href={`/projects/planning?project=${project.id}`} className="text-slate-400 hover:text-cyan-300">
                      Gantt
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && !error && (
          <div className="space-y-2 p-10 text-center text-slate-500">
            <Inbox className="mx-auto h-8 w-8 text-slate-600" />
            <p>No active execution projects for your role.</p>
            <p className="text-[11px]">Converted orders appear here automatically after order conversion.</p>
          </div>
        )}
      </div>
    </div>
  );
}
