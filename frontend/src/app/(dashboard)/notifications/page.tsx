'use client';

import React from 'react';
import Link from 'next/link';
import { AtSign, Bell, Heart, MessageCircle, MessagesSquare, Pin } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';
import { notificationHref } from '@/lib/notificationHref';
import { notificationPresentation } from '@/lib/notificationPresentation';
import { useNotifications } from '@/components/notifications/NotificationProvider';
import { NotificationDelivery, NotificationItem } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { apiRequest } from '@/lib/api';

function NotificationGlyph({ item }: { item: NotificationItem }) {
  const presentation = notificationPresentation(item);
  const className = 'h-4 w-4 text-cyan-400';
  if (item.type === 'FORUM_MENTION') return <AtSign className={className} />;
  if (item.type === 'FORUM_REACTION') return <Heart className={className} />;
  if (item.type === 'FORUM_PINNED') return <Pin className={className} />;
  if (item.type === 'FORUM_REPLY') return <MessageCircle className={className} />;
  if (presentation.kind === 'forum') return <MessagesSquare className={className} />;
  return <Bell className={className} />;
}

export default function NotificationsPage() {
  const { notifications, markRead } = useNotifications();
  const user = StorageService.getCurrentUser();
  const isAdmin = user?.role_code === 'SYSTEM_ADMIN';
  const [deliveries, setDeliveries] = React.useState<NotificationDelivery[]>([]);
  const [retrying, setRetrying] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isAdmin) return;
    void apiRequest<{ deliveries: NotificationDelivery[] }>('/api/notifications/admin/deliveries').then((result) => {
      if (result.ok) setDeliveries(result.data.deliveries || []);
    });
  }, [isAdmin]);

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
        {notifications.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">No notifications yet.</p>
        ) : notifications.map((n) => (
          <Link
            key={n.id}
            href={notificationHref(n)}
            onClick={() => {
              void markRead(n.id);
            }}
            className={`block w-full text-left p-3.5 border rounded-lg text-xs space-y-1 ${n.read_status ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-950 border-cyan-800'}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-bold text-cyan-300">
                <NotificationGlyph item={n} />
                {n.title}
              </span>
              <span className="text-[10px] text-slate-500 font-mono">{formatRelativeTime(n.created_at)}</span>
            </div>
            <p className="text-slate-300">{n.message}</p>
          </Link>
        ))}
      </div>

      {isAdmin && (
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-3">
          <h2 className="text-sm font-bold text-slate-100">Email delivery log</h2>
          <p className="text-xs text-slate-400">Failed emails can be retried. This view is limited to System Admin.</p>
          {deliveries.length === 0 ? (
            <p className="text-xs text-slate-500">No email deliveries recorded yet.</p>
          ) : deliveries.slice(0, 20).map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs">
              <div>
                <div className="font-semibold text-slate-200">{item.subject}</div>
                <div className="text-slate-400">{item.recipient_email} · {item.status}{item.transaction_id ? ` · ${item.transaction_id}` : ''}</div>
                {item.failure_reason && <div className="text-rose-300">{item.failure_reason}</div>}
              </div>
              {item.status === 'FAILED' && (
                <button
                  type="button"
                  disabled={retrying === item.notification_id}
                  onClick={async () => {
                    setRetrying(item.notification_id);
                    await apiRequest(`/api/notifications/${item.notification_id}/retry-email`, { method: 'POST' });
                    const result = await apiRequest<{ deliveries: NotificationDelivery[] }>('/api/notifications/admin/deliveries');
                    if (result.ok) setDeliveries(result.data.deliveries || []);
                    setRetrying(null);
                  }}
                  className="rounded bg-cyan-600 px-3 py-1.5 font-bold text-white disabled:opacity-60"
                >
                  Retry
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
