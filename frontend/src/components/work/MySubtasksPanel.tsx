'use client';

import React, { useMemo, useState } from 'react';
import { ListPlus, Pencil, Trash2 } from 'lucide-react';
import { DailyStatusPerson, DailyStatusRow, DailyStatusSubtask } from '@/lib/dailyStatus';
import { TasksApi } from '@/lib/tasksApi';
import AddSubtaskForm, { EditableSubtask, subtaskToEditable } from '@/components/work/AddSubtaskForm';

export default function MySubtasksPanel({
  rows,
  people,
  currentUserId,
  canAssignOthers = false,
  onChanged,
}: {
  rows: DailyStatusRow[];
  people: DailyStatusPerson[];
  currentUserId: string;
  canAssignOthers?: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EditableSubtask | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const items = useMemo(() => {
    const next: Array<{ parent: DailyStatusRow; sub: DailyStatusSubtask }> = [];
    for (const row of rows) {
      for (const sub of row.subtasks || []) {
        if (canAssignOthers || sub.assignedToId === currentUserId || row.personId === currentUserId) {
          next.push({ parent: row, sub });
        }
      }
    }
    return next;
  }, [rows, currentUserId, canAssignOthers]);

  const parents = useMemo(
    () => (canAssignOthers ? rows : rows.filter((row) => row.personId === currentUserId)),
    [rows, canAssignOthers, currentUserId]
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/90 p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <h2 className="text-sm font-bold text-slate-100">My Subtasks</h2>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          disabled={parents.length === 0}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-bold text-slate-100 hover:border-cyan-600 disabled:opacity-60"
        >
          <ListPlus className="h-3 w-3" /> Add Subtask
        </button>
      </div>
      {notice ? <div className="mb-2 text-xs text-emerald-300">{notice}</div> : null}
      {error ? <div className="mb-2 text-xs text-rose-300">{error}</div> : null}
      {items.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-500">No subtasks yet. Add one under a parent task.</p>
      ) : (
        <ul className="space-y-2">
          {items.map(({ parent, sub }) => (
            <li
              key={sub.id}
              className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-slate-100">{sub.title}</div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {parent.person} · {parent.project} · {sub.status} · {sub.progressPercent}%
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(subtaskToEditable(sub, parent.id));
                    setOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 font-bold text-slate-200 hover:border-cyan-600"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
                <button
                  type="button"
                  disabled={busyId === sub.id}
                  onClick={() => {
                    if (!window.confirm(`Delete subtask "${sub.title}"?`)) return;
                    void (async () => {
                      setBusyId(sub.id);
                      setError('');
                      const result = await TasksApi.bulkDelete([sub.id]);
                      setBusyId(null);
                      if (!result.ok) {
                        setError(result.message || 'Unable to delete subtask.');
                        return;
                      }
                      setNotice(result.data.message || 'Subtask deleted.');
                      await onChanged();
                    })();
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-rose-800 px-2 py-1 font-bold text-rose-200 hover:bg-rose-950 disabled:opacity-60"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <AddSubtaskForm
          parents={parents}
          people={people}
          currentUserId={currentUserId}
          canAssignOthers={canAssignOthers}
          editing={editing}
          defaultParentId={editing?.parentId}
          onCancel={() => {
            setOpen(false);
            setEditing(null);
          }}
          onCreated={(message) => {
            setNotice(message);
            setOpen(false);
            setEditing(null);
            void onChanged();
          }}
        />
      )}
    </div>
  );
}
