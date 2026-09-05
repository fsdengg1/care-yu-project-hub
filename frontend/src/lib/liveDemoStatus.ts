export const LIVE_DEMO_STATUS_OPTIONS = [
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
] as const;

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

export function pendingWithForStatus(status: string) {
  if (status === 'PENDING_CUSTOMER') return 'CUSTOMER';
  if (status === 'PENDING_INTERNAL') return 'INTERNAL';
  if (status === 'PENDING_BOTH') return 'BOTH';
  return 'NONE';
}
