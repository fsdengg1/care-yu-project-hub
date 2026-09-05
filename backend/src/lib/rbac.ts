import { NextFunction, Response } from 'express';
import { AuthedRequest } from '../middleware/auth.js';
import { User } from '../types.js';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  CEO: [
    'view:dashboard:ceo',
    'view:leads',
    'view:projects',
    'view:teams',
    'view:escalations',
    'view:audit',
    'view:notifications',
    'view:daily-updates',
    'decide:ceo_escalation',
    'create:announcement',
    'view:executive-overview',
  ],
  CTO: ['view:leads', 'edit:lead', 'view:projects', 'view:teams', 'view:audit', 'view:notifications', 'view:daily-updates', 'manage:users', 'create:announcement', 'view:executive-overview'],
  BUSINESS_HEAD: [
    'create:lead',
    'edit:lead',
    'view:leads',
    'view:notifications',
    'view:daily-updates',
    'view:projects',
    'create:quotation',
    'convert:lead',
    'view:escalations',
    'escalate:issue',
    'create:announcement',
    'view:executive-overview',
  ],
  ENG_DIRECTOR: [
    'create:lead',
    'edit:lead',
    'view:leads',
    'create:task',
    'create:feasibility',
    'view:notifications',
    'view:daily-updates',
    'view:projects',
    'create:quotation',
    'convert:lead',
    'view:escalations',
    'escalate:issue',
    'view:executive-overview',
  ],
  SALES: ['edit:lead', 'view:leads', 'view:notifications', 'create:quotation', 'convert:lead'],
  PROJECT_MANAGER: [
    'view:leads',
    'edit:lead',
    'assign:lead',
    'create:task',
    'create:feasibility',
    'review:lead',
    'approve:feasibility',
    'approve:costing',
    'view:projects',
    'view:notifications',
    'view:audit',
    'view:daily-updates',
    'view:escalations',
    'escalate:issue',
    'manage:project',
    'manage:users',
    'view:executive-overview',
  ],
  PROJECT_ENGINEER: ['view:leads', 'edit:lead', 'create:task', 'view:projects', 'view:notifications', 'submit:daily-update', 'view:daily-updates'],
  TEAM_LEAD: ['view:leads', 'edit:lead', 'create:task', 'assign:task', 'create:feasibility', 'view:notifications', 'submit:daily-update', 'view:daily-updates', 'view:projects', 'view:escalations', 'escalate:issue'],
  EMPLOYEE: ['view:leads', 'submit:daily-update', 'create:feasibility', 'view:notifications', 'view:daily-updates', 'view:projects'],
  EXECUTION: ['view:leads', 'submit:daily-update', 'view:notifications', 'view:daily-updates', 'view:projects'],
  PROCUREMENT: ['view:leads', 'view:projects', 'create:costing', 'view:notifications', 'submit:daily-update', 'view:daily-updates'],
  SYSTEM_ADMIN: ['*'],
};

export function hasPermission(user: User | undefined, permission: string): boolean {
  if (!user) return false;
  const granted = ROLE_PERMISSIONS[user.role_code] ?? [];
  return granted.includes('*') || granted.includes(permission);
}

export const EXECUTIVE_OVERVIEW_ROLES = [
  'CEO',
  'BUSINESS_HEAD',
  'ENG_DIRECTOR',
  'CTO',
  'PROJECT_MANAGER',
  'SYSTEM_ADMIN',
] as const;

export function canAccessExecutiveOverview(user: User | undefined): boolean {
  if (!user) return false;
  return (EXECUTIVE_OVERVIEW_ROLES as readonly string[]).includes(user.role_code);
}

export function requireExecutiveOverview(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!canAccessExecutiveOverview(req.user)) {
    return res.status(403).json({
      message:
        'Forbidden. Executive Overview is available only to CEO, Business Head, Engineering Director, CTO, and Project Manager.',
    });
  }
  return next();
}

export function requirePermission(...permissions: string[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const allowed = permissions.some((permission) => hasPermission(req.user, permission));
    if (!allowed) {
      return res.status(403).json({
        message: 'Forbidden. This action is not permitted for your role.',
      });
    }
    return next();
  };
}
