'use me';
import { User, Role } from './types';

export interface NavItem {
  name: string;
  href: string;
  iconName: string;
  badge?: string;
  allowedRoles?: string[]; // Empty means all roles
  category: 'main' | 'pre_sales' | 'projects' | 'team_work' | 'system';
}

export const NAVIGATION_ITEMS: NavItem[] = [
  // Dashboard
  {
    name: 'Dashboard',
    href: '/dashboard',
    iconName: 'LayoutDashboard',
    category: 'main'
  },

  // Pre-Sales
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

  // Projects
  {
    name: 'Active Projects',
    href: '/projects/active',
    iconName: 'Bot',
    badge: 'Phase 1 Shell',
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

  // Team & Work
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

  // System & Governance
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

export function hasPermission(user: User, requiredPermission: string): boolean {
  if (user.role_code === 'CEO' || user.role_code === 'CTO' || user.role_code === 'SYSTEM_ADMIN') return true;
  return true;
}

export function filterNavForUser(user: User): NavItem[] {
  return NAVIGATION_ITEMS.filter(item => {
    if (!item.allowedRoles || item.allowedRoles.length === 0) return true;
    return item.allowedRoles.includes(user.role_code);
  });
}
