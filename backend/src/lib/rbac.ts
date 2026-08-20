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
    'decide:ceo_escalation',
  ],
  CTO: ['view:leads', 'view:projects', 'view:teams', 'view:audit', 'view:notifications'],
  BUSINESS_HEAD: ['create:lead', 'edit:lead', 'view:leads', 'view:notifications'],
  ENG_DIRECTOR: ['create:lead', 'edit:lead', 'view:leads', 'create:feasibility', 'view:notifications'],
  SALES: ['create:lead', 'edit:lead', 'view:leads', 'view:notifications'],
  PROJECT_MANAGER: [
    'view:leads',
    'assign:lead',
    'create:task',
    'create:feasibility',
    'review:lead',
    'view:projects',
    'view:notifications',
    'view:audit',
  ],
  PROJECT_ENGINEER: ['view:leads', 'create:task', 'view:projects', 'view:notifications'],
  TEAM_LEAD: ['create:task', 'assign:task', 'create:feasibility', 'view:notifications'],
  EMPLOYEE: ['submit:daily-update', 'create:feasibility', 'view:notifications'],
  EXECUTION: ['submit:daily-update', 'view:notifications'],
  PROCUREMENT: ['view:leads', 'view:projects', 'view:notifications'],
  SYSTEM_ADMIN: ['*'],
};

export function hasPermission(user: User | undefined, permission: string): boolean {
  if (!user) return false;
  const granted = ROLE_PERMISSIONS[user.role_code] ?? [];
  return granted.includes('*') || granted.includes(permission);
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
