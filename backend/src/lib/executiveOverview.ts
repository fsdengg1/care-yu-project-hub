import { store } from '../store/db.js';
import {
  DailyUpdate,
  Project,
  ProjectActivityItem,
  Task,
  Team,
} from '../types.js';
import { projectWorkflowView } from './projectWorkflow.js';
import { withComputedProgress } from './projectProgress.js';
import { deriveHealthAndIssue } from './projects.js';
import { buildProjectActivity } from './dailyUpdates.js';

export type ExecutiveStatusFilter =
  | 'ALL'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'PENDING'
  | 'DELAYED'
  | 'AT_RISK'
  | 'BLOCKED';

export type ExecutiveSortKey =
  | 'name'
  | 'start_date'
  | 'deadline'
  | 'progress'
  | 'status'
  | 'last_activity'
  | 'completed_tasks';

export interface ExecutiveOverviewQuery {
  month: number;
  year: number;
  search?: string;
  department?: string;
  status?: ExecutiveStatusFilter;
  projectManager?: string;
  stage?: string;
  page?: number;
  limit?: number;
  sort?: ExecutiveSortKey;
  sortDir?: 'asc' | 'desc';
}

export interface ExecutiveProjectRow {
  id: string;
  code: string;
  name: string;
  customer_name: string;
  department: string;
  department_ids: string[];
  pm_id: string;
  pm_name: string;
  team_names: string[];
  start_date?: string;
  deadline?: string;
  progress: number;
  current_stage: string;
  workflow_step: number;
  completed_tasks: number;
  pending_tasks: number;
  blocked_tasks: number;
  in_progress_tasks: number;
  total_tasks: number;
  status: string;
  health: string;
  project_status: string;
  last_activity?: string;
  last_activity_label?: string;
}

export interface ExecutiveOverviewPayload {
  month: number;
  year: number;
  month_label: string;
  summary: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    delayedProjects: number;
    pendingProjects: number;
    teamMembers: number;
  };
  filteredSummary: {
    totalProjects: number;
    activeProjects: number;
    completedProjects: number;
    delayedProjects: number;
    pendingProjects: number;
  };
  projects: ExecutiveProjectRow[];
  pagination: { page: number; limit: number; total: number; pages: number };
  departments: Array<{ id: string; name: string; projects: number }>;
  projectManagers: Array<{ id: string; name: string }>;
  stages: string[];
  statusDistribution: Array<{ key: string; label: string; count: number }>;
  activityTrend: Array<{
    month: number;
    year: number;
    label: string;
    projectsWorked: number;
    projectsCompleted: number;
    tasksCompleted: number;
    tasksCreated: number;
  }>;
  attentionRequired: Array<{
    id: string;
    code: string;
    name: string;
    reason: 'DELAYED' | 'AT_RISK' | 'BLOCKED';
    deadline?: string;
    progress: number;
    pending_tasks: number;
    blocked_tasks: number;
    status: string;
  }>;
  availableMonths: Array<{ month: number; year: number; label: string }>;
}

export interface ExecutiveProjectDetail {
  project: ExecutiveProjectRow;
  customer_name: string;
  team_lead_name?: string;
  progress: number;
  lifecycle: Array<{ step: number; stage: string; state: 'completed' | 'current' | 'pending' }>;
  tasks: {
    total: number;
    completed: number;
    in_progress: number;
    pending: number;
    blocked: number;
  };
  monthly: {
    label: string;
    completed: number;
    started: number;
    in_progress: number;
    blocked: number;
  };
  team: Array<{
    user_id: string;
    name: string;
    assigned: number;
    completed: number;
    pending: number;
    hours: number;
  }>;
  taskList: Array<{
    id: string;
    title: string;
    assigned_to: string;
    department: string;
    status: string;
    due_date?: string;
    last_update?: string;
  }>;
  timeline: ProjectActivityItem[];
}

const LIFECYCLE = [
  'Project Assignment',
  'Team Lead Review',
  'Task Breakdown',
  'Team Member Execution',
  'Daily Work Update',
  'Team Lead Review & Monitor',
  'Escalation',
  'Resolution & Completion',
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function monthBounds(year: number, month: number) {
  const start = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endExclusive = `${nextYear}-${pad(nextMonth)}-01`;
  return { start, endExclusive };
}

export function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function inRange(value: string | undefined, start: string, endExclusive: string): boolean {
  if (!value) return false;
  const day = value.slice(0, 10);
  return day >= start && day < endExclusive;
}

function isoDay(value?: string) {
  return value ? value.slice(0, 10) : undefined;
}

function taskPending(task: Task) {
  if (task.status === 'DONE' && task.review_status !== 'PENDING_TL_REVIEW' && task.review_status !== 'CORRECTION_REQUIRED') {
    return false;
  }
  return task.status === 'TODO' || task.status === 'WAITING' || task.status === 'HOLD' || task.review_status === 'CORRECTION_REQUIRED';
}

function taskCompleted(task: Task) {
  return task.status === 'DONE' && task.review_status !== 'PENDING_TL_REVIEW' && task.review_status !== 'CORRECTION_REQUIRED';
}

function departmentForProject(project: Project, teams: Team[], tasks: Task[]): { name: string; ids: string[]; names: string[] } {
  const byId = new Map(teams.map((team) => [team.id, team]));
  const ids = [...(project.team_ids || [])];
  const names = ids.map((id) => byId.get(id)?.name).filter((name): name is string => Boolean(name));
  for (const task of tasks) {
    if (task.team_name && !names.includes(task.team_name)) names.push(task.team_name);
    if (task.team_id && !ids.includes(task.team_id)) ids.push(task.team_id);
  }
  return { name: names[0] || project.team_lead_name || 'Unassigned', ids, names };
}

function executiveStatus(project: Project, blocked: number, overdue: boolean): string {
  if (project.status === 'COMPLETED') return 'Completed';
  if (project.status === 'CANCELLED') return 'Cancelled';
  if (blocked > 0) return 'Blocked';
  if (project.health === 'AT_RISK' || project.health === 'CRITICAL' || overdue) return project.health === 'CRITICAL' ? 'At Risk' : overdue ? 'Delayed' : 'At Risk';
  if (project.status === 'ON_HOLD' || ['DRAFT', 'SUBMITTED_TO_PM', 'RETURNED_TO_CREATOR', 'AWAITING_ASSIGNMENT', 'PENDING_TL_REVIEW', 'RETURNED'].includes(project.intake_status || '')) {
    return 'Pending';
  }
  return 'Active';
}

function matchesStatusFilter(label: string, filter: ExecutiveStatusFilter): boolean {
  if (filter === 'ALL') return true;
  if (filter === 'ACTIVE') return label === 'Active';
  if (filter === 'COMPLETED') return label === 'Completed';
  if (filter === 'PENDING') return label === 'Pending';
  if (filter === 'DELAYED') return label === 'Delayed';
  if (filter === 'AT_RISK') return label === 'At Risk' || label === 'Delayed';
  if (filter === 'BLOCKED') return label === 'Blocked';
  return true;
}

function projectHadActivity(
  project: Project,
  start: string,
  endExclusive: string,
  tasks: Task[],
  updates: DailyUpdate[],
  auditDays: string[]
): boolean {
  const projectDates = [
    project.created_at,
    project.updated_at,
    project.last_action_at,
    project.last_update_at,
    project.assigned_at,
    project.tl_accepted_at,
    project.tl_reviewed_at,
    project.pm_approved_at,
    project.start_date,
  ];
  if (projectDates.some((value) => inRange(value, start, endExclusive))) return true;
  if (tasks.some((task) => inRange(task.created_at, start, endExclusive) || inRange(task.updated_at, start, endExclusive) || inRange(task.completed_at, start, endExclusive) || inRange(task.last_update_at, start, endExclusive) || inRange(task.last_action_at, start, endExclusive))) {
    return true;
  }
  if (
    updates.some(
      (item) =>
        inRange(item.work_date, start, endExclusive) ||
        inRange(item.submitted_at, start, endExclusive) ||
        inRange(item.created_at, start, endExclusive)
    )
  ) {
    return true;
  }
  return auditDays.some((day) => inRange(day, start, endExclusive));
}

function buildRow(project: Project, teams: Team[], projectTasks: Task[]): ExecutiveProjectRow {
  const health = deriveHealthAndIssue(project);
  const next = withComputedProgress({ ...project, health: health.health, issue: health.issue });
  const tasks = projectTasks.filter((task) => !task.is_milestone);
  const workflow = projectWorkflowView(next);
  const dept = departmentForProject(next, teams, tasks);
  const completed = tasks.filter(taskCompleted).length;
  const blocked = tasks.filter((task) => task.status === 'BLOCKED').length;
  const inProgress = tasks.filter((task) => task.status === 'IN_PROGRESS').length;
  const pending = tasks.filter(taskPending).length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = Boolean(next.target_completion && next.status === 'ACTIVE' && next.progress < 100 && next.target_completion < today);
  const lastActivity = next.last_action_at || next.last_update_at || next.updated_at;
  return {
    id: next.id,
    code: next.code,
    name: next.name,
    customer_name: next.customer_name,
    department: dept.name,
    department_ids: dept.ids,
    pm_id: next.pm_id,
    pm_name: next.pm_name,
    team_names: dept.names,
    start_date: next.start_date,
    deadline: next.target_completion,
    progress: next.progress || 0,
    current_stage: workflow.stage,
    workflow_step: workflow.step,
    completed_tasks: completed,
    pending_tasks: pending,
    blocked_tasks: blocked,
    in_progress_tasks: inProgress,
    total_tasks: tasks.length,
    status: executiveStatus(next, blocked, overdue),
    health: next.health,
    project_status: next.status,
    last_activity: lastActivity,
    last_activity_label: next.last_action || workflow.last_action_label,
  };
}

function indexByProject<T extends { project_id?: string }>(items: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const id = item.project_id;
    if (!id) continue;
    const list = map.get(id) || [];
    list.push(item);
    map.set(id, list);
  }
  return map;
}

export function listActiveMonths(): Array<{ month: number; year: number; label: string }> {
  const seen = new Set<string>();
  const push = (value?: string) => {
    if (!value) return;
    const day = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    const year = Number(day.slice(0, 4));
    const month = Number(day.slice(5, 7));
    seen.add(`${year}-${month}`);
  };
  for (const project of store.getProjects()) {
    push(project.created_at);
    push(project.updated_at);
    push(project.last_action_at);
    push(project.last_update_at);
    push(project.start_date);
  }
  for (const task of store.getTasks()) {
    push(task.created_at);
    push(task.updated_at);
    push(task.completed_at);
  }
  for (const update of store.getDailyUpdates()) {
    push(update.work_date);
    push(update.submitted_at);
  }
  const now = new Date();
  seen.add(`${now.getFullYear()}-${now.getMonth() + 1}`);
  return [...seen]
    .map((key) => {
      const [year, month] = key.split('-').map(Number);
      return { year, month, label: monthLabel(year, month) };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month)
    .slice(0, 36);
}

function collectMonthRows(year: number, month: number): ExecutiveProjectRow[] {
  const { start, endExclusive } = monthBounds(year, month);
  const teams = store.getTeams();
  const tasksByProject = indexByProject(store.getTasks());
  const updatesByProject = indexByProject(store.getDailyUpdates());
  const auditsByProject = new Map<string, string[]>();
  for (const audit of store.getAudits()) {
    if (audit.entity_type !== 'PROJECT' && audit.entity_type !== 'TASK' && audit.entity_type !== 'DAILY_UPDATE') continue;
    const list = auditsByProject.get(audit.entity_id) || [];
    list.push(audit.created_at);
    auditsByProject.set(audit.entity_id, list);
  }
  const rows: ExecutiveProjectRow[] = [];
  for (const project of store.getProjects()) {
    if (project.intake_status === 'DRAFT') continue;
    const tasks = tasksByProject.get(project.id) || [];
    const updates = updatesByProject.get(project.id) || [];
    const auditDays = [
      ...(auditsByProject.get(project.id) || []),
      ...tasks.flatMap((task) => auditsByProject.get(task.id) || []),
    ];
    if (!projectHadActivity(project, start, endExclusive, tasks, updates, auditDays)) continue;
    rows.push(buildRow(project, teams, tasks));
  }
  return rows;
}

export function buildExecutiveOverview(query: ExecutiveOverviewQuery): ExecutiveOverviewPayload {
  const month = Number(query.month);
  const year = Number(query.year);
  const search = (query.search || '').trim().toLowerCase();
  const status = (query.status || 'ALL') as ExecutiveStatusFilter;
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(50, Math.max(10, Number(query.limit) || 20));
  const sort = query.sort || 'last_activity';
  const sortDir = query.sortDir === 'asc' ? 1 : -1;

  const allRows = collectMonthRows(year, month);
  const monthTeam = new Set<string>();
  const { start, endExclusive } = monthBounds(year, month);
  for (const task of store.getTasks()) {
    if (!allRows.some((row) => row.id === task.project_id)) continue;
    if (
      inRange(task.created_at, start, endExclusive) ||
      inRange(task.updated_at, start, endExclusive) ||
      inRange(task.completed_at, start, endExclusive)
    ) {
      if (task.assigned_to_id) monthTeam.add(task.assigned_to_id);
    }
  }
  for (const update of store.getDailyUpdates()) {
    if (!update.project_id || !allRows.some((row) => row.id === update.project_id)) continue;
    if (inRange(update.work_date, start, endExclusive) || inRange(update.submitted_at, start, endExclusive)) {
      monthTeam.add(update.user_id);
    }
  }

  let filtered = allRows;
  if (query.department) {
    filtered = filtered.filter(
      (row) =>
        row.department_ids.includes(query.department!) ||
        row.department === query.department ||
        row.team_names.includes(query.department!)
    );
  }
  if (query.projectManager) {
    filtered = filtered.filter((row) => row.pm_id === query.projectManager);
  }
  if (query.stage) {
    filtered = filtered.filter((row) => row.current_stage === query.stage);
  }
  if (status !== 'ALL') {
    filtered = filtered.filter((row) => matchesStatusFilter(row.status, status));
  }
  if (search) {
    filtered = filtered.filter((row) =>
      [row.name, row.code, row.customer_name, row.pm_name, row.department, row.current_stage, row.status, ...row.team_names]
        .join(' ')
        .toLowerCase()
        .includes(search)
    );
  }

  filtered.sort((a, b) => {
    const value = (row: ExecutiveProjectRow) => {
      if (sort === 'name') return row.name.toLowerCase();
      if (sort === 'start_date') return row.start_date || '';
      if (sort === 'deadline') return row.deadline || '';
      if (sort === 'progress') return row.progress;
      if (sort === 'status') return row.status;
      if (sort === 'completed_tasks') return row.completed_tasks;
      return row.last_activity || '';
    };
    const left = value(a);
    const right = value(b);
    if (left < right) return -1 * sortDir;
    if (left > right) return 1 * sortDir;
    return 0;
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const paged = filtered.slice((page - 1) * limit, page * limit);

  const countBy = (label: string) => allRows.filter((row) => row.status === label).length;
  const delayed = allRows.filter((row) => row.status === 'Delayed' || row.status === 'At Risk').length;

  const deptMap = new Map<string, { id: string; name: string; projects: number }>();
  for (const row of allRows) {
    const key = row.department;
    const current = deptMap.get(key) || { id: row.department_ids[0] || key, name: key, projects: 0 };
    current.projects += 1;
    deptMap.set(key, current);
  }

  const pmMap = new Map<string, string>();
  for (const row of allRows) {
    if (row.pm_id) pmMap.set(row.pm_id, row.pm_name);
  }

  const trend: ExecutiveOverviewPayload['activityTrend'] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    let m = month - offset;
    let y = year;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const rows = collectMonthRows(y, m);
    const { start: s, endExclusive: e } = monthBounds(y, m);
    const tasks = store.getTasks().filter((task) => rows.some((row) => row.id === task.project_id));
    trend.push({
      month: m,
      year: y,
      label: monthLabel(y, m).slice(0, 3),
      projectsWorked: rows.length,
      projectsCompleted: rows.filter((row) => row.project_status === 'COMPLETED' && inRange(row.last_activity, s, e)).length,
      tasksCompleted: tasks.filter((task) => inRange(task.completed_at || (task.status === 'DONE' ? task.updated_at : undefined), s, e)).length,
      tasksCreated: tasks.filter((task) => inRange(task.created_at, s, e)).length,
    });
  }

  return {
    month,
    year,
    month_label: monthLabel(year, month),
    summary: {
      totalProjects: allRows.length,
      activeProjects: countBy('Active'),
      completedProjects: countBy('Completed'),
      delayedProjects: delayed,
      pendingProjects: countBy('Pending'),
      teamMembers: monthTeam.size,
    },
    filteredSummary: {
      totalProjects: filtered.length,
      activeProjects: filtered.filter((row) => row.status === 'Active').length,
      completedProjects: filtered.filter((row) => row.status === 'Completed').length,
      delayedProjects: filtered.filter((row) => row.status === 'Delayed' || row.status === 'At Risk').length,
      pendingProjects: filtered.filter((row) => row.status === 'Pending').length,
    },
    projects: paged,
    pagination: { page, limit, total, pages },
    departments: [...deptMap.values()].sort((a, b) => b.projects - a.projects),
    projectManagers: [...pmMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    stages: [...new Set(allRows.map((row) => row.current_stage))].sort(),
    statusDistribution: [
      { key: 'ACTIVE', label: 'Active', count: countBy('Active') },
      { key: 'COMPLETED', label: 'Completed', count: countBy('Completed') },
      { key: 'DELAYED', label: 'Delayed', count: countBy('Delayed') },
      { key: 'AT_RISK', label: 'At Risk', count: countBy('At Risk') },
      { key: 'PENDING', label: 'Pending', count: countBy('Pending') },
      { key: 'BLOCKED', label: 'Blocked', count: countBy('Blocked') },
    ],
    activityTrend: trend,
    attentionRequired: allRows
      .filter((row) => row.status === 'Delayed' || row.status === 'At Risk' || row.status === 'Blocked')
      .slice(0, 8)
      .map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        reason: row.status === 'Blocked' ? 'BLOCKED' : row.status === 'Delayed' ? 'DELAYED' : 'AT_RISK',
        deadline: row.deadline,
        progress: row.progress,
        pending_tasks: row.pending_tasks,
        blocked_tasks: row.blocked_tasks,
        status: row.status,
      })),
    availableMonths: listActiveMonths(),
  };
}

export function buildExecutiveProjectDetail(projectId: string, year: number, month: number): ExecutiveProjectDetail | null {
  const project = store.getProjects().find((item) => item.id === projectId);
  if (!project || project.intake_status === 'DRAFT') return null;
  const teams = store.getTeams();
  const row = buildRow(project, teams, store.getTasks().filter((task) => task.project_id === project.id));
  const { start, endExclusive } = monthBounds(year, month);
  const tasks = store.getTasks().filter((task) => task.project_id === project.id && !task.is_milestone);
  const updates = store.getDailyUpdates().filter((item) => item.project_id === project.id && item.submission_status === 'SUBMITTED');
  const workflow = projectWorkflowView(project);
  const step = Math.max(0, workflow.step);
  const lifecycle = LIFECYCLE.map((stage, index) => {
    const currentIndex = Math.max(0, step - 1);
    return {
      step: index + 1,
      stage,
      state: (index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'pending') as 'completed' | 'current' | 'pending',
    };
  });

  const monthlyTasks = tasks.filter(
    (task) =>
      inRange(task.created_at, start, endExclusive) ||
      inRange(task.updated_at, start, endExclusive) ||
      inRange(task.completed_at, start, endExclusive)
  );
  const started = monthlyTasks.filter((task) => inRange(task.created_at, start, endExclusive) || (task.status === 'IN_PROGRESS' && inRange(task.updated_at, start, endExclusive))).length;
  const completed = monthlyTasks.filter((task) => taskCompleted(task) && (inRange(task.completed_at, start, endExclusive) || inRange(task.updated_at, start, endExclusive))).length;
  const inProgress = monthlyTasks.filter((task) => task.status === 'IN_PROGRESS').length;
  const blocked = monthlyTasks.filter((task) => task.status === 'BLOCKED').length;

  const members = new Map<string, ExecutiveProjectDetail['team'][number]>();
  const addMember = (id: string, name: string) => {
    if (!id) return;
    if (!members.has(id)) members.set(id, { user_id: id, name, assigned: 0, completed: 0, pending: 0, hours: 0 });
  };
  if (project.pm_id) addMember(project.pm_id, project.pm_name);
  if (project.team_lead_id) addMember(project.team_lead_id, project.team_lead_name || 'Team Lead');
  for (const task of tasks) {
    addMember(task.assigned_to_id, task.assigned_to);
    const member = members.get(task.assigned_to_id);
    if (!member) continue;
    member.assigned += 1;
    if (taskCompleted(task)) member.completed += 1;
    else member.pending += 1;
  }
  for (const update of updates) {
    addMember(update.user_id, update.user_name);
    const member = members.get(update.user_id);
    if (member && inRange(update.work_date, start, endExclusive)) member.hours += Number(update.hours_worked || 0);
  }

  const timeline = buildProjectActivity(project.id)
    .filter((item) => inRange(item.at, start, endExclusive))
    .slice(0, 40);

  return {
    project: row,
    customer_name: project.customer_name,
    team_lead_name: project.team_lead_name,
    progress: row.progress,
    lifecycle,
    tasks: {
      total: tasks.length,
      completed: tasks.filter(taskCompleted).length,
      in_progress: tasks.filter((task) => task.status === 'IN_PROGRESS').length,
      pending: tasks.filter(taskPending).length,
      blocked: tasks.filter((task) => task.status === 'BLOCKED').length,
    },
    monthly: {
      label: monthLabel(year, month),
      completed,
      started,
      in_progress: inProgress,
      blocked,
    },
    team: [...members.values()].sort((a, b) => b.assigned - a.assigned),
    taskList: tasks.map((task) => ({
      id: task.id,
      title: task.title,
      assigned_to: task.assigned_to,
      department: task.team_name || row.department,
      status: task.status,
      due_date: task.due_date,
      last_update: task.last_update_at || task.updated_at,
    })),
    timeline,
  };
}

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function buildExecutiveExcel(query: ExecutiveOverviewQuery): { filename: string; body: string; contentType: string } {
  const payload = buildExecutiveOverview({ ...query, page: 1, limit: 500 });
  const rows = payload.projects
    .map(
      (row) =>
        `<Row><Cell><Data ss:Type="String">${xmlEscape(row.code)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.name)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.customer_name)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.department)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.pm_name)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.start_date || '')}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.deadline || '')}</Data></Cell><Cell><Data ss:Type="Number">${row.progress}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.current_stage)}</Data></Cell><Cell><Data ss:Type="Number">${row.completed_tasks}</Data></Cell><Cell><Data ss:Type="Number">${row.pending_tasks}</Data></Cell><Cell><Data ss:Type="Number">${row.blocked_tasks}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(row.status)}</Data></Cell><Cell><Data ss:Type="String">${xmlEscape(isoDay(row.last_activity) || '')}</Data></Cell></Row>`
    )
    .join('');
  const body = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Executive Overview"><Table>
<Row><Cell><Data ss:Type="String">CareYu PMS</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">Executive Project Overview</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">${xmlEscape(payload.month_label)}</Data></Cell></Row>
<Row></Row>
<Row><Cell><Data ss:Type="String">Total Projects</Data></Cell><Cell><Data ss:Type="Number">${payload.filteredSummary.totalProjects}</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">Active</Data></Cell><Cell><Data ss:Type="Number">${payload.filteredSummary.activeProjects}</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">Completed</Data></Cell><Cell><Data ss:Type="Number">${payload.filteredSummary.completedProjects}</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">Delayed / At Risk</Data></Cell><Cell><Data ss:Type="Number">${payload.filteredSummary.delayedProjects}</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">Pending</Data></Cell><Cell><Data ss:Type="Number">${payload.filteredSummary.pendingProjects}</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">Team Members</Data></Cell><Cell><Data ss:Type="Number">${payload.summary.teamMembers}</Data></Cell></Row>
<Row></Row>
<Row><Cell><Data ss:Type="String">Project ID</Data></Cell><Cell><Data ss:Type="String">Project Name</Data></Cell><Cell><Data ss:Type="String">Customer</Data></Cell><Cell><Data ss:Type="String">Department</Data></Cell><Cell><Data ss:Type="String">Project Manager</Data></Cell><Cell><Data ss:Type="String">Start Date</Data></Cell><Cell><Data ss:Type="String">Deadline</Data></Cell><Cell><Data ss:Type="String">Progress</Data></Cell><Cell><Data ss:Type="String">Stage</Data></Cell><Cell><Data ss:Type="String">Completed Tasks</Data></Cell><Cell><Data ss:Type="String">Pending Tasks</Data></Cell><Cell><Data ss:Type="String">Blocked Tasks</Data></Cell><Cell><Data ss:Type="String">Status</Data></Cell><Cell><Data ss:Type="String">Last Activity</Data></Cell></Row>
${rows}
</Table></Worksheet></Workbook>`;
  return {
    filename: `CareYu-Executive-Overview-${payload.year}-${pad(payload.month)}.xls`,
    body,
    contentType: 'application/vnd.ms-excel',
  };
}

export function buildExecutivePdfHtml(query: ExecutiveOverviewQuery): { filename: string; body: string; contentType: string } {
  const payload = buildExecutiveOverview({ ...query, page: 1, limit: 500 });
  const table = payload.projects
    .map(
      (row) =>
        `<tr><td>${xmlEscape(row.code)}</td><td>${xmlEscape(row.name)}</td><td>${xmlEscape(row.department)}</td><td>${xmlEscape(row.pm_name)}</td><td>${row.progress}%</td><td>${xmlEscape(row.current_stage)}</td><td>${xmlEscape(row.status)}</td></tr>`
    )
    .join('');
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Executive Overview</title>
<style>body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;padding:24px}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;font-size:12px;margin-top:16px}th,td{border:1px solid #cbd5e1;padding:6px 8px;text-align:left}th{background:#0f172a;color:#fff}.kpis{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.kpi{border:1px solid #cbd5e1;padding:10px 14px;border-radius:8px}</style></head>
<body>
<p>CareYu PMS</p>
<h1>Executive Project Overview</h1>
<p>${xmlEscape(payload.month_label)}</p>
<div class="kpis">
<div class="kpi">Total ${payload.filteredSummary.totalProjects}</div>
<div class="kpi">Active ${payload.filteredSummary.activeProjects}</div>
<div class="kpi">Completed ${payload.filteredSummary.completedProjects}</div>
<div class="kpi">Delayed / At Risk ${payload.filteredSummary.delayedProjects}</div>
<div class="kpi">Pending ${payload.filteredSummary.pendingProjects}</div>
<div class="kpi">Team ${payload.summary.teamMembers}</div>
</div>
<table><thead><tr><th>ID</th><th>Project</th><th>Department</th><th>PM</th><th>Progress</th><th>Stage</th><th>Status</th></tr></thead><tbody>${table || '<tr><td colspan="7">No project activity found</td></tr>'}</tbody></table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
  return {
    filename: `CareYu-Executive-Overview-${payload.year}-${pad(payload.month)}.html`,
    body,
    contentType: 'text/html; charset=utf-8',
  };
}
