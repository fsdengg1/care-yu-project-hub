// ============================================================
// CARE YU AUTOMATION — PROJECT HUB
// Types — v6 (Phase 3A Architecture Correction)
// Lead is the parent. Multi-team feasibility per Lead.
// ============================================================

export interface User {
  id: string;
  employee_id: string;
  name: string;
  email: string;
  phone: string;
  role_id: string;
  role_code: string;
  role_name: string;
  team_id?: string;
  team_name?: string;
  team_lead_id?: string;
  team_lead_name?: string;
  reporting_manager_id?: string;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  code: string;
  name: string;
  description: string;
  permissions: string[];
}

export interface Team {
  id: string;
  code: string;
  name: string;
  description: string;
  team_lead_id?: string;
  team_lead_name?: string;
  member_count: number;
  status: 'ACTIVE' | 'INACTIVE';
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  entity_type: 'USER' | 'TEAM' | 'ROLE' | 'LEAD' | 'FEASIBILITY' | 'TASK' | 'SYSTEM' | 'AUTH' | 'PROJECT' | 'ESCALATION';
  entity_id: string;
  entity_name?: string;
  action: string;
  description: string;
  old_value?: string;
  new_value?: string;
  created_at: string;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  type:
    | 'TASK_ASSIGNED'
    | 'SUGGESTION_ADDED'
    | 'STATUS_CHANGED'
    | 'SYSTEM'
    | 'BLOCKER'
    | 'NEW_LEAD_TO_PM'
    | 'LEAD_RETURNED_TO_SALES'
    | 'LEAD_RESUBMITTED_TO_PM'
    | 'LEAD_ACCEPTED_FOR_FEASIBILITY'
    | 'CUSTOMER_INFORMATION_ADDED'
    | 'DOCUMENT_ADDED'
    | 'FEASIBILITY_ASSIGNED_TO_TEAM_LEAD'
    | 'TEAM_LEAD_ALLOCATED_EMPLOYEE'
    | 'TEAM_LEAD_SUGGESTION'
    | 'TEAM_LEAD_CLARIFICATION_REQUEST'
    | 'CRITICAL_DIRECT_ASSIGNMENT_TO_EMPLOYEE'
    | 'CRITICAL_ASSIGNMENT_TEAM_LEAD_NOTICE'
    | 'FEASIBILITY_READY_TO_START'
    | 'FEASIBILITY_SUBMITTED_TO_PM'
    | 'FEASIBILITY_RETURNED_TO_TEAM'
    | 'COSTING_ASSIGNED'
    | 'COSTING_RETURNED'
    | 'COSTING_SUBMITTED_TO_PM'
    | 'QUOTATION_READY'
    | 'LEAD_CONVERTED'
    | 'CRITICAL_ESCALATION'
    | 'PROJECT_AT_RISK'
    | 'PROJECT_COMPLETED';
  title: string;
  message: string;
  entity_type: string;
  entity_id: string;
  read_status: boolean;
  created_at: string;
}

export type LeadStatus =
  | 'DRAFT'
  | 'SUBMITTED_TO_PM'
  | 'UNDER_PM_REVIEW'
  | 'RETURNED_TO_SALES'
  | 'ADDITIONAL_INFORMATION_REQUIRED'
  | 'RESUBMITTED_TO_PM'
  | 'ACCEPTED_FOR_FEASIBILITY'
  | 'FEASIBILITY_IN_PROGRESS'
  | 'FEASIBILITY_SUBMITTED'
  | 'FEASIBILITY_RETURNED'
  | 'COSTING_IN_PROGRESS'
  | 'COSTING_SUBMITTED'
  | 'COSTING_RETURNED'
  | 'QUOTATION'
  | 'NEGOTIATION'
  | 'ORDER_CONVERTED'
  | 'WON'
  | 'LOST'
  | 'ON_HOLD';

export type PipelineStage =
  | 'PROJECT_INPUT'
  | 'PM_REVIEW'
  | 'FEASIBILITY'
  | 'COSTING'
  | 'QUOTATION'
  | 'NEGOTIATION'
  | 'CONVERTED'
  | 'REJECTED'
  | 'CANCELLED';

export type CustomerType =
  | 'Automotive'
  | 'Manufacturing'
  | 'Warehouse / Logistics'
  | 'FMCG'
  | 'Electronics'
  | 'Pharmaceutical'
  | 'Other';

export type BusinessVertical = 'Business Head' | 'Engineering Director';

export type PriorityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface LeadDocument {
  id: string;
  lead_id: string;
  file_name: string;
  file_type: string;
  file_size: string;
  uploaded_by: string;
  uploaded_by_id: string;
  upload_date: string;
  category:
    | 'Customer Drawing'
    | 'Technical Specification'
    | 'Layout'
    | 'Images'
    | 'Videos'
    | 'Existing Machine Photos'
    | 'Sample Information'
    | 'RFQ'
    | 'Customer Email / Document'
    | 'Required Document'
    | 'Feasibility Document'
    | 'Quotation'
    | 'Vendor Quotation'
    | 'Costing Support'
    | 'Negotiation Support'
    | 'Other';
  file_url?: string;
}

export interface LeadActivity {
  id: string;
  lead_id: string;
  activity_type:
    | 'Customer Call'
    | 'Customer Meeting'
    | 'Customer Email'
    | 'Customer Visit'
    | 'Customer Document Received'
    | 'Technical Discussion'
    | 'Commercial Discussion'
    | 'Other';
  activity_date: string;
  contact_person: string;
  subject: string;
  description: string;
  attachment_id?: string;
  created_by: string;
  created_by_id: string;
  created_at: string;
}

export interface LeadComment {
  id: string;
  lead_id: string;
  author_id: string;
  author_name: string;
  author_role: string;
  comment: string;
  comment_type:
    | 'PM Review'
    | 'Information Request'
    | 'Sales Response'
    | 'Internal Comment'
    | 'General';
  created_at: string;
}

export interface LeadStatusHistory {
  id: string;
  lead_id: string;
  old_status: LeadStatus;
  new_status: LeadStatus;
  changed_by: string;
  changed_by_id: string;
  reason?: string;
  created_at: string;
}

export interface Lead {
  id: string;
  lead_number: string;
  title: string;
  customer_name: string;
  customer_type: CustomerType;
  business_vertical: BusinessVertical;
  created_by: string;
  created_by_id: string;
  created_by_role: string;
  sales_owner: string;
  sales_owner_id: string;
  lead_date: string;
  expected_decision_date?: string;
  priority: PriorityLevel;
  status: LeadStatus;

  // Customer Contact — RESTRICTED (Sales/PM only)
  customer_contact: string;
  customer_designation?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_location?: string;
  plant_location?: string;

  // Requirement — visible to Engineering teams
  requirement_summary: string;
  detailed_requirement: string;
  application: string;
  industry_process?: string;
  current_process?: string;
  expected_automation?: string;
  customer_objective?: string;
  expected_project_timeline?: string;
  customer_target_date?: string;

  // Technical Inputs — visible to Engineering teams
  production_quantity?: string;
  production_rate?: string;
  cycle_time?: string;
  shift_pattern?: string;
  operating_hours?: string;
  existing_equipment?: string;
  existing_automation?: string;
  integration_requirements?: string;
  technical_requirements?: string;
  machine_dimensions?: string;
  payload?: string;
  accuracy_requirement?: string;
  environment_conditions?: string;
  technical_specifications?: string;
  technical_assumptions?: string;
  customer_dependencies?: string;

  // Commercial — RESTRICTED (PM/Sales/CEO only)
  customer_budget?: string;
  estimated_opportunity_value?: string;
  expected_value?: number;
  pipeline_stage?: PipelineStage;
  currency: string;
  expected_po_date?: string;
  commercial_remarks?: string;

  pm_return_reason?: string;
  pm_review_notes?: string;
  additional_notes?: string;
  required_documents?: string;

  assigned_team_id?: string;
  assigned_team_name?: string;
  assigned_team_lead_id?: string;
  assigned_team_lead_name?: string;
  pm_id?: string;
  pm_name?: string;
  project_id?: string;
  converted_at?: string;

  feasibility_return_reason?: string;
  costing_return_reason?: string;

  feasibility_study?: FeasibilityStudy;
  costing?: CostingRecord;
  quotation?: QuotationRecord;
  negotiation_history?: NegotiationEntry[];

  created_at: string;
  updated_at: string;
  submitted_at?: string;
  reviewed_at?: string;
  accepted_at?: string;
}

export type WorkflowRecordStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED';

export interface FeasibilityStudy {
  technical_feasibility: string;
  required_resources: string;
  proposed_solution: string;
  major_constraints: string;
  estimated_timeline: string;
  technical_assumptions: string;
  required_equipment: string;
  team_remarks: string;
  documents: string[];
  status: WorkflowRecordStatus;
  submitted_by?: string;
  submitted_by_id?: string;
  submitted_at?: string;
  pm_approved_by?: string;
  pm_approved_at?: string;
  pm_return_reason?: string;
}

export interface CostingRecord {
  bom_components: string;
  vendor_requirements: string;
  vendor_quotations: string;
  component_costs: number;
  procurement_costs: number;
  engineering_costs: number;
  software_costs: number;
  installation_costs: number;
  other_costs: number;
  total_estimated_cost: number;
  commercial_assumptions: string;
  documents: string[];
  status: WorkflowRecordStatus;
  submitted_by?: string;
  submitted_by_id?: string;
  submitted_at?: string;
  pm_approved_by?: string;
  pm_approved_at?: string;
  pm_return_reason?: string;
}

export interface QuotationRecord {
  quotation_value: number;
  commercial_terms: string;
  validity: string;
  payment_terms: string;
  delivery_terms: string;
  document_name?: string;
  sent_at?: string;
  sent_by?: string;
  sent_by_id?: string;
  revised_value?: number;
}

export interface NegotiationEntry {
  id: string;
  customer_feedback: string;
  notes: string;
  revised_value?: number;
  customer_requests: string;
  commercial_changes: string;
  follow_up_date?: string;
  document_name?: string;
  action: 'UPDATE' | 'REVISED_QUOTATION' | 'CONVERT' | 'LOST';
  created_by: string;
  created_by_id: string;
  created_at: string;
}

export type MyWorkCategory =
  | 'CREATE'
  | 'DRAFT'
  | 'RETURNED'
  | 'PM_REVIEW'
  | 'ASSIGN'
  | 'FEASIBILITY'
  | 'FEASIBILITY_APPROVAL'
  | 'COSTING'
  | 'COSTING_APPROVAL'
  | 'QUOTATION'
  | 'NEGOTIATION';

export interface MyWorkItem {
  lead_id: string;
  lead_number: string;
  title: string;
  customer_name: string;
  status: LeadStatus;
  pipeline_stage: PipelineStage;
  category: MyWorkCategory;
  summary: string;
  href: string;
  priority: PriorityLevel;
}

export interface LeadWorkflowPayload {
  lead: Lead;
  documents: LeadDocument[];
  comments: LeadComment[];
  activities: LeadActivity[];
  history: LeadStatusHistory[];
  assignments: FeasibilityTeamAssignment[];
  allocations: FeasibilityEmployeeAllocation[];
  teams: Team[];
  users: User[];
  assignment?: FeasibilityTeamAssignment;
  project?: Project;
}

// ============================================================
// ENGINEERING INPUT PACKAGE
// Filtered view of Lead for Team Leads / Team Members.
// Does NOT include: customer contact, communication, commercial.
// ============================================================
export interface LeadEngineeringView {
  lead_id: string;
  lead_number: string;
  title: string;
  customer_name: string; // Customer name shown; NOT contact person
  priority: PriorityLevel;
  business_vertical: BusinessVertical;

  // Requirement
  requirement_summary: string;
  detailed_requirement: string;
  application: string;
  industry_process?: string;
  current_process?: string;
  expected_automation?: string;
  customer_objective?: string;
  expected_project_timeline?: string;
  customer_target_date?: string;

  // Technical Inputs
  production_quantity?: string;
  production_rate?: string;
  cycle_time?: string;
  shift_pattern?: string;
  operating_hours?: string;
  existing_equipment?: string;
  existing_automation?: string;
  integration_requirements?: string;
  technical_requirements?: string;
  machine_dimensions?: string;
  payload?: string;
  accuracy_requirement?: string;
  environment_conditions?: string;
  technical_specifications?: string;
  technical_assumptions?: string;
  customer_dependencies?: string;

  // Permitted documents (all engineering-type docs)
  documents: LeadDocument[];
}

// ============================================================
// PHASE 3A — FEASIBILITY TEAM ASSIGNMENT
// One Lead → Many FeasibilityTeamAssignments
// ============================================================

export type AssignmentType = 'NORMAL' | 'CRITICAL_DIRECT';

export type FeasibilityTeamAssignmentStatus =
  | 'PENDING_TEAM_LEAD_REVIEW'
  | 'CHANGE_SUGGESTED'
  | 'CLARIFICATION_REQUIRED'
  | 'ALLOCATED_TO_TEAM_MEMBER'
  | 'READY_TO_START'
  | 'IN_PROGRESS'
  | 'SUBMITTED_TO_PM'
  | 'PM_REVIEW'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'CRITICAL_DIRECT_ASSIGNED';

export type AllocationApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'CHANGE_REQUESTED'
  | 'BYPASSED_CRITICAL';

/**
 * FeasibilityTeamAssignment — one entry per team per Lead.
 * A Lead can have many of these (one per team).
 * lead_id is the foreign key — Lead is the parent.
 */
export interface FeasibilityTeamAssignment {
  id: string;
  lead_id: string;                   // FK → Lead (Lead is the parent)
  team_id: string;
  team_name: string;
  team_lead_id?: string;
  team_lead_name?: string;
  assignment_type: AssignmentType;
  priority: PriorityLevel;
  due_date: string;
  pm_instructions: string;
  expected_output?: string;
  critical_reason?: string;
  status: FeasibilityTeamAssignmentStatus;
  created_by: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * FeasibilityEmployeeAllocation — one entry per employee per team assignment.
 * A FeasibilityTeamAssignment can have many of these.
 */
export interface FeasibilityEmployeeAllocation {
  id: string;
  feasibility_team_assignment_id: string;  // FK → FeasibilityTeamAssignment
  lead_id: string;                          // Denormalised for convenience
  team_id: string;
  team_lead_id?: string;
  employee_id: string;
  employee_name: string;
  responsibility: string;
  approval_status: AllocationApprovalStatus;
  allocated_by: string;
  allocated_at: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * FeasibilitySuggestion — Team Lead suggestions/clarification requests to PM.
 */
export interface FeasibilitySuggestion {
  id: string;
  feasibility_team_assignment_id: string;
  lead_id: string;
  created_by: string;
  created_by_id: string;
  suggestion_type:
    | 'Different employee required'
    | 'Different team required'
    | 'Due date needs change'
    | 'Resource unavailable'
    | 'Skill mismatch'
    | 'Workload conflict'
    | 'Requirement unclear'
    | 'Other';
  comment: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'MODIFIED';
  pm_response?: string;
  created_at: string;
  resolved_at?: string;
}

/**
 * Task — linked to Lead + FeasibilityTeamAssignment + EmployeeAllocation.
 * Feasibility tasks are never orphaned from a Lead.
 */
export interface Task {
  id: string;
  lead_id: string;
  feasibility_team_assignment_id?: string;
  employee_allocation_id?: string;
  title: string;
  description?: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'BLOCKED';
  priority: PriorityLevel;
  due_date?: string;
  assigned_to: string;
  assigned_to_id: string;
  created_by: string;
  created_by_id: string;
  created_at: string;
  updated_at: string;
}

export interface DashboardMetrics {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  atRiskProjects: number;
  totalLeads: number;
  preSalesPipelineValue: string;
  totalEmployees: number;
  totalTeams: number;
  pendingProcurements: number;
  pendingTLFeedback: number;
}

export type ProjectHealth = 'ON_TRACK' | 'AT_RISK' | 'CRITICAL';
export type ProjectStatus = 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  pm_id: string;
  pm_name: string;
  progress: number;
  health: ProjectHealth;
  status: ProjectStatus;
  issue?: string;
  lead_id?: string;
  team_ids?: string[];
  created_at: string;
  updated_at: string;
}

export type ProcurementRequestStatus = 'DELAYED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED';

export interface ProcurementRequest {
  id: string;
  request: string;
  project_id: string;
  project_name: string;
  customer_name: string;
  status: ProcurementRequestStatus;
  impact: string;
  owner_name: string;
  owner_team: string;
  created_at: string;
  updated_at: string;
}

export type EscalationSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type EscalationStatus = 'OPEN' | 'IN_REVIEW' | 'RESOLVED';
export type EscalationLevel = 'TEAM_LEAD' | 'PROJECT_MANAGER' | 'BUSINESS_HEAD' | 'ENG_DIRECTOR' | 'CEO';

export interface Escalation {
  id: string;
  code: string;
  project_id?: string;
  project_name: string;
  customer_name: string;
  issue: string;
  impact: string;
  summary: string;
  severity: EscalationSeverity;
  status: EscalationStatus;
  raised_by_id: string;
  raised_by_name: string;
  raised_by_role: string;
  team_id?: string;
  team_name?: string;
  previous_actions: string;
  current_level: EscalationLevel;
  decision_required?: string;
  ceo_decision?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CriticalIssue {
  id: string;
  kind: 'CRITICAL_ISSUE' | 'PROJECT_AT_RISK' | 'PROCUREMENT_DELAY';
  title: string;
  customer: string;
  project: string;
  summary: string;
  escalatedBy?: string;
  escalatedAt?: string;
  href: string;
}

export interface CeoDashboardPayload {
  pipeline: {
    value: number;
    activeLeads: number;
    awaitingApproval: number;
    inProgress: number;
    negotiation: number;
    stages: {
      projectInput: number;
      pmReview: number;
      feasibility: number;
      costing: number;
      quotation: number;
      negotiation: number;
      converted: number;
    };
  };
  projects: {
    total: number;
    onTrack: number;
    atRisk: number;
    critical: number;
    needAttention: number;
    items: Project[];
  };
  teams: {
    total: number;
    members: number;
    blockedTeams: number;
    breakdown: Array<{
      id: string;
      code: string;
      name: string;
      members: number;
      hasBlocker: boolean;
    }>;
  };
  projectManager: {
    id: string;
    name: string;
    activeProjects: number;
    pendingReviews: number;
    escalations: number;
  };
  criticalIssues: CriticalIssue[];
  escalations: Escalation[];
  recentActivity: AuditLog[];
}
