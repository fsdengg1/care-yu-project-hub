'use client';

import React, { useMemo } from 'react';
import { Diamond } from 'lucide-react';
import { formatLongDate } from '@/lib/format';
import { GanttStatus, GanttTask, PlanningPlanPayload } from '@/lib/types';

export const GANTT_STATUS_LABEL: Record<GanttStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
  DELAYED: 'Delayed',
};

export const GANTT_STATUS_CLASS: Record<GanttStatus, string> = {
  NOT_STARTED: 'border-slate-700 bg-slate-800 text-slate-300',
  IN_PROGRESS: 'border-cyan-800 bg-cyan-950 text-cyan-300',
  BLOCKED: 'border-rose-800 bg-rose-950 text-rose-300',
  COMPLETED: 'border-emerald-800 bg-emerald-950 text-emerald-300',
  DELAYED: 'border-amber-800 bg-amber-950 text-amber-300',
};

const BAR_CLASS: Record<GanttStatus, string> = {
  NOT_STARTED: 'bg-slate-600',
  IN_PROGRESS: 'bg-cyan-500',
  BLOCKED: 'bg-rose-500',
  COMPLETED: 'bg-emerald-500',
  DELAYED: 'bg-amber-400',
};

function daysBetween(start?: string, end?: string) {
  if (!start || !end) return 0;
  return Math.max(0, Math.round((+new Date(`${end}T00:00:00`) - +new Date(`${start}T00:00:00`)) / 86400000));
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function offsetPct(date: string | undefined, min: string, span: number) {
  if (!date) return 0;
  return Math.max(0, Math.min(100, (daysBetween(min, date) / span) * 100));
}

function timelineRange(plan: PlanningPlanPayload) {
  const dates = [
    plan.project.start_date,
    plan.project.target_completion,
    ...plan.tasks.flatMap((task) => [task.start_date, task.due_date]),
    ...plan.phases.flatMap((phase) => [phase.start_date, phase.due_date]),
  ].filter((value): value is string => Boolean(value));
  const sorted = [...dates].sort();
  const min = sorted[0] || new Date().toISOString().slice(0, 10);
  const maxCandidate = sorted[sorted.length - 1] || addDays(min, 42);
  const max = maxCandidate <= min ? addDays(min, 21) : maxCandidate;
  return { min, max, span: Math.max(1, daysBetween(min, max)) };
}

function TimelineBar({
  start,
  end,
  min,
  span,
  status,
  progress,
  milestone,
}: {
  start?: string;
  end?: string;
  min: string;
  span: number;
  status: GanttStatus;
  progress: number;
  milestone?: boolean;
}) {
  const left = offsetPct(start || end, min, span);
  const right = offsetPct(end || start, min, span);
  const width = Math.max(1.5, right - left);
  const todayLeft = offsetPct(new Date().toISOString().slice(0, 10), min, span);
  return (
    <div className="relative h-6 overflow-hidden rounded bg-slate-950 pointer-events-none">
      <span className="absolute inset-y-0 w-px bg-cyan-400/70" style={{ left: `${todayLeft}%` }} />
      {milestone ? (
        <span className="absolute top-1 h-3.5 w-3.5 rotate-45 border border-cyan-400 bg-cyan-300" style={{ left: `calc(${left}% - 7px)` }} />
      ) : (
        <div className={`absolute top-1.5 h-3 rounded ${BAR_CLASS[status]}`} style={{ left: `${left}%`, width: `${width}%` }}>
          <div className="h-full rounded bg-white/20" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
        </div>
      )}
    </div>
  );
}

export default function ProjectGanttChart({
  plan,
  emptyMessage = 'The Project Manager has not created a Gantt chart for this project yet.',
}: {
  plan: PlanningPlanPayload;
  emptyMessage?: string;
}) {
  const timeline = useMemo(() => timelineRange(plan), [plan]);
  const ticks = useMemo(() => {
    const step = timeline.span > 60 ? 14 : timeline.span > 21 ? 7 : 1;
    const items: string[] = [];
    for (let i = 0; i <= timeline.span; i += step) items.push(addDays(timeline.min, i));
    if (items[items.length - 1] !== timeline.max) items.push(timeline.max);
    return items;
  }, [timeline]);

  const rows = useMemo(() => {
    const byPhase = plan.phases.map((phase) => ({
      id: phase.id,
      name: phase.name,
      tasks: plan.tasks.filter((task) => task.phase_id === phase.id),
    }));
    const unphased = plan.tasks.filter((task) => !task.phase_id);
    if (unphased.length) {
      byPhase.push({
        id: 'unphased',
        name: plan.project.plan_initialized ? 'Unphased work' : 'Assigned work',
        tasks: unphased,
      });
    }
    return byPhase;
  }, [plan]);

  if (plan.tasks.length === 0) {
    return <p className="p-6 text-center text-xs text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead className="border-b border-slate-800 bg-slate-950/95 text-[10px] uppercase tracking-wider text-slate-400">
          <tr>
            <th className="sticky left-0 z-10 bg-slate-950 p-3">Task</th>
            <th className="p-3">Assigned To</th>
            <th className="p-3">Start Date</th>
            <th className="p-3">Due Date</th>
            <th className="p-3">Duration</th>
            <th className="p-3">Progress</th>
            <th className="p-3">Status</th>
            <th className="p-3" style={{ minWidth: 280 }}>
              <div className="mb-1">Timeline</div>
              <div className="relative h-5 font-normal normal-case tracking-normal">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    className="absolute top-0 -translate-x-1/2 text-[9px] text-slate-500"
                    style={{ left: `${offsetPct(tick, timeline.min, timeline.span)}%` }}
                  >
                    {formatLongDate(tick)}
                  </span>
                ))}
              </div>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60">
          {rows.map((group) => (
            <React.Fragment key={group.id}>
              {group.name && (
                <tr className="bg-slate-950/40">
                  <td className="sticky left-0 z-10 bg-slate-950/95 p-3 font-bold text-slate-200" colSpan={7}>
                    {group.name}
                  </td>
                  <td className="p-3" />
                </tr>
              )}
              {group.tasks.map((task) => (
                <GanttTaskRow key={task.id} task={task} timeline={timeline} />
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GanttTaskRow({ task, timeline }: { task: GanttTask; timeline: { min: string; span: number } }) {
  const progress = task.status === 'DONE' ? 100 : task.progress_percent ?? 0;
  return (
    <tr>
      <td className={`sticky left-0 z-10 bg-slate-900 p-3 ${task.parent_task_id ? 'pl-8' : ''}`}>
        <div className="font-semibold text-slate-100">
          {task.is_milestone && <Diamond className="mr-1 inline h-3 w-3 text-cyan-400" />}
          {task.parent_task_id ? '↳ ' : ''}
          {task.title}
        </div>
        <div className="text-[11px] text-slate-500">
          {task.depends_on_title ? `Depends on ${task.depends_on_title}` : task.phase_name || '—'}
        </div>
      </td>
      <td className="p-3 text-slate-300">
        <div>{task.assigned_to || 'Unassigned'}</div>
        <div className="text-slate-500">{task.team_name || '—'}</div>
      </td>
      <td className="p-3 text-slate-300">{formatLongDate(task.start_date)}</td>
      <td className="p-3 text-slate-300">{formatLongDate(task.due_date)}</td>
      <td className="p-3 text-slate-300">{task.is_milestone ? '—' : `${task.duration_days ?? daysBetween(task.start_date, task.due_date)}d`}</td>
      <td className="p-3 text-slate-100">{progress}%</td>
      <td className="p-3">
        <span className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${GANTT_STATUS_CLASS[task.gantt_status]}`}>
          {GANTT_STATUS_LABEL[task.gantt_status]}
        </span>
      </td>
      <td className="p-3">
        <TimelineBar
          start={task.start_date}
          end={task.due_date}
          min={timeline.min}
          span={timeline.span}
          status={task.gantt_status}
          progress={progress}
          milestone={task.is_milestone}
        />
      </td>
    </tr>
  );
}
