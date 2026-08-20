'use client';

import RoleDashboardGate from '@/components/dashboards/RoleDashboardGate';
import EngineeringDashboard from '@/components/dashboards/EngineeringDashboard';

export default function EngineeringDashboardPage() {
  return (
    <RoleDashboardGate expectedPath="/dashboard/engineering">
      {(user) => <EngineeringDashboard user={user} />}
    </RoleDashboardGate>
  );
}
