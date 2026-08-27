import { Role, Team, User, AuditLog, NotificationItem } from './types';

export const INITIAL_ROLES: Role[] = [
  {
    id: 'r-ceo',
    code: 'CEO',
    name: 'CEO',
    description: 'Executive visibility across the company. Reviews critical strategic issues and escalation decisions. Does not perform operational actions.',
    permissions: ['view:dashboard:ceo', 'view:financials', 'view:all_projects', 'view:audit_logs', 'view:pipeline', 'decide:ceo_escalation']
  },
  {
    id: 'r-cto',
    code: 'CTO',
    name: 'CTO',
    description: 'Technology leadership across engineering delivery, platform architecture, and execution quality.',
    permissions: ['view:all_projects', 'view:engineering_workload', 'view:technical_progress', 'view:reports', 'manage:engineering', 'edit:lead']
  },
  {
    id: 'r-bh',
    code: 'BUSINESS_HEAD',
    name: 'Business Head',
    description: 'Leads commercial and business development activities, pre-sales pipeline, and customer opportunities.',
    permissions: ['create:lead', 'view:sales_pipeline', 'view:commercials', 'view:assigned_projects', 'view:reports']
  },
  {
    id: 'r-ed',
    code: 'ENG_DIRECTOR',
    name: 'Engineering Director',
    description: 'Oversees engineering execution, technical feasibility, project workload, and solution budgets.',
    permissions: ['create:lead', 'view:engineering_workload', 'view:technical_progress', 'view:solution_budget', 'view:reports']
  },
  {
    id: 'r-pm',
    code: 'PROJECT_MANAGER',
    name: 'Project Manager',
    description: 'Central operational controller. Manages Gantt, task assignments, milestones, procurement coordination, and timeline delivery.',
    permissions: ['manage:projects', 'assign:tasks', 'manage:milestones', 'view:all_teams', 'review:leads', 'coordinate:procurement', 'edit:lead']
  },
  {
    id: 'r-pe',
    code: 'PROJECT_ENGINEER',
    name: 'Project Engineer',
    description: 'Future operational support role. Supports PM in managing assigned project execution and sub-tasks.',
    permissions: ['manage:assigned_tasks', 'view:assigned_projects', 'review:daily_updates', 'escalate:blocker', 'edit:lead']
  },
  {
    id: 'r-tl',
    code: 'TEAM_LEAD',
    name: 'Team Lead',
    description: 'Manages team capacity, reviews PM assignments, suggests task rescheduling or reassignments, and monitors daily updates.',
    permissions: ['view:team_workload', 'suggest:task_change', 'review:team_updates', 'escalate:resource_conflict', 'edit:lead']
  },
  {
    id: 'r-emp',
    code: 'EMPLOYEE',
    name: 'Team Member',
    description: 'Executes assigned tasks across multiple projects, submits daily work logs, and reports blockers.',
    permissions: ['view:assigned_tasks', 'update:task_status', 'submit:daily_update', 'report:blocker']
  },
  {
    id: 'r-sales',
    code: 'SALES',
    name: 'Sales Executive',
    description: 'Generates and updates customer leads, manages customer documentation, and tracks proposal negotiations.',
    permissions: ['view:lead_status', 'edit:own_leads', 'upload:customer_docs']
  },
  {
    id: 'r-proc',
    code: 'PROCUREMENT',
    name: 'Procurement / Costing',
    description: 'Handles RFQs, vendor quotations, material pricing, purchase orders, and procurement tracking.',
    permissions: ['view:costing_requests', 'update:vendor_prices', 'manage:rfq', 'update:material_status']
  },
  {
    id: 'r-exec',
    code: 'EXECUTION',
    name: 'Execution',
    description: 'Site Assembly, Wiring, Panel Fabrication, Mechanical Integration & Commissioning.',
    permissions: ['view:execution_tasks', 'update:site_progress', 'report:site_blocker']
  },
  {
    id: 'r-admin',
    code: 'SYSTEM_ADMIN',
    name: 'System Administrator',
    description: 'Technical platform administrator. Manages user provisioning, master data, roles, and system settings.',
    permissions: ['manage:users', 'manage:teams', 'manage:roles', 'view:audit_logs', 'manage:settings']
  }
];

export const INITIAL_TEAMS: Team[] = [
  {
    id: 't-sw',
    code: 'SOFTWARE',
    name: 'Software Team',
    description: 'PLC, SCADA, HMI, C#/.NET Automation Software, and Cloud/Edge Integration.',
    team_lead_name: 'Not Assigned',
    member_count: 0,
    status: 'ACTIVE',
    created_at: '2026-01-10T09:00:00Z'
  },
  {
    id: 't-vision',
    code: 'VISION',
    name: 'Vision Team',
    description: '2D/3D Industrial Vision, OpenCV, Cognex/Keyence, AI Deep Learning Inspection.',
    team_lead_name: 'Not Assigned',
    member_count: 0,
    status: 'ACTIVE',
    created_at: '2026-01-10T09:00:00Z'
  },
  {
    id: 't-robotics',
    code: 'ROBOTICS',
    name: 'Robotics & Automation Solution Team',
    description: 'FANUC, KUKA, ABB Robot Simulation, EOAT Design, Motion Control & AMR/AGV.',
    team_lead_name: 'Not Assigned',
    member_count: 0,
    status: 'ACTIVE',
    created_at: '2026-01-10T09:00:00Z'
  },
  {
    id: 't-procurement',
    code: 'PROCUREMENT',
    name: 'Procurement / Costing Team',
    description: 'BOM Cost Estimation, Vendor Management, RFQ Processing & Logistics.',
    team_lead_name: 'Not Assigned',
    member_count: 0,
    status: 'ACTIVE',
    created_at: '2026-01-10T09:00:00Z'
  },
  {
    id: 't-execution',
    code: 'EXECUTION',
    name: 'Execution Team',
    description: 'Site Assembly, Wiring, Panel Fabrication, Mechanical Integration & Commissioning.',
    team_lead_name: 'Not Assigned',
    member_count: 0,
    status: 'ACTIVE',
    created_at: '2026-01-10T09:00:00Z'
  }
];

export const INITIAL_USERS: User[] = [
  {
    id: 'u-ceo',
    employee_id: 'CYA-001',
    name: 'Bernard Hamilton',
    email: 'bernard.hamilton@careyu.com',
    phone: '+91 98765 00001',
    role_id: 'r-ceo',
    role_code: 'CEO',
    role_name: 'CEO',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-bh',
    employee_id: 'CYA-002',
    name: 'Sharadha Patil',
    email: 'shradha.patil@careyu.com',
    phone: '+91 98765 00002',
    role_id: 'r-bh',
    role_code: 'BUSINESS_HEAD',
    role_name: 'Business Head',
    reporting_manager_id: 'u-ceo',
    status: 'ACTIVE',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z'
  },
  {
    id: 'u-ed',
    employee_id: 'CYA-003',
    name: 'Sabarigiri',
    email: 'engg.director@careyu.ai',
    phone: '',
    role_id: 'r-ed',
    role_code: 'ENG_DIRECTOR',
    role_name: 'Engineering Director',
    reporting_manager_id: 'u-ceo',
    status: 'ACTIVE',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z'
  }
];

export const INITIAL_AUDITS: AuditLog[] = [];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
