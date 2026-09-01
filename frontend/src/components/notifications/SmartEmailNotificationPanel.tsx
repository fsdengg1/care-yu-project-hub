'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Mail, History } from 'lucide-react';
import { NotificationsApi } from '@/lib/notificationsApi';
import { emitNotificationsChanged } from '@/lib/notificationPresentation';
import { NotificationHistoryEntry, NotificationItem, NotificationLifecycleStatus } from '@/lib/types';
import { formatRelativeTime } from '@/lib/format';

const STATUS_LABEL: Record<NotificationLifecycleStatus, string> = {
  NOT_SENT: 'Not Sent',
  MANUALLY_SENT: 'Manually Sent',
  AUTOMATICALLY_SENT: 'Automatically Sent',
  VIEWED: 'Viewed',
  COMPLETED: 'Completed',
  OVERDUE: 'Overdue',
};

const STATUS_CLASS: Record<NotificationLifecycleStatus, string> = {
  NOT_SENT: 'border-slate-600 bg-slate-800 text-slate-200',
  MANUALLY_SENT: 'border-emerald-800 bg-emerald-950 text-emerald-300',
  AUTOMATICALLY_SENT: 'border-cyan-800 bg-cyan-950 text-cyan-300',
  VIEWED: 'border-blue-800 bg-blue-950 text-blue-300',
  COMPLETED: 'border-emerald-800 bg-emerald-950 text-emerald-300',
  OVERDUE: 'border-rose-800 bg-rose-950 text-rose-300',
};

function statusOf(item: NotificationItem): NotificationLifecycleStatus {
  return item.notification_status || 'NOT_SENT';
}

export default function SmartEmailNotificationPanel({
  entityType,
  entityId,
  compact = false,
}: {
  entityType: string;
  entityId: string;
  compact?: boolean;
}) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [canSend, setCanSend] = useState(false);
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    const payload = await NotificationsApi.forEntity(entityType, entityId);
    setItems(payload.notifications.filter((item) => (item.email_channel || 'INTERNAL') === 'INTERNAL'));
    setCanSend(payload.canSend);
    setHours(payload.reminderAfterHours || 24);
  }, [entityType, entityId]);

  useEffect(() => {
    void load();
    void NotificationsApi.markViewed(entityType, entityId).then((result) => {
      if (!result.ok) return;
      emitNotificationsChanged();
      void load();
    });
  }, [entityType, entityId, load]);

  const internal = items.filter(
    (item) =>
      (item.email_channel || 'INTERNAL') === 'INTERNAL' &&
      Boolean(item.email_policy || item.email_dispatch || item.notification_history?.length)
  );
  const latest = internal[0];
  if (!latest && !canSend) return null;

  const history: NotificationHistoryEntry[] = internal.flatMap((item) => item.notification_history || []);

  return (
    <div className={`rounded-xl border border-cyan-800 bg-slate-900 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-cyan-400">
            <Mail className="h-3.5 w-3.5" /> Internal PMS notification
          </div>
          <p className="mt-1 text-xs text-slate-300">
            This item is already on the assigned person&apos;s dashboard. Outlook email is optional.
            {canSend ? ` If they do not view or act within ${hours} hours, PMS will send an automatic reminder.` : ''}
          </p>
        </div>
        {latest && (
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${STATUS_CLASS[statusOf(latest)]}`}>
            {STATUS_LABEL[statusOf(latest)]}
          </span>
        )}
      </div>
      {latest && (
        <div className="mt-2 text-xs text-slate-300">
          {latest.recipient_name ? `To ${latest.recipient_name}` : 'Assigned owner'}
          {latest.stage_name ? ` · ${latest.stage_name}` : ''}
        </div>
      )}
      {error && <div className="mt-2 text-xs text-rose-300">{error}</div>}
      {notice && <div className="mt-2 text-xs text-emerald-300">{notice}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {canSend && (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              setNotice('');
              const result = await NotificationsApi.sendEntityEmail(entityType, entityId);
              setBusy(false);
              if (!result.ok) {
                setError(result.message || 'Unable to send email notification.');
                return;
              }
              setNotice('Email notification sent.');
              await load();
            }}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            <Mail className="h-3.5 w-3.5" /> Send Email Notification
          </button>
        )}
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((open) => !open)}
            className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            <History className="h-3.5 w-3.5" /> {showHistory ? 'Hide history' : 'Notification history'}
          </button>
        )}
      </div>
      {showHistory && (
        <div className="mt-3 space-y-2 border-t border-slate-800 pt-3">
          {history
            .slice()
            .reverse()
            .map((entry, index) => (
              <div key={`${entry.created_at}-${index}`} className="text-[11px] text-slate-400">
                <span className={`mr-2 rounded border px-1.5 py-0.5 font-bold ${STATUS_CLASS[entry.status]}`}>
                  {STATUS_LABEL[entry.status]}
                </span>
                {entry.reason}
                <span className="ml-2 text-slate-500">{formatRelativeTime(entry.created_at)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
