'use client';

import React, { useMemo, useState } from 'react';
import { LeadApi } from '@/lib/leadApi';
import { canHandleLeadCommercial, canPerformPmOperations, canPrepareCosting, canPrepareFeasibility, isCeoViewOnly } from '@/lib/rbac';
import { CostingRecord, FeasibilityStudy, Lead, Team, User } from '@/lib/types';
import { formatInrCompact } from '@/lib/format';
import {
  AlertTriangle, Check, CheckCircle2, RotateCcw, Send, Calculator, FileText, Handshake, Building2
} from 'lucide-react';

interface Props {
  lead: Lead;
  currentUser: User;
  teams: Team[];
  users: User[];
  onUpdated: () => void;
}

const emptyStudy = (lead: Lead): FeasibilityStudy => ({
  technical_feasibility: lead.feasibility_study?.technical_feasibility || '',
  required_resources: lead.feasibility_study?.required_resources || '',
  proposed_solution: lead.feasibility_study?.proposed_solution || '',
  major_constraints: lead.feasibility_study?.major_constraints || '',
  estimated_timeline: lead.feasibility_study?.estimated_timeline || '',
  technical_assumptions: lead.feasibility_study?.technical_assumptions || lead.technical_assumptions || '',
  required_equipment: lead.feasibility_study?.required_equipment || '',
  team_remarks: lead.feasibility_study?.team_remarks || '',
  documents: lead.feasibility_study?.documents || [],
  status: lead.feasibility_study?.status || 'DRAFT',
});

const emptyCost = (lead: Lead): CostingRecord => ({
  bom_components: lead.costing?.bom_components || '',
  vendor_requirements: lead.costing?.vendor_requirements || '',
  vendor_quotations: lead.costing?.vendor_quotations || '',
  component_costs: lead.costing?.component_costs || 0,
  procurement_costs: lead.costing?.procurement_costs || 0,
  engineering_costs: lead.costing?.engineering_costs || 0,
  software_costs: lead.costing?.software_costs || 0,
  installation_costs: lead.costing?.installation_costs || 0,
  other_costs: lead.costing?.other_costs || 0,
  total_estimated_cost: lead.costing?.total_estimated_cost || 0,
  commercial_assumptions: lead.costing?.commercial_assumptions || '',
  documents: lead.costing?.documents || [],
  status: lead.costing?.status || 'DRAFT',
});

export default function LeadCyclePanels({ lead, currentUser, teams, users, onUpdated }: Props) {
  const isPM = canPerformPmOperations(currentUser);
  const canQuote = canHandleLeadCommercial(currentUser, lead);
  const isOwner = lead.created_by_id === currentUser.id || lead.sales_owner_id === currentUser.id
    || currentUser.role_code === 'BUSINESS_HEAD'
    || (currentUser.role_code === 'ENG_DIRECTOR' && lead.business_vertical === 'Engineering Director');
  const isAssignedTL = currentUser.role_code === 'TEAM_LEAD' && (lead.assigned_team_lead_id === currentUser.id || currentUser.team_id === lead.assigned_team_id);
  const canFeasibility = canPrepareFeasibility(currentUser) && (
    isAssignedTL ||
    currentUser.team_id === lead.assigned_team_id ||
    lead.assigned_team_lead_id === currentUser.id
  );
  const canViewFeasibility = canFeasibility || isPM || isCeoViewOnly(currentUser) || ['CTO', 'ENG_DIRECTOR', 'BUSINESS_HEAD'].includes(currentUser.role_code);
  const canCost = canPrepareCosting(currentUser);
  const canViewCosting = canCost || isPM || isOwner || isCeoViewOnly(currentUser) || ['CTO', 'ENG_DIRECTOR'].includes(currentUser.role_code);
  const approvedFeasibility = lead.feasibility_study?.status === 'APPROVED';
  const approvedCosting = lead.costing?.status === 'APPROVED';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assignTeamId, setAssignTeamId] = useState(lead.assigned_team_id || '');
  const [assignLeadId, setAssignLeadId] = useState(lead.assigned_team_lead_id || '');
  const [pmNotes, setPmNotes] = useState(lead.pm_review_notes || '');
  const [returnReason, setReturnReason] = useState('');

  const [study, setStudy] = useState<FeasibilityStudy>(() => emptyStudy(lead));
  const [feasibilityDoc, setFeasibilityDoc] = useState('');
  const [costing, setCosting] = useState<CostingRecord>(() => emptyCost(lead));
  const [quote, setQuote] = useState({
    quotation_value: String(lead.quotation?.quotation_value || lead.expected_value || ''),
    commercial_terms: lead.quotation?.commercial_terms || '',
    validity: lead.quotation?.validity || '',
    payment_terms: lead.quotation?.payment_terms || '',
    delivery_terms: lead.quotation?.delivery_terms || '',
    document_name: lead.quotation?.document_name || '',
  });
  const [nego, setNego] = useState({
    customer_feedback: '',
    notes: '',
    revised_value: '',
    customer_requests: '',
    commercial_changes: '',
    follow_up_date: '',
    document_name: '',
  });

  const selectedTeam = teams.find((team) => team.id === assignTeamId);
  const teamLeads = useMemo(
    () => users.filter((user) => user.team_id === assignTeamId && (user.role_code === 'TEAM_LEAD' || user.id === selectedTeam?.team_lead_id)),
    [users, assignTeamId, selectedTeam]
  );

  const run = async (fn: () => Promise<unknown>, fail = 'Unable to update this lead.') => {
    setBusy(true);
    setError(null);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'ok' in result && (result as { ok?: boolean }).ok === false) {
        setError((result as { message?: string }).message || fail);
      } else if (!result) {
        setError(fail);
      } else {
        onUpdated();
      }
    } catch {
      setError(fail);
    } finally {
      setBusy(false);
    }
  };

  const costingTotal =
    Number(costing.component_costs || 0) +
    Number(costing.procurement_costs || 0) +
    Number(costing.engineering_costs || 0) +
    Number(costing.software_costs || 0) +
    Number(costing.installation_costs || 0) +
    Number(costing.other_costs || 0);

  const field = (label: string, value: string, onChange: (v: string) => void, rows = 2, readOnly = false) => (
    <div>
      <label className="mb-1 block font-semibold text-slate-300">{label}</label>
      <textarea
        rows={rows}
        readOnly={readOnly}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100 ${readOnly ? 'cursor-not-allowed text-slate-400' : ''}`}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/70 p-3 text-rose-300">{error}</div>
      )}

      {isPM && ['SUBMITTED_TO_PM', 'UNDER_PM_REVIEW', 'RESUBMITTED_TO_PM', 'ACCEPTED_FOR_FEASIBILITY'].includes(lead.status) && (
        <div className="space-y-4 rounded-xl border border-blue-800/80 bg-blue-950/40 p-5">
          <div className="flex items-center gap-2 border-b border-blue-800/60 pb-2 text-sm font-bold text-blue-300">
            <CheckCircle2 className="h-4 w-4 text-cyan-400" /> Accept & Assign Team
          </div>
          <p className="text-slate-300">If the project input is complete, assign a functional team. Feasibility starts immediately after this step.</p>
          {field('Constraints / observations', pmNotes, setPmNotes, 2)}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Functional Team *</label>
              <select
                value={assignTeamId}
                onChange={(e) => {
                  setAssignTeamId(e.target.value);
                  const team = teams.find((item) => item.id === e.target.value);
                  setAssignLeadId(team?.team_lead_id || '');
                }}
                className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
              >
                <option value="">Choose team…</option>
                {teams.filter((team) => team.status === 'ACTIVE').map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Team Lead (optional)</label>
              <select
                value={assignLeadId}
                onChange={(e) => setAssignLeadId(e.target.value)}
                className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
              >
                <option value="">Use team default — {selectedTeam?.team_lead_name || 'Not assigned'}</option>
                {teamLeads.map((member) => (
                  <option key={member.id} value={member.id}>{member.name} — {member.role_name}</option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            rows={2}
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            placeholder="Return reason (required only when returning for correction)"
            className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100"
          />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy}
              data-demo="accept-assign-team"
              onClick={() => {
                if (!assignTeamId) {
                  setError('Select a functional team to accept this lead and start feasibility.');
                  return;
                }
                void run(() => LeadApi.pmReview(lead.id, { action: 'approve_assign', team_id: assignTeamId, team_lead_id: assignLeadId || undefined, notes: pmNotes }));
              }}
              className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Accept & Assign Team
            </button>
            <button
              disabled={busy}
              onClick={() => run(() => LeadApi.pmReview(lead.id, { action: 'return', reason: returnReason, notes: pmNotes }))}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 font-bold text-slate-950 hover:bg-amber-500 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Return for Correction
            </button>
          </div>
        </div>
      )}

      {canViewFeasibility && ['ACCEPTED_FOR_FEASIBILITY', 'FEASIBILITY_IN_PROGRESS', 'FEASIBILITY_RETURNED', 'FEASIBILITY_SUBMITTED'].includes(lead.status) && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-100"><FileText className="h-4 w-4 text-cyan-400" /> Feasibility Study</h3>
            <span className="text-[11px] text-slate-400">{lead.assigned_team_name || 'Unassigned team'}{lead.assigned_team_lead_name ? ` · ${lead.assigned_team_lead_name}` : ''}</span>
          </div>
          {lead.status === 'FEASIBILITY_RETURNED' && (
            <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-amber-200">
              <AlertTriangle className="mr-1 inline h-4 w-4" /> {lead.feasibility_return_reason || 'PM returned this feasibility for correction.'}
            </div>
          )}
          {field('Technical feasibility', study.technical_feasibility, (v) => setStudy({ ...study, technical_feasibility: v }), 3, approvedFeasibility || !canFeasibility)}
          {field('Required resources', study.required_resources, (v) => setStudy({ ...study, required_resources: v }), 2, approvedFeasibility)}
          {field('Proposed solution', study.proposed_solution, (v) => setStudy({ ...study, proposed_solution: v }), 3, approvedFeasibility)}
          {field('Major constraints', study.major_constraints, (v) => setStudy({ ...study, major_constraints: v }), 2, approvedFeasibility)}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {field('Estimated timeline', study.estimated_timeline, (v) => setStudy({ ...study, estimated_timeline: v }), 1, approvedFeasibility)}
            {field('Required equipment / components', study.required_equipment, (v) => setStudy({ ...study, required_equipment: v }), 1, approvedFeasibility)}
          </div>
          {field('Technical assumptions', study.technical_assumptions, (v) => setStudy({ ...study, technical_assumptions: v }), 2, approvedFeasibility)}
          {field('Team remarks', study.team_remarks, (v) => setStudy({ ...study, team_remarks: v }), 2, approvedFeasibility)}
          {canFeasibility && !approvedFeasibility && lead.status !== 'FEASIBILITY_SUBMITTED' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={feasibilityDoc}
                onChange={(e) => setFeasibilityDoc(e.target.value)}
                placeholder="Feasibility document name"
                className="flex-1 rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
              />
              <button
                disabled={busy}
                onClick={() => run(() => LeadApi.saveFeasibility(lead.id, { ...study, documents: feasibilityDoc ? [...(study.documents || []), feasibilityDoc] : study.documents }, false))}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-medium text-slate-200"
              >
                Save Draft
              </button>
              <button
                disabled={busy}
                onClick={() => run(() => LeadApi.saveFeasibility(lead.id, { ...study, documents: feasibilityDoc ? [...(study.documents || []), feasibilityDoc] : study.documents }, true))}
                className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
              >
                <Send className="h-4 w-4" /> Submit Feasibility
              </button>
            </div>
          )}
        </div>
      )}

      {isPM && lead.status === 'FEASIBILITY_SUBMITTED' && (
        <div className="space-y-3 rounded-xl border border-emerald-800/80 bg-emerald-950/30 p-5">
          <div className="font-bold text-emerald-300">PM Approval — Feasibility</div>
          <textarea rows={2} value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Return reason if sending back to the team" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => run(() => LeadApi.reviewFeasibility(lead.id, 'approve'))} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">Approve Feasibility</button>
            <button disabled={busy} onClick={() => run(() => LeadApi.reviewFeasibility(lead.id, 'return', returnReason))} className="rounded-lg bg-amber-600 px-4 py-2 font-bold text-slate-950 hover:bg-amber-500">Return to Team</button>
          </div>
        </div>
      )}

      {canViewCosting && ['COSTING_IN_PROGRESS', 'COSTING_RETURNED', 'COSTING_SUBMITTED', 'QUOTATION', 'NEGOTIATION', 'ORDER_CONVERTED'].includes(lead.status) && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-sm font-bold text-slate-100">
            <Calculator className="h-4 w-4 text-cyan-400" /> Procurement / Costing
          </div>
          {lead.status === 'COSTING_RETURNED' && (
            <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-amber-200">{lead.costing_return_reason || 'PM returned costing for revision.'}</div>
          )}
          {field('BOM / components', costing.bom_components, (v) => setCosting({ ...costing, bom_components: v }), 2, approvedCosting || !canCost)}
          {field('Vendor requirements', costing.vendor_requirements, (v) => setCosting({ ...costing, vendor_requirements: v }), 2, approvedCosting || !canCost)}
          {field('Vendor quotations', costing.vendor_quotations, (v) => setCosting({ ...costing, vendor_quotations: v }), 2, approvedCosting || !canCost)}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {[
              ['Component costs', 'component_costs'],
              ['Procurement costs', 'procurement_costs'],
              ['Engineering / manufacturing', 'engineering_costs'],
              ['Software costs', 'software_costs'],
              ['Installation / commissioning', 'installation_costs'],
              ['Other project costs', 'other_costs'],
            ].map(([label, key]) => (
              <div key={key}>
                <label className="mb-1 block font-semibold text-slate-300">{label}</label>
                <input
                  type="number"
                  readOnly={approvedCosting || !canCost}
                  value={Number(costing[key as keyof CostingRecord] || 0)}
                  onChange={(e) => setCosting({ ...costing, [key]: Number(e.target.value) })}
                  className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100"
                />
              </div>
            ))}
          </div>
          <div className="rounded border border-slate-800 bg-slate-950 p-3 font-bold text-emerald-400">
            Total estimated project cost: {formatInrCompact(costingTotal)}
          </div>
          {field('Commercial assumptions', costing.commercial_assumptions, (v) => setCosting({ ...costing, commercial_assumptions: v }), 2, approvedCosting || !canCost)}
          {canCost && !approvedCosting && ['COSTING_IN_PROGRESS', 'COSTING_RETURNED'].includes(lead.status) && (
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => run(() => LeadApi.saveCosting(lead.id, { ...costing, total_estimated_cost: costingTotal }, false))} className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200">Save Draft</button>
              <button disabled={busy} onClick={() => run(() => LeadApi.saveCosting(lead.id, { ...costing, total_estimated_cost: costingTotal }, true))} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"><Send className="h-4 w-4" /> Submit Costing</button>
            </div>
          )}
        </div>
      )}

      {isPM && lead.status === 'COSTING_SUBMITTED' && (
        <div className="space-y-3 rounded-xl border border-emerald-800/80 bg-emerald-950/30 p-5">
          <div className="font-bold text-emerald-300">PM Approval — Costing</div>
          <textarea rows={2} value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Return reason if revision is required" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => run(() => LeadApi.reviewCosting(lead.id, 'approve'))} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">Approve Costing</button>
            <button disabled={busy} onClick={() => run(() => LeadApi.reviewCosting(lead.id, 'return', returnReason))} className="rounded-lg bg-amber-600 px-4 py-2 font-bold text-slate-950 hover:bg-amber-500">Return for Revision</button>
          </div>
        </div>
      )}

      {canQuote && ['QUOTATION', 'NEGOTIATION', 'ORDER_CONVERTED'].includes(lead.status) && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-sm font-bold text-slate-100">
            <Building2 className="h-4 w-4 text-cyan-400" /> Quotation — {lead.lead_number}
          </div>
          {approvedFeasibility && <p className="text-[11px] text-slate-400">Approved feasibility and costing are available on this same lead record.</p>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Quotation value</label>
              <input value={quote.quotation_value} onChange={(e) => setQuote({ ...quote, quotation_value: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Validity</label>
              <input value={quote.validity} onChange={(e) => setQuote({ ...quote, validity: e.target.value })} placeholder="e.g. 30 days" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Payment terms</label>
              <input value={quote.payment_terms} onChange={(e) => setQuote({ ...quote, payment_terms: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Delivery terms</label>
              <input value={quote.delivery_terms} onChange={(e) => setQuote({ ...quote, delivery_terms: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </div>
          </div>
          {field('Commercial terms', quote.commercial_terms, (v) => setQuote({ ...quote, commercial_terms: v }))}
          <input value={quote.document_name} onChange={(e) => setQuote({ ...quote, document_name: e.target.value })} placeholder="Quotation document name" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
          {lead.status === 'QUOTATION' && (
            <div className="flex gap-2">
              <button disabled={busy} onClick={() => run(() => LeadApi.saveQuotation(lead.id, { ...quote, quotation_value: Number(quote.quotation_value) || 0 }, false))} className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200">Save Quotation</button>
              <button disabled={busy} onClick={() => run(() => LeadApi.saveQuotation(lead.id, { ...quote, quotation_value: Number(quote.quotation_value) || 0 }, true))} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"><Send className="h-4 w-4" /> Send Quotation</button>
            </div>
          )}
        </div>
      )}

      {canQuote && ['NEGOTIATION', 'QUOTATION'].includes(lead.status) && (
        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <div className="flex items-center gap-2 border-b border-slate-800 pb-2 text-sm font-bold text-slate-100">
            <Handshake className="h-4 w-4 text-cyan-400" /> Negotiation
          </div>
          {field('Customer feedback', nego.customer_feedback, (v) => setNego({ ...nego, customer_feedback: v }))}
          {field('Negotiation notes', nego.notes, (v) => setNego({ ...nego, notes: v }))}
          {field('Customer requests', nego.customer_requests, (v) => setNego({ ...nego, customer_requests: v }))}
          {field('Commercial changes', nego.commercial_changes, (v) => setNego({ ...nego, commercial_changes: v }))}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input value={nego.revised_value} onChange={(e) => setNego({ ...nego, revised_value: e.target.value })} placeholder="Revised quotation value" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <input type="date" value={nego.follow_up_date} onChange={(e) => setNego({ ...nego, follow_up_date: e.target.value })} className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <input value={nego.document_name} onChange={(e) => setNego({ ...nego, document_name: e.target.value })} placeholder="Supporting document" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
          </div>
          {(lead.negotiation_history || []).length > 0 && (
            <div className="space-y-2">
              {(lead.negotiation_history || []).map((entry) => (
                <div key={entry.id} className="rounded border border-slate-800 bg-slate-950 p-3 text-slate-300">
                  <div className="flex justify-between"><span className="font-bold text-slate-100">{entry.created_by} · {entry.action}</span><span className="font-mono text-[11px] text-slate-500">{new Date(entry.created_at).toLocaleString()}</span></div>
                  <div>{entry.notes || entry.customer_feedback}</div>
                  {entry.revised_value != null && <div className="text-emerald-400">Revised value: {formatInrCompact(entry.revised_value)}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy} onClick={() => run(() => LeadApi.negotiation(lead.id, { ...nego, action: 'UPDATE', revised_value: nego.revised_value || undefined }))} className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-slate-200">Update Negotiation</button>
            <button disabled={busy} onClick={() => run(() => LeadApi.negotiation(lead.id, { ...nego, action: 'REVISED_QUOTATION', revised_value: nego.revised_value || undefined }))} className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500">Send Revised Quotation</button>
            <button disabled={busy} onClick={() => run(() => LeadApi.negotiation(lead.id, { ...nego, action: 'CONVERT' }))} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-500">Convert to Order</button>
            <button disabled={busy} onClick={() => run(() => LeadApi.negotiation(lead.id, { ...nego, action: 'LOST' }))} className="rounded-lg bg-rose-700 px-4 py-2 font-bold text-white hover:bg-rose-600">Mark as Lost</button>
          </div>
        </div>
      )}
    </div>
  );
}
