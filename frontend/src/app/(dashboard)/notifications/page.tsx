'use client';

import React, { useState, useEffect } from 'react';
import { StorageService } from '@/lib/storage';
import { NotificationItem } from '@/lib/types';
import { Bell, CheckCircle2, MessageSquare, AlertTriangle, ShieldAlert } from 'lucide-react';

export default function NotificationsPage() {
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);

  useEffect(() => {
    setNotifs(StorageService.getNotifications());
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
          <Bell className="w-4 h-4" /> Notification Infrastructure
        </div>
        <h1 className="text-xl font-bold text-slate-100 mt-1">In-App Notification Center</h1>
        <p className="text-xs text-slate-400 mt-1">
          Targeted alerts for task assignments, Team Lead suggestions, PM decisions, and blockers.
        </p>
      </div>

      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
        {notifs.map(n => (
          <div key={n.id} className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-lg text-xs space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300">{n.title}</span>
              <span className="text-[10px] text-slate-500 font-mono">{new Date(n.created_at).toLocaleTimeString()}</span>
            </div>
            <p className="text-slate-300">{n.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
