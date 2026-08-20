'use client';

import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  User,
  Users,
  Briefcase,
  Cpu,
  Crown,
} from 'lucide-react';
import { OrgNode, MANAGEMENT_ROLES } from './orgHierarchy';
import { User as UserType } from '@/lib/types';

interface OrgTreeProps {
  nodes: OrgNode[];
  users: UserType[];
  expandedIds: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (node: OrgNode) => void;
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function RoleIcon({ roleCode, kind }: { roleCode?: string; kind: OrgNode['kind'] }) {
  if (kind === 'team') return <Users className="h-3.5 w-3.5" />;
  if (roleCode === 'CEO') return <Crown className="h-3.5 w-3.5" />;
  if (roleCode === 'CTO') return <Cpu className="h-3.5 w-3.5" />;
  if (roleCode && MANAGEMENT_ROLES.has(roleCode)) return <Briefcase className="h-3.5 w-3.5" />;
  return <User className="h-3.5 w-3.5" />;
}

function OrgTreeItem({
  node,
  users,
  expandedIds,
  selectedId,
  onToggle,
  onSelect,
}: {
  node: OrgNode;
  users: UserType[];
  expandedIds: Set<string>;
  selectedId: string | null;
  onToggle: (id: string) => void;
  onSelect: (node: OrgNode) => void;
}) {
  const user = node.userId ? users.find((u) => u.id === node.userId) : undefined;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const isTeam = node.kind === 'team';
  const isManagement = Boolean(node.roleCode && MANAGEMENT_ROLES.has(node.roleCode));
  const isInactive = user?.status === 'INACTIVE';

  return (
    <div>
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-label={hasChildren ? (isExpanded ? 'Collapse' : 'Expand') : 'No nested roles'}
          disabled={!hasChildren}
          onClick={() => hasChildren && onToggle(node.id)}
          className={`mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
            hasChildren
              ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              : 'cursor-default text-transparent'
          }`}
        >
          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={() => onSelect(node)}
          className={`min-w-0 flex-1 rounded-xl border px-3 py-2.5 text-left shadow-sm transition-all ${
            isSelected
              ? isTeam
                ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100'
                : 'border-blue-400 bg-blue-50 ring-2 ring-blue-100'
              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow'
          } ${isInactive ? 'opacity-70' : ''}`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${
                isTeam
                  ? 'bg-emerald-100 text-emerald-700'
                  : isManagement
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-[#0B1F3A]'
              }`}
            >
              {isTeam ? <RoleIcon kind={node.kind} roleCode={node.roleCode} /> : initials(node.title)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-semibold text-[#0B1F3A]">{node.title}</span>
                {isTeam ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Active team
                  </span>
                ) : (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      isManagement ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {node.subtitle}
                  </span>
                )}
                {user && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      user.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {user.status === 'ACTIVE' ? 'Active' : 'Inactive'}
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-slate-500">
                {isTeam
                  ? node.subtitle
                  : [user?.team_name, user?.email].filter(Boolean).join(' · ') || 'Organization leadership'}
              </div>
            </div>
            <div
              className={`hidden shrink-0 rounded-md p-1.5 sm:block ${
                isTeam ? 'text-emerald-600' : isManagement ? 'text-blue-600' : 'text-slate-400'
              }`}
            >
              <RoleIcon kind={node.kind} roleCode={node.roleCode} />
            </div>
          </div>
        </button>
      </div>

      {isExpanded && hasChildren && (
        <div className="ml-4 mt-2 space-y-2 border-l-2 border-slate-200 pl-3 sm:ml-7">
          {node.children.map((child) => (
            <OrgTreeItem
              key={child.id}
              node={child}
              users={users}
              expandedIds={expandedIds}
              selectedId={selectedId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OrgTree({
  nodes,
  users,
  expandedIds,
  selectedId,
  onToggle,
  onSelect,
}: OrgTreeProps) {
  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center text-sm text-slate-500">
        No matching employees, roles or teams.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {nodes.map((node) => (
        <OrgTreeItem
          key={node.id}
          node={node}
          users={users}
          expandedIds={expandedIds}
          selectedId={selectedId}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
