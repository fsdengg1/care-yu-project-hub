'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { canCreateLead } from '@/lib/rbac';
import { LeadApi } from '@/lib/leadApi';
import { BusinessVertical, CustomerType, LeadCustomField, LeadDocument, PriorityLevel, User } from '@/lib/types';
import { VISION_DEMO_LEAD } from '@/lib/demoVisionLead';
import AdditionalFieldRow from '@/components/leads/AdditionalFieldRow';
import FormSection from '@/components/leads/FormSection';
import LeadDocumentUpload from '@/components/leads/LeadDocumentUpload';
import EntityDocumentUpload from '@/components/documents/EntityDocumentUpload';
import SubmitLeadModal from '@/components/leads/SubmitLeadModal';
import { AlertCircle, ArrowLeft, Building2, CheckCircle2, Plus, Save, Send, Sparkles } from 'lucide-react';

const SOLUTION_OPTIONS = [
  'Vision Inspection System',
  'Robotics Cell',
  'Conveyor / Line Automation',
  'ASRS / Shuttle',
  'Palletizer',
  'PLC / Controls',
  'Other',
];

function fieldClass(invalid?: boolean) {
  return `w-full rounded border p-2 focus:border-cyan-500 ${
    invalid ? 'border-rose-700 bg-rose-950/30 text-slate-100' : 'border-slate-800 bg-slate-950 text-slate-100'
  }`;
}

function CreateLeadForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('id');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [leadId, setLeadId] = useState<string | null>(editId);
  const [leadNumber, setLeadNumber] = useState('');
  const [leadStatus, setLeadStatus] = useState('DRAFT');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [customFields, setCustomFields] = useState<LeadCustomField[]>([]);
  const persistLock = useRef<Promise<string | null> | null>(null);
  const leadIdRef = useRef<string | null>(editId);

  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_type: 'Automotive' as CustomerType,
    business_vertical: 'Business Head' as BusinessVertical,
    expected_decision_date: '',
    priority: 'Medium' as PriorityLevel,
    customer_contact: '',
    customer_designation: '',
    customer_email: '',
    customer_phone: '',
    customer_location: '',
    plant_location: '',
    project_description: '',
    requirement_summary: '',
    detailed_requirement: '',
    application: '',
    industry_process: '',
    current_process: '',
    expected_automation: '',
    required_solution: '',
    customer_objective: '',
    customer_challenge: '',
    competitor_information: '',
    expected_project_timeline: '',
    customer_target_date: '',
    production_quantity: '',
    production_rate: '',
    cycle_time: '',
    shift_pattern: '',
    operating_hours: '',
    existing_equipment: '',
    existing_automation: '',
    integration_requirements: '',
    technical_requirements: '',
    machine_dimensions: '',
    payload: '',
    accuracy_requirement: '',
    environment_conditions: '',
    technical_specifications: '',
    technical_assumptions: '',
    customer_dependencies: '',
    customer_budget: '',
    estimated_opportunity_value: '',
    currency: 'INR',
    expected_po_date: '',
    commercial_remarks: '',
    additional_notes: '',
    required_documents: '',
  });

  const isEdit = Boolean(leadId);
  const canEdit = ['DRAFT', 'RETURNED_TO_SALES', 'ADDITIONAL_INFORMATION_REQUIRED'].includes(leadStatus);

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    setCurrentUser(user);
    if (user && !canCreateLead(user)) {
      router.replace('/pre-sales/leads');
      return;
    }
    setLeadNumber(StorageService.generateLeadNumber());
    if (user?.role_code === 'ENG_DIRECTOR') {
      setFormData((prev) => ({ ...prev, business_vertical: 'Engineering Director' }));
    }
    if (editId) {
      void (async () => {
        const payload = await LeadApi.get(editId);
        const lead = payload?.lead;
        if (!lead) return;
        leadIdRef.current = lead.id;
        setLeadId(lead.id);
        setLeadNumber(lead.lead_number);
        setLeadStatus(lead.status);
        setDocuments(payload.documents || []);
        setCustomFields(lead.custom_fields || []);
        setFormData((prev) => ({
          ...prev,
          title: lead.title || '',
          customer_name: lead.customer_name || '',
          customer_type: lead.customer_type,
          business_vertical: lead.business_vertical,
          expected_decision_date: lead.expected_decision_date || '',
          priority: lead.priority,
          customer_contact: lead.customer_contact || '',
          customer_designation: lead.customer_designation || '',
          customer_email: lead.customer_email || '',
          customer_phone: lead.customer_phone || '',
          customer_location: lead.customer_location || '',
          plant_location: lead.plant_location || '',
          project_description: lead.project_description || '',
          requirement_summary: lead.requirement_summary || '',
          detailed_requirement: lead.detailed_requirement || '',
          application: lead.application || '',
          industry_process: lead.industry_process || '',
          current_process: lead.current_process || '',
          expected_automation: lead.expected_automation || '',
          required_solution: lead.required_solution || lead.expected_automation || '',
          customer_objective: lead.customer_objective || '',
          customer_challenge: lead.customer_challenge || '',
          competitor_information: lead.competitor_information || '',
          expected_project_timeline: lead.expected_project_timeline || '',
          customer_target_date: lead.customer_target_date || '',
          production_quantity: lead.production_quantity || '',
          production_rate: lead.production_rate || '',
          cycle_time: lead.cycle_time || '',
          shift_pattern: lead.shift_pattern || '',
          operating_hours: lead.operating_hours || '',
          existing_equipment: lead.existing_equipment || '',
          existing_automation: lead.existing_automation || '',
          integration_requirements: lead.integration_requirements || '',
          technical_requirements: lead.technical_requirements || '',
          machine_dimensions: lead.machine_dimensions || '',
          payload: lead.payload || '',
          accuracy_requirement: lead.accuracy_requirement || '',
          environment_conditions: lead.environment_conditions || '',
          technical_specifications: lead.technical_specifications || '',
          technical_assumptions: lead.technical_assumptions || '',
          customer_dependencies: lead.customer_dependencies || '',
          customer_budget: lead.customer_budget || '',
          estimated_opportunity_value: lead.estimated_opportunity_value || '',
          currency: lead.currency || 'INR',
          expected_po_date: lead.expected_po_date || '',
          commercial_remarks: lead.commercial_remarks || '',
          additional_notes: lead.additional_notes || '',
          required_documents: lead.required_documents || '',
        }));
      })();
    }
  }, [editId, router]);

  const payloadFromForm = (user: User, status: 'DRAFT' | 'SUBMITTED_TO_PM') => {
    const expectedValue = Number(String(formData.estimated_opportunity_value || '').replace(/[₹,\s]/g, '')) || 0;
    return {
      title: formData.title || 'Untitled Lead',
      customer_name: formData.customer_name || 'Unspecified Customer',
      customer_type: formData.customer_type,
      business_vertical: formData.business_vertical,
      created_by: user.name,
      created_by_id: user.id,
      created_by_role: user.role_name,
      sales_owner: user.name,
      sales_owner_id: user.id,
      lead_date: new Date().toISOString(),
      expected_decision_date: formData.expected_decision_date,
      priority: formData.priority,
      status,
      customer_contact: formData.customer_contact,
      customer_designation: formData.customer_designation,
      customer_email: formData.customer_email,
      customer_phone: formData.customer_phone,
      customer_location: formData.customer_location,
      plant_location: formData.plant_location,
      project_description: formData.project_description,
      requirement_summary: formData.requirement_summary,
      detailed_requirement: formData.detailed_requirement,
      application: formData.application,
      industry_process: formData.industry_process,
      current_process: formData.current_process,
      expected_automation: formData.expected_automation || formData.required_solution,
      required_solution: formData.required_solution,
      customer_objective: formData.customer_objective,
      customer_challenge: formData.customer_challenge,
      competitor_information: formData.competitor_information,
      expected_project_timeline: formData.expected_project_timeline,
      customer_target_date: formData.customer_target_date,
      production_quantity: formData.production_quantity,
      production_rate: formData.production_rate,
      cycle_time: formData.cycle_time,
      shift_pattern: formData.shift_pattern,
      operating_hours: formData.operating_hours,
      existing_equipment: formData.existing_equipment,
      existing_automation: formData.existing_automation,
      integration_requirements: formData.integration_requirements,
      technical_requirements: formData.technical_requirements,
      machine_dimensions: formData.machine_dimensions,
      payload: formData.payload,
      accuracy_requirement: formData.accuracy_requirement,
      environment_conditions: formData.environment_conditions,
      technical_specifications: formData.technical_specifications,
      technical_assumptions: formData.technical_assumptions,
      customer_dependencies: formData.customer_dependencies,
      customer_budget: formData.customer_budget,
      estimated_opportunity_value: formData.estimated_opportunity_value,
      expected_value: expectedValue,
      pipeline_stage: status === 'SUBMITTED_TO_PM' ? ('PM_REVIEW' as const) : ('PROJECT_INPUT' as const),
      currency: formData.currency,
      expected_po_date: formData.expected_po_date,
      commercial_remarks: formData.commercial_remarks,
      additional_notes: formData.additional_notes,
      required_documents: formData.required_documents,
      custom_fields: customFields.filter((field) => field.name.trim() || field.value.trim()),
    };
  };

  const persistDraft = async (user: User) => {
    if (persistLock.current) return persistLock.current;
    persistLock.current = (async () => {
      const payload = payloadFromForm(user, 'DRAFT');
      const existingId = leadIdRef.current;
      if (existingId) {
        const updated = await LeadApi.update(existingId, payload);
        return updated?.lead.id || existingId;
      }
      const created = await LeadApi.create(payload);
      const id = created.lead.id;
      leadIdRef.current = id;
      setLeadId(id);
      setLeadNumber(created.lead.lead_number);
      setLeadStatus(created.lead.status);
      router.replace(`/pre-sales/leads/create?id=${id}`);
      return id;
    })();
    try {
      return await persistLock.current;
    } finally {
      persistLock.current = null;
    }
  };

  const validateForSubmit = () => {
    const nextMissing: string[] = [];
    if (!formData.title.trim()) nextMissing.push('title');
    if (!formData.customer_name.trim()) nextMissing.push('customer_name');
    if (!formData.customer_contact.trim()) nextMissing.push('customer_contact');
    if (!formData.requirement_summary.trim()) nextMissing.push('requirement_summary');
    if (!formData.detailed_requirement.trim() && !formData.project_description.trim()) nextMissing.push('project_description');
    if (!formData.application.trim()) nextMissing.push('application');
    setMissing(nextMissing);
    if (nextMissing.length) {
      setValidationError('Please complete all required fields before submitting the lead.');
      return false;
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!currentUser || !canCreateLead(currentUser)) {
      setValidationError('This action is not permitted for your role.');
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      const id = await persistDraft(currentUser);
      if (!id) {
        setValidationError('Unable to save the draft. Please try again.');
        return;
      }
      StorageService.logAudit({
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.role_name,
        entity_type: 'LEAD',
        entity_id: id,
        action: 'LEAD_DRAFT_CREATED',
        description: `Saved draft for Lead ${leadNumber} (${formData.title}).`,
      });
      setSuccessMessage('Lead saved as draft successfully.');
      window.setTimeout(() => setSuccessMessage(null), 4000);
    } catch {
      setValidationError('Unable to save the draft. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!currentUser || !canCreateLead(currentUser)) {
      setValidationError('This action is not permitted for your role.');
      return;
    }
    if (!validateForSubmit()) {
      setConfirmSubmit(false);
      return;
    }
    if (!canEdit) {
      setValidationError('This lead has already been submitted to the Project Manager.');
      setConfirmSubmit(false);
      return;
    }
    setBusy(true);
    setValidationError(null);
    try {
      const id = await persistDraft(currentUser);
      if (!id) throw new Error('Unable to save the lead before submit.');
      const submitted = await LeadApi.submit(id);
      if (!submitted) {
        setValidationError('Unable to submit this lead. It may already be in PM review.');
        return;
      }
      StorageService.logAudit({
        user_id: currentUser.id,
        user_name: currentUser.name,
        user_role: currentUser.role_name,
        entity_type: 'LEAD',
        entity_id: id,
        action: 'LEAD_SUBMITTED_TO_PM',
        description: `Submitted Lead ${leadNumber} (${formData.title}) to PM for technical review.`,
      });
      setSuccessMessage('Lead submitted to Project Manager successfully.');
      setConfirmSubmit(false);
      router.push(`/pre-sales/leads/${id}`);
    } catch {
      setValidationError('Unable to submit the lead. Please try again.');
      setConfirmSubmit(false);
    } finally {
      setBusy(false);
    }
  };

  const addCustomField = () => {
    setCustomFields((current) => [...current, { id: `cf-${Date.now()}`, name: '', value: '' }]);
  };

  if (!currentUser) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-12">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <Building2 className="h-4 w-4" /> {isEdit ? 'Edit Customer Lead' : 'Create New Customer Lead'}
            </div>
            <h1 className="mt-0.5 text-xl font-bold text-slate-100">Pre-Sales Lead Form</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setFormData((prev) => ({ ...prev, ...VISION_DEMO_LEAD, project_description: VISION_DEMO_LEAD.detailed_requirement, required_solution: 'Vision Inspection System', customer_challenge: VISION_DEMO_LEAD.customer_objective }));
              setValidationError(null);
            }}
            className="flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-600"
            data-demo="load-vision"
          >
            <Sparkles className="h-4 w-4" /> Load Vision Demo
          </button>
          <button
            type="button"
            disabled={busy || !canEdit}
            onClick={() => void handleSaveDraft()}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4 text-slate-400" /> Save Draft
          </button>
          <button
            type="button"
            disabled={busy || !canEdit}
            onClick={() => {
              if (validateForSubmit()) setConfirmSubmit(true);
            }}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-semibold text-white shadow-md transition-all hover:bg-cyan-500 disabled:opacity-50"
            data-demo="submit-to-pm"
          >
            <Send className="h-4 w-4" /> Submit to PM
          </button>
        </div>
      </div>

      {validationError && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-800/80 bg-rose-950/80 p-4 text-xs text-rose-300">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <div className="font-bold">Please complete all required fields before submitting the lead.</div>
            <div className="mt-0.5">{validationError}</div>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-800/80 bg-emerald-950/50 p-4 text-xs text-emerald-300">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {successMessage}
        </div>
      )}

      <form className="space-y-6 text-xs" onSubmit={(event) => event.preventDefault()}>
        <fieldset disabled={!canEdit} className="space-y-6 disabled:opacity-90">
        <FormSection title="Section A — Basic Lead Information" hint={`Auto ID: ${leadNumber}`}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Lead ID (Auto)</label>
              <input type="text" disabled value={leadNumber} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 font-mono font-bold text-cyan-400" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block font-semibold text-slate-300">Lead Title *</label>
              <input type="text" required value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="e.g. Automotive Brake Disc Vision Inspection System" className={fieldClass(missing.includes('title'))} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Customer Name *</label>
              <input type="text" required value={formData.customer_name} onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })} placeholder="e.g. Brakes India Pvt Ltd" className={fieldClass(missing.includes('customer_name'))} />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Customer Type</label>
              <select value={formData.customer_type} onChange={(e) => setFormData({ ...formData, customer_type: e.target.value as CustomerType })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                <option value="Automotive">Automotive</option>
                <option value="Manufacturing">Manufacturing</option>
                <option value="Warehouse / Logistics">Warehouse / Logistics</option>
                <option value="FMCG">FMCG</option>
                <option value="Electronics">Electronics</option>
                <option value="Pharmaceutical">Pharmaceutical</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Business Vertical *</label>
              <select value={formData.business_vertical} onChange={(e) => setFormData({ ...formData, business_vertical: e.target.value as BusinessVertical })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 font-medium text-slate-100 focus:border-cyan-500">
                <option value="Business Head">Business Head (Sharadha Patil)</option>
                <option value="Engineering Director">Engineering Director (Sabarigiri)</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Created By</label>
              <input type="text" disabled value={`${currentUser.name} (${currentUser.role_name})`} className="w-full cursor-not-allowed rounded border border-slate-800 bg-slate-950 p-2 text-slate-400" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Priority Level</label>
              <select value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value as PriorityLevel })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Expected Decision Date</label>
              <input type="date" value={formData.expected_decision_date} onChange={(e) => setFormData({ ...formData, expected_decision_date: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Section B — Customer Contact Information">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Contact Person *</label>
              <input type="text" required value={formData.customer_contact} onChange={(e) => setFormData({ ...formData, customer_contact: e.target.value })} placeholder="e.g. Mr. K. R. Sundaram" className={fieldClass(missing.includes('customer_contact'))} />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Designation</label>
              <input type="text" value={formData.customer_designation} onChange={(e) => setFormData({ ...formData, customer_designation: e.target.value })} placeholder="e.g. GM — Plant Automation" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Email Address</label>
              <input type="email" value={formData.customer_email} onChange={(e) => setFormData({ ...formData, customer_email: e.target.value })} placeholder="sundaram@brakesindia.com" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Phone Number</label>
              <input type="text" value={formData.customer_phone} onChange={(e) => setFormData({ ...formData, customer_phone: e.target.value })} placeholder="+91 94440 12345" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Customer Office Location</label>
              <input type="text" value={formData.customer_location} onChange={(e) => setFormData({ ...formData, customer_location: e.target.value })} placeholder="e.g. Chennai, Tamil Nadu" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Plant / Site Location</label>
              <input type="text" value={formData.plant_location} onChange={(e) => setFormData({ ...formData, plant_location: e.target.value })} placeholder="e.g. Sriperumbudur Industrial Estate" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
        </FormSection>

        <FormSection title="Section C — Additional Project Information">
          <div>
            <label className="mb-1 block font-medium text-slate-400">Project Description</label>
            <textarea rows={3} value={formData.project_description || formData.detailed_requirement} onChange={(e) => setFormData({ ...formData, project_description: e.target.value, detailed_requirement: e.target.value })} placeholder="Describe the project scope and what the customer wants to achieve" className={fieldClass(missing.includes('project_description'))} />
          </div>
          <div>
            <label className="mb-1 block font-semibold text-slate-300">Customer Requirement *</label>
            <input type="text" value={formData.requirement_summary} onChange={(e) => setFormData({ ...formData, requirement_summary: e.target.value })} placeholder="High-level summary of the customer requirement" className={fieldClass(missing.includes('requirement_summary'))} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-semibold text-slate-300">Application / Use Case *</label>
              <input type="text" value={formData.application} onChange={(e) => setFormData({ ...formData, application: e.target.value })} placeholder="e.g. 2D Surface Defect & Dimension Verification" className={fieldClass(missing.includes('application'))} />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Expected Quantity</label>
              <input type="text" value={formData.production_quantity} onChange={(e) => setFormData({ ...formData, production_quantity: e.target.value })} placeholder="e.g. 1200 parts / day" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Estimated Project Value</label>
              <input type="text" value={formData.estimated_opportunity_value} onChange={(e) => setFormData({ ...formData, estimated_opportunity_value: e.target.value })} placeholder="e.g. ₹ 50,00,000" className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Required Solution</label>
              <select value={formData.required_solution} onChange={(e) => setFormData({ ...formData, required_solution: e.target.value, expected_automation: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500">
                <option value="">Select solution</option>
                {SOLUTION_OPTIONS.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Technical Requirements</label>
              <textarea rows={3} value={formData.technical_requirements} onChange={(e) => setFormData({ ...formData, technical_requirements: e.target.value })} placeholder="PLC, robot, vision, accuracy, utilities..." className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Commercial Requirements</label>
              <textarea rows={3} value={formData.commercial_remarks} onChange={(e) => setFormData({ ...formData, commercial_remarks: e.target.value })} placeholder="Budget, payment, delivery, commercial notes" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block font-medium text-slate-400">Competitor Information</label>
              <textarea rows={2} value={formData.competitor_information} onChange={(e) => setFormData({ ...formData, competitor_information: e.target.value })} placeholder="Known competitors or alternate quotes" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
            </div>
            <div>
              <label className="mb-1 block font-medium text-slate-400">Customer Challenge</label>
              <textarea rows={2} value={formData.customer_challenge} onChange={(e) => setFormData({ ...formData, customer_challenge: e.target.value })} placeholder="Pain points, quality escapes, manpower issues" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-medium text-slate-400">Remarks</label>
            <textarea rows={2} value={formData.additional_notes} onChange={(e) => setFormData({ ...formData, additional_notes: e.target.value })} placeholder="Any additional notes for PM review" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
          </div>

          <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-200">Custom additional fields</h3>
              <button type="button" onClick={addCustomField} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-200 hover:border-cyan-700">
                <Plus className="h-3.5 w-3.5" /> Add Additional Field
              </button>
            </div>
            {customFields.length === 0 && <p className="text-slate-500">Add lead-specific fields such as machine type, production volume, or line details.</p>}
          {customFields.map((field) => (
              <AdditionalFieldRow
                key={field.id}
                field={field}
                onChange={(next) => setCustomFields((current) => current.map((item) => (item.id === field.id ? next : item)))}
                onRemove={() => setCustomFields((current) => current.filter((item) => item.id !== field.id))}
              />
            ))}
          </div>

          <EntityDocumentUpload
            title="Documents"
            entityType="ADDITIONAL_INPUT"
            entityId={leadId || undefined}
            canEdit={canEdit}
            ensureEntity={async () => {
              if (!currentUser) return null;
              return persistDraft(currentUser);
            }}
          />

          <details className="rounded-lg border border-slate-800 bg-slate-950/50 p-4">
            <summary className="cursor-pointer font-semibold text-slate-200">Further technical & commercial details</summary>
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Industry / Process</span>
                  <input value={formData.industry_process} onChange={(e) => setFormData({ ...formData, industry_process: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Current Process</span>
                  <input value={formData.current_process} onChange={(e) => setFormData({ ...formData, current_process: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Expected Automation</span>
                  <input value={formData.expected_automation} onChange={(e) => setFormData({ ...formData, expected_automation: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Customer Objective</span>
                  <input value={formData.customer_objective} onChange={(e) => setFormData({ ...formData, customer_objective: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Expected Project Timeline</span>
                  <input value={formData.expected_project_timeline} onChange={(e) => setFormData({ ...formData, expected_project_timeline: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Customer Target Date</span>
                  <input type="date" value={formData.customer_target_date} onChange={(e) => setFormData({ ...formData, customer_target_date: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Production Rate</span>
                  <input value={formData.production_rate} onChange={(e) => setFormData({ ...formData, production_rate: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Cycle Time</span>
                  <input value={formData.cycle_time} onChange={(e) => setFormData({ ...formData, cycle_time: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Shift Pattern</span>
                  <input value={formData.shift_pattern} onChange={(e) => setFormData({ ...formData, shift_pattern: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Operating Hours</span>
                  <input value={formData.operating_hours} onChange={(e) => setFormData({ ...formData, operating_hours: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Existing Equipment</span>
                  <input value={formData.existing_equipment} onChange={(e) => setFormData({ ...formData, existing_equipment: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Existing Automation</span>
                  <input value={formData.existing_automation} onChange={(e) => setFormData({ ...formData, existing_automation: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Integration Requirements</span>
                  <input value={formData.integration_requirements} onChange={(e) => setFormData({ ...formData, integration_requirements: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Machine Dimensions</span>
                  <input value={formData.machine_dimensions} onChange={(e) => setFormData({ ...formData, machine_dimensions: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Payload</span>
                  <input value={formData.payload} onChange={(e) => setFormData({ ...formData, payload: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Accuracy Requirement</span>
                  <input value={formData.accuracy_requirement} onChange={(e) => setFormData({ ...formData, accuracy_requirement: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Environment Conditions</span>
                  <input value={formData.environment_conditions} onChange={(e) => setFormData({ ...formData, environment_conditions: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Customer Budget</span>
                  <input value={formData.customer_budget} onChange={(e) => setFormData({ ...formData, customer_budget: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium text-slate-400">Expected PO Date</span>
                  <input type="date" value={formData.expected_po_date} onChange={(e) => setFormData({ ...formData, expected_po_date: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-200 focus:border-cyan-500" />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-400">Technical Specifications</span>
                <textarea rows={2} value={formData.technical_specifications} onChange={(e) => setFormData({ ...formData, technical_specifications: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-400">Technical Assumptions</span>
                <textarea rows={2} value={formData.technical_assumptions} onChange={(e) => setFormData({ ...formData, technical_assumptions: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-400">Customer Dependencies</span>
                <textarea rows={2} value={formData.customer_dependencies} onChange={(e) => setFormData({ ...formData, customer_dependencies: e.target.value })} className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium text-slate-400">Required Documents (notes)</span>
                <textarea rows={2} value={formData.required_documents} onChange={(e) => setFormData({ ...formData, required_documents: e.target.value })} placeholder="List any documents still expected from the customer" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-200 focus:border-cyan-500" />
              </label>
            </div>
          </details>
        </FormSection>

        <FormSection title="Section D — Supporting Documents & Attachments">
          <LeadDocumentUpload
            leadId={leadId || undefined}
            documents={documents}
            canEdit={canEdit}
            ensureLead={async () => {
              if (!currentUser) return null;
              return persistDraft(currentUser);
            }}
            onDocumentsChange={setDocuments}
          />
        </FormSection>
        </fieldset>
      </form>

      <SubmitLeadModal open={confirmSubmit} busy={busy} onCancel={() => setConfirmSubmit(false)} onConfirm={() => void handleSubmit()} />
    </div>
  );
}

export default function CreateLeadPage() {
  return (
    <Suspense fallback={<div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">Loading lead form…</div>}>
      <CreateLeadForm />
    </Suspense>
  );
}
