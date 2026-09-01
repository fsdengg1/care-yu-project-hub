'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Monitor, Smartphone, Sun, Moon, RotateCcw, Send } from 'lucide-react';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { DailyStatusPerson, DailyStatusRow, SnapshotPeriod } from '@/lib/dailyStatus';
import { StorageService } from '@/lib/storage';
import DailyStatusSheet from '@/components/work/DailyStatusSheet';

function friendlyError(message?: string) {
  if (!message || /axios|sql|undefined|json/i.test(message)) return 'Unable to load the email report.';
  return message;
}

export default function EmailReportsPage() {
  const [period, setPeriod] = useState<SnapshotPeriod>('morning');
  const [mode, setMode] = useState<'desktop' | 'mobile'>('desktop');
  const [html, setHtml] = useState('');
  const [subject, setSubject] = useState('');
  const [rows, setRows] = useState<DailyStatusRow[]>([]);
  const [people, setPeople] = useState<DailyStatusPerson[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [userId, setUserId] = useState('');
  const [available, setAvailable] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const loadSheet = useCallback(async () => {
    const sheet = await DailyStatusApi.sheet();
    if (!sheet.ok) {
      setError(friendlyError(sheet.message));
      return;
    }
    setRows(sheet.rows);
    setPeople(sheet.people);
    setProjects(sheet.projects);
  }, []);

  const loadPreview = useCallback(async (nextPeriod: SnapshotPeriod, showBusy = false) => {
    if (showBusy) setBusy(true);
    setError('');
    const preview = await DailyStatusApi.emailPreview(nextPeriod);
    if (showBusy) setBusy(false);
    if (!preview.ok) {
      setError(friendlyError(preview.message));
      return;
    }
    setAvailable(preview.data.available);
    setHtml(preview.data.html || '');
    setSubject(preview.data.subject || '');
    setMessage(preview.data.message || '');
  }, []);

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (current) setUserId(current.id);
    void loadSheet();
    void loadPreview(period, true);
  }, [period, loadSheet, loadPreview]);

  useEffect(() => {
    const refresh = () => void loadSheet();
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 8000);
    return () => {
      window.removeEventListener('focus', refresh);
      window.clearInterval(timer);
    };
  }, [loadSheet]);

  const exportCsv = (visibleRows: DailyStatusRow[]) => {
    const header = ['PERSON', 'PROJECT', 'TASK DESCRIPTION', 'DEPENDENCIES', 'STATUS', 'CURRENT DATE', 'TASK DEADLINE', 'REASON FOR DELAY'];
    const lines = [
      header.join(','),
      ...visibleRows.map((row) =>
        [row.person, row.project, row.taskDescription, row.dependencies, row.status, row.currentDate, row.deadline, row.reasonForDelay]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `daily-status-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden text-xs">
      <div className="rounded-2xl border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/30 p-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
          <Mail className="h-4 w-4" /> Email Reports
        </div>
        <h1 className="mt-1 text-xl font-bold text-slate-100">Daily Status email</h1>
        <p className="mt-1 text-slate-400">
          This uses the same live Daily Work Updates sheet. Morning and evening send the matching snapshot when it has been captured.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPeriod('morning')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold ${period === 'morning' ? 'bg-cyan-600 text-white' : 'border border-slate-700 text-slate-200 hover:border-cyan-600'}`}
          >
            <Sun className="h-3.5 w-3.5" /> Morning
          </button>
          <button
            type="button"
            onClick={() => setPeriod('evening')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold ${period === 'evening' ? 'bg-cyan-600 text-white' : 'border border-slate-700 text-slate-200 hover:border-cyan-600'}`}
          >
            <Moon className="h-3.5 w-3.5" /> Evening
          </button>
          <button
            type="button"
            onClick={() => setMode('desktop')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold ${mode === 'desktop' ? 'bg-slate-800 text-cyan-300' : 'border border-slate-700 text-slate-200'}`}
          >
            <Monitor className="h-3.5 w-3.5" /> Desktop Preview
          </button>
          <button
            type="button"
            onClick={() => setMode('mobile')}
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 font-bold ${mode === 'mobile' ? 'bg-slate-800 text-cyan-300' : 'border border-slate-700 text-slate-200'}`}
          >
            <Smartphone className="h-3.5 w-3.5" /> Mobile Preview
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const result = await DailyStatusApi.emailRestore();
              setBusy(false);
              if (!result.ok) {
                setError(friendlyError(result.message));
                return;
              }
              setHtml(result.data.html);
              setSubject(result.data.subject);
              if (result.data.period) setPeriod(result.data.period);
              setNotice('Previous report restored.');
              setAvailable(true);
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 font-bold text-slate-200 hover:border-cyan-600 disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Restore Report
          </button>
          <button
            type="button"
            disabled={busy || !available}
            onClick={async () => {
              const user = StorageService.getCurrentUser();
              setBusy(true);
              const result = await DailyStatusApi.emailSend(period, user?.email);
              setBusy(false);
              if (!result.ok) {
                setError(friendlyError(result.message));
                return;
              }
              setHtml(result.data.html);
              setSubject(result.data.subject);
              setNotice(result.data.message);
              void loadSheet();
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" /> Send
          </button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-rose-900 bg-rose-950/40 px-4 py-3 text-rose-300">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-800 bg-emerald-950/40 px-4 py-3 text-emerald-200">{notice}</div>}
      {message && !available && (
        <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-slate-400">{message}</div>
      )}

      <div className="space-y-2">
        <h2 className="text-sm font-bold text-slate-100">Live Daily Work Updates</h2>
        <DailyStatusSheet
          readOnly
          rows={rows}
          people={people}
          projects={projects}
          userId={userId}
          canEditAll={false}
          canDelete={false}
          saved={false}
          selectedIds={[]}
          onSelectedIds={() => undefined}
          onPatch={async () => undefined}
          onExport={exportCsv}
          onDelete={() => undefined}
        />
      </div>

      {available && html && (
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-100">HTML Preview</h2>
            <span className="text-slate-500">{subject}</span>
          </div>
          <div className={`mx-auto overflow-hidden rounded-xl border border-slate-800 bg-white ${mode === 'mobile' ? 'max-w-[390px]' : 'w-full'}`}>
            <iframe title="Email preview" srcDoc={html} className="h-[720px] w-full border-0 bg-white" />
          </div>
        </section>
      )}
    </div>
  );
}
