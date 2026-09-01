'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { FileText, GitCompare, Moon, Plus, RefreshCw, Sun, X } from 'lucide-react';
import { StorageService } from '@/lib/storage';
import { DailyStatusApi } from '@/lib/dailyStatusApi';
import { TasksApi } from '@/lib/tasksApi';
import { canCreateWorkTask, canEditDailySheet } from '@/lib/rbac';
import { CompareItem, DailyStatusPerson, DailyStatusRow } from '@/lib/dailyStatus';
import { User } from '@/lib/types';
import ConfirmDialog from '@/components/work/ConfirmDialog';
import CompareView from '@/components/work/CompareView';
import DailyStatusSheet from '@/components/work/DailyStatusSheet';
import AdditionalTaskForm from '@/components/work/AdditionalTaskForm';

function friendlyError(error: unknown, fallback: string) {
  const text = error instanceof Error ? error.message : String(error || '');
  if (!text || /axios|sql|undefined|json/i.test(text)) return fallback;
  return text;
}

export default function DailyWorkUpdatesPage() {
  return (
    <Suspense fallback={<div className="text-xs text-slate-400">Loading daily work updates…</div>}>
      <DailyWorkUpdatesInner />
    </Suspense>
  );
}

function DailyWorkUpdatesInner() {
  const [user, setUser] = useState<User | null>(null);
  const [rows, setRows] = useState<DailyStatusRow[]>([]);
  const [people, setPeople] = useState<DailyStatusPerson[]>([]);
  const [sheetProjects, setSheetProjects] = useState<Array<{ id: string; name: string; code: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compare, setCompare] = useState<{ items: CompareItem[]; available: boolean; date?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [additionalOpen, setAdditionalOpen] = useState(false);

  const canManageTasks = canCreateWorkTask(user);
  const canEditSheet = canEditDailySheet(user);

  const loadSheet = async () => {
    const sheet = await DailyStatusApi.sheet();
    if (!sheet.ok) {
      setError(sheet.message || 'Unable to load daily work updates.');
      return;
    }
    setRows(sheet.rows);
    setPeople(sheet.people);
    setSheetProjects(sheet.projects);
  };

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (!current) return;
    setUser(current);
    void loadSheet().catch((err) => setError(friendlyError(err, 'Unable to load daily work updates.')));
  }, []);

  const refreshSheet = async () => {
    await loadSheet();
    setSelectedIds([]);
  };

  const flashSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  };

  const addTask = async () => {
    if (!user) return;
    setBusy(true);
    setError(null);
    const result = await TasksApi.create({
      title: 'New task',
      assigned_to_id: user.id,
      task_type: 'NON_PROJECT_TASK',
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to create the task.');
      return;
    }
    setNotice('Task created.');
    await refreshSheet();
  };

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
    link.download = `daily-status-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!user) return null;

  return (
    <div className="flex min-h-0 min-w-0 flex-col overflow-x-hidden text-xs">
      <div className="mb-3 shrink-0 rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-400">
              <FileText className="h-3.5 w-3.5" /> Daily Work Updates
            </div>
            <h1 className="mt-0.5 text-lg font-bold text-slate-100">Project team updates</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">Manage daily task updates and status directly from the central task sheet.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {canEditSheet && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void addTask()}
                className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-2.5 py-1.5 font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
              >
                <Plus className="h-3.5 w-3.5" /> Add Task
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => setAdditionalOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-60"
            >
              <Plus className="h-3.5 w-3.5" /> Additional Task
            </button>
            <button
              type="button"
              disabled={busy || !canEditSheet}
              onClick={async () => {
                setBusy(true);
                const result = await DailyStatusApi.snapshot('morning');
                setBusy(false);
                setNotice(result.ok ? result.data.message : result.message);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-amber-400 disabled:opacity-50"
            >
              <Sun className="h-3.5 w-3.5" /> Morning
            </button>
            <button
              type="button"
              disabled={busy || !canEditSheet}
              onClick={async () => {
                setBusy(true);
                const result = await DailyStatusApi.snapshot('evening');
                setBusy(false);
                setNotice(result.ok ? result.data.message : result.message);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-indigo-400 disabled:opacity-50"
            >
              <Moon className="h-3.5 w-3.5" /> Evening
            </button>
            <button
              type="button"
              onClick={async () => {
                const result = await DailyStatusApi.compare();
                if (!result.ok) {
                  setError(result.message);
                  return;
                }
                setCompare(result.data);
                setCompareOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2.5 py-1.5 font-bold text-slate-100 hover:border-cyan-600"
            >
              <GitCompare className="h-3.5 w-3.5" /> Compare
            </button>
            <button type="button" onClick={() => void refreshSheet()} className="rounded-md border border-slate-700 p-1.5 text-slate-300 hover:border-cyan-600" title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {error && <div className="mb-3 shrink-0 rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{error}</div>}
      {notice && <div className="mb-3 shrink-0 rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-emerald-200">{notice}</div>}

      <DailyStatusSheet
        rows={rows}
        people={people}
        projects={sheetProjects}
        userId={user.id}
        canEditAll={canEditSheet}
        canDelete={canEditSheet || canManageTasks}
        saved={saved}
        selectedIds={selectedIds}
        onSelectedIds={setSelectedIds}
        onPatch={async (id, body) => {
          setError(null);
          const result = await DailyStatusApi.updateRow(id, body);
          if (!result.ok) {
            setError(result.message || 'Unable to save this change.');
            return;
          }
          setRows(result.data.rows);
          flashSaved();
        }}
        onExport={exportCsv}
        onDelete={() => setConfirmDelete(true)}
      />

      {compareOpen && compare && (
        <div className="fixed inset-0 z-[85] flex justify-end overflow-x-hidden bg-slate-950/60" onClick={() => setCompareOpen(false)}>
          <div
            className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-slate-800 bg-slate-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-100">Previous Day</h2>
                <p className="text-[11px] text-slate-400">Morning vs Evening</p>
              </div>
              <button type="button" onClick={() => setCompareOpen(false)} className="rounded-md p-1 text-slate-400 hover:text-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
              <CompareView items={compare.items} available={compare.available} date={compare.date} />
            </div>
          </div>
        </div>
      )}

      <AdditionalTaskForm
        open={additionalOpen}
        people={people}
        projects={sheetProjects}
        currentUserId={user.id}
        requirePerson={canEditSheet}
        onClose={() => setAdditionalOpen(false)}
        onCreated={async (message) => {
          setNotice(message);
          await refreshSheet();
        }}
      />
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${selectedIds.length} selected tasks?`}
          body="This will delete the selected tasks."
          busy={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            const ids = [...selectedIds];
            setBusy(true);
            const result = await TasksApi.bulkDelete(ids);
            setBusy(false);
            setConfirmDelete(false);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            setNotice(result.data.message);
            await refreshSheet();
          }}
        />
      )}
    </div>
  );
}
