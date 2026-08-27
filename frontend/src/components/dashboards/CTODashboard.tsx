'use client';

import React, { useEffect, useState } from 'react';
import { Cpu, Layers, ShieldCheck, Workflow } from 'lucide-react';
import { Team, User } from '@/lib/types';
import { apiRequest } from '@/lib/api';

export default function CTODashboard({ user }: { user: User }) {
  const [teamCount, setTeamCount] = useState(0);

  useEffect(() => {
    void (async () => {
      const result = await apiRequest<{ teams: Team[] }>('/api/teams');
      if (result.ok) {
        setTeamCount(result.data.teams.filter((team) => team.status === 'ACTIVE').length);
      }
    })();
  }, []);

  const cards = [
    { label: 'Engineering Workstreams', value: '0', note: 'No active technical streams', icon: Workflow },
    { label: 'Platform Delivery', value: '0', note: 'No in-flight platform work', icon: Layers },
    { label: 'Quality Gates', value: 'On Track', note: 'No open architecture risks', icon: ShieldCheck },
    { label: 'Teams Reporting', value: String(teamCount), note: teamCount ? 'Active functional teams' : 'No teams reporting yet', icon: Cpu },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-blue-950/40 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Cpu className="h-4 w-4" /> CTO Dashboard
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Welcome back, {user.name}</h1>
          <p className="mt-1 max-w-xl text-xs text-slate-400">
            Technology leadership across engineering delivery, architecture quality, and execution readiness.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{card.label}</span>
                <div className="rounded-lg border border-blue-800/40 bg-blue-950 p-2 text-blue-400">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-100">{card.value}</div>
              <div className="mt-1 text-[11px] text-slate-500">{card.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
