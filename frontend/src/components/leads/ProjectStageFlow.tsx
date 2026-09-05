'use client';

import React from 'react';
import { Check, Lock, CircleDot } from 'lucide-react';
import { Lead, LiveDemonstration } from '@/lib/types';
import {
  ProjectStageFlowKey,
  ProjectStageFlowNodeState,
  projectStageFlowNodes,
  projectStageFlowSummary,
} from '@/lib/projectStageFlow';

const ICONS: Record<ProjectStageFlowKey, React.ReactNode> = {
  lead: <CircleDot className="h-3.5 w-3.5" />,
  feasibility: <CircleDot className="h-3.5 w-3.5" />,
  costing: <CircleDot className="h-3.5 w-3.5" />,
  live_demo: <CircleDot className="h-3.5 w-3.5" />,
  procurement: <Lock className="h-3.5 w-3.5" />,
  po: <CircleDot className="h-3.5 w-3.5" />,
  project: <CircleDot className="h-3.5 w-3.5" />,
};

function tone(state: ProjectStageFlowNodeState) {
  if (state === 'completed') return 'border-emerald-800 bg-emerald-950/40 text-emerald-300';
  if (state === 'current') return 'border-violet-700 bg-violet-950/50 text-violet-200 ring-1 ring-violet-500/40';
  if (state === 'waiting') return 'border-violet-800 bg-violet-950/30 text-violet-300';
  if (state === 'locked') return 'border-slate-800 bg-slate-950/40 text-slate-500';
  return 'border-slate-800 bg-slate-900 text-slate-400';
}

export default function ProjectStageFlow({
  lead,
  demo,
}: {
  lead: Lead;
  demo?: LiveDemonstration | null;
}) {
  const nodes = projectStageFlowNodes(lead, demo);
  const summary = projectStageFlowSummary(lead, demo);

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/90 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Workflow stages</h3>
        <span className="text-[11px] text-violet-300">Current: {summary.stageLabel}</span>
      </div>
      <ol className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        {nodes.map((node) => (
          <li key={node.key} className={`rounded-lg border px-2 py-2 ${tone(node.state)}`}>
            <div className="flex items-center gap-1.5 text-[11px] font-bold">
              {node.state === 'completed' ? <Check className="h-3.5 w-3.5" /> : ICONS[node.key]}
              <span className="leading-tight">{node.label}</span>
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wide opacity-80">{node.caption}</div>
            {node.detail && <div className="mt-1 text-[10px] font-medium leading-snug text-slate-300 normal-case tracking-normal">{node.detail}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}
