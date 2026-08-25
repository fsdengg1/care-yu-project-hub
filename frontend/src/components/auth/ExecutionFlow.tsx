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
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-300/90">
        Delivery workflow
      </p>
      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <React.Fragment key={step.label}>
              <div
                className="flex min-w-[72px] flex-1 flex-col items-center rounded-xl border border-white/10 bg-white/[0.06] px-2.5 py-3 text-center shadow-[0_8px_24px_rgba(0,0,0,0.12)] backdrop-blur-[2px]"
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/20 text-blue-200 ring-1 ring-blue-300/25">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-[11px] font-semibold tracking-wide text-white">{step.label}</span>
              </div>
              {index < STEPS.length - 1 && (
                <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-blue-300/70 sm:block" aria-hidden="true" />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
