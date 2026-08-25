import fs from 'node:fs';
import path from 'node:path';
import {
  AuditLog,
  AssignmentHistory,
  ChatMessage,
  Conversation,
  ConversationParticipant,
  DailyUpdate,
  EntityDocument,
  Escalation,
  FeasibilityEmployeeAllocation,
  FeasibilityTeamAssignment,
  ForumComment,
  ForumLiveMessage,
  ForumPost,
  ForumReaction,
  ForumTag,
  Lead,
  LeadActivity,
  LeadComment,
  LeadDocument,
  LeadStatusHistory,
  NotificationDelivery,
  NotificationItem,
  OutboundEmail,
  ProcurementRequest,
  Project,
  ProjectPhase,
  Role,
  StageTransition,
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
import {
  COLLECTION_NAMES,
  CollectionName,
  closePool,
  ensureSchema,
  loadAllCollections,
  pingDatabase,
  saveAllCollections,
} from './postgres.js';

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
  projectPhases: ProjectPhase[];
  conversations: Conversation[];
  conversationParticipants: ConversationParticipant[];
  chatMessages: ChatMessage[];
  entityDocuments: EntityDocument[];
  stageTransitions: StageTransition[];
  outboundEmails: OutboundEmail[];
  forumPosts: ForumPost[];
  forumComments: ForumComment[];
  forumReactions: ForumReaction[];
  forumTags: ForumTag[];
  forumLiveMessages: ForumLiveMessage[];
  assignmentHistory: AssignmentHistory[];
  notificationDeliveries: NotificationDelivery[];
}

const localDbPath = path.join(process.cwd(), 'data', 'db.json');

let cache: DbShape | null = null;
let writeChain: Promise<void> = Promise.resolve();
let initialized = false;

function mergeProjects(stored: Project[] | undefined, seed: Project[]): Project[] {
  return mergeById(stored, seed).map((project) => {
    const fromSeed = seed.find((item) => item.id === project.id);
    if (!fromSeed) return project;
    return {
      ...project,
      value: project.value ?? fromSeed.value,
      start_date: project.start_date || fromSeed.start_date,
      target_completion: project.target_completion || fromSeed.target_completion,
      current_phase: project.current_phase || fromSeed.current_phase,
      lead_id: project.lead_id || fromSeed.lead_id,
      team_ids: project.team_ids?.length ? project.team_ids : fromSeed.team_ids,
      team_lead_id: project.team_lead_id || fromSeed.team_lead_id,
      team_lead_name: project.team_lead_name || fromSeed.team_lead_name,
    };
  });
}

function mergeById<T extends { id: string }>(stored: T[] | undefined, seed: T[]): T[] {
  const current = stored ?? [];
  const known = new Set(current.map((item) => item.id));
  return [...current, ...seed.filter((item) => !known.has(item.id))];
}

function mergeUsers(stored: User[] | undefined, seed: User[]): User[] {
  const leadership = new Set(['u-ceo', 'u-cto', 'u-bh', 'u-ed', 'u-pm']);
  return mergeById(stored, seed).map((user) => {
    const fromSeed = seed.find((item) => item.id === user.id);
    const withVerified: User = {
      ...user,
      // Existing/seeded accounts are treated as verified unless explicitly pending signup verification.
      email_verified: user.email_verified ?? true,
    };
    if (!fromSeed || !leadership.has(user.id)) return withVerified;
    return {
      ...withVerified,
      name: fromSeed.name,
      role_name: fromSeed.role_name,
      role_code: fromSeed.role_code,
    };
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

function emptyDb(): DbShape {
  return {
    users: [],
    roles: [],
    teams: [],
    leads: [],
    projects: [],
    escalations: [],
    procurementRequests: [],
    audits: [],
    notifications: [],
    tasks: [],
    dailyUpdates: [],
    leadDocuments: [],
    leadComments: [],
    leadActivities: [],
    leadStatusHistory: [],
    feasibilityTeamAssignments: [],
    feasibilityEmployeeAllocations: [],
    projectPhases: [],
    conversations: [],
    conversationParticipants: [],
    chatMessages: [],
    entityDocuments: [],
    stageTransitions: [],
    outboundEmails: [],
    forumPosts: [],
    forumComments: [],
    forumReactions: [],
    forumTags: [],
    forumLiveMessages: [],
    assignmentHistory: [],
    notificationDeliveries: [],
  };
}

function readLocalDbFile(): Partial<DbShape> | null {
  if (!fs.existsSync(localDbPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(localDbPath, 'utf8')) as Partial<DbShape>;
  } catch {
    return null;
  }
}

function collectionsHaveData(parsed: Partial<DbShape> | Record<CollectionName, unknown[]>): boolean {
  return COLLECTION_NAMES.some((name) => {
    const value = (parsed as Record<string, unknown[]>)[name];
    return Array.isArray(value) && value.length > 0;
  });
}

function buildMergedDb(parsed: Partial<DbShape>): DbShape {
  return refreshTeamCounts({
    users: mergeUsers(parsed.users, INITIAL_USERS),
    roles: mergeRoles(parsed.roles, INITIAL_ROLES),
    teams: mergeTeams(parsed.teams, INITIAL_TEAMS),
    leads: mergeLeads(parsed.leads, INITIAL_LEADS),
    projects: mergeProjects(parsed.projects, INITIAL_PROJECTS),
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
    projectPhases: parsed.projectPhases ?? [],
    conversations: parsed.conversations ?? [],
    conversationParticipants: parsed.conversationParticipants ?? [],
    chatMessages: parsed.chatMessages ?? [],
    entityDocuments: parsed.entityDocuments ?? [],
    stageTransitions: parsed.stageTransitions ?? [],
    outboundEmails: parsed.outboundEmails ?? [],
    forumPosts: parsed.forumPosts ?? [],
    forumComments: parsed.forumComments ?? [],
    forumReactions: parsed.forumReactions ?? [],
    forumTags: parsed.forumTags ?? [],
    forumLiveMessages: parsed.forumLiveMessages ?? [],
    assignmentHistory: parsed.assignmentHistory ?? [],
    notificationDeliveries: parsed.notificationDeliveries ?? [],
  });
}

function toCollections(db: DbShape): Record<CollectionName, unknown[]> {
  const out = {} as Record<CollectionName, unknown[]>;
  for (const name of COLLECTION_NAMES) {
    out[name] = (db[name] as unknown[]) ?? [];
  }
  return out;
}

function countRecords(db: DbShape): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of COLLECTION_NAMES) {
    counts[name] = db[name]?.length ?? 0;
  }
  return counts;
}

async function persistDb(db: DbShape): Promise<void> {
  await saveAllCollections(toCollections(db));
}

function enqueuePersist(db: DbShape): void {
  writeChain = writeChain
    .then(() => persistDb(db))
    .catch((error) => {
      console.error('[store] Failed to persist to Postgres:', error);
    });
}

function loadDb(): DbShape {
  if (!cache) {
    throw new Error('Store not initialized. Call initStore() before handling requests.');
  }
  return cache;
}

function saveDb(db: DbShape) {
  cache = db;
  enqueuePersist(db);
}

export async function initStore(options?: { forceImportLocal?: boolean }): Promise<{
  source: 'postgres' | 'local-db.json' | 'seed';
  counts: Record<string, number>;
}> {
  await pingDatabase();
  await ensureSchema();

  const fromPostgres = await loadAllCollections();
  const postgresHasData = collectionsHaveData(fromPostgres);
  const localFile = readLocalDbFile();
  const localHasData = Boolean(localFile && collectionsHaveData(localFile));

  let source: 'postgres' | 'local-db.json' | 'seed' = 'seed';
  let parsed: Partial<DbShape> = emptyDb();

  if (options?.forceImportLocal && localHasData && localFile) {
    parsed = localFile;
    source = 'local-db.json';
  } else if (postgresHasData) {
    parsed = fromPostgres as Partial<DbShape>;
    source = 'postgres';
  } else if (localHasData && localFile) {
    parsed = localFile;
    source = 'local-db.json';
  } else {
    parsed = {
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
    };
    source = 'seed';
  }

  const merged = buildMergedDb(parsed);
  cache = merged;
  await persistDb(merged);
  initialized = true;

  return { source, counts: countRecords(merged) };
}

export async function flushStore(): Promise<void> {
  await writeChain;
}

export async function shutdownStore(): Promise<void> {
  await flushStore();
  await closePool();
  initialized = false;
  cache = null;
}

export function isStoreInitialized(): boolean {
  return initialized;
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
  saveTeams(teams: Team[]) {
    const db = loadDb();
    db.teams = teams;
    saveDb(refreshTeamCounts(db));
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
  getProjectPhases(): ProjectPhase[] {
    return loadDb().projectPhases ?? [];
  },
  saveProjectPhases(projectPhases: ProjectPhase[]) {
    const db = loadDb();
    db.projectPhases = projectPhases;
    saveDb(db);
  },
  getConversations(): Conversation[] {
    return loadDb().conversations ?? [];
  },
  saveConversations(conversations: Conversation[]) {
    const db = loadDb();
    db.conversations = conversations;
    saveDb(db);
  },
  getConversationParticipants(): ConversationParticipant[] {
    return loadDb().conversationParticipants ?? [];
  },
  saveConversationParticipants(conversationParticipants: ConversationParticipant[]) {
    const db = loadDb();
    db.conversationParticipants = conversationParticipants;
    saveDb(db);
  },
  getChatMessages(): ChatMessage[] {
    return loadDb().chatMessages ?? [];
  },
  saveChatMessages(chatMessages: ChatMessage[]) {
    const db = loadDb();
    db.chatMessages = chatMessages;
    saveDb(db);
  },
  getEntityDocuments(): EntityDocument[] {
    return loadDb().entityDocuments ?? [];
  },
  saveEntityDocuments(entityDocuments: EntityDocument[]) {
    const db = loadDb();
    db.entityDocuments = entityDocuments;
    saveDb(db);
  },
  getStageTransitions(): StageTransition[] {
    return loadDb().stageTransitions ?? [];
  },
  saveStageTransitions(stageTransitions: StageTransition[]) {
    const db = loadDb();
    db.stageTransitions = stageTransitions;
    saveDb(db);
  },
  getOutboundEmails(): OutboundEmail[] {
    return loadDb().outboundEmails ?? [];
  },
  saveOutboundEmails(outboundEmails: OutboundEmail[]) {
    const db = loadDb();
    db.outboundEmails = outboundEmails;
    saveDb(db);
  },
  getForumPosts(): ForumPost[] {
    return loadDb().forumPosts ?? [];
  },
  saveForumPosts(forumPosts: ForumPost[]) {
    const db = loadDb();
    db.forumPosts = forumPosts;
    saveDb(db);
  },
  getForumComments(): ForumComment[] {
    return loadDb().forumComments ?? [];
  },
  saveForumComments(forumComments: ForumComment[]) {
    const db = loadDb();
    db.forumComments = forumComments;
    saveDb(db);
  },
  getForumReactions(): ForumReaction[] {
    return loadDb().forumReactions ?? [];
  },
  saveForumReactions(forumReactions: ForumReaction[]) {
    const db = loadDb();
    db.forumReactions = forumReactions;
    saveDb(db);
  },
  getForumTags(): ForumTag[] {
    return loadDb().forumTags ?? [];
  },
  saveForumTags(forumTags: ForumTag[]) {
    const db = loadDb();
    db.forumTags = forumTags;
    saveDb(db);
  },
  getForumLiveMessages(): ForumLiveMessage[] {
    return loadDb().forumLiveMessages ?? [];
  },
  saveForumLiveMessages(forumLiveMessages: ForumLiveMessage[]) {
    const db = loadDb();
    db.forumLiveMessages = forumLiveMessages;
    saveDb(db);
  },
  getAssignmentHistory(): AssignmentHistory[] {
    return loadDb().assignmentHistory ?? [];
  },
  saveAssignmentHistory(assignmentHistory: AssignmentHistory[]) {
    const db = loadDb();
    db.assignmentHistory = assignmentHistory;
    saveDb(db);
  },
  getNotificationDeliveries(): NotificationDelivery[] {
    return loadDb().notificationDeliveries ?? [];
  },
  saveNotificationDeliveries(notificationDeliveries: NotificationDelivery[]) {
    const db = loadDb();
    db.notificationDeliveries = notificationDeliveries;
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
