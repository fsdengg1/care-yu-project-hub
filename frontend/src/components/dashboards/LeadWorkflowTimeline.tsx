'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, Inbox } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';

export interface LeadWorkflowEvent {
  id: string;
  at: string;
  lead_id: string;
  lead_number: string;
  customer_name: string;
  title: string;
  actor: string;
  status: string;
  href: string;
}

export default function LeadWorkflowTimeline({
  title = 'Project activity timeline',
}: {
  title?: string;
}) {
  const [events, setEvents] = useState<LeadWorkflowEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void (async () => {
      const result = await apiRequest<{ events: LeadWorkflowEvent[] }>('/api/dashboard/activity');
      if (result.ok) setEvents(result.data.events || []);
      setLoaded(true);
    })();
  }, []);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
      <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
        <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <History className="h-4 w-4 text-cyan-400" /> {title}
        </h2>
        <Link href="/pre-sales/leads" className="text-xs text-cyan-400 hover:underline">
          Open pipeline
        </Link>
      </div>
      {!loaded ? (
        <p className="text-xs text-slate-500">Loading timeline…</p>
      ) : events.length === 0 ? (
        <div className="p-6 text-center">
          <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-600" />
          <p className="text-xs text-slate-400">No lead activity yet. Create a lead or wait for the next workflow step.</p>
        </div>
      ) : (
        <ol className="space-y-0">
          {events.slice(0, 16).map((event, index) => (
            <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
              <div className="flex w-4 shrink-0 flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400 ring-4 ring-slate-900" />
                {index < Math.min(events.length, 16) - 1 && <span className="mt-1 w-px flex-1 bg-slate-700" />}
              </div>
              <Link href={event.href} className="min-w-0 flex-1 rounded-lg border border-slate-800/80 bg-slate-950/50 px-3 py-2 hover:border-cyan-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-100">{event.title}</div>
                  <div className="shrink-0 text-[10px] text-slate-500">{formatRelativeTime(event.at)}</div>
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  <span className="font-mono font-bold text-cyan-400">{event.lead_number}</span>
                  {' · '}
                  {event.customer_name}
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">{event.actor}</div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
