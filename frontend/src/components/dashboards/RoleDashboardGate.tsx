'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { User } from '@/lib/types';
import { StorageService } from '@/lib/storage';
import { getDashboardPath } from '@/lib/auth';

export default function RoleDashboardGate({
  expectedPath,
  children,
}: {
  expectedPath: string;
  children: (user: User) => React.ReactNode;
}) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const current = StorageService.getCurrentUser();
    if (!current) {
      router.replace('/login');
      return;
    }
    const path = getDashboardPath(current.role_code);
    if (path !== expectedPath) {
      router.replace(path);
      return;
    }
    setUser(current);
  }, [expectedPath, router]);

  if (!user) return null;
  return <>{children(user)}</>;
}
