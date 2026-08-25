'use client';

import React, { useMemo } from 'react';
import { Code2, Eye, Bot, ShoppingCart, HardHat, Users } from 'lucide-react';
import { Role, Team, User } from '@/lib/types';
import {
  OrgNode,
  buildOrganizationTree,
  formatAccessCaption,
  hasTeamDescendant,
} from './orgHierarchy';
import { directoryStatus } from '@/lib/usersApi';

interface OrgChartProps {
  users: User[];
  teams: Team[];
  roles?: Role[];
  selectedId?: string | null;
  onSelectPerson: (user: User) => void;
  onSelectTeam: (team: Team) => void;
}

const ROLE_TONE: Record<string, string> = {
  CEO: 'bg-gradient-to-b from-[#163A6B] to-[#0B1F3A]',
  PROJECT_MANAGER: 'bg-gradient-to-b from-[#163A6B] to-[#0B1F3A]',
  CTO: 'bg-gradient-to-b from-teal-600 to-teal-800',
  BUSINESS_HEAD: 'bg-gradient-to-b from-violet-600 to-purple-800',
  ENG_DIRECTOR: 'bg-gradient-to-b from-[#1E4B8A] to-[#163A6B]',
};

const TEAM_STYLE: Record<string, { bg: string; icon: React.ReactNode }> = {
  SOFTWARE: { bg: 'from-[#1F7A4D] to-[#166534]', icon: <Code2 className="h-5 w-5" /> },
  VISION: { bg: 'from-[#0F766E] to-[#115E59]', icon: <Eye className="h-5 w-5" /> },
  ROBOTICS: {
    bg: 'from-[#EA580C] to-[#C2410C]',
    icon: (
      <span className="flex items-center -space-x-1">
        <Bot className="h-4 w-4" />
        <Bot className="h-4 w-4" />
      </span>
    ),
  },
  PROCUREMENT: { bg: 'from-[#2563EB] to-[#1D4ED8]', icon: <ShoppingCart className="h-5 w-5" /> },
  EXECUTION: { bg: 'from-[#7C3AED] to-[#6D28D9]', icon: <HardHat className="h-5 w-5" /> },
};

const TEAM_FALLBACK = [
  'from-[#1F7A4D] to-[#166534]',
  'from-[#0F766E] to-[#115E59]',
  'from-[#EA580C] to-[#C2410C]',
  'from-[#2563EB] to-[#1D4ED8]',
  'from-[#7C3AED] to-[#6D28D9]',
];

function Stem() {
  return <div className="h-4 w-px bg-slate-400" />;
}

function BranchGroup({
  count,
  children,
}: {
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      <Stem />
      {count > 1 && (
        <div className="relative w-full">
          <div className="absolute left-[12%] right-[12%] top-0 h-px bg-slate-400" />
        </div>
      )}
      <div className="grid w-full gap-1.5 sm:gap-2" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
        {React.Children.map(children, (child, index) => (
          <div key={index} className="flex min-w-0 flex-col items-center">
            {count > 1 ? <Stem /> : null}
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonCard({
  title,
  subtitle,
  access,
  roleCode,
  selected,
  pending,
  pendingLabel,
  onClick,
}: {
  title: string;
  subtitle: string;
  access: string;
  roleCode?: string;
  selected: boolean;
  pending?: boolean;
  pendingLabel?: string;
  onClick: () => void;
}) {
  const tone = pending
    ? 'bg-gradient-to-b from-amber-600 to-amber-800'
    : ROLE_TONE[roleCode || ''] || 'bg-gradient-to-b from-slate-600 to-slate-800';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full max-w-[148px] rounded-lg px-2 py-2 text-center text-white shadow-sm transition ${tone} ${
        selected ? 'ring-2 ring-amber-300 ring-offset-1' : 'hover:brightness-110'
      }`}
    >
      <div className="text-[11px] font-bold leading-tight">{title}</div>
      <div className="mt-0.5 text-[10px] font-semibold opacity-95">{subtitle}</div>
      <div className="mt-0.5 text-[9px] font-medium leading-tight opacity-85">
        {pending ? `Signup · ${pendingLabel || 'Pending invitation'}` : formatAccessCaption(access)}
      </div>
    </button>
  );
}

function TeamCard({
  team,
  subtitle,
  selected,
  onClick,
}: {
  team: Team;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}) {
  const style = TEAM_STYLE[team.code] || {
    bg: TEAM_FALLBACK[Math.abs(team.id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)) % TEAM_FALLBACK.length],
    icon: <Users className="h-5 w-5" />,
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg bg-gradient-to-b ${style.bg} px-1.5 py-2.5 text-center text-white shadow-sm transition ${
        selected ? 'ring-2 ring-amber-300 ring-offset-1' : 'hover:brightness-110'
      }`}
    >
      <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-md bg-white/15">{style.icon}</div>
      <div className="min-h-[28px] text-[10px] font-bold leading-tight">{team.name}</div>
      <div className="mt-1.5 border-t border-white/25 pt-1.5 text-[8px] font-semibold uppercase tracking-wide text-white/90">
        {subtitle}
      </div>
    </button>
  );
}

function PersonBranch({
  node,
  users,
  teams,
  selectedId,
  onSelectPerson,
  onSelectTeam,
}: {
  node: OrgNode;
  users: User[];
  teams: Team[];
  selectedId?: string | null;
  onSelectPerson: (user: User) => void;
  onSelectTeam: (team: Team) => void;
}) {
  const user = users.find((item) => item.id === node.userId);
  const people = node.children.filter((child) => child.kind === 'person');
  const teamNodes = node.children.filter((child) => child.kind === 'team');
  const staff = people.filter((child) => !hasTeamDescendant(child));
  const operators = people.filter((child) => hasTeamDescendant(child));

  return (
    <div className="flex w-full flex-col items-center">
      {user && (
        <PersonCard
          title={node.title}
          subtitle={node.subtitle}
          access={node.access}
          roleCode={node.roleCode}
          selected={selectedId === user.id}
          pending={directoryStatus(user).pending}
          pendingLabel={directoryStatus(user).label}
          onClick={() => onSelectPerson(user)}
        />
      )}

      {staff.length > 0 && (
        <div className="w-full max-w-[560px]">
          <BranchGroup count={staff.length}>
            {staff.map((child) => (
              <PersonBranch
                key={child.id}
                node={child}
                users={users}
                teams={teams}
                selectedId={selectedId}
                onSelectPerson={onSelectPerson}
                onSelectTeam={onSelectTeam}
              />
            ))}
          </BranchGroup>
        </div>
      )}

      {operators.length > 0 && <Stem />}

      {operators.map((child) => (
        <PersonBranch
          key={child.id}
          node={child}
          users={users}
          teams={teams}
          selectedId={selectedId}
          onSelectPerson={onSelectPerson}
          onSelectTeam={onSelectTeam}
        />
      ))}

      {teamNodes.length > 0 && (
        <div className="w-full">
          <BranchGroup count={teamNodes.length}>
            {teamNodes.map((child) => {
              const team = teams.find((item) => item.id === child.teamId);
              if (!team) return null;
              const reports = child.children.filter((item) => item.kind === 'person');
              return (
                <div key={child.id} className="flex w-full min-w-0 flex-col items-center">
                  <TeamCard
                    team={team}
                    subtitle={child.subtitle || 'Team Lead / Members'}
                    selected={selectedId === team.id}
                    onClick={() => onSelectTeam(team)}
                  />
                  {reports.length > 0 && (
                    <div className="w-full">
                      <BranchGroup count={reports.length}>
                        {reports.map((person) => (
                          <PersonBranch
                            key={person.id}
                            node={person}
                            users={users}
                            teams={teams}
                            selectedId={selectedId}
                            onSelectPerson={onSelectPerson}
                            onSelectTeam={onSelectTeam}
                          />
                        ))}
                      </BranchGroup>
                    </div>
                  )}
                </div>
              );
            })}
          </BranchGroup>
        </div>
      )}
    </div>
  );
}

export default function OrgChart({ users, teams, roles = [], selectedId, onSelectPerson, onSelectTeam }: OrgChartProps) {
  const tree = useMemo(() => buildOrganizationTree(users, teams, roles), [users, teams, roles]);

  if (tree.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
        No active employees available to build the organization hierarchy.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="rounded-t-2xl bg-[#0B1F3A] px-3 py-2 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-white">
        1. Organizational Hierarchy & Access Scope
      </div>

      <div className="border-x border-b border-slate-200 bg-[#F7FAFD] px-3 py-4">
        <div className="flex flex-col items-center gap-6">
          {tree.map((root) => (
            <PersonBranch
              key={root.id}
              node={root}
              users={users}
              teams={teams}
              selectedId={selectedId}
              onSelectPerson={onSelectPerson}
              onSelectTeam={onSelectTeam}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
