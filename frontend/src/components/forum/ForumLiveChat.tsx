'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Radio, Send } from 'lucide-react';
import { ForumApi } from '@/lib/forumApi';
import { formatForumDate } from '@/lib/forumPresentation';
import { ForumLiveMessage, PresenceUser, User } from '@/lib/types';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

export default function ForumLiveChat({
  currentUser,
  onOpenDirect,
}: {
  currentUser: User;
  onOpenDirect?: (userId: string) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ForumLiveMessage[]>([]);
  const [online, setOnline] = useState<PresenceUser[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyPresence = (presence?: { active_count: number; total_users: number; users: PresenceUser[] }) => {
    if (!presence) return;
    setActiveCount(presence.active_count);
    setTotalUsers(presence.total_users);
    setOnline(presence.users);
  };

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const result = await ForumApi.live();
      if (cancelled || !result.ok) {
        if (!cancelled && !result.ok) setError(result.message);
        return;
      }
      setError(null);
      setMessages(result.data.messages);
      applyPresence(result.data.presence);
    };
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const result = await ForumApi.sendLive(draft.trim());
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDraft('');
    setMessages((current) => [...current, result.data.message]);
    applyPresence(result.data.presence);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
            <Radio className="h-4 w-4" /> Live chat
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Company-wide live chat for people currently using the Project Hub.
          </p>
        </div>
        <div className="shrink-0 rounded-full border border-emerald-800 bg-emerald-950/40 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {activeCount} active now
        </div>
      </div>
      {error && (
        <div className="mx-4 mt-3 rounded border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</div>
      )}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[200px_1fr]">
        <div className="border-b border-slate-800 p-3 lg:border-b-0 lg:border-r">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Online in Project Hub ({activeCount}/{totalUsers || activeCount})
          </div>
          <div className="mt-2 max-h-40 space-y-1 overflow-y-auto lg:max-h-[52vh]">
            {online.length === 0 && <div className="text-[11px] text-slate-500">No one else is online yet.</div>}
            {online.map((person) => (
              <button
                key={person.id}
                type="button"
                disabled={person.id === currentUser.id || !onOpenDirect}
                onClick={() => onOpenDirect?.(person.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800 disabled:cursor-default"
              >
                <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-bold">
                  {initials(person.name)}
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-slate-900 bg-emerald-400" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {person.name}
                    {person.id === currentUser.id ? ' (you)' : ''}
                  </span>
                  <span className="block truncate text-[10px] text-slate-500">{person.role_name}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-h-[42vh] flex-col">
          <div className="flex-1 space-y-2 overflow-y-auto p-4">
            {messages.length === 0 && (
              <p className="text-xs text-slate-500">No live messages yet. Say hello — everyone currently in the tool can see this.</p>
            )}
            {messages.map((item) => {
              const mine = item.author_id === currentUser.id;
              return (
                <div key={item.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                      mine ? 'bg-cyan-700 text-white' : 'border border-slate-800 bg-slate-950 text-slate-200'
                    }`}
                  >
                    <div className={`text-[10px] font-semibold ${mine ? 'text-cyan-100' : 'text-cyan-300'}`}>
                      {item.author_name} · {item.author_role}
                    </div>
                    <div className="mt-0.5 whitespace-pre-wrap break-words">{item.body}</div>
                    <div className={`mt-1 text-[10px] ${mine ? 'text-cyan-100/80' : 'text-slate-500'}`}>
                      {formatForumDate(item.created_at)}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <form
            className="flex gap-2 border-t border-slate-800 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message everyone who’s online..."
              className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
