'use client';

import React, { useMemo } from 'react';
import { CompareItem, progressForSheetStatus, sheetStatusClass } from '@/lib/dailyStatus';
import LoggedHoursProgressCell from './LoggedHoursProgressCell';

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
    <span className={`inline-flex max-w-full items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold leading-tight ${sheetStatusClass(label)}`}>
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
    <div className="daily-status-workspace daily-status-compare-wrap min-w-0 overflow-hidden rounded-xl">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#e2e8f0] px-3 py-2 text-[11px] text-[#64748b]">
        <span>
          Comparison for <span className="font-semibold text-[#0f172a]">{date}</span> · Morning master task vs actual Evening update
        </span>
        <span className="font-semibold text-[#0f172a]">{items.length} rows</span>
      </div>

      <div className="daily-status-table-wrap daily-status-compare-scroll">
        <table className="daily-status-sheet daily-status-compare">
          <colgroup>
            <col style={{ width: '9%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '24%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '8%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Person</th>
              <th>Project</th>
              <th>Task Description</th>
              <th>Current Updates</th>
              <th>Status</th>
              <th>Start Date</th>
              <th>Task Deadline</th>
              <th>On Time / Delay</th>
              <th>Logged Hours</th>
              <th>Reason For Delay</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) =>
              group.rows.map((item, index) => {
                const progress = progressForSheetStatus(item.status, item.progressPercent);
                const taskDescText = item.taskDescription || '—';
                const currentText = item.currentUpdate || 'No Evening Update Submitted';
                return (
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
                      <span className="sheet-text sheet-task-field">{taskDescText}</span>
                    </td>
                    <td className="task-desc-cell">
                      <span className="sheet-text sheet-task-field text-[#0f172a] font-medium">{currentText}</span>
                    </td>
                    <td className="status-cell">
                      <StatusPill value={item.status} />
                    </td>
                    <td className="status-cell">
                      <span className="sheet-text">{item.startDate || '—'}</span>
                    </td>
                    <td className="status-cell">
                      <span className="sheet-text">{item.taskDeadline || '—'}</span>
                    </td>
                    <td className={`status-cell ${delayClass(item.onTimeDelay)}`}>{item.onTimeDelay || '—'}</td>
                    <td className="hours-cell">
                      <LoggedHoursProgressCell
                        status={item.status}
                        progressPercent={progress}
                        hoursWorked={item.hoursWorked}
                        loggedHours={item.loggedHours}
                      />
                    </td>
                    <td className="delay-cell">
                      <span className="sheet-text">{item.reasonForDelay || '—'}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
