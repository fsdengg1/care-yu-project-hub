'use client';

import RoleDashboardGate from '@/components/dashboards/RoleDashboardGate';
import CEODashboard from '@/components/dashboards/CEODashboard';

export default function CEODashboardPage() {
  return (
    <RoleDashboardGate expectedPath="/dashboard/ceo">
      {(user) => <CEODashboard user={user} />}
    </RoleDashboardGate>
  );
}
