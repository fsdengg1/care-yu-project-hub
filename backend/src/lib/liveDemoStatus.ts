import { LiveDemoPendingWith, LiveDemoStatus } from '../types.js';

export const LIVE_DEMO_STATUS_OPTIONS: Array<{ value: LiveDemoStatus; label: string }> = [
  { value: 'REQUESTED', label: 'Request' },
  { value: 'PENDING_CUSTOMER', label: 'Pending with Customer' },
  { value: 'PENDING_INTERNAL', label: 'Pending with Internal Team' },
  { value: 'PENDING_BOTH', label: 'Pending with Both' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CASE_REFERENCE_PENDING', label: 'Case Reference Pending' },
  { value: 'VERIFICATION_PENDING', label: 'Verification Pending' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const LABEL_BY_VALUE: Record<string, string> = Object.fromEntries(
  LIVE_DEMO_STATUS_OPTIONS.map((item) => [item.value, item.label])
);

export function liveDemoStatusLabel(status?: string) {
  if (!status) return '—';
  if (status === 'REQUEST') return 'Request';
  if (status === 'PENDING') return 'Pending';
  return LABEL_BY_VALUE[status] || status.replace(/_/g, ' ');
}

export function isLiveDemoPendingStatus(status?: string) {
  return status === 'PENDING' || status === 'PENDING_CUSTOMER' || status === 'PENDING_INTERNAL' || status === 'PENDING_BOTH';
}

export function pendingWithForStatus(status: string): LiveDemoPendingWith {
  if (status === 'PENDING_CUSTOMER') return 'CUSTOMER';
  if (status === 'PENDING_INTERNAL') return 'INTERNAL';
  if (status === 'PENDING_BOTH') return 'BOTH';
  return 'NONE';
}

export function formStatusValue(status?: string, pendingWith?: string) {
  if (status === 'REQUEST') return 'REQUESTED';
  if (status === 'PENDING' || status === 'WAITING') {
    if (pendingWith === 'INTERNAL') return 'PENDING_INTERNAL';
    if (pendingWith === 'BOTH') return 'PENDING_BOTH';
    if (pendingWith === 'CUSTOMER') return 'PENDING_CUSTOMER';
    return 'PENDING_CUSTOMER';
  }
  return status || 'REQUESTED';
}

export function parseLiveDemoFormStatus(value: unknown): LiveDemoStatus | undefined {
  const raw = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[/\s-]+/g, '_')
    .replace(/_+/g, '_');
  if (!raw) return undefined;
  if (raw === 'REQUEST' || raw === 'REQUESTED') return 'REQUESTED';
  if (raw === 'PENDING_WITH_CUSTOMER' || raw === 'PENDING_CUSTOMER' || raw === 'CUSTOMER_PENDING') return 'PENDING_CUSTOMER';
  if (raw === 'PENDING_WITH_INTERNAL_TEAM' || raw === 'PENDING_INTERNAL' || raw === 'INTERNAL_PENDING' || raw === 'PENDING_WITH_CARE_YU') {
    return 'PENDING_INTERNAL';
  }
  if (raw === 'PENDING_WITH_BOTH' || raw === 'PENDING_BOTH' || raw === 'BOTH_PENDING') return 'PENDING_BOTH';
  if (raw === 'PENDING') return 'PENDING';
  const allowed = LIVE_DEMO_STATUS_OPTIONS.map((item) => item.value);
  if (allowed.includes(raw as LiveDemoStatus)) return raw as LiveDemoStatus;
  if (raw === 'RESCHEDULED') return 'RESCHEDULED';
  if (raw === 'REJECTED') return 'REJECTED';
  if (raw === 'DEMONSTRATED') return 'DEMONSTRATED';
  if (raw === 'NOT_STARTED' || raw === 'WAITING') return raw as LiveDemoStatus;
  return undefined;
}
