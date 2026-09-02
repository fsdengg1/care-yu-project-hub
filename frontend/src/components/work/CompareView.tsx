'use client';

import React, { useMemo } from 'react';
import { CompareItem, sheetStatusClass } from '@/lib/dailyStatus';

function delayClass(value?: string) {
  const text = (value || '').toLowerCase();
  if (text.includes('delay')) return 'bg-[#fee2e2] text-[#991b1b] font-semibold';
  if (text.includes('hold')) return 'bg-[#fef3c7] text-[#92400e] font-semibold';
  if (text.includes('on time')) return 'bg-[#dcfce7] text-[#166534] font-semibold';
  return '';
}

function StatusPill({ value }: { value?: string }) {
  const label = value && value !== '—' ? value : '—';
  if (label === '—') return <span className="text-[#64748b]">—</span>;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-bold ${sheetStatusClass(label)}`}>
      {label}
    </span>
  );
}

export default function CompareView({
  items,
  available,
  date,
}: {
  items: CompareItem[];
  available: boolean;
  date?: string;
}) {
  const groups = useMemo(() => {
    const sorted = items
      .slice()
      .sort((a, b) => a.person.localeCompare(b.person) || a.project.localeCompare(b.project) || a.id.localeCompare(b.id));
    const next: Array<{ person: string; rows: CompareItem[] }> = [];
    for (const row of sorted) {
      const last = next[next.length - 1];
      if (last && last.person === row.person) last.rows.push(row);
      else next.push({ person: row.person, rows: [row] });
    }
    return next;
  }, [items]);

  if (!available) {
    return (
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">
        Morning and evening updates are not yet available.
      </div>
    );
  }
  if (!items.length) {
    return (
      <div className="rounded-xl border border-[#e2e8f0] bg-white p-8 text-center text-sm text-[#64748b]">
        No tasks found.
      </div>
    );
  }

  return (
    <div className="daily-status-workspace min-w-0 overflow-hidden rounded-xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e2e8f0] px-3 py-2 text-[11px] text-[#64748b]">
        <span>
          Comparison for <span className="font-semibold text-[#0f172a]">{date}</span> · Morning status vs Evening current updates
        </span>
        <span className="font-semibold text-[#0f172a]">{items.length} rows</span>
      </div>

      <div className="daily-status-table-wrap">
        <table className="daily-status-sheet daily-status-compare">
          <colgroup>
            <col className="col-person" />
            <col className="col-project" />
            <col className="col-task-desc" />
            <col className="col-status" />
            <col className="col-task-desc" />
            <col className="col-status" />
            <col className="col-status" />
            <col className="col-hours" />
            <col className="col-delay" />
            <col className="col-hours" />
          </colgroup>
          <thead>
            <tr>
              <th>Person</th>
              <th>Project</th>
              <th>Task Description</th>
              <th>Morning Status</th>
              <th>Current Updates</th>
              <th>Status</th>
              <th>On Time / Delay</th>
              <th>Progress</th>
              <th>Reason For Delay</th>
              <th>Logged Hours</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) =>
              group.rows.map((item, index) => (
                <tr key={item.id}>
                  {index === 0 && (
                    <td className="person-cell" rowSpan={group.rows.length}>
                      {group.person}
                    </td>
                  )}
                  <td className="project-cell">
                    <span className="sheet-text">{item.project || '—'}</span>
                  </td>
                  <td className="task-desc-cell">
                    <span className="sheet-text sheet-task-field">{item.taskDescription || '—'}</span>
                  </td>
                  <td className="status-cell">
                    <StatusPill value={item.morningStatus} />
                  </td>
                  <td className="task-desc-cell">
                    <span className="sheet-text sheet-task-field">{item.currentUpdate || '—'}</span>
                  </td>
                  <td className="status-cell">
                    <StatusPill value={item.eveningStatus} />
                  </td>
                  <td className={`status-cell ${delayClass(item.onTimeDelay)}`}>
                    {item.onTimeDelay || '—'}
                  </td>
                  <td className="hours-cell">{item.progressPercent ?? 0}%</td>
                  <td className="delay-cell">
                    <span className="sheet-text">{item.reasonForDelay || '—'}</span>
                  </td>
                  <td className="hours-cell whitespace-nowrap">{item.loggedHours || '0h 00m'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
