'use client';

import React from 'react';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import {
  WorkflowActionKind,
  WORKFLOW_ACTION_SUCCESS,
  WORKFLOW_STAGE_FOR_ACTION,
  workflowStatusPresentation,
} from '@/lib/format';

export interface WorkflowActionFeedback {
  kind: WorkflowActionKind;
  message?: string;
  previousStatus?: string;
}

interface Props {
  status: string;
  feedback?: WorkflowActionFeedback | null;
  error?: string | null;
}

const FEEDBACK_STYLE: Record<WorkflowActionKind, string> = {
  submit: 'border-cyan-700 bg-cyan-950/70 text-cyan-300',
  approve: 'border-emerald-700 bg-emerald-950/70 text-emerald-300',
  reject: 'border-rose-700 bg-rose-950/70 text-rose-300',
};

const FEEDBACK_ICON: Record<WorkflowActionKind, React.ReactNode> = {
  submit: <CheckCircle2 className="h-5 w-5 shrink-0 text-cyan-300" />,
  approve: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />,
  reject: <XCircle className="h-5 w-5 shrink-0 text-rose-300" />,
};

export default function WorkflowStatusBanner({ status, feedback, error }: Props) {
  const current = workflowStatusPresentation(status);
  const displayedStage = feedback ? WORKFLOW_STAGE_FOR_ACTION[feedback.kind] : current.label;
  const previous = feedback?.previousStatus ? workflowStatusPresentation(feedback.previousStatus) : null;
  const highlight = Boolean(feedback);

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
      {feedback && (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${FEEDBACK_STYLE[feedback.kind]}`}>
          {FEEDBACK_ICON[feedback.kind]}
          <div>
            <div className="font-bold">{feedback.message || WORKFLOW_ACTION_SUCCESS[feedback.kind]}</div>
            <div className="mt-0.5 text-xs opacity-90">Current stage is now {displayedStage}.</div>
          </div>
        </div>
      )}
      <div
        className={`rounded-xl border px-4 py-3 ${current.bannerClass} ${
          highlight ? 'ring-2 ring-offset-2 ring-offset-slate-950 ring-cyan-400' : ''
        }`}
      >
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Current stage</div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-sm font-bold ${current.badgeClass}`}>
            {displayedStage}
          </span>
          {previous && previous.label !== displayedStage && (
            <span className="text-xs opacity-70">
              Previous: <span className="line-through">{previous.label}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
