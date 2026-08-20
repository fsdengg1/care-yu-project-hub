import fs from 'node:fs';
import path from 'node:path';
import {
  AuditLog,
  DailyUpdate,
  Escalation,
  FeasibilityEmployeeAllocation,
  FeasibilityTeamAssignment,
  Lead,
  LeadActivity,
  LeadComment,
  LeadDocument,
  LeadStatusHistory,
  NotificationItem,
  ProcurementRequest,
  Project,
  Role,
  Task,
  Team,
  User,
} from '../types.js';
import {
  INITIAL_ROLES,
  INITIAL_TEAMS,
  INITIAL_USERS,
  INITIAL_AUDITS,
  INITIAL_NOTIFICATIONS,
  INITIAL_LEADS,
  INITIAL_PROJECTS,
  INITIAL_ESCALATIONS,
  INITIAL_PROCUREMENT_REQUESTS,
  INITIAL_TASKS,
  INITIAL_DAILY_UPDATES,
} from '../data/seed.js';

interface DbShape {
  users: User[];
  roles: Role[];
  teams: Team[];
  leads: Lead[];
  projects: Project[];
  escalations: Escalation[];
  procurementRequests: ProcurementRequest[];
  audits: AuditLog[];
  notifications: NotificationItem[];
  tasks: Task[];
  dailyUpdates: DailyUpdate[];
  leadDocuments: LeadDocument[];
  leadComments: LeadComment[];
  leadActivities: LeadActivity[];
  leadStatusHistory: LeadStatusHistory[];
  feasibilityTeamAssignments: FeasibilityTeamAssignment[];
  feasibilityEmployeeAllocations: FeasibilityEmployeeAllocation[];
}

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'db.json');

function mergeById<T extends { id: string }>(stored: T[] | undefined, seed: T[]): T[] {
  const current = stored ?? [];
  const known = new Set(current.map((item) => item.id));
  return [...current, ...seed.filter((item) => !known.has(item.id))];
}

function mergeUsers(stored: User[] | undefined, seed: User[]): User[] {
  const leadership = new Set(['u-ceo', 'u-cto', 'u-bh', 'u-ed', 'u-pm']);
  return mergeById(stored, seed).map((user) => {
    const fromSeed = seed.find((item) => item.id === user.id);
    if (!fromSeed || !leadership.has(user.id)) return user;
    return { ...user, name: fromSeed.name, role_name: fromSeed.role_name, role_code: fromSeed.role_code };
  });
}

function mergeRoles(stored: Role[] | undefined, seed: Role[]): Role[] {
  return mergeById(stored, seed).map((role) => {
    const fromSeed = seed.find((item) => item.id === role.id);
    return fromSeed ? { ...role, ...fromSeed } : role;
  });
}

function alignStoredLead(lead: Lead): Lead {
  if (lead.status === 'WON') {
    return { ...lead, status: 'ORDER_CONVERTED', pipeline_stage: 'CONVERTED' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && lead.pipeline_stage === 'COSTING') {
    return { ...lead, status: 'COSTING_IN_PROGRESS' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && lead.pipeline_stage === 'QUOTATION') {
    return { ...lead, status: 'QUOTATION' };
  }
  if (lead.status === 'FEASIBILITY_IN_PROGRESS' && lead.pipeline_stage === 'NEGOTIATION') {
    return { ...lead, status: 'NEGOTIATION' };
  }
  return lead;
}

function mergeLeads(stored: Lead[] | undefined, seed: Lead[]): Lead[] {
  const current = stored ?? [];
  const known = new Set(current.map((item) => item.id));
  const merged = [...current, ...seed.filter((item) => !known.has(item.id))];
  return merged.map((lead) => {
    const userModified = Boolean(lead.updated_at && lead.created_at && lead.updated_at !== lead.created_at);
    if (userModified) return alignStoredLead(lead);
    const fromSeed = seed.find((item) => item.id === lead.id);
    if (!fromSeed) return alignStoredLead(lead);
    return alignStoredLead({
      ...lead,
      status: fromSeed.status,
      pipeline_stage: fromSeed.pipeline_stage,
      expected_value: lead.expected_value ?? fromSeed.expected_value,
      estimated_opportunity_value: lead.estimated_opportunity_value ?? fromSeed.estimated_opportunity_value,
    });
  });
}

function mergeAudits(stored: AuditLog[] | undefined, seed: AuditLog[]): AuditLog[] {
  return mergeById(stored, seed).map((log) => {
    const fromSeed = seed.find((item) => item.id === log.id);
    if (!fromSeed?.entity_name) return log;
    return { ...log, entity_name: fromSeed.entity_name };
  });
}

function mergeTeams(stored: Team[] | undefined, seed: Team[]): Team[] {
  const base = stored?.length ? stored : seed;
  return mergeById(base, seed).map((team) => {
    const fromSeed = seed.find((item) => item.id === team.id);
    if (!fromSeed) return team;
    return {
      ...team,
      name: fromSeed.name,
      code: fromSeed.code,
      description: fromSeed.description,
      team_lead_id: team.team_lead_id || fromSeed.team_lead_id,
      team_lead_name:
        !team.team_lead_name || team.team_lead_name === 'Not Assigned'
          ? fromSeed.team_lead_name
          : team.team_lead_name,
    };
  });
}

function refreshTeamCounts(db: DbShape): DbShape {
  db.teams = db.teams.map((team) => ({
    ...team,
    member_count: db.users.filter((user) => user.team_id === team.id && user.status === 'ACTIVE').length,
  }));
  return db;
}

function loadDb(): DbShape {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dbPath)) {
    const initial = refreshTeamCounts({
      users: INITIAL_USERS,
      roles: INITIAL_ROLES,
      teams: INITIAL_TEAMS,
      leads: INITIAL_LEADS,
      projects: INITIAL_PROJECTS,
      escalations: INITIAL_ESCALATIONS,
      procurementRequests: INITIAL_PROCUREMENT_REQUESTS,
      audits: INITIAL_AUDITS,
      notifications: INITIAL_NOTIFICATIONS,
      tasks: INITIAL_TASKS,
      dailyUpdates: INITIAL_DAILY_UPDATES,
      leadDocuments: [],
      leadComments: [],
      leadActivities: [],
      leadStatusHistory: [],
      feasibilityTeamAssignments: [],
      feasibilityEmployeeAllocations: [],
    });
    fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }

  const parsed = JSON.parse(fs.readFileSync(dbPath, 'utf8')) as Partial<DbShape>;
  const merged = refreshTeamCounts({
    users: mergeUsers(parsed.users, INITIAL_USERS),
    roles: mergeRoles(parsed.roles, INITIAL_ROLES),
    teams: mergeTeams(parsed.teams, INITIAL_TEAMS),
    leads: mergeLeads(parsed.leads, INITIAL_LEADS),
    projects: mergeById(parsed.projects, INITIAL_PROJECTS),
    escalations: mergeById(parsed.escalations, INITIAL_ESCALATIONS),
    procurementRequests: mergeById(parsed.procurementRequests, INITIAL_PROCUREMENT_REQUESTS),
    audits: mergeAudits(parsed.audits, INITIAL_AUDITS),
    notifications: mergeById(parsed.notifications, INITIAL_NOTIFICATIONS),
    tasks: mergeById(parsed.tasks, INITIAL_TASKS),
    dailyUpdates: mergeById(parsed.dailyUpdates, INITIAL_DAILY_UPDATES),
    leadDocuments: parsed.leadDocuments ?? [],
    leadComments: parsed.leadComments ?? [],
    leadActivities: parsed.leadActivities ?? [],
    leadStatusHistory: parsed.leadStatusHistory ?? [],
    feasibilityTeamAssignments: parsed.feasibilityTeamAssignments ?? [],
    feasibilityEmployeeAllocations: parsed.feasibilityEmployeeAllocations ?? [],
  });
  saveDb(merged);
  return merged;
}

function saveDb(db: DbShape) {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

export const store = {
  getUsers(): User[] {
    return loadDb().users;
  },
  getRoles(): Role[] {
    return loadDb().roles;
  },
  getTeams(): Team[] {
    return loadDb().teams;
  },
  getLeads(): Lead[] {
    return loadDb().leads;
  },
  getProjects(): Project[] {
    return loadDb().projects;
  },
  getEscalations(): Escalation[] {
    return loadDb().escalations;
  },
  getProcurementRequests(): ProcurementRequest[] {
    return loadDb().procurementRequests;
  },
  getAudits(): AuditLog[] {
    return loadDb().audits;
  },
  getNotifications(): NotificationItem[] {
    return loadDb().notifications;
  },
  getTasks(): Task[] {
    return loadDb().tasks;
  },
  getDailyUpdates(): DailyUpdate[] {
    return loadDb().dailyUpdates;
  },
  findUserByEmail(email: string): User | undefined {
    const normalized = email.trim().toLowerCase();
    return this.getUsers().find((user) => user.email.toLowerCase() === normalized);
  },
  findUserById(id: string): User | undefined {
    return this.getUsers().find((user) => user.id === id);
  },
  saveUsers(users: User[]) {
    const db = loadDb();
    db.users = users;
    saveDb(refreshTeamCounts(db));
  },
  saveLeads(leads: Lead[]) {
    const db = loadDb();
    db.leads = leads;
    saveDb(db);
  },
  saveProjects(projects: Project[]) {
    const db = loadDb();
    db.projects = projects;
    saveDb(db);
  },
  saveEscalations(escalations: Escalation[]) {
    const db = loadDb();
    db.escalations = escalations;
    saveDb(db);
  },
  saveAudits(audits: AuditLog[]) {
    const db = loadDb();
    db.audits = audits;
    saveDb(db);
  },
  saveNotifications(notifications: NotificationItem[]) {
    const db = loadDb();
    db.notifications = notifications;
    saveDb(db);
  },
  saveTasks(tasks: Task[]) {
    const db = loadDb();
    db.tasks = tasks;
    saveDb(db);
  },
  saveDailyUpdates(dailyUpdates: DailyUpdate[]) {
    const db = loadDb();
    db.dailyUpdates = dailyUpdates;
    saveDb(db);
  },
  getLeadDocuments(): LeadDocument[] {
    return loadDb().leadDocuments ?? [];
  },
  saveLeadDocuments(leadDocuments: LeadDocument[]) {
    const db = loadDb();
    db.leadDocuments = leadDocuments;
    saveDb(db);
  },
  getLeadComments(): LeadComment[] {
    return loadDb().leadComments ?? [];
  },
  saveLeadComments(leadComments: LeadComment[]) {
    const db = loadDb();
    db.leadComments = leadComments;
    saveDb(db);
  },
  getLeadActivities(): LeadActivity[] {
    return loadDb().leadActivities ?? [];
  },
  saveLeadActivities(leadActivities: LeadActivity[]) {
    const db = loadDb();
    db.leadActivities = leadActivities;
    saveDb(db);
  },
  getLeadStatusHistory(): LeadStatusHistory[] {
    return loadDb().leadStatusHistory ?? [];
  },
  saveLeadStatusHistory(leadStatusHistory: LeadStatusHistory[]) {
    const db = loadDb();
    db.leadStatusHistory = leadStatusHistory;
    saveDb(db);
  },
  getFeasibilityTeamAssignments(): FeasibilityTeamAssignment[] {
    return loadDb().feasibilityTeamAssignments ?? [];
  },
  saveFeasibilityTeamAssignments(feasibilityTeamAssignments: FeasibilityTeamAssignment[]) {
    const db = loadDb();
    db.feasibilityTeamAssignments = feasibilityTeamAssignments;
    saveDb(db);
  },
  getFeasibilityEmployeeAllocations(): FeasibilityEmployeeAllocation[] {
    return loadDb().feasibilityEmployeeAllocations ?? [];
  },
  saveFeasibilityEmployeeAllocations(feasibilityEmployeeAllocations: FeasibilityEmployeeAllocation[]) {
    const db = loadDb();
    db.feasibilityEmployeeAllocations = feasibilityEmployeeAllocations;
    saveDb(db);
  },
  appendAudit(entry: Omit<AuditLog, 'id' | 'created_at'>): AuditLog {
    const audits = this.getAudits();
    const log: AuditLog = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      created_at: new Date().toISOString(),
    };
    audits.unshift(log);
    this.saveAudits(audits);
    return log;
  },
  appendNotification(entry: Omit<NotificationItem, 'id' | 'created_at' | 'read_status'>): NotificationItem {
    const notifications = this.getNotifications();
    const item: NotificationItem = {
      ...entry,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      read_status: false,
      created_at: new Date().toISOString(),
    };
    notifications.unshift(item);
    this.saveNotifications(notifications);
    return item;
  },
};
