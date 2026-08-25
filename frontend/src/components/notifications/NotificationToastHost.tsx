'use client';

import React from 'react';
import NotificationToast from './NotificationToast';
import { useNotifications } from './NotificationProvider';

export default function NotificationToastHost() {
  const { toasts, dismissToast, markRead } = useNotifications();

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed top-16 left-3 right-3 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-[380px]"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((item) => (
        <div key={item.id} className="pointer-events-auto">
          <NotificationToast
            item={item}
            onDismiss={dismissToast}
            onView={(notification) => {
              void markRead(notification.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
