import { apiRequest } from './api';
import {
  CompareItem,
  DailyStatusKpis,
  DailyStatusPerson,
  DailyStatusRow,
  SnapshotPeriod,
} from './dailyStatus';

export const DailyStatusApi = {
  async sheet() {
    const result = await apiRequest<{
      rows: DailyStatusRow[];
      kpis: DailyStatusKpis;
      people: DailyStatusPerson[];
      projects: Array<{ id: string; name: string; code: string }>;
    }>('/api/daily-status/sheet');
    if (!result.ok) {
      return {
        ok: false as const,
        message: result.message,
        rows: [] as DailyStatusRow[],
        kpis: null as DailyStatusKpis | null,
        people: [] as DailyStatusPerson[],
        projects: [] as Array<{ id: string; name: string; code: string }>,
      };
    }
    return { ok: true as const, ...result.data };
  },

  async snapshot(period: SnapshotPeriod, date?: string) {
    return apiRequest<{ message: string; rows: DailyStatusRow[]; date: string; period: SnapshotPeriod }>(
      '/api/daily-status/snapshot',
      { method: 'POST', body: JSON.stringify({ period, date }) }
    );
  },

  async compare(date?: string) {
    const query = date ? `?date=${encodeURIComponent(date)}` : '';
    return apiRequest<{ items: CompareItem[]; available: boolean; date: string; message?: string }>(
      `/api/daily-status/compare${query}`
    );
  },

  async emailPreview(period: SnapshotPeriod, date?: string) {
    const params = new URLSearchParams({ period });
    if (date) params.set('date', date);
    return apiRequest<{
      available: boolean;
      message?: string;
      html: string;
      subject?: string;
      rows: DailyStatusRow[];
      period: SnapshotPeriod;
      date: string;
      source?: string;
    }>(`/api/daily-status/email-preview?${params.toString()}`);
  },

  async emailSend(period: SnapshotPeriod, toEmail?: string, date?: string) {
    return apiRequest<{ message: string; html: string; subject: string; rows: DailyStatusRow[] }>(
      '/api/daily-status/email-send',
      { method: 'POST', body: JSON.stringify({ period, toEmail, date }) }
    );
  },

  async emailRestore() {
    return apiRequest<{ html: string; subject: string; date?: string; period?: SnapshotPeriod; rows?: DailyStatusRow[] }>(
      '/api/daily-status/email-restore'
    );
  },

  async updateRow(id: string, body: Record<string, unknown>) {
    return apiRequest<{ task: { id: string }; rows: DailyStatusRow[] }>(`/api/daily-status/rows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
};
