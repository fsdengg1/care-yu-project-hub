import { store } from '../store/db.js';
import { DailyUpdate, Project, Task, User } from '../types.js';
import { canViewProject } from './dailyUpdates.js';
import { canViewTask } from './workTasks.js';
import { formatEmployeeDisplayName, dedupeByStableId } from './people.js';
import { sendEmail } from './email.js';

export type DailySheetStatus = 'Yet to Start' | 'In Progress' | 'Waiting' | 'Completed' | 'Hold';
export type SnapshotPeriod = 'morning' | 'evening';

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
  deadline: string;
  deadlineIso?: string;
  reasonForDelay: string;
  isAdditional: boolean;
  blocked?: boolean;
  overdue?: boolean;
  progressPercent: number;
  workDate?: string;
  latestUpdateAt?: string;
  morningStatus?: DailySheetStatus;
  eveningStatus?: DailySheetStatus;
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
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
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

function isOverdue(task: Task): boolean {
  if (!task.due_date) return false;
  if (task.status === 'DONE' || task.status === ('HOLD' as Task['status'])) return false;
  return task.due_date < todayIso();
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

function latestUpdateForTask(task: Task, updates: DailyUpdate[]): DailyUpdate | undefined {
  return updates.find(
    (item) =>
      item.task_id === task.id ||
      item.assignment_id === task.id ||
      (item.user_id === task.assigned_to_id && item.project_id === task.project_id && item.task_title === task.title)
  );
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

function scopedDailyStatusRows(user: User, rows: DailyStatusRow[]) {
  if (canSeeAllDailyStatusRows(user)) return rows;
  return rows.filter((row) => row.personId === user.id);
}

export function buildDailyStatusRows(user: User): DailyStatusRow[] {
  const users = visibleUsers(user);
  const projects = store.getProjects();
  const updates = store
    .getDailyUpdates()
    .filter((item) => item.submission_status === 'SUBMITTED')
    .slice()
    .sort((a, b) => (b.submitted_at || b.updated_at).localeCompare(a.submitted_at || a.updated_at));
  const tasks = store.getTasks().filter((task) => {
    if (task.is_milestone) return false;
    if (canSeeAllDailyStatusRows(user)) return canViewTask(user, task);
    return task.assigned_to_id === user.id;
  });

  return tasks
    .map((task) => {
      const project = task.project_id ? projects.find((item) => item.id === task.project_id) : undefined;
      const assignee = users.find((item) => item.id === task.assigned_to_id);
      const update = latestUpdateForTask(task, updates);
      const deps = dependencyIdsOf(task);
      const status = toSheetStatus(task.status === 'BLOCKED' ? 'WAITING' : task.status);
      return {
        id: task.id,
        personId: task.assigned_to_id,
        person: formatEmployeeDisplayName(assignee || task.assigned_to),
        projectId: task.project_id,
        project: project?.name || task.project_name || update?.project_name || '—',
        taskDescription: (update?.work_completed || task.description || task.title || '').trim() || task.title,
        dependencyIds: deps,
        dependencies: formatDependencies(deps, users, update?.dependency),
        status,
        currentDate: formatSheetDate(todayIso()),
        deadline: formatSheetDate(task.due_date),
        deadlineIso: task.due_date ? String(task.due_date).slice(0, 10) : undefined,
        reasonForDelay: delayReason(task, update),
        isAdditional: Boolean(task.is_additional),
        blocked: task.status === 'BLOCKED' || task.status === ('WAITING' as Task['status']),
        overdue: isOverdue(task),
        progressPercent: task.progress_percent || 0,
        workDate: update?.work_date,
        latestUpdateAt: update?.submitted_at || update?.updated_at || task.last_update_at,
      } satisfies DailyStatusRow;
    })
    .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project));
}

export function buildDailyStatusKpis(user: User, rows = buildDailyStatusRows(user)): DailyStatusKpis {
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
  const rows = buildDailyStatusRows(user);
  const records = store.getSystemMeta();
  const id = snapshotId(date, period);
  const next = records.filter((item) => item.id !== id);
  next.push({
    id,
    payloadType: 'DAILY_STATUS_SNAPSHOT',
    payload: {
      date,
      period,
      captured_at: new Date().toISOString(),
      captured_by: user.id,
      rows,
    },
  });
  store.saveSystemMeta(next);
  return { date, period, rows, captured_at: new Date().toISOString() };
}

export function loadDailyStatusSnapshot(date: string, period: SnapshotPeriod): DailyStatusRow[] | null {
  const record = store.getSystemMeta().find((item) => item.id === snapshotId(date, period));
  const rows = (record?.payload as { rows?: DailyStatusRow[] } | undefined)?.rows;
  return Array.isArray(rows) ? rows : null;
}

export function rowsForPeriod(user: User, period: SnapshotPeriod, date = todayIso()): {
  rows: DailyStatusRow[];
  source: 'snapshot' | 'live';
  available: boolean;
} {
  const snap = loadDailyStatusSnapshot(date, period);
  if (snap) return { rows: scopedDailyStatusRows(user, snap), source: 'snapshot', available: true };
  if (date === todayIso()) return { rows: buildDailyStatusRows(user), source: 'live', available: true };
  return { rows: [], source: 'snapshot', available: false };
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
  kinds: CompareKind[];
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

export function compareSnapshots(user: User, date = yesterdayIso()): { items: CompareItem[]; available: boolean; date: string } {
  const morningRaw = loadDailyStatusSnapshot(date, 'morning');
  const eveningRaw = loadDailyStatusSnapshot(date, 'evening');
  if (!morningRaw || !eveningRaw) {
    return { items: [], available: false, date };
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
      taskDescription: base.taskDescription,
      morningStatus: am?.status || '—',
      eveningStatus: pm?.status || '—',
      morningDeadline: am?.deadline,
      eveningDeadline: pm?.deadline,
      morningDependencies: am?.dependencies,
      eveningDependencies: pm?.dependencies,
      kinds: compareKinds(am, pm),
    };
  });
  return { items, available: true, date };
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

function formatReportDateSlash(value?: string): string {
  const formatted = formatSheetDate(value);
  return formatted === '—' ? formatted : formatted.replace(/-/g, '/');
}

function formatSubjectDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(+date)) return value;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${String(date.getDate()).padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
}

function emailPeriodCopy(period: SnapshotPeriod) {
  const isMorning = period === 'morning';
  return {
    reportTitle: isMorning ? 'Morning Status Report' : 'Evening Status Report',
    periodWord: isMorning ? 'morning' : 'evening',
    greeting: 'Dear Team,',
    intro: `Please find the ${isMorning ? 'morning' : 'evening'} Daily Status Report below.`,
  };
}

function moduleLabel(taskDescription: string): string {
  const trimmed = taskDescription.trim();
  if (!trimmed) return '—';
  const first = trimmed.split(/[.\n–—]/)[0]?.trim() || trimmed;
  return first.length > 52 ? `${first.slice(0, 49)}…` : first;
}

function blockerText(row: DailyStatusRow): string {
  if (row.status === 'Waiting' || row.status === 'Hold' || row.blocked) {
    const reason = (row.reasonForDelay || '').trim();
    if (reason && reason !== '—' && reason.toLowerCase() !== 'no delay') return reason;
    return row.status === 'Waiting' ? 'Blocked / waiting' : 'On hold';
  }
  const reason = (row.reasonForDelay || '').trim();
  if (reason && reason !== '—' && reason.toLowerCase() !== 'no delay') return reason;
  return '—';
}

function deadlineMeta(row: DailyStatusRow, today: string): { label: string; color: string } {
  const iso = row.deadlineIso || parseSheetDate(row.deadline);
  const tone = deadlineTone(row.status, iso || row.deadline, today);
  if (tone === 'completed') return { label: 'Completed', color: '#166534' };
  if (iso === today) return { label: 'Due Today', color: '#c2410c' };
  if (tone === 'delay-1' || tone === 'delay-2plus') return { label: 'Overdue', color: '#dc2626' };
  return { label: 'On Time', color: '#15803d' };
}

function progressBarHtml(percent: number): string {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return `<div style="min-width:72px;">
    <div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;">
      <div style="width:${value}%;height:8px;background:#2563eb;border-radius:999px;"></div>
    </div>
    <div style="font-size:11px;color:#334155;margin-top:4px;font-weight:700;">${value}%</div>
  </div>`;
}

export function inferDefaultEmailPeriod(now = new Date()): SnapshotPeriod {
  return now.getHours() >= 14 ? 'evening' : 'morning';
}

export function renderDailyStatusEmailHtml(params: {
  period: SnapshotPeriod;
  date: string;
  rows: DailyStatusRow[];
  recipientName: string;
}): { html: string; text: string; subject: string } {
  const copy = emailPeriodCopy(params.period);
  const today = params.date || todayIso();
  const subject = `${copy.reportTitle} - ${formatSubjectDate(today)}`;
  const reportDate = formatReportDateSlash(today);
  const th =
    'padding:10px 8px;background:#0B1F3A;color:#ffffff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;border:1px solid #1e293b;text-align:left;white-space:nowrap;';
  const td = 'padding:8px 8px;border:1px solid #dbe3ee;font-size:11px;color:#0f172a;vertical-align:top;background:#ffffff;';
  const sorted = [...params.rows].sort(
    (a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id)
  );
  const rowsHtml = sorted
    .map((row, index) => {
      const badge = statusBadgeStyle(row.status);
      const deadline = deadlineMeta(row, today);
      return `<tr>
        <td style="${td}text-align:center;color:#64748b;">${index + 1}</td>
        <td style="${td}font-weight:700;white-space:nowrap;">${escapeHtml(row.person)}</td>
        <td style="${td}">${escapeHtml(row.project)}</td>
        <td style="${td}">${escapeHtml(moduleLabel(row.taskDescription))}</td>
        <td style="${td}">${escapeHtml(row.taskDescription)}</td>
        <td style="${td}">${escapeHtml(row.dependencies)}</td>
        <td style="${td}">${escapeHtml(blockerText(row))}</td>
        <td style="${td}"><span style="display:inline-block;padding:4px 10px;border-radius:999px;border:1px solid ${badge.color};background:${badge.bg};color:${badge.color};font-size:10px;font-weight:700;white-space:nowrap;">${escapeHtml(row.status)}</span></td>
        <td style="${td}">${progressBarHtml(row.progressPercent)}</td>
        <td style="${td}white-space:nowrap;">0h 00m</td>
        <td style="${td}white-space:nowrap;">${escapeHtml(formatSheetDate(row.workDate || row.currentDate))}</td>
        <td style="${td}white-space:nowrap;">
          <div>${escapeHtml(row.deadline)}</div>
          <div style="font-size:10px;font-weight:700;color:${deadline.color};margin-top:4px;">${escapeHtml(deadline.label)}</div>
        </td>
      </tr>`;
    })
    .join('');
  const empty = `<tr><td colspan="12" style="${td}text-align:center;color:#64748b;">No tasks found.</td></tr>`;
  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F7FB;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F4F7FB;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:1180px;background:#ffffff;border:1px solid #dbe3ee;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background:#2563eb;padding:22px 24px;color:#ffffff;">
              <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">CAREYU AUTOMATION PVT. LTD.</div>
              <div style="font-size:24px;font-weight:700;margin-top:8px;line-height:1.2;">${escapeHtml(copy.reportTitle)}</div>
              <div style="font-size:13px;color:#dbeafe;margin-top:6px;">Report date: ${escapeHtml(reportDate)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 24px 8px;font-size:14px;line-height:1.6;color:#0f172a;">
              <div style="font-weight:700;margin-bottom:8px;">${escapeHtml(copy.greeting)}</div>
              <div>${escapeHtml(copy.intro)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 12px 24px;">
              <div style="overflow-x:auto;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;min-width:980px;">
                  <thead>
                    <tr>
                      <th style="${th}">#</th>
                      <th style="${th}">Name</th>
                      <th style="${th}">Project</th>
                      <th style="${th}">Module</th>
                      <th style="${th}">Today&apos;s Work</th>
                      <th style="${th}">Dependencies</th>
                      <th style="${th}">Blockers</th>
                      <th style="${th}">Status</th>
                      <th style="${th}">Progress</th>
                      <th style="${th}">Logged Hours</th>
                      <th style="${th}">Start Date</th>
                      <th style="${th}">Deadline</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${sorted.length ? rowsHtml : empty}
                  </tbody>
                </table>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 20px;font-size:14px;line-height:1.6;color:#0f172a;">
              <div>Regards,</div>
              <div style="font-weight:700;margin-top:4px;">Automation Team</div>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 24px 20px;border-top:1px solid #e2e8f0;font-size:11px;line-height:1.5;color:#64748b;">
              This internal Daily Status Report is sent by CareYu Automation Pvt. Ltd. to project stakeholders.
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
      (row, index) =>
        `${index + 1}. ${row.person} | ${row.project} | ${moduleLabel(row.taskDescription)} | ${row.taskDescription} | ${row.dependencies} | ${blockerText(row)} | ${row.status} | ${row.progressPercent}% | ${row.deadline}`
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
}) {
  const date = params.date || todayIso();
  const packed = rowsForPeriod(params.actor, params.period, date);
  if (!packed.available && packed.source === 'snapshot') {
    return { error: 'Morning and evening updates are not yet available.' as const };
  }
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

export function directoryPeople(): Array<{ id: string; name: string; displayName: string; email: string; role_name: string }> {
  return dedupeByStableId(
    store.getUsers().filter((user) => user.status === 'ACTIVE'),
    (user) => user.id
  ).map((user) => ({
    id: user.id,
    name: user.name,
    displayName: formatEmployeeDisplayName(user),
    email: user.email,
    role_name: user.role_name,
  }));
}

export function visibleProjects(user: User): Project[] {
  return store.getProjects().filter((project) => canViewProject(user, project));
}
