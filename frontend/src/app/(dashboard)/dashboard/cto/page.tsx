'use client';

import RoleDashboardGate from '@/components/dashboards/RoleDashboardGate';
import CTODashboard from '@/components/dashboards/CTODashboard';

export default function CTODashboardPage() {
  return (
    <RoleDashboardGate expectedPath="/dashboard/cto">
      {(user) => <CTODashboard user={user} />}
    </RoleDashboardGate>
  );
}
