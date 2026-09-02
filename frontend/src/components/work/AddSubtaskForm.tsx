'use client';

import React, { useMemo, useState } from 'react';
import { TasksApi } from '@/lib/tasksApi';
import { DailyStatusPerson, DailyStatusRow } from '@/lib/dailyStatus';

export default function AddSubtaskForm({
  parents,
  people,
  defaultParentId,
  currentUserId,
  onCreated,
  onCancel,
}: {
  parents: DailyStatusRow[];
  people: DailyStatusPerson[];
  defaultParentId?: string;
  currentUserId: string;
  onCreated: (message: string) => void;
  onCancel: () => void;
}) {
  const rootParents = useMemo(() => parents.filter((row) => !row.id.startsWith('sub-')), [parents]);
  const [parentId, setParentId] = useState(defaultParentId || rootParents[0]?.id || '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedToId, setAssignedToId] = useState(currentUserId);
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('TODO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const parent = rootParents.find((row) => row.id === parentId);

  const submit = async () => {
    if (!parentId || !title.trim()) {
      setError('Parent task and subtask title are required.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await TasksApi.create({
      title: title.trim(),
      description: description.trim() || title.trim(),
      task_type: parent?.projectId ? 'PROJECT_TASK' : 'NON_PROJECT_TASK',
      project_id: parent?.projectId,
      project_name: parent?.project === '—' ? undefined : parent?.project,
      assigned_to_id: assignedToId || currentUserId,
      due_date: dueDate || undefined,
      status,
      parent_task_id: parentId,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message || 'Unable to create subtask.');
      return;
    }
    onCreated('Subtask created under the selected parent task.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <h2 className="text-sm font-bold text-slate-100">Add Subtask</h2>
        <p className="mt-1 text-xs text-slate-400">Creates an activity under a main Daily Work Updates task.</p>
        <div className="mt-4 space-y-3 text-xs">
          <label className="block text-slate-300">
            Parent Task
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {rootParents.length === 0 && <option value="">No parent tasks available</option>}
              {rootParents.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.person} — {row.project} — {row.taskDescription.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-slate-300">
            Subtask / Activity
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              placeholder="Study RCS documents"
            />
          </label>
          <label className="block text-slate-300">
            Description
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            />
          </label>
          <label className="block text-slate-300">
            Assigned To
            <select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
            >
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName || person.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-slate-300">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              >
                <option value="TODO">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="DONE">Completed</option>
                <option value="WAITING">Waiting</option>
                <option value="HOLD">Hold</option>
              </select>
            </label>
            <label className="block text-slate-300">
              Deadline
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100"
              />
            </label>
          </div>
        </div>
        {error && <div className="mt-3 rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-xs text-rose-300">{error}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-200">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void submit()}
            className="rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            Create Subtask
          </button>
        </div>
      </div>
    </div>
  );
}
