'use client';

import React, { useEffect, useState } from 'react';
import { User, NotificationItem } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { apiRequest } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';
import { Bell, Search, LogOut, ChevronDown, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import AppearanceToggle from '@/components/theme/AppearanceToggle';

interface NavbarProps {
  user: User;
  onUserChange?: (newUser: User) => void;
}

export default function Navbar({ user, onUserChange }: NavbarProps) {
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  const unreadCount = notifications.filter(n => !n.read_status).length;
  const allUsers = StorageService.getUsers();

  const loadNotifications = async () => {
    const result = await apiRequest<{ notifications: NotificationItem[] }>('/api/notifications');
    if (result.ok) {
      setNotifications(result.data.notifications);
      return;
    }
    setNotifications(StorageService.getNotifications(user.id));
  };

  useEffect(() => {
    loadNotifications();
  }, [user.id]);

  const markRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, read_status: true } : item));
  };

  const handleSelectRoleAccount = async (targetUser: User) => {
    const result = await apiRequest<{ token: string; user: User }>('/api/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ userId: targetUser.id }),
    });
    if (result.ok) {
      StorageService.setAuthToken(result.data.token);
      StorageService.setCurrentUser(result.data.user);
    } else {
      StorageService.setCurrentUser(targetUser);
    }
    StorageService.logAudit({
      user_id: targetUser.id,
      user_name: targetUser.name,
      user_role: targetUser.role_name,
      entity_type: 'AUTH',
      entity_id: targetUser.id,
      action: 'ROLE_SWITCH',
      description: `Switched active session view to ${targetUser.name} (${targetUser.role_name})`
    });
    setShowRoleSelector(false);
    if (onUserChange) onUserChange(result.ok ? result.data.user : targetUser);
    window.location.href = '/dashboard';
  };

  const handleLogout = () => {
    StorageService.logAudit({
      user_id: user.id,
      user_name: user.name,
      user_role: user.role_name,
      entity_type: 'AUTH',
      entity_id: user.id,
      action: 'USER_LOGOUT',
      description: `${user.name} signed out`,
    });
    StorageService.clearCurrentUser();
    window.location.href = '/login';
  };

  return (
    <header className="h-14 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Quick Search */}
      <div className="flex items-center gap-3">
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search projects, leads, BOM, tasks..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950/60 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>
      </div>

      {/* Right Controls & Demo Role Context Switcher */}
      <div className="flex items-center gap-4">
        {/* Development Role Preview Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowRoleSelector(!showRoleSelector)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 rounded-md text-xs font-medium text-slate-200 transition-colors"
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold">DEMO ROLE CONTEXT:</span>
            <span className="text-cyan-300 font-semibold">{user.name} ({user.role_code})</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {showRoleSelector && (
            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-lg shadow-xl py-2 z-50">
              <div className="px-3 py-1.5 text-[10px] font-bold text-amber-400 uppercase tracking-wider border-b border-slate-800">
                Development Role Preview
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/50">
                {allUsers.map(u => (
                  <button
                    key={u.id}
                    onClick={() => handleSelectRoleAccount(u)}
                    className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-800/60 text-xs transition-colors ${
                      u.id === user.id ? 'bg-cyan-950/40 text-cyan-300 font-semibold' : 'text-slate-300'
                    }`}
                  >
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-[10px] text-slate-400">{u.role_name} {u.team_name ? `• ${u.team_name}` : ''}</div>
                    </div>
                    {u.id === user.id && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <AppearanceToggle />

        {/* Notifications Icon */}
        <div className="relative">
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {showNotifications && (
            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-3 z-50">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
                <span className="text-xs font-bold text-slate-200">Notifications ({notifications.length})</span>
                <Link href="/notifications" className="text-[11px] text-cyan-400 hover:underline">
                  View all
                </Link>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2 text-center">No notifications</p>
                ) : (
                  notifications.slice(0, 6).map(n => (
                    <button
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={`w-full text-left p-2 rounded bg-slate-950/50 border text-xs ${n.read_status ? 'border-slate-800' : 'border-cyan-800'}`}
                    >
                      <div className="font-semibold text-cyan-300">{n.title}</div>
                      <div className="text-slate-400 mt-0.5">{n.message}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{formatRelativeTime(n.created_at)}</div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Avatar */}
        <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
          <div className="w-8 h-8 rounded-full bg-cyan-600/30 border border-cyan-500/50 flex items-center justify-center text-cyan-300 font-bold text-xs">
            {user.name.split(' ').map(n => n[0]).join('')}
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
