import React from 'react';

export default function LeadTaskBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`lead-task-badge ${className}`.trim()}>
      Lead Task
    </span>
  );
}
