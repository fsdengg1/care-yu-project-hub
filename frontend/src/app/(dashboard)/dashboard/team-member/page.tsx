'use client';

import RoleDashboardGate from '@/components/dashboards/RoleDashboardGate';
import EmployeeDashboard from '@/components/dashboards/EmployeeDashboard';

export default function TeamMemberDashboardPage() {
  return (
    <RoleDashboardGate expectedPath="/dashboard/team-member">
      {(user) => <EmployeeDashboard user={user} />}
    </RoleDashboardGate>
  );
}
