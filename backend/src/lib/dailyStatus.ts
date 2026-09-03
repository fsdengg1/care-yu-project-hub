import { store } from '../store/db.js';
import { env } from '../config/env.js';
import { DailyUpdate, Project, Task, User } from '../types.js';
import { canViewProject } from './dailyUpdates.js';
import { formatEmployeeDisplayName, dedupeByStableId, personGivenKey } from './people.js';
import { sendEmail } from './email.js';

export type DailySheetStatus = 'Yet to Start' | 'In Progress' | 'Waiting' | 'Completed' | 'Hold';
export type SnapshotPeriod = 'morning' | 'evening';

export interface DailyStatusSubtask {
  id: string;
  title: string;
  description?: string;
  status: DailySheetStatus;
  progressPercent: number;
  deadline: string;
  deadlineIso?: string;
  assignedTo: string;
  assignedToId?: string;
  parentTaskId?: string;
}

export interface DailyStatusRow {
  id: string;
  personId: string;
  person: string;
  projectId?: string;
  project: string;
  taskDescription: string;
  dependencyIds: string[];
  dependencies: string;
  status: DailySheetStatus;
  currentDate: string;
  startDate: string;
  startDateIso?: string;
  deadline: string;
  deadlineIso?: string;
  reasonForDelay: string;
  isAdditional: boolean;
  blocked?: boolean;
  overdue?: boolean;
  progressPercent: number;
  /** Decimal hours from latest submitted daily update (e.g. 6.5). */
  hoursWorked: number;
  /** Display label e.g. "6h 30m". */
  loggedHours: string;
  workDate?: string;
  latestUpdateAt?: string;
  morningStatus?: DailySheetStatus;
  eveningStatus?: DailySheetStatus;
  subtasks?: DailyStatusSubtask[];
  hasSubtasks?: boolean;
  /** Hidden from the default Daily Work Updates view on every dashboard. */
  sheetHidden?: boolean;
}

export interface DailyStatusKpis {
  updatesToday: number;
  pending: number;
  blocked: number;
  completed: number;
  projectsRequiringAttention: number;
}

const SNAPSHOT_PREFIX = 'dss:';

export function toSheetStatus(status?: string): DailySheetStatus {
  const value = (status || '').toUpperCase().replace(/\s+/g, '_');
  if (value === 'DONE' || value === 'COMPLETED') return 'Completed';
  if (value === 'IN_PROGRESS' || value === 'WORK_IN_PROGRESS') return 'In Progress';
  if (value === 'HOLD' || value === 'ON_HOLD') return 'Hold';
  if (value === 'WAITING' || value === 'BLOCKED') return 'Waiting';
  if (value === 'YET_TO_START' || value === 'TODO' || value === 'NOT_STARTED') return 'Yet to Start';
  return 'Yet to Start';
}

export function fromSheetStatus(status: string): Task['status'] {
  if (status === 'Completed') return 'DONE';
  if (status === 'In Progress') return 'IN_PROGRESS';
  if (status === 'Hold') return 'HOLD' as Task['status'];
  if (status === 'Waiting') return 'WAITING' as Task['status'];
  return 'TODO';
}

export function formatSheetDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(+date)) return value;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function todayIso(): string {
  return dateInAppTimezone();
}

/** Previous calendar day (app timezone) as YYYY-MM-DD. */
function yesterdayIso(): string {
  const today = todayIso();
  const [y, m, d] = today.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() - 1);
  return utc.toISOString().slice(0, 10);
}

function periodRowsAvailable(date: string, period: SnapshotPeriod): boolean {
  const rows = loadMailedOrSnapshotRows(date, period);
  return Boolean(rows && rows.length);
}

/** Calendar date in app timezone (default Asia/Kolkata) as YYYY-MM-DD. */
export function dateInAppTimezone(when = new Date(), timezone = env.appTimezone || 'Asia/Kolkata'): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(when);
}

export type DeadlineTone = 'completed' | 'hold' | 'delay-1' | 'delay-2plus' | 'normal';

function parseSheetDate(value?: string): string | null {
  if (!value || value === '—') return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const match = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  const date = new Date(value);
  if (Number.isNaN(+date)) return null;
  return date.toISOString().slice(0, 10);
}

function overdueDays(deadlineIso: string | undefined, today = todayIso()): number {
  if (!deadlineIso) return 0;
  const start = Date.parse(`${deadlineIso}T00:00:00`);
  const end = Date.parse(`${today}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86400000);
}

export function deadlineTone(status: string, deadline?: string, today?: string): DeadlineTone {
  const sheet = toSheetStatus(status);
  if (status === 'Completed' || sheet === 'Completed') return 'completed';
  if (status === 'Hold' || sheet === 'Hold') return 'hold';
  const iso = parseSheetDate(deadline);
  const days = iso ? overdueDays(iso, today) : 0;
  if (days >= 2) return 'delay-2plus';
  if (days === 1) return 'delay-1';
  return 'normal';
}

function deadlineInlineStyle(tone: DeadlineTone): string {
  if (tone === 'completed') return 'background:#dcfce7;color:#166534;font-weight:700;';
  if (tone === 'hold') return 'background:#fde68a;color:#78350f;font-weight:700;';
  if (tone === 'delay-1') return 'background:#dc2626;color:#ffffff;font-weight:700;';
  if (tone === 'delay-2plus') return 'background:#0f172a;color:#ffffff;font-weight:700;';
  return '';
}

function isOverdue(task: Task, asOf = todayIso()): boolean {
  if (!task.due_date) return false;
  if (task.status === 'DONE' || task.status === ('HOLD' as Task['status'])) return false;
  return task.due_date < asOf;
}

function delayReason(task: Task, update?: DailyUpdate): string {
  const blocker = update?.blocker || task.blocked_reason;
  if (blocker?.trim()) return blocker.trim();
  if (task.status === 'DONE' || !isOverdue(task)) return 'No delay';
  return task.remarks?.trim() || 'No delay';
}

function dependencyIdsOf(task: Task): string[] {
  const ids = [
    ...(Array.isArray(task.depends_on_ids) ? task.depends_on_ids : []),
    task.depends_on_id,
  ]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  return [...new Set(ids)];
}

function formatDependencies(ids: string[], users: User[], fallback?: string): string {
  if (!ids.length) {
    const parsed = parseLegacyDependency(fallback);
    return parsed || '—';
  }
  const names = ids
    .map((id) => users.find((user) => user.id === id))
    .filter((user): user is User => Boolean(user))
    .map((user) => formatEmployeeDisplayName(user));
  return names.length ? names.join(', ') : '—';
}

function parseLegacyDependency(value?: string): string {
  if (!value?.trim()) return '';
  const raw = value.trim();
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw) as { names?: string[]; ids?: string[] } | string[];
      if (Array.isArray(parsed)) return parsed.map((item) => formatEmployeeDisplayName(String(item))).join(', ');
      if (Array.isArray(parsed.names) && parsed.names.length) {
        return parsed.names.map((name) => formatEmployeeDisplayName(name)).join(', ');
      }
    } catch {
      return '';
    }
  }
  return raw
    .split(',')
    .map((part) => formatEmployeeDisplayName(part.trim()))
    .filter(Boolean)
    .join(', ');
}

function formatLoggedHours(hours?: number): string {
  const value = Math.max(0, Number(hours) || 0);
  const whole = Math.floor(value);
  const mins = Math.min(59, Math.round((value - whole) * 60));
  return `${whole}h ${String(mins).padStart(2, '0')}m`;
}

function updatesForTask(task: Task, updates: DailyUpdate[]): DailyUpdate[] {
  return updates.filter(
    (item) =>
      item.task_id === task.id ||
      item.assignment_id === task.id ||
      (item.user_id === task.assigned_to_id && item.project_id === task.project_id && item.task_title === task.title)
  );
}

function pickUpdateForDate(
  forTask: DailyUpdate[],
  workDate: string,
  period?: SnapshotPeriod
): DailyUpdate | undefined {
  if (!forTask.length) return undefined;
  const onDate = forTask.filter((item) => item.work_date === workDate);
  if (!onDate.length) return undefined;
  const preferred = period || inferDefaultEmailPeriod();
  return onDate.find((item) => item.period === preferred) || onDate[0];
}

function latestUpdateForTask(
  task: Task,
  updates: DailyUpdate[],
  workDate = todayIso(),
  period?: SnapshotPeriod
): DailyUpdate | undefined {
  const forTask = updatesForTask(task, updates);
  if (!forTask.length) return undefined;
  const onDate = pickUpdateForDate(forTask, workDate, period);
  if (onDate) return onDate;
  // Today: fall back to the latest prior update for narrative fields.
  if (workDate === todayIso()) return forTask[0];
  return undefined;
}

/** Logged hours are per calendar day. A day with no log is 0. */
function loggedHoursForDate(
  task: Task,
  updates: DailyUpdate[],
  workDate: string,
  period?: SnapshotPeriod
): number {
  const dayUpdate = pickUpdateForDate(updatesForTask(task, updates), workDate, period);
  return Math.max(0, Number(dayUpdate?.hours_worked) || 0);
}

function visibleUsers(user: User): User[] {
  return dedupeByStableId(
    store.getUsers().filter((item) => item.status === 'ACTIVE'),
    (item) => item.id
  );
}

export function canSeeAllDailyStatusRows(user: User) {
  return ['CEO', 'ENG_DIRECTOR', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'].includes(user.role_code);
}

/** Shared Daily Work Updates visibility: leadership sees every row; others see assigned/created tasks. */
export function canSeeDailyStatusTask(user: User, task: Task): boolean {
  if (task.is_milestone) return false;
  if (task.acceptance_status === 'REQUESTED' || task.acceptance_status === 'REJECTED') return false;
  // Global shared sheet for CEO / Engineering Director / Arivan (PM) / admin.
  if (canSeeAllDailyStatusRows(user)) return true;
  return (
    task.assigned_to_id === user.id ||
    task.created_by_id === user.id ||
    task.assigned_by_id === user.id ||
    task.responsible_user_id === user.id
  );
}

function scopedDailyStatusRows(user: User, rows: DailyStatusRow[]) {
  if (canSeeAllDailyStatusRows(user)) return rows;
  return rows.filter((row) => row.personId === user.id);
}

export function visibleSheetRows(rows: DailyStatusRow[]) {
  return rows.filter((row) => !row.sheetHidden);
}

export function buildDailyStatusRows(
  user: User,
  options?: { date?: string; period?: SnapshotPeriod }
): DailyStatusRow[] {
  const workDate = options?.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? options.date : todayIso();
  const period = options?.period;
  const users = visibleUsers(user);
  const allUsers = store.getUsers();
  const projects = store.getProjects();
  const updates = store
    .getDailyUpdates()
    .filter((item) => item.submission_status === 'SUBMITTED')
    .slice()
    .sort((a, b) => (b.submitted_at || b.updated_at).localeCompare(a.submitted_at || a.updated_at));
  const visibleTasks = store.getTasks().filter((task) => canSeeDailyStatusTask(user, task));
  const visibleRootIds = new Set(visibleTasks.filter((task) => !task.parent_task_id).map((task) => task.id));
  // Nest children under visible parents even when the subtask assignee differs.
  const childrenByParent = new Map<string, Task[]>();
  for (const task of store.getTasks()) {
    if (task.is_milestone) continue;
    if (task.acceptance_status === 'REQUESTED' || task.acceptance_status === 'REJECTED') continue;
    if (!task.parent_task_id || !visibleRootIds.has(task.parent_task_id)) continue;
    const list = childrenByParent.get(task.parent_task_id) || [];
    list.push(task);
    childrenByParent.set(task.parent_task_id, list);
  }

  return visibleTasks
    .filter((task) => !task.parent_task_id)
    .map((task) => {
      const project = task.project_id ? projects.find((item) => item.id === task.project_id) : undefined;
      const assignee =
        users.find((item) => item.id === task.assigned_to_id) ||
        allUsers.find((item) => item.id === task.assigned_to_id);
      const update = latestUpdateForTask(task, updates, workDate, period);
      const hoursToday = loggedHoursForDate(task, updates, workDate, period);
      const deps = dependencyIdsOf(task);
      const status = toSheetStatus(task.status === 'BLOCKED' ? 'WAITING' : task.status);
      const children = (childrenByParent.get(task.id) || []).slice().sort((a, b) => a.title.localeCompare(b.title));
      const subtasks: DailyStatusSubtask[] = children.map((child) => ({
        id: child.id,
        title: child.title,
        description: child.description || child.title,
        status: toSheetStatus(child.status === 'BLOCKED' ? 'WAITING' : child.status),
        progressPercent: child.progress_percent || 0,
        deadline: formatSheetDate(child.due_date),
        deadlineIso: child.due_date ? String(child.due_date).slice(0, 10) : undefined,
        assignedTo: formatEmployeeDisplayName(
          users.find((item) => item.id === child.assigned_to_id) ||
            allUsers.find((item) => item.id === child.assigned_to_id) ||
            child.assigned_to
        ),
        assignedToId: child.assigned_to_id,
        parentTaskId: child.parent_task_id || task.id,
      }));
      let progressPercent = task.progress_percent || 0;
      if (children.length && !task.progress_manual_override) {
        const doneWeight = children.reduce((sum, child) => {
          if (child.status === 'DONE') return sum + 1;
          if (child.status === 'IN_PROGRESS') return sum + 0.5;
          return sum;
        }, 0);
        progressPercent = Math.round((doneWeight / children.length) * 100);
      }
      return {
        id: task.id,
        personId: task.assigned_to_id,
        person: formatEmployeeDisplayName(assignee || task.assigned_to),
        projectId: task.project_id,
        project: project?.name || task.project_name || update?.project_name || '—',
        taskDescription: (update?.work_completed || task.description || task.title || '').trim() || task.title,
        dependencyIds: deps,
        dependencies: formatDependencies(deps, allUsers, update?.dependency),
        status,
        currentDate: formatSheetDate(workDate),
        startDate: formatSheetDate(task.start_date),
        startDateIso: task.start_date ? String(task.start_date).slice(0, 10) : undefined,
        deadline: formatSheetDate(task.due_date),
        deadlineIso: task.due_date ? String(task.due_date).slice(0, 10) : undefined,
        reasonForDelay: delayReason(task, update),
        isAdditional: Boolean(task.is_additional),
        blocked: task.status === 'BLOCKED' || task.status === ('WAITING' as Task['status']),
        overdue: isOverdue(task, workDate),
        progressPercent,
        hoursWorked: hoursToday,
        loggedHours: formatLoggedHours(hoursToday),
        workDate: pickUpdateForDate(updatesForTask(task, updates), workDate, period)?.work_date || workDate,
        latestUpdateAt: update?.submitted_at || update?.updated_at || task.last_update_at,
        subtasks,
        hasSubtasks: subtasks.length > 0,
        sheetHidden: Boolean(task.sheet_hidden),
      } satisfies DailyStatusRow;
    })
    .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project));
}

export function buildDailyStatusKpis(user: User, rows = visibleSheetRows(buildDailyStatusRows(user))): DailyStatusKpis {
  const today = todayIso();
  const summaryUpdates = store.getDailyUpdates().filter((item) => item.work_date === today && item.submission_status === 'SUBMITTED');
  const visibleProjectIds = new Set(
    store.getProjects().filter((project) => canViewProject(user, project)).map((project) => project.id)
  );
  const attention = rows.filter((row) => row.blocked || row.overdue || row.status === 'Hold');
  return {
    updatesToday: summaryUpdates.filter((item) => !item.project_id || visibleProjectIds.has(item.project_id) || item.user_id === user.id).length,
    pending: rows.filter((row) => row.status === 'Yet to Start' || row.status === 'In Progress').length,
    blocked: rows.filter((row) => row.status === 'Waiting' || row.blocked).length,
    completed: rows.filter((row) => row.status === 'Completed').length,
    projectsRequiringAttention: new Set(attention.map((row) => row.projectId || row.project)).size,
  };
}

function snapshotId(date: string, period: SnapshotPeriod) {
  return `${SNAPSHOT_PREFIX}${date}:${period}`;
}

export function saveDailyStatusSnapshot(user: User, period: SnapshotPeriod, date = todayIso()) {
  const rows = visibleSheetRows(buildDailyStatusRows(user, { date, period }));
  return persistDailyStatusSnapshot(date, period, rows, user.id);
}

/** Persist the exact rows that were (or will be) mailed for morning/evening compare. */
export function persistDailyStatusSnapshot(
  date: string,
  period: SnapshotPeriod,
  rows: DailyStatusRow[],
  capturedBy = 'system'
) {
  const records = store.getSystemMeta();
  const id = snapshotId(date, period);
  const next = records.filter((item) => item.id !== id);
  const captured_at = new Date().toISOString();
  next.push({
    id,
    payloadType: 'DAILY_STATUS_SNAPSHOT',
    payload: {
      date,
      period,
      captured_at,
      captured_by: capturedBy,
      rows,
    },
  });
  store.saveSystemMeta(next);
  return { date, period, rows, captured_at };
}

export function loadDailyStatusSnapshot(date: string, period: SnapshotPeriod): DailyStatusRow[] | null {
  const record = store.getSystemMeta().find((item) => item.id === snapshotId(date, period));
  const rows = (record?.payload as { rows?: DailyStatusRow[] } | undefined)?.rows;
  return Array.isArray(rows) ? rows : null;
}

/** Prefer snapshot; else rows stored on outbound morning/evening mail bodies. */
export function loadMailedOrSnapshotRows(date: string, period: SnapshotPeriod): DailyStatusRow[] | null {
  const snap = loadDailyStatusSnapshot(date, period);
  if (snap?.length) return snap;
  const mailed = loadRowsFromOutboundMails(date, period);
  if (mailed?.length) return mailed;
  return snap;
}

function inferPeriodFromSubject(subject: string): SnapshotPeriod | null {
  if (/7:15|7\.15\s*pm|evening/i.test(subject)) return 'evening';
  if (/11:15|11\.15\s*am|12:00|12\s*pm|noon|morning/i.test(subject)) return 'morning';
  return null;
}

function subjectMentionsReportDate(subject: string, date: string): boolean {
  if (!subject) return false;
  if (subject.includes(date)) return true;
  const display = formatSheetDate(date); // dd-mm-yyyy
  if (display !== '—' && subject.includes(display)) return true;
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return false;
  const monthIdx = Number(m) - 1;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[monthIdx];
  if (!mon) return false;
  const variants = [
    `${d}-${mon}-${y}`,
    `${d} ${mon} ${y}`,
    `${Number(d)} ${mon} ${y}`,
    `${d}/${m}/${y}`,
    `${d}-${m}-${y}`,
  ];
  return variants.some((value) => subject.includes(value));
}

function loadRowsFromOutboundMails(date: string, period: SnapshotPeriod): DailyStatusRow[] | null {
  const types = new Set(['DAILY_STATUS_REPORT', 'DAILY_STATUS_REPORT_SCHEDULED', 'DAILY_STATUS_REPORT_TEST']);
  const emails = store
    .getOutboundEmails()
    .filter((email) => types.has(String(email.email_type || '')))
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  for (const email of emails) {
    const subject = String(email.subject || '');
    try {
      const parsed = JSON.parse(email.body || '{}') as {
        date?: string;
        period?: SnapshotPeriod | string;
        rows?: DailyStatusRow[];
        slot?: string;
      };
      if (Array.isArray(parsed.rows) && parsed.rows.length) {
        const parsedDate = parsed.date
          ? /^\d{4}-\d{2}-\d{2}/.test(parsed.date)
            ? parsed.date.slice(0, 10)
            : parseSheetDate(parsed.date)
          : null;
        const dateMatch =
          parsedDate === date ||
          (!parsedDate && subjectMentionsReportDate(subject, date));
        if (!dateMatch) continue;
        const inferredPeriod: SnapshotPeriod | null =
          parsed.period === 'morning' || parsed.period === 'evening'
            ? parsed.period
            : parsed.slot === 'noon'
              ? 'morning'
              : parsed.slot === 'evening'
                ? 'evening'
                : inferPeriodFromSubject(subject);
        if (inferredPeriod === period) return parsed.rows;
      }
    } catch {
      /* ignore non-json bodies */
    }

    if (subjectMentionsReportDate(subject, date) && inferPeriodFromSubject(subject) === period) {
      try {
        const parsed = JSON.parse(email.body || '{}') as { rows?: DailyStatusRow[] };
        if (Array.isArray(parsed.rows) && parsed.rows.length) return parsed.rows;
      } catch {
        /* no rows in body */
      }
    }
  }
  return null;
}

/** For a past date: overlay that day's submitted updates onto morning rows as evening state. */
function eveningRowsFromDayUpdates(date: string, morningRows: DailyStatusRow[]): DailyStatusRow[] | null {
  const updates = store
    .getDailyUpdates()
    .filter((item) => item.work_date === date && item.submission_status === 'SUBMITTED')
    .slice()
    .sort((a, b) => (b.submitted_at || b.updated_at || '').localeCompare(a.submitted_at || a.updated_at || ''));
  if (!updates.length) return null;

  const eveningPreferred = updates.filter((item) => item.period === 'evening');
  const pool = eveningPreferred.length ? eveningPreferred : updates;
  let applied = 0;
  const rows = morningRows.map((row) => {
    const update =
      pool.find((item) => item.task_id === row.id || item.assignment_id === row.id) ||
      pool.find(
        (item) =>
          item.user_id === row.personId &&
          (item.project_id === row.projectId || item.project_name === row.project || item.task_title === row.taskDescription)
      );
    if (!update) return { ...row };
    applied += 1;
    const status = toSheetStatus(update.work_status || row.status);
    const hours = Math.max(0, Number(update.hours_worked) || 0);
    return {
      ...row,
      taskDescription: (update.work_completed || row.taskDescription || '').trim() || row.taskDescription,
      status,
      progressPercent: Math.max(0, Math.min(100, Number(update.progress_percent) || row.progressPercent || 0)),
      hoursWorked: hours || row.hoursWorked,
      loggedHours: hours ? formatLoggedHours(hours) : row.loggedHours,
      reasonForDelay: (update.blocker || row.reasonForDelay || '—').trim() || '—',
      workDate: date,
      latestUpdateAt: update.submitted_at || update.updated_at || row.latestUpdateAt,
    } satisfies DailyStatusRow;
  });
  return applied > 0 ? rows : null;
}

export function rowsForPeriod(user: User, period: SnapshotPeriod, date = todayIso()): {
  rows: DailyStatusRow[];
  source: 'snapshot' | 'live';
  available: boolean;
} {
  // One source of truth: the same Daily Work Updates builder used by the hub,
  // for the selected calendar date (hidden tasks stay out of mail).
  return {
    rows: visibleSheetRows(buildDailyStatusRows(user, { date, period })),
    source: 'live',
    available: true,
  };
}

export type CompareKind =
  | 'Improved'
  | 'Completed'
  | 'No Change'
  | 'Hold'
  | 'Status Changed'
  | 'Deadline Changed'
  | 'Dependency Changed'
  | 'Task Description Changed';

export interface CompareItem {
  id: string;
  person: string;
  project: string;
  taskDescription: string;
  morningStatus: string;
  eveningStatus: string;
  morningDeadline?: string;
  eveningDeadline?: string;
  morningDependencies?: string;
  eveningDependencies?: string;
  currentUpdate?: string;
  onTimeDelay?: string;
  progressPercent?: number;
  reasonForDelay?: string;
  loggedHours?: string;
  hoursWorked?: number;
  kinds: CompareKind[];
}

function delayLabel(row?: DailyStatusRow): string {
  if (!row) return '—';
  if (row.status === 'Completed') return 'On Time';
  if (row.status === 'Hold') return 'Hold';
  if (row.overdue) return 'Delay';
  return 'On Time';
}

/** Progress for compare: Completed always 100%, else use stored % / status defaults. */
function progressFromRow(row?: DailyStatusRow): number {
  if (!row) return 0;
  if (row.status === 'Completed') return 100;
  if (row.status === 'Yet to Start') return 0;
  const stored = Math.max(0, Math.min(100, Number(row.progressPercent) || 0));
  if (stored > 0) return stored;
  if (row.status === 'In Progress') return 50;
  if (row.status === 'Waiting') return 25;
  if (row.status === 'Hold') return stored;
  return stored;
}

function compareKinds(morning?: DailyStatusRow, evening?: DailyStatusRow): CompareKind[] {
  if (!morning || !evening) return ['No Change'];
  const kinds: CompareKind[] = [];
  if (morning.status !== evening.status) {
    if (evening.status === 'Completed') kinds.push('Completed', 'Improved');
    else if (evening.status === 'Hold') kinds.push('Hold');
    else if (morning.status === 'Yet to Start' && evening.status === 'In Progress') kinds.push('Improved', 'Status Changed');
    else kinds.push('Status Changed');
  }
  if (morning.deadline !== evening.deadline) kinds.push('Deadline Changed');
  if (morning.dependencies !== evening.dependencies) kinds.push('Dependency Changed');
  if (morning.taskDescription !== evening.taskDescription) kinds.push('Task Description Changed');
  if (!kinds.length) kinds.push('No Change');
  return [...new Set(kinds)];
}

function resolveCompareDate(requested?: string): string {
  if (requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)) return requested;
  const today = todayIso();
  const yesterday = yesterdayIso();
  // Prefer today when morning (or evening) mail exists; otherwise fall back to previous day.
  if (periodRowsAvailable(today, 'morning') || periodRowsAvailable(today, 'evening')) return today;
  if (periodRowsAvailable(yesterday, 'morning') && periodRowsAvailable(yesterday, 'evening')) return yesterday;
  return today;
}

export function compareSnapshots(
  user: User,
  date?: string
): { items: CompareItem[]; available: boolean; date: string; message?: string } {
  const resolved = resolveCompareDate(date);
  const today = todayIso();
  let morningRaw = loadMailedOrSnapshotRows(resolved, 'morning');
  let eveningRaw = loadMailedOrSnapshotRows(resolved, 'evening');

  // Today: evening side always tracks the live sheet so latest hub edits show in Compare
  // (morning stays frozen from Morning save/mail).
  if (resolved === today) {
    eveningRaw = visibleSheetRows(buildDailyStatusRows(user, { date: resolved, period: 'evening' }));
  }
  // Previous day: if evening mail/snapshot is missing, rebuild from that day's submitted updates.
  if ((!eveningRaw || !eveningRaw.length) && resolved < today && morningRaw?.length) {
    const rebuilt = eveningRowsFromDayUpdates(resolved, morningRaw);
    if (rebuilt?.length) {
      eveningRaw = rebuilt;
      persistDailyStatusSnapshot(resolved, 'evening', rebuilt, user.id);
    }
  }
  // Today: if morning mail/snapshot is missing but evening exists, do not invent morning from live.
  if (!morningRaw || !morningRaw.length) {
    return {
      items: [],
      available: false,
      date: resolved,
      message:
        resolved === today
          ? 'Today morning mail/snapshot is not available yet. Send or save Morning first, or switch to Previous day.'
          : 'Previous day morning mail/snapshot is not available.',
    };
  }
  if (!eveningRaw || !eveningRaw.length) {
    return {
      items: [],
      available: false,
      date: resolved,
      message:
        resolved === today
          ? 'Evening mail/snapshot is not available yet.'
          : 'Previous day evening mail/snapshot is not available. Send Evening for that day, or ensure evening updates were submitted.',
    };
  }

  const morning = scopedDailyStatusRows(user, morningRaw);
  const evening = scopedDailyStatusRows(user, eveningRaw);
  const ids = new Set([...morning.map((row) => row.id), ...evening.map((row) => row.id)]);
  const items: CompareItem[] = [...ids].map((id) => {
    const am = morning.find((row) => row.id === id);
    const pm = evening.find((row) => row.id === id);
    const base = pm || am!;
    return {
      id,
      person: base.person,
      project: base.project,
      taskDescription: (am?.taskDescription || '').trim() || '—',
      morningStatus: am?.status || '—',
      eveningStatus: pm?.status || '—',
      morningDeadline: am?.deadline,
      eveningDeadline: pm?.deadline,
      morningDependencies: am?.dependencies,
      eveningDependencies: pm?.dependencies,
      currentUpdate: (pm?.taskDescription || '').trim() || '—',
      onTimeDelay: delayLabel(pm || am),
      progressPercent: progressFromRow(pm || am),
      reasonForDelay: pm?.reasonForDelay || am?.reasonForDelay || '—',
      loggedHours: pm?.loggedHours || am?.loggedHours || formatLoggedHours(0),
      hoursWorked: pm?.hoursWorked ?? am?.hoursWorked ?? 0,
      kinds: compareKinds(am, pm),
    };
  });
  return { items, available: true, date: resolved };
}

/** Upsert morning/evening DailyUpdate hours for a task on the selected work date. */
export function upsertLoggedHoursForTask(
  actor: User,
  taskId: string,
  hoursWorked: number,
  workDate = todayIso()
): { ok: true; update: DailyUpdate } | { ok: false; error: string; status?: number } {
  const task = store.getTasks().find((item) => item.id === taskId);
  if (!task) return { ok: false, error: 'not_found', status: 404 };
  if (!canSeeDailyStatusTask(actor, task) && task.assigned_to_id !== actor.id) {
    return { ok: false, error: 'forbidden', status: 403 };
  }
  const period: SnapshotPeriod = inferDefaultEmailPeriod();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(workDate) ? workDate : todayIso();
  const hours = Math.max(0, Number(hoursWorked) || 0);
  const now = new Date().toISOString();
  const updates = store.getDailyUpdates();
  const existing = updates.find(
    (item) =>
      item.task_id === taskId &&
      item.work_date === date &&
      item.period === period &&
      item.user_id === (task.assigned_to_id || actor.id)
  );
  if (existing) {
    const next = { ...existing, hours_worked: hours, updated_at: now, period };
    const index = updates.findIndex((item) => item.id === existing.id);
    updates[index] = next;
    store.saveDailyUpdates(updates);
    return { ok: true, update: next };
  }
  const project = task.project_id ? store.getProjects().find((item) => item.id === task.project_id) : undefined;
  const assignee = store.findUserById(task.assigned_to_id) || actor;
  const created: DailyUpdate = {
    id: `upd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    user_id: assignee.id,
    user_name: assignee.name,
    user_role: assignee.role_name,
    team_id: assignee.team_id,
    team_name: assignee.team_name,
    assignment_id: task.id,
    assignment_source: 'TASK',
    task_id: task.id,
    lead_id: task.lead_id || project?.lead_id,
    lead_number: project?.lead_number,
    project_id: project?.id,
    project_code: project?.code,
    project_name: project?.name || task.project_name || '—',
    customer_name: project?.customer_name || '',
    task_title: task.title,
    work_date: date,
    work_completed: task.description || task.title,
    progress_percent: task.progress_percent ?? 0,
    hours_worked: hours,
    work_status:
      task.status === 'DONE'
        ? 'COMPLETED'
        : task.status === 'IN_PROGRESS'
          ? 'IN_PROGRESS'
          : task.status === 'BLOCKED' || task.status === 'WAITING' || task.status === 'HOLD'
            ? 'BLOCKED'
            : 'NOT_STARTED',
    next_plan: '—',
    attachments: [],
    submission_status: 'SUBMITTED',
    submitted_at: now,
    summary: `Logged ${formatLoggedHours(hours)} via Daily Work Updates (${period}).`,
    period,
    created_at: now,
    updated_at: now,
  };
  updates.unshift(created);
  store.saveDailyUpdates(updates);
  return { ok: true, update: created };
}

function statusBadgeStyle(status: DailySheetStatus): { bg: string; color: string } {
  if (status === 'Completed') return { bg: '#dcfce7', color: '#166534' };
  if (status === 'In Progress') return { bg: '#dbeafe', color: '#1d4ed8' };
  if (status === 'Waiting') return { bg: '#ffedd5', color: '#9a3412' };
  if (status === 'Hold') return { bg: '#fef3c7', color: '#92400e' };
  return { bg: '#f8fafc', color: '#334155' };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatSubjectDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(+date)) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

function emailPeriodCopy(period: SnapshotPeriod, reportLabel?: string) {
  const isMorning = period === 'morning';
  const reportTitle =
    reportLabel || (isMorning ? 'Morning Status Report' : 'Evening Status Report');
  return {
    reportTitle,
    periodWord: isMorning ? 'morning' : 'evening',
    greeting: 'Dear Team,',
    intro: `Please find the ${reportTitle} below. This table uses the same Daily Work Updates records as the hub.`,
  };
}

export function inferDefaultEmailPeriod(now = new Date()): SnapshotPeriod {
  // Morning until 4:00 PM; Evening from 4:00 PM onward (local time).
  return now.getHours() >= 16 ? 'evening' : 'morning';
}

export function renderDailyStatusEmailHtml(params: {
  period: SnapshotPeriod;
  date: string;
  rows: DailyStatusRow[];
  recipientName: string;
  reportLabel?: string;
  subjectOverride?: string;
}): { html: string; text: string; subject: string } {
  const copy = emailPeriodCopy(params.period, params.reportLabel);
  const today = params.date || todayIso();
  const subject =
    (params.subjectOverride || '').trim() || `${copy.reportTitle} - ${formatSubjectDate(today)}`;
  const reportDate = formatSheetDate(today);
  const headerCell =
    'padding:10px 8px;background:#facc15;color:#0f172a;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.02em;border:1px solid #d4a017;text-align:center;white-space:nowrap;vertical-align:middle;height:40px;';
  const cell =
    'padding:10px 8px;border:1px solid #d8dee6;font-size:12px;line-height:1.4;color:#0f172a;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;';
  const personCell = `${cell}font-weight:700;text-align:center;background:#fffef6;white-space:nowrap;vertical-align:middle;`;
  const statusCell = `${cell}text-align:center;white-space:nowrap;`;
  const dateCell = `${cell}text-align:center;white-space:nowrap;`;
  const hoursCell = `${cell}text-align:center;white-space:nowrap;`;
  const depsCell = `${cell}`;
  const delayCell = `${cell}text-align:center;white-space:nowrap;`;
  const sorted = [...params.rows].sort(
    (a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id)
  );
  const groups: Array<{ person: string; personId: string; rows: DailyStatusRow[] }> = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.personId === row.personId) last.rows.push(row);
    else groups.push({ person: row.person, personId: row.personId, rows: [row] });
  }
  const formatDepsHtml = (value: string) => {
    const parts = value
      .split(/[,;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length || parts[0] === '—') return '—';
    return parts.map((part) => escapeHtml(part)).join('<br />');
  };
  const rowsHtml = groups
    .map((group) =>
      group.rows
        .map((row, index) => {
          const badge = statusBadgeStyle(row.status);
          const personTd =
            index === 0
              ? `<td width="110" style="${personCell}" rowspan="${group.rows.length}">${escapeHtml(group.person)}</td>`
              : '';
          const deadlineStyle = deadlineInlineStyle(
            deadlineTone(row.status, row.deadlineIso || row.deadline, today)
          );
          const statusLabel = escapeHtml(row.status).replace(/ /g, '&nbsp;');
          const startDate = escapeHtml(row.startDate || '—').replace(/-/g, '&#8209;');
          const deadline = escapeHtml(row.deadline).replace(/-/g, '&#8209;');
          const hours = escapeHtml(row.loggedHours || formatLoggedHours(row.hoursWorked));
          return `<tr>
        ${personTd}
        <td width="140" style="${cell}">${escapeHtml(row.project)}</td>
        <td width="260" style="${cell}">${escapeHtml(row.taskDescription)}</td>
        <td width="130" style="${depsCell}">${formatDepsHtml(row.dependencies)}</td>
        <td width="100" style="${statusCell}"><span style="display:inline-block;padding:4px 8px;border-radius:999px;background:${badge.bg};color:${badge.color};font-size:11px;font-weight:700;line-height:1.2;white-space:nowrap;">${statusLabel}</span></td>
        <td width="95" style="${dateCell}">${startDate}</td>
        <td width="95" style="${dateCell}${deadlineStyle}">${deadline}</td>
        <td width="90" style="${hoursCell}">${hours}</td>
        <td width="150" style="${delayCell}">${escapeHtml(row.reasonForDelay)}</td>
      </tr>`;
        })
        .join('')
    )
    .join('');
  const empty = `<tr><td colspan="9" style="${cell}text-align:center;color:#64748b;">No tasks found.</td></tr>`;
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F7FB;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="1280" cellspacing="0" cellpadding="0" style="width:1280px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
          <tr>
            <td style="background:#0B1F3A;padding:18px 22px;color:#ffffff;border-radius:12px 12px 0 0;">
              <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#facc15;">CareYu Automation</div>
              <div style="font-size:20px;font-weight:700;margin-top:4px;">${escapeHtml(copy.reportTitle)}</div>
              <div style="font-size:13px;color:#cbd5e1;margin-top:4px;">Report date: ${escapeHtml(reportDate)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 22px 8px;font-size:14px;line-height:1.6;color:#0f172a;">
              <div style="font-weight:700;margin-bottom:8px;">${escapeHtml(copy.greeting)}</div>
              <div>${escapeHtml(copy.intro)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 16px 24px;">
              <table role="presentation" width="1280" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:1280px;table-layout:fixed;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                <thead>
                  <tr>
                    <th width="110" style="${headerCell}">Person</th>
                    <th width="140" style="${headerCell}">Project</th>
                    <th width="260" style="${headerCell}">Task Description</th>
                    <th width="130" style="${headerCell}">Dependencies</th>
                    <th width="100" style="${headerCell}">Status</th>
                    <th width="95" style="${headerCell}">Start Date</th>
                    <th width="95" style="${headerCell}">Task Deadline</th>
                    <th width="90" style="${headerCell}">Logged Hours</th>
                    <th width="150" style="${headerCell}">Reason For Delay</th>
                  </tr>
                </thead>
                <tbody>
                  ${sorted.length ? rowsHtml : empty}
                </tbody>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 22px 20px;font-size:14px;line-height:1.6;color:#0f172a;">
              <div>Regards,</div>
              <div style="font-weight:700;margin-top:4px;">Automation Team</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  const text = [
    copy.reportTitle,
    `Report date: ${reportDate}`,
    '',
    copy.greeting,
    copy.intro,
    '',
    ...sorted.map(
      (row) =>
        `${row.person} | ${row.project} | ${row.taskDescription} | ${row.dependencies} | ${row.status} | ${row.startDate || '—'} | ${row.deadline} | ${row.loggedHours || formatLoggedHours(row.hoursWorked)} | ${row.reasonForDelay}`
    ),
    '',
    'Regards,',
    'Automation Team',
  ].join('\n');
  return { html, text, subject };
}

export async function sendDailyStatusReport(params: {
  actor: User;
  period: SnapshotPeriod;
  toEmail?: string;
  date?: string;
  fromEmail?: string;
  fromName?: string;
  ccEmails?: string[];
  bccEmails?: string[];
}) {
  const date = params.date || todayIso();
  const packed = rowsForPeriod(params.actor, params.period, date);
  if (!packed.available && packed.source === 'snapshot') {
    return { error: 'Morning and evening updates are not yet available.' as const };
  }
  // Freeze the exact mailed rows so Compare can show morning vs evening mail text.
  persistDailyStatusSnapshot(date, params.period, packed.rows, params.actor.id);
  const toEmail = (params.toEmail || params.actor.email || '').trim().toLowerCase();
  const rendered = renderDailyStatusEmailHtml({
    period: params.period,
    date,
    rows: packed.rows,
    recipientName: formatEmployeeDisplayName(params.actor),
  });
  const result = await sendEmail({
    toEmail,
    toName: params.actor.name,
    toUserId: params.actor.id,
    subject: rendered.subject,
    htmlContent: rendered.html,
    text: rendered.text,
    emailChannel: 'INTERNAL',
    emailType: 'DAILY_STATUS_REPORT',
    fromEmail: params.fromEmail,
    fromName: params.fromName,
    ccEmails: params.ccEmails,
    bccEmails: params.bccEmails,
  });
  const emails = store.getOutboundEmails();
  if (emails[0]?.email_type === 'DAILY_STATUS_REPORT') {
    store.saveOutboundEmails([
      {
        ...emails[0],
        body: JSON.stringify({ date, period: params.period, html: rendered.html, rows: packed.rows }),
      },
      ...emails.slice(1),
    ]);
  }
  return { result, html: rendered.html, subject: rendered.subject, rows: packed.rows, date, period: params.period };
}

export function restoreDailyStatusReport(): {
  html: string;
  subject: string;
  date?: string;
  period?: SnapshotPeriod;
  rows?: DailyStatusRow[];
} | null {
  const latest = store
    .getOutboundEmails()
    .find((item) => item.email_type === 'DAILY_STATUS_REPORT');
  if (!latest) return null;
  try {
    const parsed = JSON.parse(latest.body || '{}') as {
      html?: string;
      date?: string;
      period?: SnapshotPeriod;
      rows?: DailyStatusRow[];
    };
    if (parsed.html) {
      return {
        html: parsed.html,
        subject: latest.subject,
        date: parsed.date,
        period: parsed.period,
        rows: parsed.rows,
      };
    }
  } catch {
    /* use body as html */
  }
  if (!latest.body) return null;
  return { html: latest.body, subject: latest.subject };
}

type DirectoryPerson = { id: string; name: string; displayName: string; email: string; role_name: string };

function isRemovedDirectoryPerson(user: { name?: string; email?: string }): boolean {
  const given = personGivenKey(user.name);
  const local = String(user.email || '')
    .split('@')[0]
    .toLowerCase();
  const email = String(user.email || '').trim().toLowerCase();
  // Only hide Sanjay / Aravind. Do not hide by "fsd*" email locals — live accounts
  // use fsdlead1 (Arun) and fsdengg1 (Kabitha), and they must stay in pickers.
  return given === 'sanjay' || given === 'aravind' || local === 'sanjay' || local === 'aravind' || email === 'sanjay@careyu.ai' || email === 'aravind@careyu.ai';
}

function toDirectoryPerson(user: User): DirectoryPerson {
  return {
    id: user.id,
    name: user.name,
    displayName: formatEmployeeDisplayName(user),
    email: user.email,
    role_name: user.role_name,
  };
}

const SHEET_PICKER_EMAILS = new Set([
  'robottech@careyu.ai',
  'fsdlead1@careyu.ai',
  'arun@careyu.ai',
  'kabitha@careyu.ai',
  'fsdengg1@careyu.ai',
  'raja@careyu.ai',
  'projects@careyu.ai',
]);

const SHEET_PICKER_NAMES = new Set(['aakash', 'arun', 'kabitha', 'raja', 'vanippriya', 'vani']);

export function directoryPeople(): DirectoryPerson[] {
  const active = store.getUsers().filter((user) => user.status === 'ACTIVE' && !isRemovedDirectoryPerson(user));
  return dedupeByStableId(active, (user) => user.id)
    .map(toDirectoryPerson)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** People pickers for the sheet: directory + anyone already assigned or listed as a dependency. */
export function peopleForDailySheet(rows: DailyStatusRow[]): DirectoryPerson[] {
  const people = directoryPeople();
  const byId = new Map(people.map((person) => [person.id, person]));

  const pushPerson = (entry: DirectoryPerson) => {
    if (!entry.id || byId.has(entry.id)) return;
    byId.set(entry.id, entry);
    people.push(entry);
  };

  const ensureUser = (user: User) => {
    if (isRemovedDirectoryPerson(user)) return;
    pushPerson(toDirectoryPerson(user));
  };

  // Always keep known functional leads/members selectable (Aakash, Arun, …).
  for (const user of store.getUsers()) {
    if (user.status !== 'ACTIVE') continue;
    const email = String(user.email || '').trim().toLowerCase();
    const given = personGivenKey(user.name);
    if (SHEET_PICKER_EMAILS.has(email) || SHEET_PICKER_NAMES.has(given) || user.role_code === 'TEAM_LEAD') {
      ensureUser(user);
    }
  }

  const ensureId = (idRaw: string, fallbackName?: string) => {
    const id = String(idRaw || '').trim();
    if (!id || byId.has(id)) return;
    const user = store.getUsers().find((item) => item.id === id);
    if (user) {
      // Assignees/deps on the sheet must remain selectable even if directory hide rules change.
      pushPerson(toDirectoryPerson(user));
      return;
    }
    const byName = fallbackName
      ? store.getUsers().find((item) => item.status === 'ACTIVE' && personGivenKey(item.name) === personGivenKey(fallbackName))
      : undefined;
    if (byName && !isRemovedDirectoryPerson(byName)) {
      // Prefer the live directory person when the task points at an orphan id.
      pushPerson(toDirectoryPerson(byName));
    }
    pushPerson({
      id,
      name: fallbackName || id,
      displayName: formatEmployeeDisplayName(fallbackName || id),
      email: '',
      role_name: '',
    });
  };

  for (const row of rows) {
    ensureId(row.personId, row.person);
    for (const depId of row.dependencyIds || []) ensureId(depId);
  }

  return people.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function visibleProjects(user: User): Project[] {
  return store.getProjects().filter((project) => canViewProject(user, project));
}
