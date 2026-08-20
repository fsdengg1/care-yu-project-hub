export function formatInrCompact(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '₹ 0';
  if (value >= 10000000) {
    const cr = value / 10000000;
    return `₹ ${cr.toFixed(cr >= 10 ? 0 : 2).replace(/\.00$/, '')} Cr`;
  }
  if (value >= 100000) {
    const lakh = value / 100000;
    return `₹ ${lakh.toFixed(lakh >= 10 ? 0 : 0)}L`;
  }
  return `₹ ${value.toLocaleString('en-IN')}`;
}

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function formatClock(iso: string): string {
  const date = new Date(iso);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (date >= startOfToday) {
    return date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  const yesterday = new Date(startOfToday);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= yesterday) return 'Yesterday';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  PROJECT_INPUT: 'Project Input',
  PM_REVIEW: 'PM Review',
  FEASIBILITY: 'Feasibility',
  COSTING: 'Costing',
  QUOTATION: 'Quotation',
  NEGOTIATION: 'Negotiation',
  CONVERTED: 'Converted',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};
