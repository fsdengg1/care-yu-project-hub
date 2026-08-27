import {
  AuditLog,
  Escalation,
  Lead,
  NotificationItem,
  DailyUpdate,
  ProcurementRequest,
  Project,
  Task,
} from '../types.js';

/** Operational demo seed is retired. Live PMS starts with empty operational collections. */
export const INITIAL_LEADS: Lead[] = [];
export const INITIAL_PROJECTS: Project[] = [];
export const INITIAL_PROCUREMENT_REQUESTS: ProcurementRequest[] = [];
export const INITIAL_ESCALATIONS: Escalation[] = [];
export const INITIAL_TASKS: Task[] = [];
export const INITIAL_DAILY_UPDATES: DailyUpdate[] = [];
export const INITIAL_AUDITS: AuditLog[] = [];
export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
