'use client';

import RoleDashboardGate from '@/components/dashboards/RoleDashboardGate';
import SalesDashboard from '@/components/dashboards/SalesDashboard';

export default function BusinessHeadDashboardPage() {
  return (
    <RoleDashboardGate expectedPath="/dashboard/business-head">
      {(user) => <SalesDashboard user={user} />}
    </RoleDashboardGate>
  );
}
