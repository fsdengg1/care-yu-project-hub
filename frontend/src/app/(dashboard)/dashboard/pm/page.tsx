'use client';

import RoleDashboardGate from '@/components/dashboards/RoleDashboardGate';
import PMDashboard from '@/components/dashboards/PMDashboard';

export default function PMDashboardPage() {
  return (
    <RoleDashboardGate expectedPath="/dashboard/pm">
      {(user) => <PMDashboard user={user} />}
    </RoleDashboardGate>
  );
}
