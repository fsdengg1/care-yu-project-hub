'use client';

import React, { useState, useEffect } from 'react';
import { apiRequest } from '@/lib/api';
import { StorageService } from '@/lib/storage';
import { NotificationItem } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format';
import { Bell } from 'lucide-react';

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);

  const load = async () => {
    const result = await apiRequest<{ notifications: NotificationItem[] }>('/api/notifications');
    if (result.ok) {
      setNotifs(result.data.notifications);
      return;
    }
    const user = StorageService.getCurrentUser();
    setNotifs(StorageService.getNotifications(user?.id));
  };

  useEffect(() => {
    load();
  }, []);

  const markRead = async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifs((current) => current.map((item) => item.id === id ? { ...item, read_status: true } : item));
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
          <Bell className="w-4 h-4" /> Notifications
        </div>
        <h1 className="text-xl font-bold text-slate-100 mt-1">In-App Notification Center</h1>
        <p className="text-xs text-slate-400 mt-1">
          Critical escalations, project risk, and completed work for your role.
        </p>
      </div>

      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
        {notifs.map(n => (
          <button
            key={n.id}
            onClick={() => markRead(n.id)}
            className={`w-full text-left p-3.5 border rounded-lg text-xs space-y-1 ${n.read_status ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-950 border-cyan-800'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300">{n.title}</span>
              <span className="text-[10px] text-slate-500 font-mono">{formatRelativeTime(n.created_at)}</span>
            </div>
            <p className="text-slate-300">{n.message}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
