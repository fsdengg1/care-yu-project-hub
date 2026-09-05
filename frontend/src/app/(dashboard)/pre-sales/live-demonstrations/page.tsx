'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { LiveDemoApi } from '@/lib/liveDemoApi';
import { formatLongDate } from '@/lib/format';
import { liveDemoStatusLabel } from '@/lib/liveDemoStatus';
import { LiveDemonstration } from '@/lib/types';
import RequestLiveDemoModal from '@/components/leads/RequestLiveDemoModal';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'REQUESTED', label: 'Request' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'PENDING_CUSTOMER', label: 'Pending – Customer' },
  { id: 'PENDING_INTERNAL', label: 'Pending – Internal' },
  { id: 'PENDING_BOTH', label: 'Pending – Both' },
  { id: 'UNDER_REVIEW', label: 'Under Review' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'ASSIGNED', label: 'Assigned' },
  { id: 'SCHEDULED', label: 'Scheduled' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'CASE_REFERENCE_PENDING', label: 'Case Reference Pending' },
  { id: 'VERIFICATION_PENDING', label: 'Verification Pending' },
  { id: 'VERIFIED', label: 'Verified' },
  { id: 'CANCELLED', label: 'Cancelled' },
];

type Counts = {
  requests: number;
  waitingForReview: number;
  pendingCustomer: number;
  pendingInternal: number;
  pendingBoth: number;
  scheduledToday: number;
  inProgress: number;
  completed: number;
  caseReferencePending: number;
  verificationPending: number;
  procurementUnlocked: number;
};

type Row = LiveDemonstration & {
  lead_number?: string;
  lead_title?: string;
  customer_name?: string;
  procurement_unlocked?: boolean;
};

export default function LiveDemonstrationsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [items, setItems] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Counts>({
    requests: 0,
    waitingForReview: 0,
    pendingCustomer: 0,
    pendingInternal: 0,
    pendingBoth: 0,
    scheduledToday: 0,
    inProgress: 0,
    completed: 0,
    caseReferencePending: 0,
    verificationPending: 0,
    procurementUnlocked: 0,
  });
  const [requestOpen, setRequestOpen] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);

  const load = async (nextStatus = status, nextSearch = search) => {
    const result = await LiveDemoApi.list({
      ...(nextStatus ? { status: nextStatus } : {}),
      ...(nextSearch ? { search: nextSearch } : {}),
    });
    if (result.ok) {
      setItems(result.data.items || []);
      setCounts({
        requests: result.data.requests || 0,
        waitingForReview: result.data.waitingForReview || 0,
        pendingCustomer: result.data.pendingCustomer || 0,
        pendingInternal: result.data.pendingInternal || 0,
        pendingBoth: result.data.pendingBoth || 0,
        scheduledToday: result.data.scheduledToday,
        inProgress: result.data.inProgress || 0,
        completed: result.data.completed,
        caseReferencePending: result.data.caseReferencePending,
        verificationPending: result.data.verificationPending,
        procurementUnlocked: result.data.procurementUnlocked,
      });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-5 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">LIVE Case Demonstration</h1>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Manage customer requests for LIVE Care Yu demonstrations, scheduling, outcomes and LIVE Case References before Procurement.
          </p>
        </div>
        <button type="button" onClick={() => setRequestOpen(true)} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500">
          + Request LIVE Demonstration
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6 text-xs">
        <Stat label="Demo Requests" value={counts.requests} />
        <Stat label="Waiting for Review" value={counts.waitingForReview} />
        <Stat label="Pending – Customer" value={counts.pendingCustomer} />
        <Stat label="Pending – Internal" value={counts.pendingInternal} />
        <Stat label="Pending – Both" value={counts.pendingBoth} />
        <Stat label="Scheduled Today" value={counts.scheduledToday} />
        <Stat label="In Progress" value={counts.inProgress} />
        <Stat label="Completed" value={counts.completed} />
        <Stat label="Case Reference Pending" value={counts.caseReferencePending} />
        <Stat label="Verification Pending" value={counts.verificationPending} />
        <Stat label="Procurement Unlocked" value={counts.procurementUnlocked} />
      </div>
      <div className="flex flex-col gap-3 md:flex-row">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void load(status, search);
          }}
          placeholder="Search lead, customer, project, requester or demonstrator"
          className="form-control flex-1"
        />
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            void load(e.target.value, search);
          }}
          className="form-control md:w-56"
        >
          {FILTERS.map((item) => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        <button type="button" onClick={() => void load(status, search)} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white">
          Search
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-900 text-slate-400">
            <tr>
              <th className="p-3">Lead</th>
              <th className="p-3">Customer</th>
              <th className="p-3">Status</th>
              <th className="p-3">Pending With</th>
              <th className="p-3">Pending Reason</th>
              <th className="p-3">Action Owner</th>
              <th className="p-3">Next Action</th>
              <th className="p-3">Demonstrator</th>
              <th className="p-3">Demo Date</th>
              <th className="p-3">Outcome</th>
              <th className="p-3">LIVE Case Reference</th>
              <th className="p-3">Procurement</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-10 text-center">
                  <div className="text-sm font-semibold text-slate-200">No LIVE Demonstration Requests</div>
                  <p className="mt-1 text-slate-500">Customer LIVE demonstration requests will appear here once created.</p>
                  <button type="button" onClick={() => setRequestOpen(true)} className="mt-4 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white">
                    + Request LIVE Demonstration
                  </button>
                </td>
              </tr>
            ) : items.map((item) => (
              <tr
                key={item.id}
                className="cursor-pointer border-t border-slate-800 hover:bg-slate-900/80"
                onClick={() => setDetail(item)}
              >
                <td className="p-3">
                  <Link href={`/pre-sales/leads/${item.lead_id}?tab=live-demo`} className="font-mono font-bold text-cyan-400" onClick={(e) => e.stopPropagation()}>
                    {item.lead_number}
                  </Link>
                  <div className="max-w-xs text-slate-500 wrap-break-word">{item.lead_title}</div>
                </td>
                <td className="p-3 text-slate-200">{item.customer_name}</td>
                <td className="p-3">{liveDemoStatusLabel(item.status)}</td>
                <td className="p-3">{pendingWithLabel(item.pending_with)}</td>
                <td className="p-3 max-w-xs truncate">{item.pending_reason || '—'}</td>
                <td className="p-3">{item.action_owner_name || '—'}</td>
                <td className="p-3 max-w-xs truncate">{item.next_action || '—'}</td>
                <td className="p-3">{item.demonstrator_name || '—'}</td>
                <td className="p-3">{formatLongDate(item.scheduled_date || item.preferred_date)}</td>
                <td className="p-3">{item.outcome?.replace(/_/g, ' ') || '—'}</td>
                <td className="p-3">{item.live_case_reference || item.reference_status.replace(/_/g, ' ')}</td>
                <td className="p-3">{item.procurement_unlocked ? 'Unlocked' : 'Locked'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {detail && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4" onClick={() => setDetail(null)}>
          <div className="my-8 w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-100" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">LIVE Demonstration Request Details</h2>
              <Link href={`/pre-sales/leads/${detail.lead_id}?tab=live-demo`} className="text-xs font-bold text-cyan-400">Open Lead</Link>
            </div>
            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <Field label="Lead" value={`${detail.lead_number || ''} ${detail.lead_title || ''}`} />
              <Field label="Customer" value={detail.customer_name} />
              <Field label="Status" value={liveDemoStatusLabel(detail.status)} />
              <Field label="Pending With" value={pendingWithLabel(detail.pending_with)} />
              <Field label="Pending Reason" value={detail.pending_reason} />
              <Field label="Action Owner" value={detail.action_owner_name} />
              <Field label="Next Action" value={detail.next_action} />
              <Field label="Customer Action Required" value={detail.customer_action_required} />
              <Field label="Internal Action Required" value={detail.internal_action_required} />
              <Field label="Pending Since" value={formatLongDate(detail.pending_since)} />
              <Field label="Requested By" value={detail.requested_by_name} />
              <Field label="Reason" value={detail.reason} />
              <Field label="Customer Requirement" value={detail.customer_requirement} />
              <Field label="Demonstration Requirements" value={detail.demonstration_requirements} />
              <Field label="Requested Support" value={detail.support_user_names?.join(', ')} />
              <Field label="Demonstrator" value={detail.demonstrator_name} />
              <Field label="Schedule" value={[detail.scheduled_date, detail.scheduled_time].filter(Boolean).join(' ')} />
              <Field label="Outcome" value={detail.outcome} />
              <Field label="LIVE Case Reference" value={detail.live_case_reference} />
              <Field label="Verification" value={detail.reference_status.replace(/_/g, ' ')} />
              <Field label="Procurement" value={detail.procurement_unlocked ? 'UNLOCKED' : 'LOCKED'} />
            </div>
            <button type="button" onClick={() => setDetail(null)} className="mt-4 rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-200">Close</button>
          </div>
        </div>
      )}
      {requestOpen && (
        <RequestLiveDemoModal
          onClose={() => setRequestOpen(false)}
          onCreated={() => void load()}
        />
      )}
    </div>
  );
}

function pendingWithLabel(value?: string) {
  if (value === 'CUSTOMER') return 'Customer';
  if (value === 'INTERNAL') return 'Care Yu / Internal';
  if (value === 'BOTH') return 'Both';
  if (value === 'NONE') return 'Not Applicable';
  return '—';
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-100 wrap-break-word">{value || '—'}</div>
    </div>
  );
}
