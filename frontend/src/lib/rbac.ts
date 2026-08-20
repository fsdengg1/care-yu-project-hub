'use client';

import { User } from './types';

export interface NavItem {
  name: string;
  href: string;
  iconName: string;
  badge?: string;
  allowedRoles?: string[];
  category: 'main' | 'pre_sales' | 'projects' | 'team_work' | 'system';
}

export const NAVIGATION_ITEMS: NavItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    iconName: 'LayoutDashboard',
    category: 'main'
  },
  {
    name: 'Leads & Pipeline',
    href: '/pre-sales/leads',
    iconName: 'Building2',
    category: 'pre_sales',
    allowedRoles: ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SALES', 'SYSTEM_ADMIN']
  },
  {
    name: 'Feasibility Studies',
    href: '/pre-sales/feasibility',
    iconName: 'Scan',
    category: 'pre_sales',
    allowedRoles: ['CEO', 'CTO', 'PROJECT_MANAGER', 'ENG_DIRECTOR', 'TEAM_LEAD', 'EMPLOYEE', 'SYSTEM_ADMIN']
  },
  {
    name: 'Solution & Costing',
    href: '/pre-sales/costing',
    iconName: 'Calculator',
    category: 'pre_sales',
    allowedRoles: ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'PROCUREMENT', 'SYSTEM_ADMIN']
  },
  {
    name: 'Active Projects',
    href: '/projects/active',
    iconName: 'Bot',
    category: 'projects',
    allowedRoles: ['CEO', 'CTO', 'BUSINESS_HEAD', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'PROJECT_ENGINEER', 'TEAM_LEAD', 'EMPLOYEE', 'EXECUTION', 'SYSTEM_ADMIN']
  },
  {
    name: 'Project Gantt & Planning',
    href: '/projects/planning',
    iconName: 'GanttChartSquare',
    category: 'projects',
    allowedRoles: ['CEO', 'CTO', 'PROJECT_MANAGER', 'PROJECT_ENGINEER', 'ENG_DIRECTOR', 'SYSTEM_ADMIN']
  },
  {
    name: 'My Assigned Work',
    href: '/my-work',
    iconName: 'CheckSquare',
    category: 'team_work'
  },
  {
    name: 'Daily Work Updates',
    href: '/daily-updates',
    iconName: 'FileText',
    category: 'team_work'
  },
  {
    name: 'Functional Teams',
    href: '/teams',
    iconName: 'Users',
    category: 'team_work'
  },
  {
    name: 'Procurement Requests',
    href: '/procurement',
    iconName: 'ShoppingCart',
    category: 'team_work',
    allowedRoles: ['CEO', 'CTO', 'PROJECT_MANAGER', 'PROCUREMENT', 'SYSTEM_ADMIN']
  },
  {
    name: 'Organization Management',
    href: '/org',
    iconName: 'Network',
    category: 'system'
  },
  {
    name: 'User Management',
    href: '/users',
    iconName: 'UserCheck',
    category: 'system',
    allowedRoles: ['CEO', 'CTO', 'PROJECT_MANAGER', 'SYSTEM_ADMIN']
  },
  {
    name: 'Roles & Permissions',
    href: '/roles',
    iconName: 'ShieldAlert',
    category: 'system',
    allowedRoles: ['CEO', 'CTO', 'SYSTEM_ADMIN']
  },
  {
    name: 'Audit Trail',
    href: '/audit-logs',
    iconName: 'History',
    category: 'system',
    allowedRoles: ['CEO', 'CTO', 'PROJECT_MANAGER', 'SYSTEM_ADMIN']
  }
];

const CEO_HIDDEN_HREFS = new Set([
  '/my-work',
  '/daily-updates',
  '/users',
  '/roles',
]);

export function isCeoViewOnly(user: User | null | undefined): boolean {
  return user?.role_code === 'CEO';
}

export function canCreateLead(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canPerformPmOperations(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canPrepareFeasibility(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['TEAM_LEAD', 'EMPLOYEE', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function canPrepareCosting(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role_code === 'PROCUREMENT' || user.role_code === 'SYSTEM_ADMIN') return true;
  const hay = `${user.team_name || ''} ${user.role_name || ''}`.toLowerCase();
  return hay.includes('procurement') || hay.includes('costing');
}

export function canHandleCommercial(user: User | null | undefined): boolean {
  if (!user) return false;
  return ['BUSINESS_HEAD', 'ENG_DIRECTOR', 'SALES', 'SYSTEM_ADMIN'].includes(user.role_code);
}

export function hasPermission(user: User, requiredPermission: string): boolean {
  if (user.role_code === 'SYSTEM_ADMIN') return true;
  if (user.role_code === 'CEO') {
    return [
      'view:financials',
      'view:all_projects',
      'view:audit_logs',
      'view:pipeline',
      'decide:ceo_escalation',
    ].includes(requiredPermission);
  }
  if (user.role_code === 'CTO') return true;
  return true;
}

export function filterNavForUser(user: User): NavItem[] {
  return NAVIGATION_ITEMS.filter((item) => {
    if (isCeoViewOnly(user) && CEO_HIDDEN_HREFS.has(item.href)) return false;
    if (!item.allowedRoles || item.allowedRoles.length === 0) return true;
    return item.allowedRoles.includes(user.role_code);
  });
}

export const CEO_NAV_CATEGORY_LABELS: Record<NavItem['category'], string> = {
  main: 'Overview',
  pre_sales: 'Pre-Sales Visibility',
  projects: 'Project Visibility',
  team_work: 'Execution & Workload',
  system: 'Governance',
};
