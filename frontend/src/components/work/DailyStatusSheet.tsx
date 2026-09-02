'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Filter, Search, Trash2 } from 'lucide-react';
import {
  DailyStatusPerson,
  DailyStatusRow,
  deadlineCellClass,
  deadlineTone,
  parseSheetDate,
} from '@/lib/dailyStatus';
import UserDropdown from './UserDropdown';
import DependencyMultiSelect from './DependencyMultiSelect';
import StatusDropdown from './StatusDropdown';

export type SheetChip = 'all' | 'mine' | 'overdue' | 'critical' | 'due-today' | 'completed' | 'hold' | 'additional';

const CHIPS: Array<{ id: SheetChip; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'My Tasks' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'critical', label: 'Critical' },
  { id: 'due-today', label: 'Due Today' },
  { id: 'completed', label: 'Completed' },
  { id: 'hold', label: 'Hold' },
  { id: 'additional', label: 'Additional Tasks' },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function isoToInput(value?: string) {
  return parseSheetDate(value) || '';
}

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(38, el.scrollHeight)}px`;
}

function AutoResizeTextarea({
  className,
  defaultValue,
  onBlur,
  placeholder,
}: {
  className?: string;
  defaultValue?: string;
  placeholder?: string;
  onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    resizeTextarea(ref.current);
  }, [defaultValue]);

  return (
    <textarea
      ref={ref}
      defaultValue={defaultValue}
      className={className}
      placeholder={placeholder}
      onInput={(event) => resizeTextarea(event.currentTarget)}
      onBlur={onBlur}
    />
  );
}

type PatchBody = Record<string, unknown>;

export default function DailyStatusSheet({
  rows,
  people,
  projects: _projects,
  userId,
  canEditAll,
  canDelete,
  saved,
  selectedIds,
  onSelectedIds,
  onPatch,
  onExport,
  onDelete,
  readOnly = false,
}: {
  rows: DailyStatusRow[];
  people: DailyStatusPerson[];
  projects: Array<{ id: string; name: string }>;
  userId: string;
  canEditAll: boolean;
  canDelete: boolean;
  saved: boolean;
  selectedIds: string[];
  onSelectedIds: (ids: string[]) => void;
  onPatch: (id: string, body: PatchBody) => Promise<void>;
  onExport: (visible: DailyStatusRow[]) => void;
  onDelete: () => void;
  readOnly?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState<SheetChip>('all');
  const today = todayIso();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (needle) {
          const hay = `${row.person} ${row.project} ${row.taskDescription}`.toLowerCase();
          if (!hay.includes(needle)) return false;
        }
        if (chip === 'mine') return row.personId === userId;
        if (chip === 'overdue') return Boolean(row.overdue);
        if (chip === 'critical') return Boolean(row.overdue && (row.status === 'Waiting' || row.status === 'Hold' || row.blocked));
        if (chip === 'due-today') return isoToInput(row.deadlineIso || row.deadline) === today;
        if (chip === 'completed') return row.status === 'Completed';
        if (chip === 'hold') return row.status === 'Hold';
        if (chip === 'additional') return row.isAdditional;
        return true;
      })
      .slice()
      .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
  }, [rows, query, chip, userId, today]);

  const groups = useMemo(() => {
    const next: Array<{ personId: string; person: string; rows: DailyStatusRow[] }> = [];
    for (const row of visible) {
      const last = next[next.length - 1];
      if (last && last.personId === row.personId) last.rows.push(row);
      else next.push({ personId: row.personId, person: row.person, rows: [row] });
    }
    return next;
  }, [visible]);

  const allSelected = visible.length > 0 && visible.every((row) => selectedIds.includes(row.id));
  const selectedVisible = selectedIds.filter((id) => visible.some((row) => row.id === id)).length;
  const canEditRow = (row: DailyStatusRow) =>
    !readOnly && (canEditAll || (row.isAdditional && row.personId === userId));
  const showSelect = !readOnly;
  const tableRef = useRef<HTMLTableElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      tableRef.current?.querySelectorAll('textarea.sheet-textarea').forEach((node) => {
        resizeTextarea(node as HTMLTextAreaElement);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [visible]);

  return (
    <section className={`daily-status-workspace min-w-0 overflow-hidden rounded-xl ${readOnly ? 'daily-status-workspace-readonly' : ''}`}>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[#94a3b8]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search employee or project..."
            className="w-full rounded-md border border-[#cbd5e1] bg-white py-1.5 pl-8 pr-3 text-xs text-[#0f172a] placeholder-[#94a3b8]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {CHIPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setChip(item.id)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                chip === item.id
                  ? 'border-[#0f172a] bg-[#0f172a] text-white'
                  : 'border-[#cbd5e1] bg-white text-[#475569] hover:border-[#94a3b8]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <button type="button" className="rounded-md border border-[#cbd5e1] p-1.5 text-[#475569]" title="Filter">
            <Filter className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onExport(visible)}
            className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] px-2 py-1.5 text-[11px] font-bold text-[#0f172a] hover:border-[#0f172a]"
          >
            <Download className="h-3.5 w-3.5" /> Excel
          </button>
          {!readOnly && selectedIds.length > 0 && (
            <span className="text-[11px] font-semibold text-[#0f172a]">{selectedIds.length} selected</span>
          )}
          {!readOnly && (
            <button
              type="button"
              disabled={!canDelete || selectedIds.length === 0}
              onClick={onDelete}
              className="inline-flex items-center gap-1 rounded-md border border-[#cbd5e1] px-2 py-1.5 text-[11px] font-bold text-[#0f172a] hover:border-rose-500 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 px-3 py-1.5 text-[11px] text-[#64748b]">
        <span>
          {!readOnly && selectedVisible ? `${selectedVisible} selected · ` : ''}
          {visible.length} rows
        </span>
        {saved && <span className="font-semibold text-emerald-700">Saved</span>}
      </div>

      <div className="daily-status-table-wrap">
        <table ref={tableRef} className="daily-status-sheet">
          <colgroup>
            {showSelect && <col className="col-check" />}
            <col className="col-person" />
            <col className="col-project" />
            <col className="col-task-desc" />
            <col className="col-deps" />
            <col className="col-status" />
            <col className="col-date" />
            <col className="col-deadline" />
            <col className="col-delay" />
          </colgroup>
          <thead>
            <tr>
              {showSelect && (
                <th>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => onSelectedIds(event.target.checked ? visible.map((row) => row.id) : [])}
                    aria-label="Select all visible rows"
                  />
                </th>
              )}
              <th>Person</th>
              <th>Project</th>
              <th>Task Description</th>
              <th>Dependencies</th>
              <th>Status</th>
              <th>Current Date</th>
              <th>Task Deadline</th>
              <th>Reason For Delay</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={showSelect ? 9 : 8} className="py-10 text-center text-[#64748b]">
                  No tasks found.
                </td>
              </tr>
            )}
            {groups.map((group) =>
              group.rows.map((row, index) => {
                const editable = canEditRow(row);
                const tone = deadlineTone(row.status, row.deadlineIso || row.deadline, today);
                return (
                  <tr key={row.id}>
                    {showSelect && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={(event) =>
                            onSelectedIds(
                              event.target.checked ? [...selectedIds, row.id] : selectedIds.filter((id) => id !== row.id)
                            )
                          }
                          aria-label={`Select ${row.person} task`}
                        />
                      </td>
                    )}
                    {index === 0 && (
                      <td className="person-cell" rowSpan={group.rows.length}>
                        {canEditAll && !readOnly ? (
                          <UserDropdown
                            variant="sheet"
                            people={people}
                            value={group.personId}
                            onChange={async (id) => {
                              const ids = group.rows.map((item) => item.id);
                              for (const taskId of ids) {
                                await onPatch(taskId, { assigned_to_id: id });
                              }
                            }}
                          />
                        ) : (
                          group.person
                        )}
                      </td>
                    )}
                    <td className="project-cell">
                    {editable ? (
                      <AutoResizeTextarea
                        key={`${row.id}-${row.project}`}
                        defaultValue={row.project === '—' ? '' : row.project}
                        className="sheet-textarea sheet-project-field"
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          const current = row.project === '—' ? '' : row.project;
                          if (value !== current) void onPatch(row.id, { project_name: value });
                        }}
                      />
                    ) : (
                      <span className="sheet-text">{row.project || '—'}</span>
                    )}
                  </td>
                  <td className="task-desc-cell">
                    {editable ? (
                      <AutoResizeTextarea
                        key={row.taskDescription}
                        defaultValue={row.taskDescription}
                        className="sheet-textarea sheet-task-field"
                        onBlur={(event) => {
                          const value = event.target.value.trim();
                          if (value && value !== row.taskDescription) {
                            void onPatch(row.id, { description: value, title: value.slice(0, 120) });
                          }
                        }}
                      />
                    ) : (
                      <span className="sheet-text sheet-task-field">{row.taskDescription}</span>
                    )}
                  </td>
                  <td className="deps-cell">
                    {editable ? (
                      <DependencyMultiSelect
                        variant="sheet"
                        people={people.filter((person) => person.id !== row.personId)}
                        value={row.dependencyIds}
                        onChange={(ids) => void onPatch(row.id, { depends_on_ids: ids })}
                      />
                    ) : (
                      row.dependencies
                    )}
                  </td>
                  <td className="status-cell">
                    <StatusDropdown
                      variant="sheet"
                      value={row.status}
                      disabled={!editable}
                      onChange={(status) => void onPatch(row.id, { status })}
                    />
                  </td>
                  <td className="date-cell">
                    <input type="date" className="sheet-input sheet-date-input" value={isoToInput(row.currentDate) || today} readOnly tabIndex={-1} />
                  </td>
                  <td className={`date-cell tone-cell ${deadlineCellClass(tone)}`}>
                    {editable ? (
                      <input
                        type="date"
                        className="sheet-input sheet-date-input"
                        style={{ color: 'inherit', fontWeight: 'inherit' }}
                        value={isoToInput(row.deadlineIso || row.deadline)}
                        onChange={(event) => void onPatch(row.id, { due_date: event.target.value || '' })}
                      />
                    ) : (
                      row.deadline
                    )}
                  </td>
                  <td className="delay-cell">
                    {editable ? (
                      <AutoResizeTextarea
                        key={row.reasonForDelay}
                        defaultValue={row.reasonForDelay === '—' ? '' : row.reasonForDelay}
                        className="sheet-textarea"
                        placeholder="—"
                        onBlur={(event) => {
                          const value = event.target.value.trim() || 'No delay';
                          if (value !== row.reasonForDelay) void onPatch(row.id, { remarks: value });
                        }}
                      />
                    ) : (
                      <span className="sheet-text">{row.reasonForDelay}</span>
                    )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
