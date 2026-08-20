'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { LeadApi } from '@/lib/leadApi';
import { StorageService } from '@/lib/storage';
import { MyWorkItem, User } from '@/lib/types';
import { LEAD_STATUS_LABELS } from '@/lib/format';
import {
  CheckSquare, ArrowRight, Inbox, Plus, RotateCcw, FileText, Handshake, Scan, Calculator, Building2
} from 'lucide-react';

const GROUP_META: Record<string, { title: string; icon: React.ReactNode }> = {
  CREATE: { title: 'Project Input', icon: <Plus className="h-4 w-4" /> },
  DRAFT: { title: 'Drafts to complete', icon: <FileText className="h-4 w-4" /> },
  RETURNED: { title: 'Returned Items', icon: <RotateCcw className="h-4 w-4" /> },
  PM_REVIEW: { title: 'PM Review', icon: <Scan className="h-4 w-4" /> },
  ASSIGN: { title: 'Assign to Team', icon: <Scan className="h-4 w-4" /> },
  FEASIBILITY: { title: 'Feasibility', icon: <Scan className="h-4 w-4" /> },
  FEASIBILITY_APPROVAL: { title: 'PM Approval — Feasibility', icon: <Scan className="h-4 w-4" /> },
  COSTING: { title: 'Procurement / Costing', icon: <Calculator className="h-4 w-4" /> },
  COSTING_APPROVAL: { title: 'PM Approval — Costing', icon: <Calculator className="h-4 w-4" /> },
  QUOTATION: { title: 'Quotation', icon: <Building2 className="h-4 w-4" /> },
  NEGOTIATION: { title: 'Negotiation', icon: <Handshake className="h-4 w-4" /> },
};

const ORDER = ['CREATE', 'DRAFT', 'RETURNED', 'PM_REVIEW', 'ASSIGN', 'FEASIBILITY', 'FEASIBILITY_APPROVAL', 'COSTING', 'COSTING_APPROVAL', 'QUOTATION', 'NEGOTIATION'];

export default function MyAssignedWorkPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<Record<string, MyWorkItem[]>>({});
  const [items, setItems] = useState<MyWorkItem[]>([]);

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    if (!user) return;
    setCurrentUser(user);
    void (async () => {
      const result = await LeadApi.myWork();
      setGroups(result.groups);
      setItems(result.items);
    })();
  }, []);

  if (!currentUser) return null;

  const actionable = items.filter((item) => item.category !== 'CREATE');
  const isBH = ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES'].includes(currentUser.role_code);

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <CheckSquare className="h-4 w-4" /> My Work
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">My Assigned Work</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Tasks for <span className="font-semibold text-cyan-300">{currentUser.name}</span> based on role, workflow state, and assignment.
        </p>
      </div>

      {isBH && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Create New Lead', value: 'Open form', href: '/pre-sales/leads/create' },
            { label: 'Ready for quotation', value: String((groups.QUOTATION || []).length), href: '/pre-sales/leads' },
            { label: 'Active negotiations', value: String((groups.NEGOTIATION || []).length), href: '/pre-sales/leads' },
            { label: 'Returned by PM', value: String((groups.RETURNED || []).length), href: '/pre-sales/leads' },
          ].map((card) => (
            <Link key={card.label} href={card.href} className="rounded-xl border border-slate-800 bg-slate-900/90 p-4 hover:border-cyan-800">
              <div className="text-slate-400">{card.label}</div>
              <div className="mt-2 text-2xl font-bold text-slate-100">{card.value}</div>
            </Link>
          ))}
        </div>
      )}

      {ORDER.filter((key) => (groups[key] || []).length > 0).map((key) => {
        const meta = GROUP_META[key];
        const list = groups[key] || [];
        return (
          <div key={key} className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-2 font-bold text-slate-100">
              <span className="text-cyan-400">{meta?.icon}</span>
              {meta?.title || key}
              <span className="ml-auto rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300">{list.length}</span>
            </div>
            {list.map((item) => (
              <Link
                key={`${item.category}-${item.lead_id}`}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 hover:border-cyan-800"
              >
                <div>
                  <div className="font-bold text-slate-100">
                    {item.category === 'CREATE' ? item.title : (
                      <>
                        <span className="mr-2 font-mono text-cyan-400">{item.lead_number}</span>
                        {item.title}
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 text-slate-400">{item.summary}</div>
                  {item.category !== 'CREATE' && (
                    <div className="mt-1 text-[11px] text-slate-500">{item.customer_name} · {LEAD_STATUS_LABELS[item.status] || item.status}</div>
                  )}
                </div>
                <span className="flex items-center gap-1 text-cyan-400">
                  Open <ArrowRight className="h-3 w-3" />
                </span>
              </Link>
            ))}
          </div>
        );
      })}

      {actionable.length === 0 && !isBH && (
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/90 p-12 text-center text-slate-500">
          <Inbox className="mx-auto h-8 w-8 text-slate-600" />
          <p>No feasibility assignments allocated to you yet.</p>
        </div>
      )}

      {actionable.length === 0 && isBH && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-8 text-center">
          <p className="text-slate-300">No returned items or commercial follow-ups right now.</p>
          <Link href="/pre-sales/leads/create" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500">
            <Plus className="h-4 w-4" /> Create New Lead
          </Link>
        </div>
      )}
    </div>
  );
}
