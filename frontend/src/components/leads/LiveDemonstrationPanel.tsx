'use client';

import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Lock, MonitorPlay, Plus, X } from 'lucide-react';
import EntityDocumentUpload from '@/components/documents/EntityDocumentUpload';
import RequestLiveDemoModal from '@/components/leads/RequestLiveDemoModal';
import { LiveDemoApi } from '@/lib/liveDemoApi';
import { formStatusValue, isLiveDemoPendingStatus, LIVE_DEMO_STATUS_OPTIONS, liveDemoStatusLabel } from '@/lib/liveDemoStatus';
import { formatLongDate } from '@/lib/format';
import {
  Lead,
  LiveDemoChecklistItem,
  LiveDemoCustomerParticipant,
  LiveDemonstration,
  LiveDemonstrationPayload,
  User,
} from '@/lib/types';

const STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  WAITING: 'Waiting',
  REQUESTED: 'Requested',
  PENDING: 'Pending',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  ASSIGNED: 'Assigned',
  SCHEDULED: 'Scheduled',
  IN_PROGRESS: 'In Progress',
  DEMONSTRATED: 'Demonstrated',
  CASE_REFERENCE_PENDING: 'Case Reference Pending',
  VERIFICATION_PENDING: 'Verification Pending',
  VERIFIED: 'Verified',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
};

const STATUS_CLASS: Record<string, string> = {
  NOT_STARTED: 'border-slate-300 bg-slate-50 text-slate-600 dark:border-slate-700 dark:text-slate-300',
  WAITING: 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-300',
  REQUESTED: 'border-sky-800 bg-sky-950/40 text-sky-300',
  PENDING: 'border-amber-800 bg-amber-950/40 text-amber-200',
  UNDER_REVIEW: 'border-amber-800 bg-amber-950/40 text-amber-200',
  APPROVED: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  ASSIGNED: 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
  SCHEDULED: 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300',
  IN_PROGRESS: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  DEMONSTRATED: 'border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
  CASE_REFERENCE_PENDING: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  VERIFICATION_PENDING: 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200',
  VERIFIED: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  COMPLETED: 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  REJECTED: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
  CANCELLED: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
};

const OUTCOMES = [
  { id: 'SUCCESSFUL', label: 'Successful' },
  { id: 'SUCCESSFUL_WITH_FOLLOW_UP', label: 'Successful with Follow-up' },
  { id: 'PARTIALLY_SUCCESSFUL', label: 'Partially Successful' },
  { id: 'CUSTOMER_REQUESTED_CHANGES', label: 'Customer Requested Changes' },
  { id: 'NOT_SUCCESSFUL', label: 'Not Successful' },
];

function emptyParticipant(company: string): LiveDemoCustomerParticipant {
  return { id: `cpart-${Date.now()}`, name: '', designation: '', company, email: '', phone: '' };
}

function pendingWithLabel(value?: string) {
  if (value === 'CUSTOMER') return 'Customer';
  if (value === 'INTERNAL') return 'Care Yu / Internal';
  if (value === 'BOTH') return 'Both';
  if (value === 'NONE') return 'Not Applicable';
  return '—';
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-100 wrap-break-word">{value || '—'}</div>
    </div>
  );
}

export default function LiveDemonstrationPanel({
  lead,
  users,
  currentUser,
  payload,
  onUpdated,
}: {
  lead: Lead;
  users: User[];
  currentUser: User;
  payload?: LiveDemonstrationPayload | null;
  onUpdated: () => Promise<void> | void;
}) {
  const available = Boolean(payload?.available || lead.costing?.status === 'APPROVED');
  const demo = payload?.demonstration || null;
  const locked = payload?.procurement_locked !== false && !['COMPLETED', 'VERIFIED'].includes(demo?.status || '');
  const canAct = Boolean(payload?.can_schedule) || ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN', 'CTO', 'SALES'].includes(currentUser.role_code);
  const canCreate = Boolean(payload?.can_create) || canAct;
  const canReview = Boolean(payload?.can_review) || ['PROJECT_MANAGER', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'SYSTEM_ADMIN', 'CEO', 'CTO'].includes(currentUser.role_code);
  const canAssign = Boolean(payload?.can_assign) || canReview;
  const canVerify = canReview;
  const activeUsers = users.filter((item) => item.status === 'ACTIVE');

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [assignForm, setAssignForm] = useState({
    coordinator_id: demo?.coordinator_id || currentUser.id,
    demonstrator_id: demo?.demonstrator_id || '',
    support_user_ids: demo?.support_user_ids || [],
  });
  const [assignOpen, setAssignOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [pendingForm, setPendingForm] = useState({
    pending_with: demo?.pending_with && demo.pending_with !== 'NONE' ? demo.pending_with : '',
    pending_reason: demo?.pending_reason || '',
    next_action: demo?.next_action || '',
    customer_action_required: demo?.customer_action_required || '',
    internal_action_required: demo?.internal_action_required || '',
    action_owner_id: demo?.action_owner_id || '',
    customer_action_owner_id: demo?.customer_action_owner_id || '',
    pending_resolution_note: '',
    resume_status: 'UNDER_REVIEW',
  });
  const [ownerSearch, setOwnerSearch] = useState('');
  const [completeOpen, setCompleteOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reference, setReference] = useState(demo?.live_case_reference || '');
  const [rejectReason, setRejectReason] = useState('');

  const [form, setForm] = useState({
    preferred_date: demo?.scheduled_date || '',
    preferred_time: demo?.scheduled_time || '',
    timezone: demo?.timezone || 'Asia/Kolkata',
    mode: demo?.mode || 'ONLINE',
    location: demo?.location || '',
    meeting_link: demo?.meeting_link || '',
    coordinator_id: demo?.coordinator_id || currentUser.id,
    demonstrator_id: demo?.demonstrator_id || '',
    support_user_ids: demo?.support_user_ids || [],
    purpose: demo?.purpose || '',
    scope: demo?.scope || '',
    reschedule_reason: '',
    customer_participants: demo?.customer_participants?.length
      ? demo.customer_participants
      : [emptyParticipant(lead.customer_name)],
  });

  const [completeForm, setCompleteForm] = useState({
    outcome: demo?.outcome || 'SUCCESSFUL',
    what_was_demonstrated: demo?.what_was_demonstrated || '',
    customer_feedback: demo?.customer_feedback || '',
    customer_questions: demo?.customer_questions || '',
    customer_concerns: demo?.customer_concerns || '',
    issues: demo?.issues || '',
    follow_up_required: demo?.follow_up_required ? 'YES' : 'NO',
    follow_up_details: demo?.follow_up_details || '',
    customer_interested: demo?.interest_level || 'YES',
    customer_decision: demo?.customer_decision || 'UNKNOWN',
  });

  const status = demo?.status || (available ? 'NOT_STARTED' : 'NOT_STARTED');

  const run = async (action: () => ReturnType<typeof LiveDemoApi.start>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to update LIVE Case Demonstration.');
      return;
    }
    setScheduleOpen(false);
    setCompleteOpen(false);
    setRescheduleOpen(false);
    setCancelOpen(false);
    setAssignOpen(false);
    setPendingOpen(false);
    setResolveOpen(false);
    await onUpdated();
  };

  const supportLabel = demo?.support_user_names?.filter(Boolean).join(' / ') || 'Not assigned';
  const ownerOptions = activeUsers.filter((item) => {
    const q = ownerSearch.trim().toLowerCase();
    if (!q) return true;
    return `${item.name} ${item.role_name} ${item.email || ''}`.toLowerCase().includes(q);
  });
  const pendingWith = demo?.pending_with;

  const checklist = demo?.checklist || [];

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const isDemoDay = Boolean(demo?.scheduled_date && demo.scheduled_date <= today && ['SCHEDULED', 'IN_PROGRESS'].includes(demo.status));

  if (!available) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-300">
          <Lock className="h-4 w-4 text-slate-500" /> LIVE Case Demonstration
        </div>
        <p className="mt-2 text-xs text-slate-500">
          This module becomes available after Solution &amp; Costing is completed.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-violet-900/50 bg-slate-900/90 p-5">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-violet-300">
            <MonitorPlay className="h-4 w-4" /> LIVE Case Demonstration
          </div>
          <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
            Manage customer requests for LIVE Care Yu demonstrations, scheduling, outcomes and LIVE Case References before Procurement.
          </p>
        </div>
        <label className="min-w-[220px]">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-cyan-300">Status</span>
          <select
            value={formStatusValue(status, demo?.pending_with)}
            disabled={!canAct || busy || ['COMPLETED', 'VERIFIED'].includes(status)}
            onChange={(e) => {
              const next = e.target.value;
              if (isLiveDemoPendingStatus(next)) {
                setPendingForm({
                  ...pendingForm,
                  pending_with: next === 'PENDING_INTERNAL' ? 'INTERNAL' : next === 'PENDING_BOTH' ? 'BOTH' : 'CUSTOMER',
                  pending_reason: demo?.pending_reason || pendingForm.pending_reason,
                  next_action: demo?.next_action || pendingForm.next_action,
                  customer_action_required: demo?.customer_action_required || pendingForm.customer_action_required,
                  internal_action_required: demo?.internal_action_required || pendingForm.internal_action_required,
                  action_owner_id: demo?.action_owner_id || pendingForm.action_owner_id,
                  customer_action_owner_id: demo?.customer_action_owner_id || pendingForm.customer_action_owner_id,
                });
                setPendingOpen(true);
                return;
              }
              if (next === 'SCHEDULED') {
                setScheduleOpen(true);
                return;
              }
              if (next === 'COMPLETED') {
                setCompleteOpen(true);
                return;
              }
              if (next === 'CANCELLED') {
                setCancelOpen(true);
                return;
              }
              void run(() => LiveDemoApi.update(lead.id, { status: next, demonstrator_id: demo?.demonstrator_id, support_user_ids: demo?.support_user_ids }));
            }}
            className="form-control text-xs"
          >
            {LIVE_DEMO_STATUS_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 text-xs text-slate-300">
        <Field label="Lead ID" value={lead.lead_number} />
        <Field label="Project" value={lead.title} />
        <Field label="Customer" value={lead.customer_name} />
        <Field label="Current Stage" value="Live Case Demonstration" />
        <Field label="Owner" value={lead.current_owner_name || lead.responsible_user_name} />
        <Field label="Sales Owner" value={lead.sales_owner} />
      </div>

      {error && <div className="rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{error}</div>}

      <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-2 text-xs">
        <Field label="Requested By" value={demo?.requested_by_name} />
        <Field label="Reason" value={demo?.reason} />
        <Field label="Customer Requirement" value={demo?.customer_requirement} />
        <Field label="Demonstration Requirements" value={demo?.demonstration_requirements} />
        <Field label="Coordinator" value={demo?.coordinator_name || 'Not assigned'} />
        <Field label="Requested Support" value={supportLabel} />
        <Field label="Next Action" value={demo?.next_action} />
        {demo?.scheduled_date && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 pt-2">
            <Field label="Date" value={formatLongDate(demo.scheduled_date)} />
            <Field label="Time" value={demo.scheduled_time} />
            <Field label="Mode" value={demo.mode?.replace('_', '-')} />
          </div>
        )}
        {demo?.demonstrator_name && <Field label="Demonstrator" value={demo.demonstrator_name} />}
      </div>

      {isLiveDemoPendingStatus(demo?.status) && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/25 p-4 space-y-2 text-xs text-amber-100">
          <div className="text-sm font-bold text-amber-200">
            {pendingWith === 'CUSTOMER' || demo?.status === 'PENDING_CUSTOMER'
              ? '⏳ Waiting for Customer'
              : pendingWith === 'INTERNAL' || demo?.status === 'PENDING_INTERNAL'
                ? '⏳ Internal Action Pending'
                : pendingWith === 'BOTH' || demo?.status === 'PENDING_BOTH'
                  ? '⏳ Customer + Internal Actions Pending'
                  : '⏳ PENDING'}
          </div>
          <Field label="Pending With" value={pendingWithLabel(pendingWith)} />
          <Field label="Pending Reason" value={demo.pending_reason} />
          <Field label="Action Owner" value={demo.action_owner_name} />
          {(pendingWith === 'CUSTOMER' || pendingWith === 'BOTH') && (
            <Field label="Customer Action Required" value={demo.customer_action_required} />
          )}
          {(pendingWith === 'INTERNAL' || pendingWith === 'BOTH') && (
            <Field label="Internal Action Required" value={demo.internal_action_required} />
          )}
          {pendingWith === 'CUSTOMER' && <Field label="Internal Action Required" value="—" />}
          {pendingWith === 'INTERNAL' && <Field label="Customer Action Required" value="—" />}
          <Field label="Next Action" value={demo.next_action} />
          <Field label="Pending Since" value={formatLongDate(demo.pending_since)} />
        </div>
      )}

      {!demo && (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-xs dark:border-slate-700">
          <div className="font-bold text-slate-800 dark:text-slate-100">No LIVE Demonstration Request</div>
          <p className="mt-1 text-slate-500">Status: NOT STARTED. Capture the customer request before scheduling.</p>
          {canCreate && (
            <button type="button" onClick={() => setRequestOpen(true)} className="mt-3 rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white">
              Request LIVE Demonstration
            </button>
          )}
        </div>
      )}

      {demo?.status === 'COMPLETED' && (
        <div className="rounded-lg border border-emerald-800 bg-emerald-950/30 p-4 text-xs text-emerald-100 space-y-1">
          <div className="font-bold flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> LIVE Case Reference received</div>
          <Field label="LIVE Case Reference" value={demo.live_case_reference} />
          <Field label="Demonstrated By" value={demo.completed_by || demo.demonstrator_name} />
          <Field label="Demonstration Date" value={formatLongDate(demo.completed_at || demo.scheduled_date)} />
          <Field label="Verified By" value={demo.verified_by} />
          <Field label="Verified Date" value={formatLongDate(demo.verified_at)} />
        </div>
      )}

      {(demo?.status === 'CASE_REFERENCE_PENDING' || demo?.status === 'VERIFICATION_PENDING') && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/20 p-4 space-y-3">
          <div className="text-xs font-bold text-amber-200">LIVE Case Reference</div>
          {canAct && demo.reference_status !== 'PENDING_VERIFICATION' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Enter the actual customer LIVE Case Reference"
                className="form-control flex-1"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => LiveDemoApi.saveReference(lead.id, reference))}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50"
              >
                Save LIVE Case Reference
              </button>
            </div>
          )}
          {demo.live_case_reference && (
            <Field label="Entered reference" value={demo.live_case_reference} />
          )}
          {canVerify && (demo.reference_status === 'PENDING_VERIFICATION' || demo.status === 'VERIFICATION_PENDING') && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => LiveDemoApi.verify(lead.id, { action: 'verify' }))}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500"
              >
                Verify Reference
              </button>
              <input
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rejection reason"
                className="form-control flex-1"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => LiveDemoApi.verify(lead.id, { action: 'reject', reason: rejectReason }))}
                className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-600"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}

      {demo?.follow_up_required && demo.status !== 'COMPLETED' && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/20 p-4 space-y-2 text-xs">
          <div className="font-bold text-amber-200">Follow-up required</div>
          <Field label="Details" value={demo.follow_up_details} />
          <Field label="Owner" value={demo.follow_up_owner_name} />
          <Field label="Status" value={demo.follow_up_status} />
          {canAct && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => LiveDemoApi.followUp(lead.id, { status: 'COMPLETED', description: demo.follow_up_details }))}
              className="rounded-lg border border-amber-700 px-3 py-1.5 font-bold text-amber-200"
            >
              Mark follow-up completed
            </button>
          )}
        </div>
      )}

      {checklist.length > 0 && ['SCHEDULED', 'IN_PROGRESS', 'ASSIGNED'].includes(status) && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
          <div className="mb-2 text-xs font-bold text-slate-200">Demonstration checklist</div>
          <div className="space-y-1.5">
            {checklist.map((item) => (
              <label key={item.id} className="flex items-start gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={item.done}
                  disabled={!canAct || busy}
                  onChange={(e) => {
                    const next: LiveDemoChecklistItem[] = checklist.map((row) =>
                      row.id === item.id ? { ...row, done: e.target.checked } : row
                    );
                    void run(() => LiveDemoApi.checklist(lead.id, next));
                  }}
                />
                <span className={item.done ? 'text-slate-500 line-through' : ''}>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {demo?.id && (
        <EntityDocumentUpload
          title="Demonstration Documents"
          entityType="LIVE_DEMO"
          entityId={demo.id}
          canEdit={canAct && demo.status !== 'COMPLETED'}
          ensureEntity={async () => demo.id}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {canCreate && ['NOT_STARTED', 'CANCELLED', 'REJECTED'].includes(status) && (
          <button type="button" onClick={() => setRequestOpen(true)} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500">
            Request LIVE Demonstration
          </button>
        )}
        {canReview && ['REQUESTED', 'REQUEST', 'UNDER_REVIEW'].includes(status) && (
          <>
            <button type="button" disabled={busy} onClick={() => void run(() => LiveDemoApi.review(lead.id, { action: 'approve' }))} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white">
              Approve
            </button>
            <button type="button" disabled={busy} onClick={() => void run(() => LiveDemoApi.review(lead.id, { action: 'reject', reason: reviewNote || 'Rejected' }))} className="rounded-lg bg-rose-700 px-4 py-2 text-xs font-bold text-white">
              Reject
            </button>
            <button type="button" disabled={busy} onClick={() => void run(() => LiveDemoApi.review(lead.id, { action: 'more_info', required_information: reviewNote, review_message: reviewNote }))} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-bold dark:border-slate-700">
              Request More Information
            </button>
            <input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Review note / required information" className="form-control min-w-[200px] flex-1" />
          </>
        )}
        {canAssign && ['APPROVED', 'ASSIGNED'].includes(status) && (
          <button type="button" onClick={() => setAssignOpen(true)} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white">
            Assign Demonstrator
          </button>
        )}
        {canAct && ['ASSIGNED', 'APPROVED', 'PENDING', 'PENDING_CUSTOMER', 'PENDING_INTERNAL', 'PENDING_BOTH'].includes(status) && (status !== 'PENDING' && !isLiveDemoPendingStatus(status) ? Boolean(demo?.demonstrator_id) : true) && (
          <button type="button" onClick={() => setScheduleOpen(true)} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500">
            Schedule Demonstration
          </button>
        )}
        {canAct && demo?.id && !['COMPLETED', 'VERIFIED', 'CANCELLED', 'REJECTED'].includes(status) && (
          <button
            type="button"
            onClick={() => {
              setPendingForm({
                pending_with: demo.pending_with && demo.pending_with !== 'NONE' ? demo.pending_with : '',
                pending_reason: demo.pending_reason || '',
                next_action: demo.next_action || '',
                customer_action_required: demo.customer_action_required || '',
                internal_action_required: demo.internal_action_required || '',
                action_owner_id: demo.action_owner_id || '',
                customer_action_owner_id: demo.customer_action_owner_id || '',
                pending_resolution_note: '',
                resume_status: 'UNDER_REVIEW',
              });
              setPendingOpen(true);
            }}
            className="rounded-lg border border-amber-700 px-4 py-2 text-xs font-bold text-amber-200"
          >
            {status === 'PENDING' || isLiveDemoPendingStatus(status) ? 'Update Pending Status' : 'Mark as Pending'}
          </button>
        )}
        {canReview && isLiveDemoPendingStatus(status) && (
          <button type="button" onClick={() => setResolveOpen(true)} className="rounded-lg border border-emerald-700 px-4 py-2 text-xs font-bold text-emerald-200">
            Resolve Pending
          </button>
        )}
        {canAct && status === 'SCHEDULED' && (
          <>
            <button type="button" onClick={() => setScheduleOpen(true)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100">
              Update Details
            </button>
            <button type="button" onClick={() => setRescheduleOpen(true)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-bold text-slate-100">
              Reschedule
            </button>
            {(isDemoDay || true) && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(() => LiveDemoApi.start(lead.id))}
                className="rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-500"
              >
                Start Demonstration
              </button>
            )}
            <button type="button" onClick={() => setCancelOpen(true)} className="rounded-lg border border-rose-800 px-4 py-2 text-xs font-bold text-rose-300">
              Cancel
            </button>
          </>
        )}
        {canAct && status === 'IN_PROGRESS' && (
          <button type="button" onClick={() => setCompleteOpen(true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">
            Complete Demonstration
          </button>
        )}
        {!locked && (demo?.status === 'COMPLETED' || demo?.status === 'VERIFIED') && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => LiveDemoApi.proceedProcurement(lead.id))}
            className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
          >
            Proceed to Procurement
          </button>
        )}
      </div>

      <div className="rounded-lg border border-slate-800 px-3 py-2 text-[11px] text-slate-400">
        Procurement: {locked ? <span className="font-bold text-rose-300">LOCKED</span> : <span className="font-bold text-emerald-300">UNLOCKED</span>}
      </div>

      {(scheduleOpen || rescheduleOpen) && (
        <Modal title={rescheduleOpen ? 'Reschedule Customer LIVE Demonstration' : 'Schedule Customer LIVE Demonstration'} onClose={() => { setScheduleOpen(false); setRescheduleOpen(false); }}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
            <label className="block">Customer<input readOnly value={lead.customer_name} className="form-control mt-1" /></label>
            <label className="block">Lead ID<input readOnly value={lead.lead_number} className="form-control mt-1" /></label>
            <label className="sm:col-span-2 block">Project<input readOnly value={lead.title} className="form-control mt-1" /></label>
            <label className="block">Preferred Date<input type="date" value={form.preferred_date} onChange={(e) => setForm({ ...form, preferred_date: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Preferred Time<input type="time" value={form.preferred_time} onChange={(e) => setForm({ ...form, preferred_time: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Timezone<input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Mode
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as typeof form.mode })} className="form-control mt-1">
                <option value="ON_SITE">On-site</option>
                <option value="ONLINE">Online</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </label>
            <label className="block">Location<input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="form-control mt-1" /></label>
            <label className="sm:col-span-2 block">Meeting Link<input value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Coordinator
              <select value={form.coordinator_id} onChange={(e) => setForm({ ...form, coordinator_id: e.target.value })} className="form-control mt-1">
                {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role_name}</option>)}
              </select>
            </label>
            <label className="block">Demonstrator
              <select value={form.demonstrator_id} onChange={(e) => setForm({ ...form, demonstrator_id: e.target.value })} className="form-control mt-1">
                <option value="">Select user</option>
                {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role_name}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2 block">Support Required
              <select
                multiple
                value={form.support_user_ids}
                onChange={(e) => setForm({ ...form, support_user_ids: Array.from(e.target.selectedOptions).map((opt) => opt.value) })}
                className="form-control mt-1 h-24"
              >
                {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.role_name}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2 block">Purpose<textarea rows={2} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} className="form-control mt-1" /></label>
            <label className="sm:col-span-2 block">Expected Demonstration Scope<textarea rows={3} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} className="form-control mt-1" /></label>
            {rescheduleOpen && (
              <label className="sm:col-span-2 block">Reason<textarea rows={2} value={form.reschedule_reason} onChange={(e) => setForm({ ...form, reschedule_reason: e.target.value })} className="form-control mt-1" /></label>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <div className="text-xs font-bold text-slate-200">Customer participants</div>
            {form.customer_participants.map((person, index) => (
              <div key={person.id} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input placeholder="Name" value={person.name} onChange={(e) => {
                  const next = [...form.customer_participants];
                  next[index] = { ...person, name: e.target.value };
                  setForm({ ...form, customer_participants: next });
                }} className="form-control" />
                <input placeholder="Designation" value={person.designation || ''} onChange={(e) => {
                  const next = [...form.customer_participants];
                  next[index] = { ...person, designation: e.target.value };
                  setForm({ ...form, customer_participants: next });
                }} className="form-control" />
                <input placeholder="Company" value={person.company || ''} onChange={(e) => {
                  const next = [...form.customer_participants];
                  next[index] = { ...person, company: e.target.value };
                  setForm({ ...form, customer_participants: next });
                }} className="form-control" />
                <input placeholder="Email" value={person.email || ''} onChange={(e) => {
                  const next = [...form.customer_participants];
                  next[index] = { ...person, email: e.target.value };
                  setForm({ ...form, customer_participants: next });
                }} className="form-control" />
              </div>
            ))}
            <button type="button" onClick={() => setForm({ ...form, customer_participants: [...form.customer_participants, emptyParticipant(lead.customer_name)] })} className="inline-flex items-center gap-1 text-xs text-cyan-400">
              <Plus className="h-3 w-3" /> Add participant
            </button>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => { setScheduleOpen(false); setRescheduleOpen(false); }} className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-200">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => LiveDemoApi.schedule(lead.id, {
                preferred_date: form.preferred_date,
                preferred_time: form.preferred_time,
                timezone: form.timezone,
                mode: form.mode,
                location: form.location,
                meeting_link: form.meeting_link,
                coordinator_id: form.coordinator_id,
                demonstrator_id: form.demonstrator_id,
                support_user_ids: form.support_user_ids,
                purpose: form.purpose,
                scope: form.scope,
                customer_participants: form.customer_participants,
                reschedule_reason: form.reschedule_reason,
              }))}
              className="rounded-lg bg-cyan-600 px-4 py-1.5 font-bold text-white"
            >
              Schedule Demonstration
            </button>
          </div>
        </Modal>
      )}

      {completeOpen && (
        <Modal title="Complete LIVE Demonstration" onClose={() => setCompleteOpen(false)}>
          <div className="space-y-3 text-xs">
            <label className="block">Demonstration Outcome
              <select value={completeForm.outcome} onChange={(e) => setCompleteForm({ ...completeForm, outcome: e.target.value })} className="form-control mt-1">
                {OUTCOMES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="block">What Was Demonstrated<textarea rows={3} value={completeForm.what_was_demonstrated} onChange={(e) => setCompleteForm({ ...completeForm, what_was_demonstrated: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Customer Feedback<textarea rows={3} value={completeForm.customer_feedback} onChange={(e) => setCompleteForm({ ...completeForm, customer_feedback: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Customer Questions<textarea rows={2} value={completeForm.customer_questions} onChange={(e) => setCompleteForm({ ...completeForm, customer_questions: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Customer Concerns<textarea rows={2} value={completeForm.customer_concerns} onChange={(e) => setCompleteForm({ ...completeForm, customer_concerns: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Issues / Gaps<textarea rows={2} value={completeForm.issues} onChange={(e) => setCompleteForm({ ...completeForm, issues: e.target.value })} className="form-control mt-1" /></label>
            <label className="block">Follow-up Required
              <select value={completeForm.follow_up_required} onChange={(e) => setCompleteForm({ ...completeForm, follow_up_required: e.target.value })} className="form-control mt-1">
                <option value="NO">No</option>
                <option value="YES">Yes</option>
              </select>
            </label>
            {completeForm.follow_up_required === 'YES' && (
              <label className="block">Follow-up Details<textarea rows={2} value={completeForm.follow_up_details} onChange={(e) => setCompleteForm({ ...completeForm, follow_up_details: e.target.value })} className="form-control mt-1" /></label>
            )}
            <label className="block">Customer Decision
              <select value={completeForm.customer_decision} onChange={(e) => setCompleteForm({ ...completeForm, customer_decision: e.target.value })} className="form-control mt-1">
                <option value="PROCEEDING">Proceeding</option>
                <option value="INTERNAL_REVIEW">Internal Review</option>
                <option value="CHANGES_REQUIRED">Changes Required</option>
                <option value="NOT_PROCEEDING">Not Proceeding</option>
                <option value="UNKNOWN">Unknown</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setCompleteOpen(false)} className="rounded-lg bg-slate-800 px-3 py-1.5">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => LiveDemoApi.complete(lead.id, {
                ...completeForm,
                follow_up_required: completeForm.follow_up_required === 'YES',
              }))}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 font-bold text-white"
            >
              Complete Demonstration
            </button>
          </div>
        </Modal>
      )}

      {cancelOpen && (
        <Modal title="Cancel Demonstration" onClose={() => setCancelOpen(false)}>
          <textarea rows={4} value={form.reschedule_reason} onChange={(e) => setForm({ ...form, reschedule_reason: e.target.value })} placeholder="Cancellation reason" className="form-control" />
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setCancelOpen(false)} className="rounded-lg bg-slate-800 px-3 py-1.5">Back</button>
            <button type="button" disabled={busy} onClick={() => void run(() => LiveDemoApi.cancel(lead.id, form.reschedule_reason))} className="rounded-lg bg-rose-700 px-4 py-1.5 font-bold text-white">Cancel Demonstration</button>
          </div>
        </Modal>
      )}

      {assignOpen && (
        <Modal title="Assign Demonstrator and Support" onClose={() => setAssignOpen(false)}>
          <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            <label className="block">Coordinator
              <select value={assignForm.coordinator_id} onChange={(e) => setAssignForm({ ...assignForm, coordinator_id: e.target.value })} className="form-control mt-1">
                {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>)}
              </select>
            </label>
            <label className="block">Demonstrator
              <select value={assignForm.demonstrator_id} onChange={(e) => setAssignForm({ ...assignForm, demonstrator_id: e.target.value })} className="form-control mt-1">
                <option value="">Select user</option>
                {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>)}
              </select>
            </label>
            <label className="sm:col-span-2 block">Support Users
              <select multiple value={assignForm.support_user_ids} onChange={(e) => setAssignForm({ ...assignForm, support_user_ids: Array.from(e.target.selectedOptions).map((opt) => opt.value) })} className="form-control mt-1 h-28">
                {activeUsers.map((item) => <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setAssignOpen(false)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void run(() => LiveDemoApi.assign(lead.id, assignForm))} className="rounded-lg bg-cyan-600 px-4 py-1.5 text-xs font-bold text-white">Assign</button>
          </div>
        </Modal>
      )}

      {pendingOpen && (
        <Modal title="Update Pending Status" onClose={() => setPendingOpen(false)}>
          <div className="space-y-3 text-xs">
            <label className="block">Pending With
              <select
                value={pendingForm.pending_with}
                onChange={(e) => setPendingForm({ ...pendingForm, pending_with: e.target.value })}
                className="form-control mt-1"
              >
                <option value="">Select</option>
                <option value="CUSTOMER">Customer</option>
                <option value="INTERNAL">Care Yu / Internal</option>
                <option value="BOTH">Both</option>
                <option value="NONE">Not Applicable</option>
              </select>
            </label>
            <label className="block">Pending Reason
              <textarea
                rows={4}
                value={pendingForm.pending_reason}
                onChange={(e) => setPendingForm({ ...pendingForm, pending_reason: e.target.value })}
                placeholder="Explain why the LIVE demonstration is currently pending."
                className="form-control mt-1"
              />
            </label>
            {(pendingForm.pending_with === 'CUSTOMER' || pendingForm.pending_with === 'BOTH') && (
              <label className="block">Customer Action Required
                <textarea
                  rows={3}
                  value={pendingForm.customer_action_required}
                  onChange={(e) => setPendingForm({ ...pendingForm, customer_action_required: e.target.value })}
                  placeholder="What must the customer confirm or provide?"
                  className="form-control mt-1"
                />
              </label>
            )}
            {(pendingForm.pending_with === 'INTERNAL' || pendingForm.pending_with === 'BOTH') && (
              <label className="block">Internal Action Required
                <textarea
                  rows={3}
                  value={pendingForm.internal_action_required}
                  onChange={(e) => setPendingForm({ ...pendingForm, internal_action_required: e.target.value })}
                  placeholder="What must Care Yu complete before the demonstration can proceed?"
                  className="form-control mt-1"
                />
              </label>
            )}
            {pendingForm.pending_with === 'BOTH' && (
              <label className="block">Customer Action Owner / Responsible PMS User
                <select
                  value={pendingForm.customer_action_owner_id}
                  onChange={(e) => setPendingForm({ ...pendingForm, customer_action_owner_id: e.target.value })}
                  className="form-control mt-1"
                >
                  <option value="">Select user</option>
                  {ownerOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="block">Action Owner
              <input
                value={ownerSearch}
                onChange={(e) => setOwnerSearch(e.target.value)}
                placeholder="Search PMS users"
                className="form-control mt-1 mb-1"
              />
              <select
                value={pendingForm.action_owner_id}
                onChange={(e) => setPendingForm({ ...pendingForm, action_owner_id: e.target.value })}
                className="form-control"
              >
                <option value="">Select user</option>
                {ownerOptions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>
                ))}
              </select>
            </label>
            <label className="block">Next Action
              <textarea
                rows={3}
                value={pendingForm.next_action}
                onChange={(e) => setPendingForm({ ...pendingForm, next_action: e.target.value })}
                placeholder="What action is required to move the LIVE demonstration forward?"
                className="form-control mt-1"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setPendingOpen(false)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => LiveDemoApi.pending(lead.id, pendingForm))}
              className="rounded-lg bg-amber-600 px-4 py-1.5 text-xs font-bold text-white"
            >
              Save Pending Status
            </button>
          </div>
        </Modal>
      )}

      {resolveOpen && (
        <Modal title="Resolve Pending" onClose={() => setResolveOpen(false)}>
          <div className="space-y-3 text-xs">
            <label className="block">Resolution / Update
              <textarea
                rows={4}
                value={pendingForm.pending_resolution_note}
                onChange={(e) => setPendingForm({ ...pendingForm, pending_resolution_note: e.target.value })}
                placeholder="Describe how the pending action was completed."
                className="form-control mt-1"
              />
            </label>
            <label className="block">Move to
              <select
                value={pendingForm.resume_status}
                onChange={(e) => setPendingForm({ ...pendingForm, resume_status: e.target.value })}
                className="form-control mt-1"
              >
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="APPROVED">Approved</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="SCHEDULED">Scheduled</option>
              </select>
            </label>
            <p className="text-slate-500">Scheduled is allowed only when a demonstration date already exists.</p>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={() => setResolveOpen(false)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs">Cancel</button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => LiveDemoApi.resolvePending(lead.id, {
                pending_resolution_note: pendingForm.pending_resolution_note,
                resume_status: pendingForm.resume_status,
              }))}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white"
            >
              Resolve Pending
            </button>
          </div>
        </Modal>
      )}

      {requestOpen && (
        <RequestLiveDemoModal
          presetLead={lead}
          users={users}
          onClose={() => setRequestOpen(false)}
          onCreated={() => void onUpdated()}
        />
      )}

      {(payload?.activity || []).length > 0 && (
        <div className="rounded-lg border border-slate-200 p-4 text-xs dark:border-slate-800">
          <div className="mb-2 font-bold text-slate-800 dark:text-slate-100">Activity History</div>
          <ul className="space-y-1 text-slate-600 dark:text-slate-400">
            {payload?.activity?.map((event) => (
              <li key={`${event.at}-${event.label}`}>{formatLongDate(event.at)} — {event.label}{event.detail ? `: ${event.detail}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <CalendarClock className="h-4 w-4 text-cyan-400" /> {title}
          </h3>
          <button type="button" onClick={onClose}><X className="h-4 w-4 text-slate-400" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
