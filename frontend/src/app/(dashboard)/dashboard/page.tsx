'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StorageService } from '@/lib/storage';
import { getDashboardPath } from '@/lib/auth';
import { User } from '@/lib/types';
import CEODashboard from '@/components/dashboards/CEODashboard';
import SalesDashboard from '@/components/dashboards/SalesDashboard';
import ProcurementDashboard from '@/components/dashboards/ProcurementDashboard';

export default function DashboardDispatcherPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const user = StorageService.getCurrentUser();
    if (!user) {
      router.replace('/login');
      return;
    }
    const path = getDashboardPath(user.role_code);
    if (path !== '/dashboard') {
      router.replace(path);
      return;
    }
    setCurrentUser(user);
  }, [router]);

  if (!currentUser) return null;

  switch (currentUser.role_code) {
    case 'SALES':
      return <SalesDashboard user={currentUser} />;
    case 'PROCUREMENT':
      return <ProcurementDashboard user={currentUser} />;
    default:
      return <CEODashboard user={currentUser} />;
  }
}
