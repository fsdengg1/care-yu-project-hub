'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/lib/api';
import {
  NOTIFICATIONS_CHANGED_EVENT,
  loadShownToastIds,
  saveShownToastIds,
} from '@/lib/notificationPresentation';
import { StorageService } from '@/lib/storage';
import { ForumApi } from '@/lib/forumApi';
import { NotificationItem, User } from '@/lib/types';

interface NotificationContextValue {
  notifications: NotificationItem[];
  unreadCount: number;
  toasts: NotificationItem[];
  dismissToast: (id: string) => void;
  markRead: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const MAX_VISIBLE = 3;
const POLL_MS = 10000;

const liveState = {
  userId: '',
  toasts: [] as NotificationItem[],
  queue: [] as NotificationItem[],
};

export function resetToastLiveState() {
  liveState.userId = '';
  liveState.toasts = [];
  liveState.queue = [];
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return value;
}

export function NotificationProvider({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>(() =>
    liveState.userId === user.id ? liveState.toasts : []
  );
  const queueRef = useRef<NotificationItem[]>(liveState.userId === user.id ? liveState.queue : []);
  const shownRef = useRef<Set<string>>(loadShownToastIds(user.id));
  const claimedRef = useRef<Set<string>>(new Set(shownRef.current));
  const userIdRef = useRef(user.id);

  userIdRef.current = user.id;

  const persistShown = useCallback(() => {
    saveShownToastIds(userIdRef.current, shownRef.current);
  }, []);

  const syncLive = useCallback((nextToasts: NotificationItem[]) => {
    liveState.userId = userIdRef.current;
    liveState.toasts = nextToasts;
    liveState.queue = queueRef.current;
  }, []);

  const consumeQueue = useCallback(() => {
    setToasts((current) => {
      if (current.length >= MAX_VISIBLE || queueRef.current.length === 0) return current;
      const room = MAX_VISIBLE - current.length;
      const next = [...current, ...queueRef.current.splice(0, room)];
      syncLive(next);
      return next;
    });
  }, [syncLive]);

  const enqueue = useCallback((items: NotificationItem[]) => {
    if (!items.length) return;
    setToasts((current) => {
      const blocked = new Set([
        ...current.map((item) => item.id),
        ...queueRef.current.map((item) => item.id),
        ...claimedRef.current,
      ]);
      const incoming = items.filter((item) => !blocked.has(item.id));
      if (!incoming.length) return current;
      incoming.forEach((item) => claimedRef.current.add(item.id));
      const room = Math.max(0, MAX_VISIBLE - current.length);
      const nextVisible = [...current, ...incoming.slice(0, room)];
      queueRef.current = [...queueRef.current, ...incoming.slice(room)];
      syncLive(nextVisible);
      return nextVisible;
    });
  }, [syncLive]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => {
      const next = current.filter((item) => item.id !== id);
      queueRef.current = queueRef.current.filter((item) => item.id !== id);
      syncLive(next);
      return next;
    });
    window.setTimeout(() => consumeQueue(), 0);
  }, [consumeQueue, syncLive]);

  const ingest = useCallback((list: NotificationItem[]) => {
    const unread = list
      .filter((item) => !item.read_status)
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    const shown = shownRef.current;

    if (shown.size === 0) {
      unread.forEach((item) => shown.add(item.id));
      persistShown();
      if (unread[0]) enqueue([unread[0]]);
      return;
    }

    const fresh = unread.filter((item) => !shown.has(item.id));
    unread.forEach((item) => shown.add(item.id));
    persistShown();
    if (fresh.length) enqueue(fresh);
  }, [enqueue, persistShown]);

  const refresh = useCallback(async () => {
    const result = await apiRequest<{ notifications: NotificationItem[] }>('/api/notifications');
    const list = result.ok ? result.data.notifications : StorageService.getNotifications(userIdRef.current);
    setNotifications(list);
    ingest(list);
  }, [ingest]);

  const markRead = useCallback(async (id: string) => {
    await apiRequest(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((current) =>
      current.map((item) => (item.id === id ? { ...item, read_status: true, read_at: new Date().toISOString() } : item))
    );
    dismissToast(id);
  }, [dismissToast]);

  useEffect(() => {
    if (liveState.userId !== user.id) {
      liveState.userId = user.id;
      liveState.toasts = [];
      liveState.queue = [];
      shownRef.current = loadShownToastIds(user.id);
      claimedRef.current = new Set(shownRef.current);
      queueRef.current = [];
      setToasts([]);
      setNotifications([]);
    } else {
      shownRef.current = loadShownToastIds(user.id);
      claimedRef.current = new Set([...shownRef.current, ...claimedRef.current]);
      queueRef.current = liveState.queue;
      setToasts(liveState.toasts);
    }

    let cancelled = false;
    const tick = async () => {
      const [result] = await Promise.all([
        apiRequest<{ notifications: NotificationItem[] }>('/api/notifications'),
        ForumApi.heartbeat(),
      ]);
      if (cancelled) return;
      const list = result.ok ? result.data.notifications : StorageService.getNotifications(user.id);
      setNotifications(list);
      ingest(list);
    };

    void tick();
    const timer = window.setInterval(() => {
      void tick();
    }, POLL_MS);

    const onChanged = () => {
      void tick();
    };
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
    window.addEventListener('focus', onChanged);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onChanged);
      window.removeEventListener('focus', onChanged);
    };
  }, [user.id, ingest]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount: notifications.filter((item) => !item.read_status).length,
      toasts,
      dismissToast,
      markRead,
      refresh,
    }),
    [notifications, toasts, dismissToast, markRead, refresh]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
