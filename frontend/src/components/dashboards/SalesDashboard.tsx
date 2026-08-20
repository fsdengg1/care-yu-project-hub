'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { User } from '@/lib/types';
import { LeadApi, BusinessHeadDashboard } from '@/lib/leadApi';
import { formatInrCompact, LEAD_STATUS_LABELS } from '@/lib/format';
import { Building2, Plus, Inbox, ArrowRight } from 'lucide-react';

export default function SalesDashboard({ user }: { user: User }) {
  const isBH = user.role_code === 'BUSINESS_HEAD';
  const verticalName = isBH ? 'Business Head' : 'Sales';
  const [data, setData] = useState<BusinessHeadDashboard | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await LeadApi.businessHeadDashboard();
      setData(result);
    })();
  }, []);

  const pipelineValue = data?.pipelineValue ?? 0;
  const technicalReview = data?.technicalReview ?? 0;
  const commercial = data?.commercialProposals ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-gradient-to-r from-slate-900 via-blue-950/30 to-slate-900 p-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            <Building2 className="h-4 w-4" /> {isBH ? 'Business Head Dashboard' : 'Sales Dashboard'}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-slate-100">Welcome back, {user.name}</h1>
          <p className="mt-1 text-xs text-slate-400">
            Track customer opportunities under <span className="font-semibold text-cyan-300">{verticalName}</span> vertical.
          </p>
        </div>
        <Link href="/pre-sales/leads/create" className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500">
          <Plus className="h-4 w-4" /> Create New Lead
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Pipeline Value</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{formatInrCompact(pipelineValue)}</div>
          <div className="mt-1 text-[11px] text-slate-500">
            {data?.activeOpportunities || 0} active opportunities
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Leads in Technical Review</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{technicalReview}</div>
          <div className="mt-1 text-[11px] text-slate-500">Feasibility / PM feasibility approval</div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
          <div className="text-xs font-medium text-slate-400">Commercial Proposals</div>
          <div className="mt-2 text-2xl font-bold text-slate-100">{commercial}</div>
          <div className="mt-1 text-[11px] text-slate-500">Quotation / Negotiation</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2">
          <h2 className="text-sm font-bold text-slate-100">Pipeline activity</h2>
          <Link href="/my-work" className="text-xs text-cyan-400 hover:underline">My Assigned Work</Link>
        </div>
        {!data?.leads?.length ? (
          <div className="space-y-2 p-8 text-center">
            <Inbox className="mx-auto h-6 w-6 text-slate-600" />
            <p className="text-xs font-medium text-slate-300">No sales leads recorded yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {data.leads.map((lead) => (
              <Link key={lead.id} href={`/pre-sales/leads/${lead.id}`} className="flex items-center justify-between py-3 hover:bg-slate-800/30">
                <div>
                  <span className="mr-2 font-mono font-bold text-cyan-400">{lead.lead_number}</span>
                  <span className="font-semibold text-slate-100">{lead.title}</span>
                  <div className="text-[11px] text-slate-400">{lead.customer_name} · {LEAD_STATUS_LABELS[lead.status] || lead.status}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-300">{formatInrCompact(lead.expected_value ?? 0)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-500" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
