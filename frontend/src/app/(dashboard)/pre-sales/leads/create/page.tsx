'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { canCreateLead } from '@/lib/rbac';
import { apiRequest } from '@/lib/api';
import { CustomerType, BusinessVertical, PriorityLevel, User } from '@/lib/types';
import { VISION_DEMO_LEAD } from '@/lib/demoVisionLead';
import { Building2, Save, Send, ArrowLeft, AlertCircle, Sparkles } from 'lucide-react';

export default function CreateLeadPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [leadNumber, setLeadNumber] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    customer_name: '',
    customer_type: 'Automotive' as CustomerType,
    business_vertical: 'Business Head' as BusinessVertical,
    expected_decision_date: '',
    priority: 'Medium' as PriorityLevel,

    // Contact
    customer_contact: '',
    customer_designation: '',
    customer_email: '',
    customer_phone: '',
    customer_location: '',
    plant_location: '',

    // Requirement
    requirement_summary: '',
    detailed_requirement: '',
    application: '',
    industry_process: '',
    current_process: '',
    expected_automation: '',
    customer_objective: '',
    expected_project_timeline: '',
    customer_target_date: '',

    // Technical
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

    // Commercial
    customer_budget: '',
    estimated_opportunity_value: '',
    currency: 'INR',
    expected_po_date: '',
    commercial_remarks: ''
  });

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    setCurrentUser(user);
    if (user && !canCreateLead(user)) {
      router.replace('/pre-sales/leads');
      return;
    }
    setLeadNumber(StorageService.generateLeadNumber());

    // Preset Business Vertical based on Role
    if (user?.role_code === 'ENG_DIRECTOR') {
      setFormData(prev => ({ ...prev, business_vertical: 'Engineering Director' }));
    }
  }, []);

  if (!currentUser) return null;

  const handleSave = (asSubmitToPM: boolean) => {
    setValidationError(null);

    // Mandatory Field Validation if Submitting to PM
    if (asSubmitToPM) {
      if (!formData.title.trim()) {
        setValidationError('Lead Title is mandatory.');
        return;
      }
      if (!formData.customer_name.trim()) {
        setValidationError('Customer Name is mandatory.');
        return;
      }
      if (!formData.customer_contact.trim()) {
        setValidationError('Customer Contact Person is mandatory.');
        return;
      }
      if (!formData.requirement_summary.trim()) {
        setValidationError('Requirement Summary is mandatory.');
        return;
      }
      if (!formData.detailed_requirement.trim()) {
        setValidationError('Detailed Customer Requirement is mandatory.');
        return;
      }
      if (!formData.application.trim()) {
        setValidationError('Application / Use Case is mandatory.');
        return;
      }
    }

    if (!canCreateLead(currentUser)) {
      setValidationError('This action is not permitted for your role.');
      return;
    }

    const initialStatus = asSubmitToPM ? 'SUBMITTED_TO_PM' : 'DRAFT';
    const expectedValue = Number(String(formData.estimated_opportunity_value || '').replace(/[₹,\s]/g, '')) || 0;

    const newLead = StorageService.createLead({
      title: formData.title || 'Untitled Lead',
      customer_name: formData.customer_name || 'Unspecified Customer',
      customer_type: formData.customer_type,
      business_vertical: formData.business_vertical,
      created_by: currentUser.name,
      created_by_id: currentUser.id,
      created_by_role: currentUser.role_name,
      sales_owner: currentUser.name,
      sales_owner_id: currentUser.id,
      lead_date: new Date().toISOString(),
      expected_decision_date: formData.expected_decision_date,
      priority: formData.priority,
      status: initialStatus,

      customer_contact: formData.customer_contact,
      customer_designation: formData.customer_designation,
      customer_email: formData.customer_email,
      customer_phone: formData.customer_phone,
      customer_location: formData.customer_location,
      plant_location: formData.plant_location,

      requirement_summary: formData.requirement_summary,
      detailed_requirement: formData.detailed_requirement,
      application: formData.application,
      industry_process: formData.industry_process,
      current_process: formData.current_process,
      expected_automation: formData.expected_automation,
      customer_objective: formData.customer_objective,
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
      pipeline_stage: asSubmitToPM ? 'PM_REVIEW' : 'PROJECT_INPUT',
      currency: formData.currency,
      expected_po_date: formData.expected_po_date,
      commercial_remarks: formData.commercial_remarks
    });

    void apiRequest('/api/leads', {
      method: 'POST',
      body: JSON.stringify(newLead),
    });

    // Central Audit Logging
    StorageService.logAudit({
      user_id: currentUser.id,
      user_name: currentUser.name,
      user_role: currentUser.role_name,
      entity_type: 'LEAD',
      entity_id: newLead.id,
      action: asSubmitToPM ? 'LEAD_SUBMITTED_TO_PM' : 'LEAD_DRAFT_CREATED',
      description: asSubmitToPM 
        ? `Created and submitted Lead ${newLead.lead_number} (${newLead.title}) to PM for technical review.`
        : `Saved draft for Lead ${newLead.lead_number} (${newLead.title}).`
    });

    // PM Notification if Submitted
    if (asSubmitToPM) {
      const pmUser = StorageService.getUsers().find(u => u.role_code === 'PROJECT_MANAGER');
      StorageService.sendNotification({
        recipient_id: pmUser?.id || 'u-pm',
        type: 'NEW_LEAD_TO_PM',
        title: `New Lead Submitted: ${newLead.lead_number}`,
        message: `Lead "${newLead.title}" for ${newLead.customer_name} (${newLead.business_vertical}) is awaiting your technical completeness review.`,
        entity_type: 'LEAD',
        entity_id: newLead.id
      });
    }

    router.push('/pre-sales/leads');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between bg-slate-900 p-5 rounded-xl border border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs uppercase tracking-wider">
              <Building2 className="w-4 h-4" /> Create New Customer Lead
            </div>
            <h1 className="text-xl font-bold text-slate-100 mt-0.5">Pre-Sales Lead Form</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setFormData((prev) => ({ ...prev, ...VISION_DEMO_LEAD }));
              setValidationError(null);
            }}
            className="px-4 py-2 bg-violet-700 hover:bg-violet-600 text-white font-medium text-xs rounded-lg flex items-center gap-2 transition-colors"
            data-demo="load-vision"
          >
            <Sparkles className="w-4 h-4" /> Load Vision Demo
          </button>

          <button
            type="button"
            onClick={() => handleSave(false)}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-xs rounded-lg flex items-center gap-2 transition-colors"
          >
            <Save className="w-4 h-4 text-slate-400" /> Save Draft
          </button>

          <button
            type="button"
            onClick={() => handleSave(true)}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-lg shadow-md flex items-center gap-2 transition-all"
            data-demo="submit-to-pm"
          >
            <Send className="w-4 h-4" /> Submit to PM
          </button>
        </div>
      </div>

      {/* Validation Banner */}
      {validationError && (
        <div className="p-4 bg-rose-950/80 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <div>
            <div className="font-bold">Please complete the required information before submitting this Lead:</div>
            <div className="mt-0.5">{validationError}</div>
          </div>
        </div>
      )}

      <form className="space-y-6 text-xs">
        {/* SECTION A — BASIC LEAD INFORMATION */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4 shadow-sm">
          <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-cyan-400">
              Section A — Basic Lead Information
            </h2>
            <span className="text-[10px] text-slate-500 font-mono">Auto ID: {leadNumber}</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Lead ID (Auto)</label>
              <input
                type="text"
                disabled
                value={leadNumber}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded font-mono text-cyan-400 font-bold cursor-not-allowed"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-300 mb-1 font-semibold">Lead Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Automotive Brake Disc Vision Inspection System"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Customer Name *</label>
              <input
                type="text"
                required
                value={formData.customer_name}
                onChange={e => setFormData({ ...formData, customer_name: e.target.value })}
                placeholder="e.g. Brakes India Pvt Ltd"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Customer Type</label>
              <select
                value={formData.customer_type}
                onChange={e => setFormData({ ...formData, customer_type: e.target.value as CustomerType })}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              >
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
              <label className="block text-slate-300 mb-1 font-semibold">Business Vertical *</label>
              <select
                value={formData.business_vertical}
                onChange={e => setFormData({ ...formData, business_vertical: e.target.value as BusinessVertical })}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-100 font-medium focus:border-cyan-500"
              >
                <option value="Business Head">Business Head (Sharadha Patil)</option>
                <option value="Engineering Director">Engineering Director (Sabarigiri)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Created By</label>
              <input
                type="text"
                disabled
                value={`${currentUser.name} (${currentUser.role_name})`}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-400 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Priority Level</label>
              <select
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value as PriorityLevel })}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Expected Decision Date</label>
              <input
                type="date"
                value={formData.expected_decision_date}
                onChange={e => setFormData({ ...formData, expected_decision_date: e.target.value })}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* SECTION B — CUSTOMER CONTACT */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4 shadow-sm">
          <div className="border-b border-slate-800 pb-2.5">
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-cyan-400">
              Section B — Customer Contact Information
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Contact Person *</label>
              <input
                type="text"
                required
                value={formData.customer_contact}
                onChange={e => setFormData({ ...formData, customer_contact: e.target.value })}
                placeholder="e.g. Mr. K. R. Sundaram"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Designation</label>
              <input
                type="text"
                value={formData.customer_designation}
                onChange={e => setFormData({ ...formData, customer_designation: e.target.value })}
                placeholder="e.g. GM — Plant Automation"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Email Address</label>
              <input
                type="email"
                value={formData.customer_email}
                onChange={e => setFormData({ ...formData, customer_email: e.target.value })}
                placeholder="sundaram@brakesindia.com"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Phone Number</label>
              <input
                type="text"
                value={formData.customer_phone}
                onChange={e => setFormData({ ...formData, customer_phone: e.target.value })}
                placeholder="+91 94440 12345"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Customer Office Location</label>
              <input
                type="text"
                value={formData.customer_location}
                onChange={e => setFormData({ ...formData, customer_location: e.target.value })}
                placeholder="e.g. Chennai, Tamil Nadu"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Plant / Site Location</label>
              <input
                type="text"
                value={formData.plant_location}
                onChange={e => setFormData({ ...formData, plant_location: e.target.value })}
                placeholder="e.g. Sriperumbudur Industrial Estate"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* SECTION C — REQUIREMENT INFORMATION */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4 shadow-sm">
          <div className="border-b border-slate-800 pb-2.5">
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-cyan-400">
              Section C — Customer Requirement Details
            </h2>
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-semibold">Requirement Summary *</label>
            <input
              type="text"
              required
              value={formData.requirement_summary}
              onChange={e => setFormData({ ...formData, requirement_summary: e.target.value })}
              placeholder="High-level 1-line summary of what customer wants"
              className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 mb-1 font-semibold">Detailed Customer Requirement *</label>
            <textarea
              rows={4}
              required
              value={formData.detailed_requirement}
              onChange={e => setFormData({ ...formData, detailed_requirement: e.target.value })}
              placeholder="Comprehensive description of the operational requirement, target parts, defect types to inspect, or automation scope..."
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:border-cyan-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 mb-1 font-semibold">Application / Use Case *</label>
              <input
                type="text"
                required
                value={formData.application}
                onChange={e => setFormData({ ...formData, application: e.target.value })}
                placeholder="e.g. 2D Surface Defect & Dimension Verification"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-100 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Industry / Process</label>
              <input
                type="text"
                value={formData.industry_process}
                onChange={e => setFormData({ ...formData, industry_process: e.target.value })}
                placeholder="e.g. Machining Line Post-Cast Inspection"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* SECTION D — TECHNICAL INPUTS */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4 shadow-sm">
          <div className="border-b border-slate-800 pb-2.5 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-cyan-400">
              Section D — Technical Information (Optional Initial Inputs)
            </h2>
            <span className="text-[11px] text-slate-400">PM will review technical completeness</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Production Rate / Quantity</label>
              <input
                type="text"
                value={formData.production_rate}
                onChange={e => setFormData({ ...formData, production_rate: e.target.value })}
                placeholder="e.g. 1200 parts / day"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Required Cycle Time</label>
              <input
                type="text"
                value={formData.cycle_time}
                onChange={e => setFormData({ ...formData, cycle_time: e.target.value })}
                placeholder="e.g. 18 sec / part"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Shift Pattern / Operating Hours</label>
              <input
                type="text"
                value={formData.shift_pattern}
                onChange={e => setFormData({ ...formData, shift_pattern: e.target.value })}
                placeholder="e.g. 2 Shifts (16 Hours/Day)"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">PLC / Robot / Vision Requirements</label>
              <input
                type="text"
                value={formData.technical_requirements}
                onChange={e => setFormData({ ...formData, technical_requirements: e.target.value })}
                placeholder="e.g. Siemens S7-1500 PLC, Cognex 2D Vision Camera"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Accuracy Requirement / Tolerances</label>
              <input
                type="text"
                value={formData.accuracy_requirement}
                onChange={e => setFormData({ ...formData, accuracy_requirement: e.target.value })}
                placeholder="e.g. ± 0.05 mm dimension check"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">Technical Assumptions & Customer Dependencies</label>
            <textarea
              rows={3}
              value={formData.technical_assumptions}
              onChange={e => setFormData({ ...formData, technical_assumptions: e.target.value })}
              placeholder="e.g. Customer will provide clean pneumatic supply and sample parts for optics calibration..."
              className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
            />
          </div>
        </div>

        {/* SECTION E — COMMERCIAL ESTIMATE */}
        <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-5 space-y-4 shadow-sm">
          <div className="border-b border-slate-800 pb-2.5">
            <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider text-cyan-400">
              Section E — Commercial Information (Optional)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Customer Budget</label>
              <input
                type="text"
                value={formData.customer_budget}
                onChange={e => setFormData({ ...formData, customer_budget: e.target.value })}
                placeholder="e.g. ₹ 45,00,000"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Estimated Opportunity Value</label>
              <input
                type="text"
                value={formData.estimated_opportunity_value}
                onChange={e => setFormData({ ...formData, estimated_opportunity_value: e.target.value })}
                placeholder="e.g. ₹ 50,00,000"
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">Expected PO Date</label>
              <input
                type="date"
                value={formData.expected_po_date}
                onChange={e => setFormData({ ...formData, expected_po_date: e.target.value })}
                className="w-full p-2 bg-slate-950 border border-slate-800 rounded text-slate-200 focus:border-cyan-500"
              />
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
