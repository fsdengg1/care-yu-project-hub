'use client';

import React from 'react';
import {
  Building2,
  Check,
  ClipboardList,
  FilePenLine,
  FileText,
  ShoppingCart,
  UserRound,
} from 'lucide-react';
import { Lead } from '@/lib/types';
import { formatLongDate, formatRelativeTime } from '@/lib/format';
import {
  ProjectStageFlowKey,
  projectStageFlowNodes,
  projectStageFlowSummary,
} from '@/lib/projectStageFlow';

const ICONS: Record<ProjectStageFlowKey, React.ReactNode> = {
  lead: <UserRound className="h-5 w-5" />,
  feasibility: <ClipboardList className="h-5 w-5" />,
  costing: <FilePenLine className="h-5 w-5" />,
  procurement: <ShoppingCart className="h-5 w-5" />,
  po: <FileText className="h-5 w-5" />,
  project: <Building2 className="h-5 w-5" />,
};

export default function ProjectStageFlow({
  lead,
  canForward,
  onForward,
}: {
  lead: Lead;
  canForward?: boolean;
  onForward?: () => void;
}) {
  const nodes = projectStageFlowNodes(lead);
  const summary = projectStageFlowSummary(lead);
  const roleLabel = lead.responsible_role_code ? lead.responsible_role_code.replace(/_/g, ' ') : 'Awaiting assignment';

  return (
    <section className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/90">
      <div className="border-b border-slate-800 px-4 py-5 sm:px-6">
        <div className="flex items-start overflow-x-auto pb-1">
          {nodes.map((node, index) => {
            const next = nodes[index + 1];
            const lineClass = !next
              ? ''
              : node.state === 'completed' && (next.state === 'completed' || next.state === 'current')
                ? next.state === 'current'
                  ? 'bg-violet-400'
                  : 'bg-emerald-500'
                : 'bg-[repeating-linear-gradient(90deg,transparent,transparent_4px,#475569_4px,#475569_8px)]';
            return (
              <React.Fragment key={node.key}>
                <div className="flex w-[7.75rem] shrink-0 flex-col items-center px-1 text-center sm:w-auto sm:flex-1">
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full border-2 ${
                      node.state === 'completed'
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : node.state === 'current'
                          ? 'border-violet-500 bg-violet-600 text-white shadow-[0_0_0_4px_rgba(139,92,246,0.25)]'
                          : 'border-slate-600 bg-slate-950 text-slate-500'
                    }`}
                  >
                    {node.state === 'completed' ? <Check className="h-5 w-5" strokeWidth={3} /> : ICONS[node.key]}
                  </span>
                  <div
                    className={`mt-2 text-[13px] font-bold leading-tight ${
                      node.state === 'current' ? 'text-violet-300' : node.state === 'completed' ? 'text-slate-100' : 'text-slate-500'
                    }`}
                  >
                    {node.label}
                  </div>
                  <div
                    className={`mt-0.5 text-[11px] font-semibold ${
                      node.state === 'current'
                        ? 'text-violet-400'
                        : node.state === 'completed'
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {node.caption}
                  </div>
                  {node.date && <div className="mt-0.5 text-[11px] text-slate-400">{formatLongDate(node.date)}</div>}
                </div>
                {next && <div className={`mt-[1.35rem] h-0.5 min-w-[1rem] flex-1 ${lineClass}`} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 border-b border-slate-800 px-4 py-4 sm:px-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-violet-400">Current Owner</div>
          <div className="mt-1 text-lg font-bold text-slate-100">{summary.owner}</div>
          <div className="mt-1 text-xs text-slate-400">
            {roleLabel}
            {lead.pending_action !== false && lead.responsible_user_id ? ' · Action Required' : ''}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-400 sm:grid-cols-4">
            <div>
              Assigned
              <br />
              <span className="font-medium text-slate-200">{lead.assigned_at ? formatRelativeTime(lead.assigned_at) : '—'}</span>
            </div>
            <div>
              Accepted
              <br />
              <span className="font-medium text-slate-200">{lead.accepted_at ? formatRelativeTime(lead.accepted_at) : '—'}</span>
            </div>
            <div>
              Forwarded
              <br />
              <span className="font-medium text-slate-200">{lead.forwarded_at ? formatRelativeTime(lead.forwarded_at) : '—'}</span>
            </div>
            <div>
              Reminders
              <br />
              <span className="font-medium text-slate-200">{lead.reminder_count || 0}</span>
            </div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Created By</div>
          <div className="mt-1 font-semibold text-slate-100">{lead.created_by}</div>
          {canForward && onForward && (
            <button
              type="button"
              onClick={onForward}
              className="mt-4 w-full rounded-lg border border-cyan-700 px-3 py-2 text-xs font-bold text-cyan-300 hover:bg-cyan-950"
            >
              Forward / Assign
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 bg-slate-950/60 px-4 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Stage</div>
          <div className="mt-1 inline-flex rounded-full border border-violet-500 px-3 py-1 text-sm font-bold text-violet-300">
            {summary.stageLabel}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Current Owner</div>
          <div className="mt-1 text-sm font-bold text-slate-100">{summary.owner}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Assigned By</div>
          <div className="mt-1 text-sm font-bold text-slate-100">{summary.assignedBy}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Action Required</div>
          <div className="mt-1 text-sm font-semibold text-cyan-300">{summary.actionRequired}</div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Due / Next</div>
          <div className="mt-1 text-sm font-bold text-slate-100">{summary.nextAction}</div>
          {summary.dueDate && (
            <div className="mt-0.5 text-sm font-bold text-rose-400">{formatLongDate(summary.dueDate)}</div>
          )}
        </div>
      </div>
    </section>
  );
}
