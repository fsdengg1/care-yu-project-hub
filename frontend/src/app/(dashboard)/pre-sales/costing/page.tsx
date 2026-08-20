'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Lead } from '@/lib/types';
import { formatInrCompact, PIPELINE_STAGE_LABELS } from '@/lib/format';
import { StorageService } from '@/lib/storage';
import { isCeoViewOnly } from '@/lib/rbac';

export default function CostingPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [viewOnly, setViewOnly] = useState(false);

  useEffect(() => {
    setViewOnly(isCeoViewOnly(StorageService.getCurrentUser()));
    (async () => {
      const result = await apiRequest<{ leads: Lead[] }>('/api/leads');
      if (result.ok) {
        setLeads(result.data.leads.filter((lead) => lead.pipeline_stage === 'COSTING' || lead.pipeline_stage === 'QUOTATION'));
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <Calculator className="h-4 w-4" /> Pre-Sales Visibility
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Solution & Costing</h1>
        <p className="mt-1 text-xs text-slate-400">
          {viewOnly ? 'Management view of costing and quotation-stage opportunities. No operational costing actions.' : 'Opportunities currently in costing or quotation.'}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-[10px] uppercase tracking-wider text-slate-400">
            <tr>
              <th className="p-3">Lead ID</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Project</th>
              <th className="p-3">Value</th>
              <th className="p-3">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-slate-800/40">
                <td className="p-3 font-mono font-bold text-cyan-400">
                  <Link href={`/pre-sales/leads/${lead.id}`}>{lead.lead_number}</Link>
                </td>
                <td className="p-3">{lead.customer_name}</td>
                <td className="p-3 text-slate-100">{lead.title}</td>
                <td className="p-3">{formatInrCompact(lead.expected_value ?? 0)}</td>
                <td className="p-3">{PIPELINE_STAGE_LABELS[lead.pipeline_stage || ''] || lead.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
