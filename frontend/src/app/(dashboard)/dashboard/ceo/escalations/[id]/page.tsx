'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Escalation } from '@/lib/types';

export default function CeoEscalationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [escalation, setEscalation] = useState<Escalation | null>(null);
  const [decision, setDecision] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const result = await apiRequest<{ escalation: Escalation }>(`/api/escalations/${id}`);
    if (result.ok) setEscalation(result.data.escalation);
  };

  useEffect(() => {
    load();
  }, [id]);

  const resolve = async () => {
    if (!escalation) return;
    setSaving(true);
    setError(null);
    const result = await apiRequest<{ escalation: Escalation }>(`/api/escalations/${escalation.id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setEscalation(result.data.escalation);
    setDecision('');
  };

  if (!escalation) {
    return <div className="p-12 text-center text-xs text-slate-400">Loading escalation…</div>;
  }

  const canDecide = escalation.current_level === 'CEO' && escalation.status === 'OPEN';

  return (
    <div className="space-y-6">
      <Link href="/dashboard/ceo/escalations" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200">
        <ArrowLeft className="h-3.5 w-3.5" /> All escalations
      </Link>

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <ShieldAlert className="h-4 w-4" /> {escalation.code}
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">{escalation.customer_name}</h1>
        <p className="text-sm text-slate-300">{escalation.project_name}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/90 p-5 text-xs">
          <Row label="Issue" value={escalation.issue} />
          <Row label="Raised By" value={escalation.raised_by_role} />
          <Row label="Team" value={escalation.team_name || '—'} />
          <Row label="Impact" value={escalation.impact} />
          <Row label="Previous Actions" value={escalation.previous_actions} />
          <Row label="Current Level" value={escalation.current_level} />
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-200">Decision Required</h2>
          {escalation.decision_required && (
            <p className="mb-4 text-xs text-slate-300">{escalation.decision_required}</p>
          )}
          {escalation.ceo_decision && (
            <div className="mb-4 rounded border border-emerald-900 bg-emerald-950/40 p-3 text-xs text-emerald-300">
              Resolution: {escalation.ceo_decision}
            </div>
          )}
          {canDecide ? (
            <div className="space-y-3">
              <textarea
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                rows={4}
                placeholder="Decision / Resolution"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-100"
              />
              {error && <p className="text-xs text-rose-400">{error}</p>}
              <button
                onClick={resolve}
                disabled={saving}
                className="rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
              >
                Resolve Escalation
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              {escalation.status === 'RESOLVED'
                ? 'This escalation has been resolved.'
                : 'No CEO action is required at the current escalation level.'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 font-medium text-slate-200">{value}</div>
    </div>
  );
}
