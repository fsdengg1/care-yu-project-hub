'use client';

import React, { useEffect, useState } from 'react';
import { Scan, Users, Wrench, Gauge } from 'lucide-react';
import { User } from '@/lib/types';
import { LeadApi } from '@/lib/leadApi';

export default function EngineeringDashboard({ user }: { user: User }) {
  const [feasibilityCount, setFeasibilityCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    void (async () => {
      const leads = await LeadApi.list();
      setFeasibilityCount(
        leads.filter(
          (lead) =>
            lead.pipeline_stage === 'FEASIBILITY' ||
            lead.status === 'ACCEPTED_FOR_FEASIBILITY' ||
            lead.status === 'FEASIBILITY_IN_PROGRESS' ||
            lead.status === 'FEASIBILITY_SUBMITTED'
        ).length
      );
      setReviewCount(leads.filter((lead) => lead.status === 'FEASIBILITY_SUBMITTED').length);
    })();
  }, []);

  const cards = [
    {
      label: 'Feasibility Studies',
      value: String(feasibilityCount),
      note: feasibilityCount ? 'Studies currently in the pipeline' : 'No studies in progress',
      icon: Scan,
    },
    { label: 'Engineering Capacity', value: 'Available', note: 'Teams ready for allocation', icon: Users },
    { label: 'Technical Progress', value: '0%', note: 'No active engineering milestones', icon: Gauge },
    {
      label: 'Solution Reviews',
      value: String(reviewCount),
      note: reviewCount ? 'Pending technical reviews' : 'No pending technical reviews',
      icon: Wrench,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-400">
          <Wrench className="h-4 w-4" /> Engineering Dashboard
        </div>
        <h1 className="mt-1 text-2xl font-bold text-slate-100">Welcome back, {user.name}</h1>
        <p className="mt-1 text-xs text-slate-400">
          Monitor technical feasibility, engineering capacity, and solution progress across all teams.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{card.label}</span>
                <div className="rounded-lg border border-indigo-800/40 bg-indigo-950 p-2 text-indigo-400">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3 text-2xl font-bold text-slate-100">{card.value}</div>
              <div className="mt-1 text-[11px] text-slate-500">{card.note}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
