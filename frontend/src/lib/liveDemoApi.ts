import { apiRequest } from './api';
import { LiveDemonstration, LiveDemonstrationPayload, Lead } from './types';

export const LiveDemoApi = {
  async get(leadId: string) {
    return apiRequest<LiveDemonstrationPayload & { lead: Lead }>(`/api/live-demonstrations/lead/${leadId}`);
  },
  async list(params?: Record<string, string>) {
    const query = new URLSearchParams(params || {}).toString();
    return apiRequest<{
      pending: number;
      requests?: number;
      waitingForReview?: number;
      pendingCustomer?: number;
      pendingInternal?: number;
      pendingBoth?: number;
      scheduledToday: number;
      inProgress?: number;
      completed: number;
      caseReferencePending: number;
      verificationPending: number;
      procurementUnlocked: number;
      items: Array<LiveDemonstration & { lead_number?: string; lead_title?: string; customer_name?: string; procurement_unlocked?: boolean }>;
    }>(`/api/live-demonstrations${query ? `?${query}` : ''}`);
  },
  async summary() {
    return apiRequest<{
      pending: number;
      requests?: number;
      waitingForReview?: number;
      pendingCustomer?: number;
      pendingInternal?: number;
      pendingBoth?: number;
      scheduledToday: number;
      inProgress?: number;
      completed: number;
      caseReferencePending: number;
      verificationPending: number;
      procurementUnlocked: number;
    }>('/api/live-demonstrations/summary');
  },
  async eligibleLeads() {
    return apiRequest<{
      leads: Array<{
        id: string;
        lead_number: string;
        title: string;
        customer_name: string;
        customer_contact?: string;
        sales_owner?: string;
        current_owner_name?: string;
        lead_owner?: string;
        status: string;
        required_solution?: string;
      }>;
    }>('/api/live-demonstrations/eligible-leads');
  },
  async request(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/request`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async review(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/review`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async assign(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/assign`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async pending(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/pending`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async resolvePending(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/resolve-pending`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async schedule(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demonstration?: LiveDemonstration; demo: LiveDemonstration }>(
      `/api/live-demonstrations/lead/${leadId}/schedule`,
      { method: 'POST', body: JSON.stringify(body) }
    );
  },
  async update(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  async checklist(leadId: string, checklist: unknown) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/checklist`, {
      method: 'POST',
      body: JSON.stringify({ checklist }),
    });
  },
  async start(leadId: string) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  },
  async complete(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/complete`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async saveReference(leadId: string, live_case_reference: string) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/reference`, {
      method: 'POST',
      body: JSON.stringify({ live_case_reference }),
    });
  },
  async verify(leadId: string, body: Record<string, unknown> = {}) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/verify`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async cancel(leadId: string, reason: string) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  async followUp(leadId: string, body: Record<string, unknown>) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(`/api/live-demonstrations/lead/${leadId}/follow-up`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async proceedProcurement(leadId: string) {
    return apiRequest<{ lead: Lead; demo: LiveDemonstration }>(
      `/api/live-demonstrations/lead/${leadId}/proceed-procurement`,
      { method: 'POST', body: JSON.stringify({}) }
    );
  },
};
