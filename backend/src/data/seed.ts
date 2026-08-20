import { Role, Team, User, AuditLog, NotificationItem } from '../types.js';

export const INITIAL_ROLES: Role[] = [
  {
    id: 'r-ceo',
    code: 'CEO',
    name: 'CEO',
    description: 'Executive leadership with full read/write visibility across all financial, project, employee, and pre-sales operations.',
    permissions: ['all:*', 'view:financials', 'view:all_projects', 'view:audit_logs', 'manage:system']
  },
  {
    id: 'r-cto',
    code: 'CTO',
    name: 'CTO',
    description: 'Technology leadership across engineering delivery, platform architecture, and execution quality.',
    permissions: ['view:all_projects', 'view:engineering_workload', 'view:technical_progress', 'view:reports', 'manage:engineering']
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
    permissions: ['manage:projects', 'assign:tasks', 'manage:milestones', 'view:all_teams', 'review:leads', 'coordinate:procurement']
  },
  {
    id: 'r-pe',
    code: 'PROJECT_ENGINEER',
    name: 'Project Engineer',
    description: 'Future operational support role. Supports PM in managing assigned project execution and sub-tasks.',
    permissions: ['manage:assigned_tasks', 'view:assigned_projects', 'review:daily_updates', 'escalate:blocker']
  },
  {
    id: 'r-tl',
    code: 'TEAM_LEAD',
    name: 'Team Lead',
    description: 'Manages team capacity, reviews PM assignments, suggests task rescheduling or reassignments, and monitors daily updates.',
    permissions: ['view:team_workload', 'suggest:task_change', 'review:team_updates', 'escalate:resource_conflict']
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
    permissions: ['create:lead', 'edit:own_leads', 'upload:customer_docs', 'view:lead_status']
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
    team_lead_id: 'u-tl-sw',
    team_lead_name: 'Arun',
    member_count: 1, // Only Arun (Team Lead) currently
    status: 'ACTIVE',
    created_at: '2026-01-10T09:00:00Z'
  },
  {
    id: 't-vision',
    code: 'VISION',
    name: 'Vision Team',
    description: '2D/3D Industrial Vision, OpenCV, Cognex/Keyence, AI Deep Learning Inspection.',
    team_lead_id: 'u-tl-vis',
    team_lead_name: 'Vani',
    member_count: 1, // Only Vani (Team Lead) currently
    status: 'ACTIVE',
    created_at: '2026-01-10T09:00:00Z'
  },
  {
    id: 't-robotics',
    code: 'ROBOTICS',
    name: 'Robotics & Solutions Team',
    description: 'FANUC, KUKA, ABB Robot Simulation, EOAT Design, Motion Control & AMR/AGV.',
    team_lead_id: 'u-tl-rob',
    team_lead_name: 'Aakash',
    member_count: 1, // Only Aakash (Team Lead) currently
    status: 'ACTIVE',
    created_at: '2026-01-10T09:00:00Z'
  },
  {
    id: 't-procurement',
    code: 'PROCUREMENT',
    name: 'Procurement / Costing Team',
    description: 'BOM Cost Estimation, Vendor Management, RFQ Processing & Logistics.',
    team_lead_id: undefined,
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
    team_lead_id: undefined,
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
    id: 'u-cto',
    employee_id: 'CYA-001A',
    name: 'Priya Menon',
    email: 'priya.menon@careyu.com',
    phone: '+91 98765 00015',
    role_id: 'r-cto',
    role_code: 'CTO',
    role_name: 'CTO',
    reporting_manager_id: 'u-ceo',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  },
  {
    id: 'u-bh',
    employee_id: 'CYA-002',
    name: 'Shradha Patil',
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
    name: 'Sabarigiri T',
    email: 'sabarigiri.t@careyu.com',
    phone: '+91 98765 00003',
    role_id: 'r-ed',
    role_code: 'ENG_DIRECTOR',
    role_name: 'Engineering Director',
    reporting_manager_id: 'u-ceo',
    status: 'ACTIVE',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z'
  },
  {
    id: 'u-pm',
    employee_id: 'CYA-004',
    name: 'Arivan',
    email: 'arivan@careyu.com',
    phone: '+91 98765 00004',
    role_id: 'r-pm',
    role_code: 'PROJECT_MANAGER',
    role_name: 'Project Manager',
    reporting_manager_id: 'u-ceo',
    status: 'ACTIVE',
    created_at: '2026-01-03T00:00:00Z',
    updated_at: '2026-01-03T00:00:00Z'
  },
  {
    id: 'u-tl-sw',
    employee_id: 'CYA-010',
    name: 'Arun',
    email: 'arun@careyu.com',
    phone: '+91 98765 00010',
    role_id: 'r-tl',
    role_code: 'TEAM_LEAD',
    role_name: 'Team Lead',
    team_id: 't-sw',
    team_name: 'Software Team',
    reporting_manager_id: 'u-pm',
    status: 'ACTIVE',
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z'
  },
  {
    id: 'u-tl-vis',
    employee_id: 'CYA-011',
    name: 'Vani',
    email: 'vani@careyu.com',
    phone: '+91 98765 00011',
    role_id: 'r-tl',
    role_code: 'TEAM_LEAD',
    role_name: 'Team Lead',
    team_id: 't-vision',
    team_name: 'Vision Team',
    reporting_manager_id: 'u-pm',
    status: 'ACTIVE',
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z'
  },
  {
    id: 'u-tl-rob',
    employee_id: 'CYA-012',
    name: 'Aakash',
    email: 'aakash@careyu.com',
    phone: '+91 98765 00012',
    role_id: 'r-tl',
    role_code: 'TEAM_LEAD',
    role_name: 'Team Lead',
    team_id: 't-robotics',
    team_name: 'Robotics & Solutions Team',
    reporting_manager_id: 'u-pm',
    status: 'ACTIVE',
    created_at: '2026-01-05T00:00:00Z',
    updated_at: '2026-01-05T00:00:00Z'
  },
  {
    id: 'u-emp-sw',
    employee_id: 'CYA-020',
    name: 'Karthik',
    email: 'karthik@careyu.com',
    phone: '+91 98765 00020',
    role_id: 'r-emp',
    role_code: 'EMPLOYEE',
    role_name: 'Team Member',
    team_id: 't-sw',
    team_name: 'Software Team',
    team_lead_id: 'u-tl-sw',
    team_lead_name: 'Arun',
    reporting_manager_id: 'u-tl-sw',
    status: 'ACTIVE',
    created_at: '2026-01-08T00:00:00Z',
    updated_at: '2026-01-08T00:00:00Z'
  },
  {
    id: 'u-admin',
    employee_id: 'CYA-SYS-001',
    name: 'System Administrator',
    email: 'admin@careyu.com',
    phone: '+91 98765 99999',
    role_id: 'r-admin',
    role_code: 'SYSTEM_ADMIN',
    role_name: 'System Administrator',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z'
  }
];

export const INITIAL_AUDITS: AuditLog[] = [
  {
    id: 'log-001',
    user_id: 'u-admin',
    user_name: 'System Administrator',
    user_role: 'System Administrator',
    entity_type: 'SYSTEM',
    entity_id: 'sys-init',
    action: 'SYSTEM_INITIALIZED',
    description: 'Care Yu Automation — Project Hub Phase 1 clean foundation initialized.',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString()
  }
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
