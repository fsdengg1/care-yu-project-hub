import fs from 'node:fs';
import path from 'node:path';
import {
  AuditLog,
  DailyUpdate,
  Escalation,
  Lead,
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

function mergeLeads(stored: Lead[] | undefined, seed: Lead[]): Lead[] {
  return mergeById(stored, seed).map((lead) => {
    const fromSeed = seed.find((item) => item.id === lead.id);
    if (!fromSeed) return lead;
    return {
      ...lead,
      expected_value: fromSeed.expected_value,
      pipeline_stage: fromSeed.pipeline_stage,
      estimated_opportunity_value: fromSeed.estimated_opportunity_value,
      status: fromSeed.status,
    };
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
  appendAudit(entry: Omit<AuditLog, 'id' | 'created_at'>): AuditLog {
    const audits = this.getAudits();
    const log: AuditLog = {
      ...entry,
      id: `log-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    audits.unshift(log);
    this.saveAudits(audits);
    return log;
  },
};
