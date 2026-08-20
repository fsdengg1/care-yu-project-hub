'use client';

import RoleDashboardGate from '@/components/dashboards/RoleDashboardGate';
import TeamLeadDashboard from '@/components/dashboards/TeamLeadDashboard';

export default function TeamLeadDashboardPage() {
  return (
    <RoleDashboardGate expectedPath="/dashboard/team-lead">
      {(user) => <TeamLeadDashboard user={user} />}
    </RoleDashboardGate>
  );
}
