'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Bot, ShieldAlert } from 'lucide-react';
import { ProjectsApi } from '@/lib/projectsApi';
import { formatInrCompact, formatLongDate, WORK_STATUS_LABELS } from '@/lib/format';
import { StorageService } from '@/lib/storage';
import { canOpenProjectGantt } from '@/lib/rbac';
import { ProjectDetailPayload, ProjectStatus, User } from '@/lib/types';

function healthClass(health: string) {
  if (health === 'CRITICAL') return 'border-rose-800 bg-rose-950 text-rose-300';
  if (health === 'AT_RISK') return 'border-amber-800 bg-amber-950 text-amber-300';
  return 'border-emerald-800 bg-emerald-950 text-emerald-300';
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ProjectDetailPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState('EXECUTION');
  const [status, setStatus] = useState<ProjectStatus>('ACTIVE');
  const [target, setTarget] = useState('');
  const [remark, setRemark] = useState('');
  const [escIssue, setEscIssue] = useState('');
  const [escImpact, setEscImpact] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [intakeComment, setIntakeComment] = useState('');
  const [tlComment, setTlComment] = useState('');

  const load = async () => {
    const payload = await ProjectsApi.get(params.id);
    if (!payload) {
      setError('Project not found or you do not have access.');
      return;
    }
    setDetail(payload);
    setPhase(payload.project.current_phase || 'EXECUTION');
    setStatus(payload.project.status);
    setTarget(payload.project.target_completion || '');
    setEscIssue(payload.project.issue || '');
  };

  useEffect(() => {
    setUser(StorageService.getCurrentUser());
    void load();
  }, [params.id]);

  if (error && !detail) {
    return <div className="rounded-xl border border-rose-900 bg-rose-950/40 p-5 text-xs text-rose-300">{error}</div>;
  }
  if (!detail) return null;

  const project = detail.project;

  return (
    <div className="space-y-6 text-xs">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <Link href="/projects/active" className="inline-flex items-center gap-1 text-cyan-400 hover:underline">
          <ArrowLeft className="h-3 w-3" /> Active Projects
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
              <Bot className="h-4 w-4" /> Project overview
            </div>
            <h1 className="mt-1 text-xl font-bold text-slate-100">{project.customer_name} – {project.name}</h1>
            <p className="mt-1 text-slate-400">
              {project.code}
              {project.lead_number ? ` · Lead ${project.lead_number}` : ''}
              {detail.canManage ? ' · PM workspace' : ' · Read-only visibility'}
            </p>
            {canOpenProjectGantt(user, project) && (
              <Link href={`/projects/planning?project=${project.id}`} className="mt-2 inline-block text-cyan-400 hover:underline">
                Open Gantt & Planning
              </Link>
            )}
          </div>
          <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${healthClass(project.health)}`}>
            {project.health.replace('_', ' ')}
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Project ID" value={project.code} />
        <Field label="Lead ID" value={project.lead_number || project.lead_id || '—'} href={project.lead_id ? `/pre-sales/leads/${project.lead_id}` : undefined} />
        <Field label="Project Manager" value={project.pm_name} />
        <Field label="Team Lead" value={project.team_lead_name || '—'} />
        <Field label="Assigned member" value={project.assigned_member_name || '—'} />
        <Field label="Workflow" value={(detail.actions?.intake_status || project.intake_status || 'IN_EXECUTION').replace(/_/g, ' ')} />
        <Field label="Project value" value={formatInrCompact(project.value || 0)} />
        <Field label="Start date" value={formatLongDate(project.start_date)} />
        <Field label="Target completion" value={formatLongDate(project.target_completion)} />
        <Field label="Overall progress" value={`${project.progress}%`} />
        <Field label="Health" value={project.health.replace('_', ' ')} />
      </div>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-100">Current status</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Current phase" value={detail.currentStatus.phase} />
          <Field label="Current task" value={detail.currentStatus.current_task} />
          <Field label="Current owner" value={detail.currentStatus.current_owner} />
          <Field label="Current blocker" value={detail.currentStatus.current_blocker || '—'} />
          <Field label="Last update" value={formatLongDate(detail.currentStatus.last_update)} />
          <Field
            label="Next milestone"
            value={detail.currentStatus.next_milestone
              ? `${detail.currentStatus.next_milestone.name} · ${formatLongDate(detail.currentStatus.next_milestone.date)}${detail.currentStatus.next_milestone.delayed ? ' · DELAYED' : ''}`
              : '—'}
          />
        </div>
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-slate-400">
            <span>Progress</span>
            <span className="text-slate-100">{project.progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-800">
            <div
              className={`h-full ${project.health === 'CRITICAL' ? 'bg-rose-500' : project.health === 'AT_RISK' ? 'bg-amber-400' : 'bg-emerald-500'}`}
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      </section>

      {(detail.actions?.canAssign || detail.actions?.canIntake || detail.actions?.canTlReview || (detail.actions?.canEscalate && !detail.canManage)) && (
        <section className="space-y-4 rounded-xl border border-cyan-900/50 bg-slate-900/90 p-5">
          <h2 className="text-sm font-bold text-slate-100">Execution workflow</h2>
          {project.intake_comment && (
            <p className="rounded border border-slate-800 bg-slate-950/60 p-2 text-slate-300">Latest comment: {project.intake_comment}</p>
          )}
          {detail.actions?.canAssign && (
            <div className="space-y-2">
              <p className="text-slate-400">Assign to a Team Lead (review required) or directly to a Team Member. You stay the Project Manager.</p>
              <div className="flex flex-wrap gap-2">
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="min-w-64 rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
                  <option value="">Select Team Lead or Team Member</option>
                  {(detail.assignableUsers || []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.role_name}{item.team_name ? ` · ${item.team_name}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    if (!assigneeId) {
                      setError('Select who should own execution.');
                      return;
                    }
                    const result = await ProjectsApi.assign(project.id, assigneeId);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage('Project assigned. You retain PM ownership and visibility.');
                    await load();
                  }}
                  className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
                >
                  Assign project
                </button>
              </div>
            </div>
          )}
          {detail.actions?.canIntake && (
            <div className="space-y-2">
              <p className="text-slate-400">Review scope, timeline, and PM instructions. Accept to break into tasks, or return with comments.</p>
              <textarea rows={2} value={intakeComment} onChange={(e) => setIntakeComment(e.target.value)} placeholder="Comments (required if returning)" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const result = await ProjectsApi.intake(project.id, 'accept', intakeComment);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage('Project accepted. Create tasks in My Assigned Work or Gantt.');
                    await load();
                  }}
                  className="rounded-lg bg-emerald-700 px-4 py-2 font-bold text-white hover:bg-emerald-600"
                >
                  Accept project
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const result = await ProjectsApi.intake(project.id, 'return', intakeComment);
                    if (!result.ok) {
                      setError(result.message);
                      return;
                    }
                    setMessage('Project returned to the Project Manager.');
                    await load();
                  }}
                  className="rounded-lg border border-amber-800 bg-amber-950 px-4 py-2 font-bold text-amber-100 hover:bg-amber-900"
                >
                  Return to PM
                </button>
              </div>
            </div>
          )}
          {detail.actions?.canTlReview && (
            <div className="space-y-2">
              <p className="text-slate-400">All tasks are complete. Submit Team Lead final review so the PM can approve closure.</p>
              <textarea rows={2} value={tlComment} onChange={(e) => setTlComment(e.target.value)} placeholder="Final review notes" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
              <button
                type="button"
                onClick={async () => {
                  const result = await ProjectsApi.tlReview(project.id, tlComment);
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setMessage('Final review sent to the Project Manager.');
                  await load();
                }}
                className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
              >
                Submit Team Lead review
              </button>
            </div>
          )}
          {detail.actions?.canEscalate && !detail.canManage && (
            <div className="grid gap-2 md:grid-cols-2">
              <input value={escIssue} onChange={(e) => setEscIssue(e.target.value)} placeholder="Escalation issue" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
              <input value={escImpact} onChange={(e) => setEscImpact(e.target.value)} placeholder="Impact" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
              <button
                type="button"
                onClick={async () => {
                  const result = await ProjectsApi.escalate(project.id, { issue: escIssue, impact: escImpact, severity: 'HIGH' });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setMessage('Escalation raised to the next level.');
                  await load();
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-800 bg-rose-950 px-4 py-2 font-bold text-rose-200 hover:bg-rose-900"
              >
                <ShieldAlert className="h-3.5 w-3.5" /> Escalate issue
              </button>
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <h2 className="mb-3 text-sm font-bold text-slate-100">Team</h2>
        {detail.teams.length === 0 && <p className="text-slate-500">No teams assigned to this project yet.</p>}
        <div className="grid gap-3 lg:grid-cols-2">
          {detail.teams.map((team) => (
            <div key={team.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div className="font-semibold text-slate-100">{team.name}</div>
              <div className="text-slate-400">Lead: {team.team_lead_name || '—'}</div>
              <div className="mt-1 text-slate-500">
                Workload {team.workload.open}/{team.workload.total || team.members.length} open
              </div>
              <div className="mt-2 space-y-1">
                {team.members.map((member) => (
                  <div key={member.id} className="flex justify-between text-slate-300">
                    <span>{member.name} · {member.role_name}</span>
                    <span className="text-slate-500">{member.open_tasks} open</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">Daily work updates</h2>
          <Link href={`/daily-updates?project=${project.id}`} className="text-cyan-400 hover:underline">Open module</Link>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <UpdateCard title="Latest employee update" update={detail.dailyWork.latestEmployee} />
          <UpdateCard title="Latest team lead update" update={detail.dailyWork.latestTeamLead} />
          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Latest PM update</div>
            {detail.dailyWork.latestPmRemark ? (
              <>
                <div className="mt-1 font-semibold text-slate-100">{detail.dailyWork.latestPmRemark.user_name}</div>
                <div className="text-slate-400">{detail.dailyWork.latestPmRemark.comment}</div>
                <div className="mt-1 text-slate-500">{formatLongDate(detail.dailyWork.latestPmRemark.created_at)}</div>
              </>
            ) : (
              <p className="mt-1 text-slate-500">No PM remark yet.</p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 font-semibold text-slate-200">Recent blockers</h3>
            {detail.dailyWork.recentBlockers.length === 0 && <p className="text-slate-500">No recent blockers.</p>}
            {detail.dailyWork.recentBlockers.map((item) => (
              <Link key={item.id} href={`/daily-updates/${item.id}`} className="mb-2 block rounded border border-rose-900/40 bg-rose-950/20 p-2 text-rose-200">
                BLOCKED — {item.blocker} · {item.user_name}
              </Link>
            ))}
          </div>
          <div>
            <h3 className="mb-2 font-semibold text-slate-200">Recent completed work</h3>
            {detail.dailyWork.recentCompleted.length === 0 && <p className="text-slate-500">No completed updates yet.</p>}
            {detail.dailyWork.recentCompleted.map((item) => (
              <div key={item.id} className="mb-2 rounded border border-slate-800 p-2 text-slate-300">
                {item.task_title} · {item.user_name} · {item.progress_percent}%
              </div>
            ))}
          </div>
        </div>
      </section>

      {detail.delayedMilestones.length > 0 && (
        <section className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-5">
          <h2 className="mb-2 text-sm font-bold text-amber-200">Delayed milestones</h2>
          {detail.delayedMilestones.map((item) => (
            <div key={item.name} className="text-slate-300">{item.name} · {formatLongDate(item.date)} · {item.owner}</div>
          ))}
        </section>
      )}

      {detail.canManage && (
        <section className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <h2 className="text-sm font-bold text-slate-100">PM controls</h2>
          <p className="text-slate-500">Overall progress is calculated from Gantt tasks. Completion needs Team Lead final review (unless you assigned a member directly) and no open escalations.</p>
          <Link href={`/projects/planning?project=${project.id}`} className="inline-flex rounded-lg bg-cyan-600 px-3 py-1.5 font-bold text-white hover:bg-cyan-500">
            Open Gantt & Planning
          </Link>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-slate-400">Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100">
                <option value="ACTIVE">In execution</option>
                <option value="ON_HOLD">On hold</option>
                <option value="COMPLETED">Completed</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">Current phase</span>
              <input value={phase} onChange={(e) => setPhase(e.target.value)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-400">Target completion</span>
              <input type="date" value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-slate-400">Project remark</span>
            <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="PM note for management visibility" className="w-full rounded border border-slate-800 bg-slate-950 p-2.5 text-slate-100" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={async () => {
                const result = await ProjectsApi.patch(project.id, {
                  status,
                  current_phase: phase,
                  target_completion: target,
                  remarks: remark,
                });
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setRemark('');
                setMessage('Project updated. Progress is calculated from the Gantt task plan.');
                if (status === 'COMPLETED') {
                  router.push('/projects/active');
                  return;
                }
                await load();
              }}
              className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white hover:bg-cyan-500"
            >
              Save project status
            </button>
            {project.issue && (
              <button
                type="button"
                onClick={async () => {
                  const result = await ProjectsApi.patch(project.id, { issue: null });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  setMessage('Blocker cleared.');
                  await load();
                }}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-bold text-slate-100 hover:bg-slate-700"
              >
                Resolve blocker
              </button>
            )}
          </div>
          <div className="grid gap-2 border-t border-slate-800 pt-4 md:grid-cols-2">
            <input value={escIssue} onChange={(e) => setEscIssue(e.target.value)} placeholder="Escalation issue" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <input value={escImpact} onChange={(e) => setEscImpact(e.target.value)} placeholder="Impact" className="rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
          </div>
          <button
            type="button"
            onClick={async () => {
              const result = await ProjectsApi.escalate(project.id, { issue: escIssue, impact: escImpact, severity: 'HIGH' });
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setMessage('Escalation raised.');
              await load();
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-800 bg-rose-950 px-4 py-2 font-bold text-rose-200 hover:bg-rose-900"
          >
            <ShieldAlert className="h-3.5 w-3.5" /> Escalate issue
          </button>
        </section>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">Activity / audit</h2>
          <Link href={`/projects/${project.id}/activity`} className="text-cyan-400 hover:underline">Full history</Link>
        </div>
        {detail.activity.slice(0, 8).map((item) => (
          <div key={item.id} className="border-b border-slate-800/70 py-2 last:border-0">
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{item.kind.replace('_', ' ')} · {formatLongDate(item.at)}</div>
            <div className="font-semibold text-slate-200">{item.title}</div>
            <div className="text-slate-400">{item.detail}</div>
          </div>
        ))}
        {detail.activity.length === 0 && <p className="text-slate-500">No project activity yet.</p>}
      </section>

      {(message || error) && (
        <div className={`rounded-xl border px-4 py-3 ${error ? 'border-rose-900 bg-rose-950/40 text-rose-300' : 'border-emerald-900 bg-emerald-950/30 text-emerald-300'}`}>
          {error || message}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      {href ? (
        <Link href={href} className="mt-1 block font-semibold text-cyan-300 hover:underline">{value}</Link>
      ) : (
        <div className="mt-1 font-semibold text-slate-100">{value}</div>
      )}
    </div>
  );
}

function UpdateCard({ title, update }: { title: string; update?: { id: string; user_name: string; work_completed?: string; work_status: string; progress_percent: number; submitted_at?: string; created_at: string } }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{title}</div>
      {update ? (
        <>
          <div className="mt-1 font-semibold text-slate-100">{update.user_name}</div>
          <div className="text-slate-400">{update.work_completed || '—'}</div>
          <div className="mt-1 text-slate-500">
            {WORK_STATUS_LABELS[update.work_status] || update.work_status} · {update.progress_percent}% · {formatLongDate(update.submitted_at || update.created_at)}
          </div>
          <Link href={`/daily-updates/${update.id}`} className="mt-1 inline-block text-cyan-400 hover:underline">Open</Link>
        </>
      ) : (
        <p className="mt-1 text-slate-500">No update yet.</p>
      )}
    </div>
  );
}
