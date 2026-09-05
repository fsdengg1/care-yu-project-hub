'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { LiveDemoApi } from '@/lib/liveDemoApi';
import { UsersApi, directoryStatus } from '@/lib/usersApi';
import { LIVE_DEMO_STATUS_OPTIONS } from '@/lib/liveDemoStatus';
import { Lead, User } from '@/lib/types';

const SOURCES = [
  { id: 'CUSTOMER', label: 'Customer' },
  { id: 'BUSINESS_HEAD', label: 'Business Head' },
  { id: 'ENG_DIRECTOR', label: 'Engineering Director' },
  { id: 'SALES_OWNER', label: 'Sales Owner' },
  { id: 'PROJECT_MANAGER', label: 'Project Manager' },
  { id: 'OTHER', label: 'Other' },
];

type EligibleLead = {
  id: string;
  lead_number: string;
  title: string;
  customer_name: string;
  customer_contact?: string;
  sales_owner?: string;
  current_owner_name?: string;
  lead_owner?: string;
  status: string;
  required_solution?: string;
};

function activeUsers(users: User[]) {
  return users.filter((user) => directoryStatus(user).key !== 'INACTIVE' && user.status === 'ACTIVE' && !directoryStatus(user).pending);
}

export default function RequestLiveDemoModal({
  onClose,
  onCreated,
  presetLead,
  users: usersProp,
}: {
  onClose: () => void;
  onCreated: () => void;
  presetLead?: Lead | EligibleLead | null;
  users?: User[];
}) {
  const [leads, setLeads] = useState<EligibleLead[]>([]);
  const [users, setUsers] = useState<User[]>(usersProp || []);
  const [leadQuery, setLeadQuery] = useState('');
  const [leadId, setLeadId] = useState(presetLead?.id || '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [source, setSource] = useState('');
  const [requestedById, setRequestedById] = useState('');
  const [requestedByName, setRequestedByName] = useState('');
  const [reason, setReason] = useState('');
  const [requirement, setRequirement] = useState('');
  const [supportIds, setSupportIds] = useState<string[]>([]);
  const [supportQuery, setSupportQuery] = useState('');
  const [demonstratorId, setDemonstratorId] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [preferredTime, setPreferredTime] = useState('');
  const [mode, setMode] = useState('');
  const [location, setLocation] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('REQUESTED');
  const [pendingReason, setPendingReason] = useState('');
  const [customerAction, setCustomerAction] = useState('');
  const [internalAction, setInternalAction] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [actionOwnerId, setActionOwnerId] = useState('');
  const [customerOwnerId, setCustomerOwnerId] = useState('');
  const [ownerSearch, setOwnerSearch] = useState('');
  const [outcome, setOutcome] = useState('');
  const [whatDemonstrated, setWhatDemonstrated] = useState('');
  const [feedback, setFeedback] = useState('');
  const [questions, setQuestions] = useState('');
  const [issues, setIssues] = useState('');
  const [followUp, setFollowUp] = useState('NO');
  const [reference, setReference] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [participants, setParticipants] = useState([{ name: '', designation: '', company: '', email: '' }]);

  useEffect(() => {
    void (async () => {
      const [eligible, directory] = await Promise.all([
        LiveDemoApi.eligibleLeads(),
        usersProp?.length ? Promise.resolve({ ok: true as const, users: usersProp }) : UsersApi.list(),
      ]);
      if (eligible.ok) setLeads(eligible.data.leads || []);
      if (directory.ok) setUsers(directory.users);
    })();
  }, [usersProp]);

  const selectedLead = useMemo(
    () => leads.find((item) => item.id === leadId) || (presetLead && presetLead.id === leadId ? (presetLead as EligibleLead) : undefined),
    [leads, leadId, presetLead]
  );
  const people = activeUsers(users);
  const filteredLeads = leads.filter((item) =>
    `${item.lead_number} ${item.title} ${item.customer_name}`.toLowerCase().includes(leadQuery.trim().toLowerCase())
  );
  const filteredPeople = people.filter((item) =>
    `${item.name} ${item.role_name} ${item.email}`.toLowerCase().includes(supportQuery.trim().toLowerCase())
  );

  const ownerPeople = people.filter((item) =>
    `${item.name} ${item.role_name}`.toLowerCase().includes(ownerSearch.trim().toLowerCase())
  );
  const isPendingCustomer = status === 'PENDING_CUSTOMER';
  const isPendingInternal = status === 'PENDING_INTERNAL';
  const isPendingBoth = status === 'PENDING_BOTH';
  const isPending = isPendingCustomer || isPendingInternal || isPendingBoth;

  const submit = async () => {
    if (!leadId) {
      setError('Select a Lead / Project.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await LiveDemoApi.request(leadId, {
      status,
      request_source: source,
      requested_by_id: source === 'CUSTOMER' || source === 'OTHER' ? undefined : requestedById,
      requested_by_name: source === 'CUSTOMER' || source === 'OTHER' ? requestedByName : undefined,
      reason,
      customer_requirement: requirement,
      demonstration_requirements: requirement,
      requested_support_user_ids: supportIds,
      demonstrator_id: demonstratorId || undefined,
      preferred_date: preferredDate || undefined,
      preferred_time: preferredTime || undefined,
      scheduled_date: preferredDate || undefined,
      scheduled_time: preferredTime || undefined,
      mode: mode || undefined,
      location: location || undefined,
      meeting_link: meetingLink || undefined,
      additional_notes: notes || undefined,
      pending_reason: pendingReason || undefined,
      customer_action_required: customerAction || undefined,
      internal_action_required: internalAction || undefined,
      next_action: nextAction || undefined,
      action_owner_id: actionOwnerId || undefined,
      customer_action_owner_id: customerOwnerId || undefined,
      outcome: outcome || undefined,
      what_was_demonstrated: whatDemonstrated || undefined,
      customer_feedback: feedback || undefined,
      customer_questions: questions || undefined,
      issues: issues || undefined,
      follow_up_required: followUp === 'YES',
      live_case_reference: reference || undefined,
      cancellation_reason: cancelReason || undefined,
      customer_participants: participants.filter((item) => item.name.trim()),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to create the LIVE demonstration request.');
      return;
    }
    onCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-6 w-full max-w-3xl rounded-xl border border-slate-800 bg-slate-900 p-5 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-start justify-between border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100">Request Customer LIVE Demonstration</h3>
            <p className="mt-1 text-xs text-slate-400">Capture the actual customer request. Nothing is scheduled until review and assignment.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 text-xs text-slate-300">
          {error && <div className="rounded-lg border border-rose-800 bg-rose-950/40 px-3 py-2 text-rose-200">{error}</div>}
          {!presetLead && (
            <label className="block text-slate-300">
              Lead / Project
              <input value={leadQuery} onChange={(e) => setLeadQuery(e.target.value)} placeholder="Search lead, customer or project" className="form-control mt-1" />
              <select value={leadId} onChange={(e) => setLeadId(e.target.value)} className="form-control mt-2">
                <option value="">Select a lead</option>
                {filteredLeads.map((item) => (
                  <option key={item.id} value={item.id}>{item.lead_number} – {item.title}</option>
                ))}
              </select>
            </label>
          )}
          {selectedLead && (
            <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-950/50 p-3 sm:grid-cols-2">
              <ReadOnly label="Lead ID" value={selectedLead.lead_number} />
              <ReadOnly label="Project" value={selectedLead.title} />
              <ReadOnly label="Customer" value={selectedLead.customer_name} />
              <ReadOnly label="Sales Owner" value={selectedLead.sales_owner} />
              <ReadOnly label="Lead Owner" value={selectedLead.lead_owner || selectedLead.current_owner_name} />
              <ReadOnly label="Current Stage" value={String(selectedLead.status || '').replace(/_/g, ' ')} />
              <ReadOnly label="Required Solution" value={selectedLead.required_solution} />
            </div>
          )}
          <label className="block rounded-lg border border-cyan-800 bg-cyan-950/20 p-3 text-slate-200">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="form-control mt-1">
              {LIVE_DEMO_STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          {isPending && (
            <div className="space-y-3 rounded-lg border border-amber-800 bg-amber-950/20 p-3">
              <label className="block text-slate-300">
                Pending Reason
                <textarea rows={3} value={pendingReason} onChange={(e) => setPendingReason(e.target.value)} placeholder="Explain why the LIVE demonstration is currently pending." className="form-control mt-1" />
              </label>
              {(isPendingCustomer || isPendingBoth) && (
                <label className="block text-slate-300">
                  Customer Action Required
                  <textarea rows={3} value={customerAction} onChange={(e) => setCustomerAction(e.target.value)} placeholder="What must the customer confirm or provide?" className="form-control mt-1" />
                </label>
              )}
              {(isPendingInternal || isPendingBoth) && (
                <label className="block text-slate-300">
                  Internal Action Required
                  <textarea rows={3} value={internalAction} onChange={(e) => setInternalAction(e.target.value)} placeholder="What must Care Yu complete before the demonstration can proceed?" className="form-control mt-1" />
                </label>
              )}
              {isPendingBoth && (
                <label className="block text-slate-300">
                  Customer Action Owner / Responsible PMS User
                  <select value={customerOwnerId} onChange={(e) => setCustomerOwnerId(e.target.value)} className="form-control mt-1">
                    <option value="">Select PMS user</option>
                    {ownerPeople.map((item) => <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>)}
                  </select>
                </label>
              )}
              {(isPendingInternal || isPendingBoth) && (
                <label className="block text-slate-300">
                  {isPendingBoth ? 'Internal Action Owner' : 'Action Owner'}
                  <input value={ownerSearch} onChange={(e) => setOwnerSearch(e.target.value)} placeholder="Search active PMS users" className="form-control mt-1 mb-1" />
                  <select value={actionOwnerId} onChange={(e) => setActionOwnerId(e.target.value)} className="form-control">
                    <option value="">Select PMS user</option>
                    {ownerPeople.map((item) => <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>)}
                  </select>
                </label>
              )}
              <label className="block text-slate-300">
                Next Action
                <textarea rows={3} value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="What action is required to move the LIVE demonstration forward?" className="form-control mt-1" />
              </label>
            </div>
          )}
          <label className="block text-slate-300">
            Who Requested the LIVE Demonstration?
            <select value={source} onChange={(e) => setSource(e.target.value)} className="form-control mt-1">
              <option value="">Select</option>
              {SOURCES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          {source === 'CUSTOMER' || source === 'OTHER' ? (
            <label className="block text-slate-300">
              Requested By
              <input value={requestedByName} onChange={(e) => setRequestedByName(e.target.value)} placeholder={source === 'CUSTOMER' ? 'Customer contact name' : 'Requester details'} className="form-control mt-1" />
            </label>
          ) : source ? (
            <label className="block text-slate-300">
              Requested By
              <select value={requestedById} onChange={(e) => setRequestedById(e.target.value)} className="form-control mt-1">
                <option value="">Select PMS user</option>
                {people.map((item) => <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>)}
              </select>
            </label>
          ) : null}
          <label className="block text-slate-300">
            Reason for LIVE Demonstration
            <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does the customer require a LIVE demonstration?" className="form-control mt-1" />
          </label>
          <label className="block text-slate-300">
            Customer Demonstration Requirements
            <textarea rows={4} value={requirement} onChange={(e) => setRequirement(e.target.value)} placeholder="Describe exactly what the customer wants to see during the LIVE demonstration." className="form-control mt-1" />
          </label>
          <div>
            <div className="font-semibold text-slate-200">Requested Support</div>
            <p className="mt-1 text-[11px] text-slate-400">
              Names below are not selected yet. Tap a person to add them. Only selected people receive this request in notifications and My Assigned Work.
            </p>
            <input value={supportQuery} onChange={(e) => setSupportQuery(e.target.value)} placeholder="Search active PMS users" className="form-control mt-1" />
            <div className="mt-2 min-h-[28px] flex flex-wrap gap-1">
              {supportIds.length === 0 ? (
                <span className="text-[11px] text-slate-500">No one selected</span>
              ) : supportIds.map((id) => {
                const person = people.find((item) => item.id === id);
                return (
                  <button key={id} type="button" onClick={() => setSupportIds(supportIds.filter((item) => item !== id))} className="rounded-full border border-cyan-700 bg-cyan-950/40 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                    {person?.name || id} ×
                  </button>
                );
              })}
            </div>
            <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/40">
              {filteredPeople.map((item) => {
                const selected = supportIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSupportIds(selected ? supportIds.filter((id) => id !== item.id) : [...supportIds, item.id])}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-200 ${selected ? 'bg-cyan-950/40 font-semibold' : 'hover:bg-slate-800'}`}
                  >
                    <span className={`inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] ${selected ? 'border-cyan-500 bg-cyan-600 text-white' : 'border-slate-600 text-transparent'}`}>✓</span>
                    {item.name} – {item.role_name}
                  </button>
                );
              })}
            </div>
          </div>
          {(status === 'APPROVED' || status === 'ASSIGNED' || status === 'REQUESTED' || isPending) && (
          <label className="block text-slate-300">
            {status === 'APPROVED' || status === 'ASSIGNED' ? 'Demonstrator' : 'Preferred / Assigned Demonstrator'}
            <select value={demonstratorId} onChange={(e) => setDemonstratorId(e.target.value)} className="form-control mt-1">
              <option value="">{status === 'APPROVED' || status === 'ASSIGNED' ? 'Select PMS user' : 'Optional at request'}</option>
              {people.map((item) => <option key={item.id} value={item.id}>{item.name} – {item.role_name}</option>)}
            </select>
          </label>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-slate-300">{status === 'SCHEDULED' ? 'Demonstration Date' : 'Preferred Demo Date'}<input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className="form-control mt-1" /></label>
            <label className="block text-slate-300">{status === 'SCHEDULED' ? 'Demonstration Time' : 'Preferred Demo Time'}<input type="time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} className="form-control mt-1" /></label>
            <label className="block text-slate-300">
              Demonstration Mode
              <select value={mode} onChange={(e) => setMode(e.target.value)} className="form-control mt-1">
                <option value="">{status === 'SCHEDULED' ? 'Select mode' : 'Optional'}</option>
                <option value="ONLINE">Online</option>
                <option value="ON_SITE">On-site</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </label>
            <label className="block text-slate-300">Location / Meeting venue<input value={location} onChange={(e) => setLocation(e.target.value)} className="form-control mt-1" /></label>
            <label className="sm:col-span-2 block text-slate-300">Meeting Link<input value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} className="form-control mt-1" /></label>
          </div>
          {status === 'COMPLETED' && (
            <div className="space-y-3 rounded-lg border border-emerald-800 bg-emerald-950/20 p-3">
              <label className="block text-slate-300">Demonstration Outcome
                <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className="form-control mt-1">
                  <option value="">Select</option>
                  <option value="SUCCESSFUL">Successful</option>
                  <option value="SUCCESSFUL_WITH_FOLLOW_UP">Successful with Follow-up</option>
                  <option value="PARTIALLY_SUCCESSFUL">Partially Successful</option>
                  <option value="CUSTOMER_REQUESTED_CHANGES">Customer Requested Changes</option>
                  <option value="NOT_SUCCESSFUL">Not Successful</option>
                </select>
              </label>
              <label className="block text-slate-300">What Was Demonstrated<textarea rows={3} value={whatDemonstrated} onChange={(e) => setWhatDemonstrated(e.target.value)} className="form-control mt-1" /></label>
              <label className="block text-slate-300">Customer Feedback<textarea rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} className="form-control mt-1" /></label>
              <label className="block text-slate-300">Customer Questions<textarea rows={2} value={questions} onChange={(e) => setQuestions(e.target.value)} className="form-control mt-1" /></label>
              <label className="block text-slate-300">Issues / Gaps<textarea rows={2} value={issues} onChange={(e) => setIssues(e.target.value)} className="form-control mt-1" /></label>
              <label className="block text-slate-300">Follow-up Required
                <select value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="form-control mt-1">
                  <option value="NO">No</option>
                  <option value="YES">Yes</option>
                </select>
              </label>
            </div>
          )}
          {(status === 'CASE_REFERENCE_PENDING' || status === 'VERIFICATION_PENDING' || status === 'VERIFIED') && (
            <label className="block text-slate-300">
              LIVE Case Reference
              <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Enter the actual customer LIVE Case Reference" className="form-control mt-1" />
              {status === 'CASE_REFERENCE_PENDING' && (
                <p className="mt-1 text-[11px] text-slate-500">Leave blank if the customer has not provided a reference yet. A reference is never generated automatically.</p>
              )}
            </label>
          )}
          {status === 'CANCELLED' && (
            <label className="block text-slate-300">Cancellation reason
              <textarea rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} className="form-control mt-1" />
            </label>
          )}
          <div>
            <div className="font-semibold text-slate-200">Customer Participants</div>
            {participants.map((person, index) => (
              <div key={index} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <input placeholder="Name" value={person.name} onChange={(e) => {
                  const next = [...participants];
                  next[index] = { ...person, name: e.target.value };
                  setParticipants(next);
                }} className="form-control" />
                <input placeholder="Designation" value={person.designation} onChange={(e) => {
                  const next = [...participants];
                  next[index] = { ...person, designation: e.target.value };
                  setParticipants(next);
                }} className="form-control" />
                <input placeholder="Company" value={person.company} onChange={(e) => {
                  const next = [...participants];
                  next[index] = { ...person, company: e.target.value };
                  setParticipants(next);
                }} className="form-control" />
                <input placeholder="Email" value={person.email} onChange={(e) => {
                  const next = [...participants];
                  next[index] = { ...person, email: e.target.value };
                  setParticipants(next);
                }} className="form-control" />
              </div>
            ))}
            <button type="button" onClick={() => setParticipants([...participants, { name: '', designation: '', company: selectedLead?.customer_name || '', email: '' }])} className="mt-2 inline-flex items-center gap-1 text-cyan-400">
              <Plus className="h-3 w-3" /> Add participant
            </button>
          </div>
          <label className="block text-slate-300">
            Additional Notes
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="form-control mt-1" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
            Save LIVE Demonstration
          </button>
        </div>
      </div>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm text-slate-100">{value || '—'}</div>
    </div>
  );
}
