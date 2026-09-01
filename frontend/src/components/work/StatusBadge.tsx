'use client';

import React from 'react';
import { sheetStatusClass } from '@/lib/dailyStatus';

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${sheetStatusClass(status)}`}>
      {status}
    </span>
  );
}
