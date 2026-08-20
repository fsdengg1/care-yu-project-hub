import React from 'react';
import { ArrowRight, Briefcase, CheckCircle2, ListChecks, Users } from 'lucide-react';

const STEPS = [
  { label: 'Project', icon: Briefcase },
  { label: 'Team', icon: Users },
  { label: 'Tasks', icon: ListChecks },
  { label: 'Completion', icon: CheckCircle2 },
];

export default function ExecutionFlow() {
  return (
    <div className="w-full max-w-xl">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-300">
        Delivery workflow
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <React.Fragment key={step.label}>
              <div className="flex min-w-[92px] flex-1 flex-col items-center rounded-2xl border border-white/10 bg-white/5 px-3 py-4 text-center backdrop-blur-sm">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/20">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold text-white">{step.label}</span>
              </div>
              {index < STEPS.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 shrink-0 text-blue-300/80 sm:block" aria-hidden="true" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
