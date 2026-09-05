'use client';

import React, { useMemo, useState } from 'react';
import { Lead, User, VisitStatus } from '@/lib/types';
import { LeadApi } from '@/lib/leadApi';
import { canPerformPmOperations } from '@/lib/rbac';
import { CAREYU_OFFICE_ADDRESS } from '@/lib/company';
import { WorkflowActionFeedback } from '@/components/leads/WorkflowStatusBanner';
import { MapPin, Users } from 'lucide-react';

const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  NOT_REQUIRED: 'Not Required',
  PENDING_PM_ASSIGNMENT: 'Pending PM Assignment',
  TEAM_ASSIGNED: 'Team Assigned',
  SCHEDULED: 'Scheduled',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
};

export default function VisitManagementPanel({
  lead,
  currentUser,
  users,
  onUpdated,
}: {
  lead: Lead;
  currentUser: User;
  users: User[];
  onUpdated: (feedback?: WorkflowActionFeedback) => void;
}) {
  const isPM = canPerformPmOperations(currentUser);
  const requirement = lead.visit_requirement || 'NONE';
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>(lead.visit_assigned_user_ids || []);
  const [scheduledDate, setScheduledDate] = useState(lead.visit_scheduled_date || lead.visit_preferred_date || '');
  const [scheduledTime, setScheduledTime] = useState(lead.visit_scheduled_time || lead.visit_preferred_time || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAssign, setShowAssign] = useState(false);

  const eligible = useMemo(
    () =>
      users
        .filter((user) => user.status === 'ACTIVE')
        .filter((user) => {
          const q = search.trim().toLowerCase();
          if (!q) return true;
          return `${user.name} ${user.role_name} ${user.team_name || ''}`.toLowerCase().includes(q);
        }),
    [users, search]
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (!result) {
        setError('Unable to update visit details.');
        return;
      }
      onUpdated({ kind: 'submit', message: 'Visit details updated.' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update visit details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5 text-xs">
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <MapPin className="h-4 w-4 text-cyan-400" /> Visit Information
        </h3>
        <span className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
          {VISIT_STATUS_LABELS[lead.visit_status || 'NOT_REQUIRED']}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Visit Requirement</div>
          <div className="mt-1 font-semibold text-slate-200">
            {requirement === 'CUSTOMER_SITE'
              ? 'CareYu Team Visit to Customer Site'
              : requirement === 'CAREYU_OFFICE'
                ? 'Customer Visit to CareYu Office'
                : 'No Visit Required'}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Preferred Date</div>
          <div className="mt-1 text-slate-200">{lead.visit_preferred_date || '—'}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Preferred Time</div>
          <div className="mt-1 text-slate-200">{lead.visit_preferred_time || '—'}</div>
        </div>
      </div>

      {requirement === 'CUSTOMER_SITE' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Customer Site</div>
            <div className="mt-1 text-slate-200">{lead.visit_site_name || '—'}</div>
            <div className="text-slate-400">{lead.visit_site_address}</div>
            <div className="text-slate-400">{[lead.visit_city, lead.visit_state, lead.visit_country].filter(Boolean).join(', ')}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Site Contact</div>
            <div className="mt-1 text-slate-200">{lead.visit_contact_name || '—'}</div>
            <div className="text-slate-400">{lead.visit_contact_phone} · {lead.visit_contact_email}</div>
            {lead.visit_remarks && <div className="mt-1 text-slate-400">{lead.visit_remarks}</div>}
          </div>
        </div>
      )}

      {requirement === 'CAREYU_OFFICE' && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Visitor</div>
            <div className="mt-1 text-slate-200">{lead.visit_visitor_name || '—'} · {lead.visit_visitor_designation || ''}</div>
            <div className="text-slate-400">{lead.visit_visitor_count ? `${lead.visit_visitor_count} visitor(s)` : ''} · {lead.customer_name}</div>
            <div className="mt-1 text-slate-400">{lead.visit_purpose}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">CareYu Office</div>
            <pre className="mt-1 whitespace-pre-wrap font-sans text-slate-300">{lead.visit_office_address || CAREYU_OFFICE_ADDRESS}</pre>
          </div>
        </div>
      )}

      {requirement !== 'NONE' && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center gap-2 font-semibold text-slate-200">
            <Users className="h-4 w-4 text-cyan-400" /> Assigned Visit Team
          </div>
          {(lead.visit_assigned_user_names || []).length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(lead.visit_assigned_user_names || []).map((name) => (
                <span key={name} className="rounded-full border border-cyan-800 bg-cyan-950 px-2 py-0.5 text-[11px] text-cyan-200">{name}</span>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-slate-500">PM has not assigned CareYu team members yet.</p>
          )}
          {lead.visit_assigned_by && (
            <p className="mt-1 text-[11px] text-slate-500">Assigned by {lead.visit_assigned_by}{lead.visit_assigned_at ? ` · ${new Date(lead.visit_assigned_at).toLocaleString()}` : ''}</p>
          )}
        </div>
      )}

      {isPM && requirement !== 'NONE' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowAssign((open) => !open)}
            className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
          >
            Assign Visit Team
          </button>
          {showAssign && (
            <div className="space-y-2 rounded-lg border border-cyan-900 bg-slate-950 p-3">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search CareYu users" className="form-control" />
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {eligible.map((user) => (
                  <label key={user.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-slate-900">
                    <input
                      type="checkbox"
                      checked={selected.includes(user.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(user.id) ? current.filter((id) => id !== user.id) : [...current, user.id]
                        )
                      }
                    />
                    <span className="text-slate-200">{user.name}</span>
                    <span className="text-slate-500">{user.role_name}{user.team_name ? ` · ${user.team_name}` : ''}</span>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => LeadApi.assignVisitTeam(lead.id, selected))}
                className="rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                Save assigned members
              </button>
            </div>
          )}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className="form-control" />
            <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="form-control" />
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => LeadApi.scheduleVisit(lead.id, { scheduled_date: scheduledDate, scheduled_time: scheduledTime, status: lead.visit_scheduled_date ? 'RESCHEDULED' : 'SCHEDULED' }))}
              className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200"
            >
              {lead.visit_scheduled_date ? 'Update scheduled date' : 'Mark visit scheduled'}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void run(() => LeadApi.scheduleVisit(lead.id, { status: 'COMPLETED' }))} className="rounded-lg bg-emerald-700 px-3 py-1.5 font-semibold text-white">Visit Completed</button>
            <button type="button" disabled={busy} onClick={() => void run(() => LeadApi.scheduleVisit(lead.id, { status: 'CANCELLED' }))} className="rounded-lg bg-rose-700 px-3 py-1.5 font-semibold text-white">Cancel Visit</button>
          </div>
        </div>
      )}
      {error && <p className="text-rose-400">{error}</p>}
    </div>
  );
}
