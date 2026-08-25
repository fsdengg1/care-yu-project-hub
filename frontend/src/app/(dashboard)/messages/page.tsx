'use client';

import React, { Suspense, useEffect, useState } from 'react';
import ChatWorkspace from '@/components/chat/ChatWorkspace';
import { StorageService } from '@/lib/storage';
import { User } from '@/lib/types';
import { MessageSquare } from 'lucide-react';

function MessagesBody() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    setUser(StorageService.getCurrentUser());
  }, []);
  if (!user) return null;
  return (
    <div className="space-y-4 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <MessageSquare className="h-4 w-4" /> Communication
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Messages</h1>
        <p className="mt-0.5 text-slate-400">
        Direct and Groups are private chat. Forum has async threads plus live chat that shows who is currently active in the Project Hub.
        </p>
      </div>
      <ChatWorkspace currentUser={user} />
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="text-slate-400">Loading messages…</div>}>
      <MessagesBody />
    </Suspense>
  );
}
