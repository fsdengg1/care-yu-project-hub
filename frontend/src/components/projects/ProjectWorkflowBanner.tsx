'use client';

import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatDateTime, PROJECT_INTAKE_STEPS, PROJECT_STEPS } from '@/lib/format';
import { ProjectWorkflowSnapshot } from '@/lib/types';

export default function ProjectWorkflowBanner({
  workflow,
  message,
  error,
}: {
  workflow?: ProjectWorkflowSnapshot | null;
  message?: string | null;
  error?: string | null;
}) {
  const step = workflow?.step || 1;

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-rose-800 bg-rose-950/70 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <div className="font-bold">Action failed</div>
            <div className="mt-0.5 text-xs text-rose-300">{error}</div>
          </div>
        </div>
      )}
      {message && (
        <div className="flex items-start gap-3 rounded-xl border border-emerald-700 bg-emerald-950/70 px-4 py-3 text-sm text-emerald-100">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />
          <div>
            <div className="font-bold">{message}</div>
            {workflow && (
              <div className="mt-0.5 text-xs opacity-90">Current stage is now {workflow.stage}.</div>
            )}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-cyan-800 bg-slate-900/90 px-4 py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Meta label="Current Stage" value={workflow?.stage || 'Project Assignment'} />
          <Meta label="Current Status" value={workflow?.status || 'Awaiting Assignment'} />
          <Meta label="Last Action" value={workflow?.last_action_label || '—'} />
          <Meta label="Updated By" value={workflow?.last_action_by || '—'} />
          <Meta label="Updated Date/Time" value={formatDateTime(workflow?.last_action_at)} />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1 lg:grid-cols-8">
          {(workflow?.step === 0
            ? PROJECT_INTAKE_STEPS.map((item, index) => ({ key: item.key, step: index + 1, stage: item.stage }))
            : PROJECT_STEPS.map((item) => ({ key: String(item.step), step: item.step, stage: item.stage }))
          ).map((item) => {
            const intake = workflow?.intake_status;
            const intakeActive =
              (item.stage === 'Draft' && (intake === 'DRAFT' || intake === 'RETURNED_TO_CREATOR')) ||
              (item.stage === 'Submitted to PM' && intake === 'SUBMITTED_TO_PM') ||
              (item.stage === 'PM Review' && intake === 'SUBMITTED_TO_PM');
            const active = workflow?.step === 0 ? intakeActive : item.step === step;
            const done =
              workflow?.step === 0
                ? item.stage === 'Draft' && intake === 'SUBMITTED_TO_PM'
                : item.step < step;
            return (
              <div
                key={item.key}
                className={`rounded-lg border px-2 py-2 text-center ${
                  active
                    ? 'border-cyan-500 bg-cyan-950 text-cyan-100'
                    : done
                      ? 'border-emerald-900 bg-emerald-950/30 text-emerald-200'
                      : 'border-slate-800 bg-slate-950/40 text-slate-500'
                }`}
              >
                <div className="text-[10px] font-bold">Step {item.step}</div>
                <div className="mt-0.5 text-[10px] leading-tight">{item.stage}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}
