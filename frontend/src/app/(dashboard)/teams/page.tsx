'use client';

import React, { useState, useEffect } from 'react';
import { StorageService } from '@/lib/storage';
import { Team, User } from '@/lib/types';
import { MANAGEMENT_ROLES, isDisplayedTeamMember } from '@/components/org/orgHierarchy';
import { Users, Plus, ShieldCheck, UserCheck, Cpu, HardHat, Camera, Bot, Wrench, ShoppingBag } from 'lucide-react';
import { UsersApi, directoryStatus } from '@/lib/usersApi';
import { apiRequest } from '@/lib/api';

const TEAM_ICONS: Record<string, React.ReactNode> = {
  SOFTWARE: <Cpu className="w-5 h-5 text-cyan-400" />,
  VISION: <Camera className="w-5 h-5 text-amber-400" />,
  ROBOTICS: <Bot className="w-5 h-5 text-indigo-400" />,
  EXECUTION: <Wrench className="w-5 h-5 text-emerald-400" />,
  PROCUREMENT: <ShoppingBag className="w-5 h-5 text-purple-400" />
};

export default function FunctionalTeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    void (async () => {
      const result = await UsersApi.list();
      const next = result.ok ? result.users : StorageService.getUsers();
      if (result.ok) StorageService.saveUsers(next);
      setUsers(next);
      const teamsResult = await apiRequest<{ teams: Team[] }>('/api/teams');
      setTeams(teamsResult.ok ? teamsResult.data.teams : StorageService.getTeams());
      if (teamsResult.ok) StorageService.saveTeams(teamsResult.data.teams);
    })();
  }, []);

  const functionalMembers = users.filter(
    (u) => u.team_id && u.status === 'ACTIVE' && u.role_code !== 'SYSTEM_ADMIN'
  ).length;
  const managementMembers = users.filter(
    (u) => MANAGEMENT_ROLES.has(u.role_code) && u.status === 'ACTIVE'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <Users className="w-4 h-4" /> Functional Organization
          </div>
          <h1 className="text-xl font-bold text-slate-100 mt-1">Functional Engineering Teams</h1>
          <p className="text-xs text-slate-400 mt-1">
            All functional employees are assigned to one of five delivery teams. Executive and management roles are excluded from functional team headcount.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 px-4 py-3 text-xs text-slate-300">
        <span className="font-semibold text-slate-100">{functionalMembers} functional team members</span>
        {' + '}
        <span className="font-semibold text-slate-100">{managementMembers} management</span>
        {' = '}
        <span className="font-semibold text-cyan-300">{functionalMembers + managementMembers} total employees</span>
        <span className="text-slate-500"> · matches Organization Management</span>
      </div>

      {/* Team Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {teams.map(t => {
          const teamLead = users.find(u => u.id === t.team_lead_id);
          const teamMembers = users.filter((u) => isDisplayedTeamMember(u, t, users) || u.id === t.team_lead_id);

          return (
            <div key={t.id} className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4 shadow-sm flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                      {TEAM_ICONS[t.code] || <Users className="w-5 h-5 text-cyan-400" />}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-100 text-sm">{t.name}</h3>
                      <span className="text-[10px] text-slate-400 font-mono uppercase">{t.code}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">
                    ACTIVE
                  </span>
                </div>

                <p className="text-xs text-slate-400 leading-relaxed">{t.description}</p>

                {/* Team Lead Highlight */}
                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-lg text-xs">
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Designated Team Lead</div>
                  <div className="font-semibold text-cyan-300 mt-0.5 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                    {teamLead ? teamLead.name : t.team_lead_name || 'Unassigned'}
                  </div>
                </div>
              </div>

              {/* Members List Teaser */}
              <div className="pt-3 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                  <span>Assigned Members</span>
                  <span className="font-bold text-slate-200">{teamMembers.filter((u) => u.role_code !== 'TEAM_LEAD').length} members</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {teamMembers.filter((u) => u.role_code !== 'TEAM_LEAD').length === 0 ? (
                    <p className="text-[11px] text-slate-500">No team members yet. You can add them later.</p>
                  ) : (
                    teamMembers.filter((u) => u.role_code !== 'TEAM_LEAD').map(m => (
                    <span key={m.id} className={`text-[10px] px-2 py-0.5 rounded border ${
                      directoryStatus(m).pending
                        ? 'bg-amber-950 text-amber-300 border-amber-800/60'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}>
                      {m.name}{directoryStatus(m).pending ? ' · Signup' : ''}
                    </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
