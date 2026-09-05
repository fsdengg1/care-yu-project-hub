'use client';

import React, { useEffect, useState } from 'react';
import { progressForSheetStatus } from '@/lib/dailyStatus';

export default function LoggedHoursProgressCell({
  status,
  progressPercent,
  hoursWorked,
  loggedHours,
  editable = false,
  onProgressCommit,
  onHoursCommit,
}: {
  status?: string;
  progressPercent?: number;
  hoursWorked?: number;
  loggedHours?: string;
  editable?: boolean;
  onProgressCommit?: (percent: number) => void;
  onHoursCommit?: (hours: number) => void;
}) {
  const aligned = progressForSheetStatus(status, progressPercent);
  const [percent, setPercent] = useState(aligned);

  useEffect(() => {
    setPercent(aligned);
  }, [aligned]);

  const hoursLabel = loggedHours || '0h 00m';
  const barColor = percent >= 100 ? '#16a34a' : percent > 0 ? '#2563eb' : '#94a3b8';

  return (
    <div className="sheet-progress-hours">
      <div className="sheet-progress-track" aria-hidden>
        <div className="sheet-progress-fill" style={{ width: `${percent}%`, background: barColor }} />
      </div>
      {editable && onProgressCommit ? (
        <label className="sheet-progress-pct">
          <input
            type="number"
            min={0}
            max={100}
            className="sheet-input sheet-progress-input"
            value={Number.isFinite(percent) ? percent : 0}
            onChange={(event) => setPercent(Math.max(0, Math.min(100, Number(event.target.value) || 0)))}
              onBlur={() => {
              const next = Math.max(0, Math.min(100, Math.round(percent) || 0));
              setPercent(next);
              if (next !== aligned) onProgressCommit(next);
            }}
            title="Progress % (0–100). 100% marks the task completed."
            aria-label="Progress percent"
          />
          <span>%</span>
        </label>
      ) : (
        <div className={`sheet-progress-pct-label ${percent >= 100 ? 'is-complete' : ''}`}>{percent}%</div>
      )}
      {editable && onHoursCommit ? (
        <input
          type="number"
          min={0}
          step={0.25}
          className="sheet-input sheet-hours-input w-full text-center"
          defaultValue={hoursWorked ?? 0}
          key={`hours-${hoursWorked ?? 0}`}
          onBlur={(event) => {
            const next = Math.max(0, Number(event.target.value) || 0);
            if (next !== (hoursWorked ?? 0)) onHoursCommit(next);
          }}
          title="Logged hours (decimal, e.g. 6.5)"
          aria-label="Logged hours"
        />
      ) : (
        <span className="sheet-hours-label">{hoursLabel}</span>
      )}
    </div>
  );
}
