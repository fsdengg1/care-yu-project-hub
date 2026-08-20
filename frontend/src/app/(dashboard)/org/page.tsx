'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Plus,
  Search,
  Users,
  FolderKanban,
  UserCheck,
  Filter,
} from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { Role, Team, User } from '@/lib/types';
import OrgTree from '@/components/org/OrgTree';
import OrgDetailsPanel from '@/components/org/OrgDetailsPanel';
import EmployeeActionModal, {
  EmployeeForm,
  EmployeeModalMode,
} from '@/components/org/EmployeeActionModal';
import {
  OrgNode,
  ORG_ADMIN_ROLES,
  buildOrganizationTree,
  collectExpandableIds,
  defaultExpandedIds,
  filterOrganizationTree,
} from '@/components/org/orgHierarchy';

type Selection =
  | { kind: 'person'; nodeId: string; userId: string; reportingContextId?: string }
  | { kind: 'team'; nodeId: string; teamId: string }
  | null;

const ACTIVE_PROJECT_STATUSES = new Set([
  'SUBMITTED_TO_PM',
  'UNDER_PM_REVIEW',
  'ADDITIONAL_INFORMATION_REQUIRED',
  'RESUBMITTED_TO_PM',
  'ACCEPTED_FOR_FEASIBILITY',
  'FEASIBILITY_IN_PROGRESS',
]);

export default function OrganizationManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [teamFilter, setTeamFilter] = useState('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<EmployeeModalMode>('add');
  const [activeProjects, setActiveProjects] = useState(0);
  const [teamStats, setTeamStats] = useState<
    Record<string, { activeProjects: number; pendingTasks: number; completedTasks: number }>
  >({});

  const reload = () => {
    const nextUsers = StorageService.getUsers();
    const nextTeams = StorageService.getTeams();
    setUsers(nextUsers);
    setTeams(nextTeams);
    setRoles(StorageService.getRoles());
    setCurrentUser(StorageService.getCurrentUser());

    const leads = StorageService.getLeads();
    setActiveProjects(leads.filter((lead) => ACTIVE_PROJECT_STATUSES.has(lead.status)).length);

    const assignments = StorageService.getFeasibilityTeamAssignments();
    const tasks = StorageService.getTasks();
    const stats: Record<string, { activeProjects: number; pendingTasks: number; completedTasks: number }> = {};

    nextTeams.forEach((team) => {
      const memberIds = new Set(nextUsers.filter((u) => u.team_id === team.id).map((u) => u.id));
      const teamAssignments = assignments.filter(
        (a) => a.team_id === team.id && !['COMPLETED', 'CANCELLED'].includes(a.status)
      );
      const uniqueLeads = new Set(teamAssignments.map((a) => a.lead_id));
      const teamTasks = tasks.filter((task) => memberIds.has(task.assigned_to_id));
      stats[team.id] = {
        activeProjects: uniqueLeads.size,
        pendingTasks: teamTasks.filter((task) => task.status !== 'DONE').length,
        completedTasks: teamTasks.filter((task) => task.status === 'DONE').length,
      };
    });
    setTeamStats(stats);
  };

  useEffect(() => {
    reload();
  }, []);

  const fullTree = useMemo(() => buildOrganizationTree(users, teams), [users, teams]);
  const filteredTree = useMemo(
    () => filterOrganizationTree(fullTree, search, roleFilter, teamFilter, users),
    [fullTree, search, roleFilter, teamFilter, users]
  );

  useEffect(() => {
    if (fullTree.length === 0) return;
    if (search || roleFilter !== 'ALL' || teamFilter !== 'ALL') {
      setExpandedIds(collectExpandableIds(filteredTree));
      return;
    }
    setExpandedIds(defaultExpandedIds(fullTree));
    // Keep manual expand/collapse unless search or filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, roleFilter, teamFilter, fullTree.length]);

  const canManage = Boolean(currentUser && ORG_ADMIN_ROLES.has(currentUser.role_code));
  const selectedUser = selection?.kind === 'person' ? users.find((u) => u.id === selection.userId) : undefined;
  const selectedTeam = selection?.kind === 'team' ? teams.find((t) => t.id === selection.teamId) : undefined;

  const managerName = (() => {
    if (!selectedUser) return '—';
    const contextId = selection?.kind === 'person' ? selection.reportingContextId : undefined;
    const manager = users.find((u) => u.id === (contextId || selectedUser.reporting_manager_id));
    return manager?.name || '—';
  })();

  const handleToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelect = (node: OrgNode) => {
    if (node.kind === 'person' && node.userId) {
      setSelection({
        kind: 'person',
        nodeId: node.id,
        userId: node.userId,
        reportingContextId: node.reportingContextId,
      });
      return;
    }
    if (node.kind === 'team' && node.teamId) {
      setSelection({ kind: 'team', nodeId: node.id, teamId: node.teamId });
    }
  };

  const openModal = (mode: EmployeeModalMode) => {
    setModalMode(mode);
    setModalOpen(true);
  };

  const persistUsers = (nextUsers: User[], description: string, entityId: string) => {
    StorageService.saveUsers(nextUsers);
    setUsers(nextUsers);
    if (currentUser) {
      StorageService.logAudit({
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.role_name,
        entity_type: 'USER',
        entity_id: entityId,
        action: 'ORG_EMPLOYEE_UPDATED',
        description,
      });
    }
  };

  const syncTeamMembership = (nextUsers: User[], previous?: User, next?: User) => {
    let nextTeams = [...teams];
    const recount = (teamId?: string) => {
      if (!teamId) return;
      nextTeams = nextTeams.map((team) =>
        team.id === teamId
          ? { ...team, member_count: nextUsers.filter((u) => u.team_id === team.id).length }
          : team
      );
    };

    if (previous?.team_id && previous.team_id !== next?.team_id) {
      nextTeams = nextTeams.map((team) =>
        team.id === previous.team_id && team.team_lead_id === previous.id
          ? { ...team, team_lead_id: undefined, team_lead_name: 'Not Assigned' }
          : team
      );
      recount(previous.team_id);
    }

    if (next?.team_id) {
      recount(next.team_id);
      if (next.role_code === 'TEAM_LEAD') {
        nextTeams = nextTeams.map((team) =>
          team.id === next.team_id
            ? { ...team, team_lead_id: next.id, team_lead_name: next.name }
            : team
        );
      }
    }

    StorageService.saveTeams(nextTeams);
    setTeams(nextTeams);
  };

  const applyEmployeeForm = (form: EmployeeForm) => {
    const selectedRole = roles.find((r) => r.id === form.role_id);
    const selectedTeam = teams.find((t) => t.id === form.team_id);
    const teamLead = selectedTeam
      ? users.find((u) => u.id === selectedTeam.team_lead_id)
      : undefined;

    if (modalMode === 'add') {
      const newUser: User = {
        id: `u-${Date.now()}`,
        employee_id: form.employee_id || `CYA-${Math.floor(100 + Math.random() * 900)}`,
        name: form.name,
        email: form.email,
        phone: form.phone || '',
        role_id: form.role_id,
        role_code: selectedRole?.code || 'EMPLOYEE',
        role_name: selectedRole?.name || 'Team Member',
        team_id: selectedTeam?.id,
        team_name: selectedTeam?.name,
        team_lead_id: teamLead?.id,
        team_lead_name: teamLead?.name,
        reporting_manager_id: form.reporting_manager_id || undefined,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const nextUsers = [newUser, ...users];
      persistUsers(nextUsers, `Added employee ${newUser.name} (${newUser.role_name})`, newUser.id);
      syncTeamMembership(nextUsers, undefined, newUser);
      setSelection({ kind: 'person', nodeId: `person-${newUser.id}`, userId: newUser.id });
      setModalOpen(false);
      return;
    }

    if (!selectedUser) return;

    const updated: User = {
      ...selectedUser,
      name: modalMode === 'edit' ? form.name : selectedUser.name,
      email: modalMode === 'edit' ? form.email : selectedUser.email,
      phone: modalMode === 'edit' ? form.phone : selectedUser.phone,
      employee_id: modalMode === 'edit' ? form.employee_id || selectedUser.employee_id : selectedUser.employee_id,
      role_id: modalMode === 'edit' || modalMode === 'role' ? form.role_id : selectedUser.role_id,
      role_code:
        modalMode === 'edit' || modalMode === 'role'
          ? selectedRole?.code || selectedUser.role_code
          : selectedUser.role_code,
      role_name:
        modalMode === 'edit' || modalMode === 'role'
          ? selectedRole?.name || selectedUser.role_name
          : selectedUser.role_name,
      team_id: modalMode === 'edit' || modalMode === 'team' ? selectedTeam?.id : selectedUser.team_id,
      team_name: modalMode === 'edit' || modalMode === 'team' ? selectedTeam?.name : selectedUser.team_name,
      team_lead_id:
        modalMode === 'edit' || modalMode === 'team' ? teamLead?.id : selectedUser.team_lead_id,
      team_lead_name:
        modalMode === 'edit' || modalMode === 'team' ? teamLead?.name : selectedUser.team_lead_name,
      reporting_manager_id:
        modalMode === 'edit' || modalMode === 'manager'
          ? form.reporting_manager_id || undefined
          : selectedUser.reporting_manager_id,
      status: modalMode === 'edit' ? form.status : selectedUser.status,
      updated_at: new Date().toISOString(),
    };

    const nextUsers = users.map((u) => (u.id === updated.id ? updated : u));
    persistUsers(nextUsers, `Updated ${updated.name} from Organization Management`, updated.id);
    syncTeamMembership(nextUsers, selectedUser, updated);
    setModalOpen(false);
  };

  const handleToggleStatus = () => {
    if (!selectedUser) return;
    const nextStatus = selectedUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = { ...selectedUser, status: nextStatus as 'ACTIVE' | 'INACTIVE', updated_at: new Date().toISOString() };
    const nextUsers = users.map((u) => (u.id === updated.id ? updated : u));
    persistUsers(
      nextUsers,
      `${nextStatus === 'ACTIVE' ? 'Activated' : 'Deactivated'} employee ${updated.name}`,
      updated.id
    );
  };

  const teamMembers = selectedTeam ? users.filter((u) => u.team_id === selectedTeam.id) : [];
  const stats = selectedTeam ? teamStats[selectedTeam.id] : undefined;

  return (
    <div className="-m-6 min-h-full bg-[#F4F7FB] p-6 text-slate-800">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            <Building2 className="h-4 w-4" />
            Careyu Automation
          </div>
          <h1 className="mt-1 text-2xl font-bold text-[#0B1F3A]">Organization Management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage organizational hierarchy, teams and role-based access.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setSelection(null);
              openModal('add');
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#0B1F3A] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#132a4d]"
          >
            <Plus className="h-4 w-4" /> Add Employee
          </button>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total Employees', value: users.filter((u) => u.role_code !== 'SYSTEM_ADMIN').length, icon: Users },
          { label: 'Teams', value: teams.length, icon: Building2 },
          { label: 'Active Projects', value: activeProjects, icon: FolderKanban },
          {
            label: 'Active Members',
            value: users.filter((u) => u.status === 'ACTIVE' && u.role_code !== 'SYSTEM_ADMIN').length,
            icon: UserCheck,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{card.label}</span>
                <Icon className="h-4 w-4 text-blue-600" />
              </div>
              <div className="mt-2 text-2xl font-bold text-[#0B1F3A]">{card.value}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee, role or team"
            className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] py-2.5 pl-9 pr-3 text-sm text-[#0B1F3A] outline-none placeholder:text-slate-400 focus:border-blue-500"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-sm">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent text-sm text-[#0B1F3A] outline-none"
            >
              <option value="ALL">Filter Role</option>
              {roles
                .filter((role) => role.code !== 'SYSTEM_ADMIN')
                .map((role) => (
                  <option key={role.id} value={role.code}>
                    {role.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-2 text-sm">
            <Users className="h-4 w-4 text-slate-400" />
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="bg-transparent text-sm text-[#0B1F3A] outline-none"
            >
              <option value="ALL">Filter Team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#0B1F3A]">Organization overview</h2>
              <p className="text-xs text-slate-500">Expand a node to view reporting lines. Click a person or team for details.</p>
            </div>
          </div>
          <OrgTree
            nodes={filteredTree}
            users={users}
            expandedIds={expandedIds}
            selectedId={selection?.nodeId || null}
            onToggle={handleToggle}
            onSelect={handleSelect}
          />
        </section>

        <div className="xl:sticky xl:top-4 xl:h-[calc(100vh-8rem)]">
          <OrgDetailsPanel
            person={
              selectedUser
                ? { user: selectedUser, managerName }
                : null
            }
            team={
              selectedTeam
                ? {
                    team: selectedTeam,
                    leadName: selectedTeam.team_lead_name || 'Not Assigned',
                    members: teamMembers,
                    memberCount: teamMembers.length,
                    activeProjects: stats?.activeProjects || 0,
                    pendingTasks: stats?.pendingTasks || 0,
                    completedTasks: stats?.completedTasks || 0,
                  }
                : null
            }
            canManage={canManage}
            onEditEmployee={() => openModal('edit')}
            onAssignRole={() => openModal('role')}
            onAssignTeam={() => openModal('team')}
            onChangeManager={() => openModal('manager')}
            onToggleStatus={handleToggleStatus}
          />
        </div>
      </div>

      <EmployeeActionModal
        open={modalOpen}
        mode={modalMode}
        roles={roles}
        teams={teams}
        users={users}
        employee={modalMode === 'add' ? null : selectedUser}
        onClose={() => setModalOpen(false)}
        onSubmit={applyEmployeeForm}
      />
    </div>
  );
}
