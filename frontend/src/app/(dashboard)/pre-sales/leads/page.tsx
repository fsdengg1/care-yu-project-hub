'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { Lead, LeadStatus, User } from '@/lib/types';
import { 
  Building2, 
  Plus, 
  Search, 
  Filter, 
  Eye, 
  Inbox, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight,
  FileText
} from 'lucide-react';

const STATUS_BADGES: Record<LeadStatus, { label: string; style: string }> = {
  DRAFT: { label: 'DRAFT', style: 'bg-slate-800 text-slate-300 border-slate-700' },
  SUBMITTED_TO_PM: { label: 'SUBMITTED TO PM', style: 'bg-blue-950 text-blue-300 border-blue-800' },
  UNDER_PM_REVIEW: { label: 'UNDER PM REVIEW', style: 'bg-blue-950 text-blue-300 border-blue-800' },
  RETURNED_TO_SALES: { label: 'RETURNED TO SALES', style: 'bg-amber-950 text-amber-300 border-amber-800' },
  ADDITIONAL_INFORMATION_REQUIRED: { label: 'ADDITIONAL INFO REQ', style: 'bg-amber-950 text-amber-300 border-amber-800' },
  RESUBMITTED_TO_PM: { label: 'RESUBMITTED TO PM', style: 'bg-blue-950 text-blue-300 border-blue-800' },
  ACCEPTED_FOR_FEASIBILITY: { label: 'ACCEPTED FOR FEASIBILITY', style: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  FEASIBILITY_IN_PROGRESS: { label: 'FEASIBILITY IN PROGRESS', style: 'bg-indigo-950 text-indigo-300 border-indigo-800' },
  WON: { label: 'WON', style: 'bg-emerald-950 text-emerald-300 border-emerald-800' },
  LOST: { label: 'LOST', style: 'bg-rose-950 text-rose-300 border-rose-800' },
  ON_HOLD: { label: 'ON HOLD', style: 'bg-slate-800 text-slate-400 border-slate-700' }
};

export default function LeadsListPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [verticalFilter, setVerticalFilter] = useState<string>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    setCurrentUser(user);
    setLeads(StorageService.getLeads());
  }, []);

  if (!currentUser) return null;

  // Role visibility filtration
  const isCEO = currentUser.role_code === 'CEO' || currentUser.role_code === 'SYSTEM_ADMIN';
  const isPM = currentUser.role_code === 'PROJECT_MANAGER';
  const isBH = currentUser.role_code === 'BUSINESS_HEAD';
  const isED = currentUser.role_code === 'ENG_DIRECTOR';

  const visibleLeads = leads.filter(lead => {
    // Role level check
    if (isCEO || isPM) {
      // CEO and PM see all leads
    } else if (isBH) {
      if (lead.business_vertical !== 'Business Head' && lead.created_by_id !== currentUser.id) return false;
    } else if (isED) {
      if (lead.business_vertical !== 'Engineering Director' && lead.created_by_id !== currentUser.id) return false;
    } else {
      // Sales / Creator
      if (lead.created_by_id !== currentUser.id && lead.sales_owner_id !== currentUser.id) return false;
    }

    // Search query
    const query = search.toLowerCase();
    const matchesSearch = 
      lead.lead_number.toLowerCase().includes(query) ||
      lead.title.toLowerCase().includes(query) ||
      lead.customer_name.toLowerCase().includes(query) ||
      lead.sales_owner.toLowerCase().includes(query);

    // Filters
    const matchesStatus = statusFilter === 'ALL' || lead.status === statusFilter;
    const matchesVertical = verticalFilter === 'ALL' || lead.business_vertical === verticalFilter;
    const matchesPriority = priorityFilter === 'ALL' || lead.priority === priorityFilter;

    return matchesSearch && matchesStatus && matchesVertical && matchesPriority;
  });

  // PM Review Queue (Submitted or Under PM review)
  const pmReviewQueue = leads.filter(l => 
    l.status === 'SUBMITTED_TO_PM' || 
    l.status === 'UNDER_PM_REVIEW' || 
    l.status === 'RESUBMITTED_TO_PM'
  );

  // Sales Action Required Queue (Returned to Sales)
  const salesReturnedQueue = leads.filter(l => 
    (l.status === 'RETURNED_TO_SALES' || l.status === 'ADDITIONAL_INFORMATION_REQUIRED') &&
    (isCEO || l.created_by_id === currentUser.id || l.sales_owner_id === currentUser.id)
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
            <Building2 className="w-4 h-4" /> Pre-Sales Module
          </div>
          <h1 className="text-xl font-bold text-slate-100 mt-1">Leads & Pipeline Management</h1>
          <p className="text-xs text-slate-400 mt-1">
            Care Yu Automation Pre-Sales lead tracking, PM review workflow, and feasibility approvals.
          </p>
        </div>

        {(isCEO || isBH || isED || currentUser.role_code === 'SALES') && (
          <Link
            href="/pre-sales/leads/create"
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg shadow-md flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> Create New Lead
          </Link>
        )}
      </div>

      {/* Action Required Banner for PM */}
      {isPM && pmReviewQueue.length > 0 && (
        <div className="bg-blue-950/40 border border-blue-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-blue-300 font-bold text-xs">
              <Clock className="w-4 h-4 text-blue-400" />
              LEADS AWAITING PM REVIEW ({pmReviewQueue.length})
            </div>
            <span className="text-[10px] bg-blue-900/60 text-blue-300 px-2 py-0.5 rounded border border-blue-700">
              Project Manager Review Queue
            </span>
          </div>

          <div className="divide-y divide-blue-900/40">
            {pmReviewQueue.map(lead => (
              <div key={lead.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-cyan-400 font-bold mr-2">{lead.lead_number}</span>
                  <span className="font-semibold text-slate-100">{lead.title}</span>
                  <span className="text-slate-400 ml-2">({lead.customer_name})</span>
                  <span className="ml-3 text-[10px] px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                    {lead.business_vertical}
                  </span>
                </div>
                <Link
                  href={`/pre-sales/leads/${lead.id}`}
                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded text-[11px] flex items-center gap-1"
                >
                  Review Lead <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Required Banner for Sales */}
      {salesReturnedQueue.length > 0 && (
        <div className="bg-amber-950/40 border border-amber-800/80 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              ACTION REQUIRED — RETURNED LEADS ({salesReturnedQueue.length})
            </div>
            <span className="text-[10px] bg-amber-900/60 text-amber-300 px-2 py-0.5 rounded border border-amber-700">
              Additional Information Required by PM
            </span>
          </div>

          <div className="divide-y divide-amber-900/40">
            {salesReturnedQueue.map(lead => (
              <div key={lead.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="font-mono text-amber-400 font-bold mr-2">{lead.lead_number}</span>
                  <span className="font-semibold text-slate-100">{lead.title}</span>
                  <div className="text-slate-400 text-[11px] mt-0.5 italic">
                    PM Reason: &quot;{lead.pm_return_reason || 'Please provide additional technical details'}&quot;
                  </div>
                </div>
                <Link
                  href={`/pre-sales/leads/${lead.id}`}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[11px] flex items-center gap-1"
                >
                  Update & Resubmit <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-slate-900/90 p-3.5 rounded-lg border border-slate-800">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Lead ID, title, customer, owner..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          
          <select
            value={verticalFilter}
            onChange={(e) => setVerticalFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Verticals</option>
            <option value="Business Head">Business Head</option>
            <option value="Engineering Director">Engineering Director</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED_TO_PM">Submitted to PM</option>
            <option value="UNDER_PM_REVIEW">Under PM Review</option>
            <option value="RETURNED_TO_SALES">Returned to Sales</option>
            <option value="RESUBMITTED_TO_PM">Resubmitted to PM</option>
            <option value="ACCEPTED_FOR_FEASIBILITY">Accepted for Feasibility</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-md text-xs text-slate-300 focus:outline-none"
          >
            <option value="ALL">All Priorities</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
            <option value="Critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Main Leads Table */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="p-3">Lead ID</th>
                <th className="p-3">Lead Title & Customer</th>
                <th className="p-3">Business Vertical</th>
                <th className="p-3">Sales Owner</th>
                <th className="p-3">Priority</th>
                <th className="p-3">Status</th>
                <th className="p-3">Lead Date</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {visibleLeads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-slate-500 text-xs">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                    No Leads created yet.
                  </td>
                </tr>
              ) : (
                visibleLeads.map(lead => {
                  const statusInfo = STATUS_BADGES[lead.status] || { label: lead.status, style: 'bg-slate-800 text-slate-300' };

                  return (
                    <tr key={lead.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="p-3 font-mono font-bold text-cyan-400">{lead.lead_number}</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-100">{lead.title}</div>
                        <div className="text-[11px] text-slate-400">{lead.customer_name} • <span className="text-slate-500">{lead.customer_type}</span></div>
                      </td>
                      <td className="p-3 text-slate-300 font-medium">{lead.business_vertical}</td>
                      <td className="p-3 text-slate-400">{lead.sales_owner}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                          lead.priority === 'Critical' ? 'bg-rose-950 text-rose-300 border-rose-800' :
                          lead.priority === 'High' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                          'bg-slate-800 text-slate-300 border-slate-700'
                        }`}>
                          {lead.priority}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border ${statusInfo.style}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-[11px]">
                        {new Date(lead.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <Link
                          href={`/pre-sales/leads/${lead.id}`}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded text-[11px] font-medium inline-flex items-center gap-1 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
