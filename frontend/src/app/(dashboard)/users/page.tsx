'use client';

import React, { useState, useEffect } from 'react';
import { StorageService } from '@/lib/storage';
import { User, Role, Team } from '@/lib/types';
import { 
  Users, 
  UserPlus, 
  Search, 
  Edit3, 
  UserCheck, 
  UserX, 
  ShieldCheck, 
  Check, 
  X,
  Filter
} from 'lucide-react';

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    employee_id: '',
    role_id: '',
    team_id: '',
    reporting_manager_id: ''
  });

  useEffect(() => {
    setUsers(StorageService.getUsers());
    setRoles(StorageService.getRoles());
    setTeams(StorageService.getTeams());
  }, []);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.role_id) return;

    const selectedRole = roles.find(r => r.id === formData.role_id);
    const selectedTeam = teams.find(t => t.id === formData.team_id);
    const currentUser = StorageService.getCurrentUser();
    if (!currentUser) return;

    const newUser: User = {
      id: `u-${Date.now()}`,
      employee_id: formData.employee_id || `CYA-${Math.floor(100 + Math.random() * 900)}`,
      name: formData.name,
      email: formData.email,
      phone: formData.phone || '+91 98765 00000',
      role_id: formData.role_id,
      role_code: selectedRole?.code || 'EMPLOYEE',
      role_name: selectedRole?.name || 'Team Member',
      team_id: selectedTeam?.id,
      team_name: selectedTeam?.name,
      reporting_manager_id: formData.reporting_manager_id || 'u-pm',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const updated = [newUser, ...users];
    setUsers(updated);
    StorageService.saveUsers(updated);

    StorageService.logAudit({
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_role: currentUser.role_name,
      entity_type: 'USER',
      entity_id: newUser.id,
      action: 'USER_CREATED',
      description: `Created new user profile ${newUser.name} (${newUser.role_name}) assigned to ${newUser.team_name || 'No Team'}`
    });

    setShowAddModal(false);
    setFormData({ name: '', email: '', phone: '', employee_id: '', role_id: '', team_id: '', reporting_manager_id: '' });
  };

  const handleToggleStatus = (targetUser: User) => {
    const newStatus = targetUser.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const updated = users.map(u => u.id === targetUser.id ? { ...u, status: newStatus as 'ACTIVE' | 'INACTIVE' } : u);
    setUsers(updated);
    StorageService.saveUsers(updated);

    const currentUser = StorageService.getCurrentUser();
    if (!currentUser) return;
    StorageService.logAudit({
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_role: currentUser.role_name,
      entity_type: 'USER',
      entity_id: targetUser.id,
      action: 'USER_STATUS_CHANGED',
      description: `Changed status for ${targetUser.name} from ${targetUser.status} to ${newStatus}`
    });
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(search.toLowerCase()) || 
                          u.email.toLowerCase().includes(search.toLowerCase()) ||
                          u.employee_id.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'ALL' || u.role_code === roleFilter;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <Users className="w-4 h-4" /> Enterprise User Directory
          </div>
          <h1 className="text-xl font-bold text-slate-100 mt-1">User & Employee Management</h1>
          <p className="text-xs text-slate-400 mt-1">
            Provision users, assign roles, define functional team memberships and reporting lines.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs rounded-lg shadow-lg shadow-cyan-950/50 flex items-center gap-2 transition-all"
        >
          <UserPlus className="w-4 h-4" /> Add New User
        </button>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/80 p-3 rounded-lg border border-slate-800">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or employee ID..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-500" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
          >
            <option value="ALL">All Roles ({users.length})</option>
            {roles.map(r => (
              <option key={r.id} value={r.code}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">Emp ID</th>
                <th className="p-3">Employee Name</th>
                <th className="p-3">Role</th>
                <th className="p-3">Functional Team</th>
                <th className="p-3">Team Lead / Manager</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 text-xs">
                    No matching users found in directory.
                  </td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-3 font-mono text-[11px] text-cyan-400 font-semibold">{u.employee_id}</td>
                    <td className="p-3">
                      <div className="font-semibold text-slate-100">{u.name}</div>
                      <div className="text-[11px] text-slate-400">{u.email}</div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-950 text-cyan-300 border border-cyan-800/60">
                        {u.role_name}
                      </span>
                    </td>
                    <td className="p-3 text-slate-300">
                      {u.team_name ? u.team_name : <span className="text-slate-500 italic">Unassigned</span>}
                    </td>
                    <td className="p-3 text-slate-400">
                      {u.team_lead_name || 'Project Manager'}
                    </td>
                    <td className="p-3">
                      {u.status === 'ACTIVE' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800/60 flex items-center gap-1 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1 w-fit">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`p-1.5 rounded border text-xs font-medium transition-colors ${
                          u.status === 'ACTIVE'
                            ? 'bg-rose-950/40 hover:bg-rose-950 text-rose-300 border-rose-800/50'
                            : 'bg-emerald-950/40 hover:bg-emerald-950 text-emerald-300 border-emerald-800/50'
                        }`}
                        title={u.status === 'ACTIVE' ? 'Deactivate User' : 'Activate User'}
                      >
                        {u.status === 'ACTIVE' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-cyan-400" /> Provision New Employee / User
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Vikram Patel"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Employee ID</label>
                  <input
                    type="text"
                    value={formData.employee_id}
                    onChange={e => setFormData({ ...formData, employee_id: e.target.value })}
                    placeholder="e.g. CYA-045"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Email Address *</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. vikram@careyu.com"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Phone Number</label>
                  <input
                    type="text"
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+91 98765 00000"
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Assigned Role *</label>
                  <select
                    required
                    value={formData.role_id}
                    onChange={e => setFormData({ ...formData, role_id: e.target.value })}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
                  >
                    <option value="">Select Role...</option>
                    {roles.map(r => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">Functional Team</label>
                  <select
                    value={formData.team_id}
                    onChange={e => setFormData({ ...formData, team_id: e.target.value })}
                    className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
                  >
                    <option value="">Select Team...</option>
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow"
                >
                  Save & Provision User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
