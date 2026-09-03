import React from 'react';
import LeadTaskBadge from './LeadTaskBadge';

export default function TaskAccessBadges({
  leadTask,
  acceptanceStatus,
  createdByName,
  viewOnly,
}: {
  leadTask?: boolean;
  acceptanceStatus?: 'REQUESTED' | 'ACCEPTED' | 'REJECTED';
  createdByName?: string;
  viewOnly?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {leadTask ? <LeadTaskBadge /> : null}
      {acceptanceStatus === 'REQUESTED' ? (
        <span className="task-access-badge task-access-badge-pending">Pending Acceptance</span>
      ) : null}
      {acceptanceStatus === 'ACCEPTED' ? (
        <span className="task-access-badge task-access-badge-accepted">Accepted</span>
      ) : null}
      {createdByName ? (
        <span className="task-access-badge task-access-badge-creator">Created by {createdByName}</span>
      ) : null}
      {viewOnly ? (
        <span className="task-access-badge task-access-badge-pending">View Only</span>
      ) : null}
    </div>
  );
}
