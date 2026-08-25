import { env } from '../config/env.js';
import { brandedEmailLayout } from './authEmails.js';
import { formatDateTime } from './responsibility.js';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function detailLines(rows: Array<[string, string]>) {
  return rows
    .filter(([, value]) => Boolean(value && value !== '—'))
    .map(([label, value]) => `<strong>${escapeHtml(label)}:</strong><br/>${escapeHtml(value)}`)
    .join('<br/><br/>');
}

function textDetails(rows: Array<[string, string]>) {
  return rows
    .filter(([, value]) => Boolean(value && value !== '—'))
    .map(([label, value]) => `${label}:\n${value}`)
    .join('\n\n');
}

export function workflowEmailContent(params: {
  title: string;
  greeting: string;
  intro: string;
  details: Array<[string, string]>;
  ctaLabel: string;
  ctaUrl: string;
  closing?: string;
}) {
  const detailsHtml = detailLines(params.details);
  const paragraphs = [
    escapeHtml(params.intro),
    detailsHtml,
    escapeHtml(params.closing || 'Please review and take the required action.'),
  ];
  const content = brandedEmailLayout({
    title: params.title,
    preheader: params.intro,
    greeting: escapeHtml(params.greeting),
    paragraphs,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
    footerNote: 'Regards,<br/>CareYu Automation<br/>Project Management System',
  });
  const text = [
    params.title,
    '',
    params.greeting,
    '',
    params.intro,
    '',
    textDetails(params.details),
    '',
    params.closing || 'Please review and take the required action.',
    '',
    `${params.ctaLabel}: ${params.ctaUrl}`,
    '',
    'Regards,',
    'CareYu Automation',
    'Project Management System',
  ].join('\n');
  return { html: content.html, text };
}

export function absoluteAppUrl(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${env.frontendUrl}${normalized}`;
}

export function assignmentEmail(params: {
  recipientName: string;
  itemName: string;
  createdBy: string;
  priority?: string;
  createdOn?: string;
  actionUrl: string;
  entityLabel?: string;
}) {
  const entity = params.entityLabel || 'Lead';
  return {
    subject: `New ${entity} Assigned – ${params.itemName}`,
    ...workflowEmailContent({
      title: `New ${entity} Assigned to You`,
      greeting: `Hello ${params.recipientName},`,
      intro: `A new ${entity.toLowerCase()} has been assigned to you in the CareYu Project Management System.`,
      details: [
        [entity, params.itemName],
        ['Created By', params.createdBy],
        ['Priority', params.priority || ''],
        ['Created On', formatDateTime(params.createdOn)],
      ],
      ctaLabel: `View ${entity}`,
      ctaUrl: absoluteAppUrl(params.actionUrl),
    }),
  };
}

export function forwardEmail(params: {
  recipientName: string;
  itemName: string;
  previousName: string;
  currentName: string;
  forwardedBy: string;
  reason?: string;
  actionUrl: string;
  entityLabel?: string;
}) {
  const entity = params.entityLabel || 'Lead';
  return {
    subject: `${entity} Forwarded to You – ${params.itemName}`,
    ...workflowEmailContent({
      title: `${entity} Forwarded to You`,
      greeting: `Hello ${params.recipientName},`,
      intro: `The following ${entity.toLowerCase()} has been forwarded to you by ${params.forwardedBy}.`,
      details: [
        [entity, params.itemName],
        ['Previous Responsible Person', params.previousName],
        ['Current Responsible Person', params.currentName],
        ['Reason', params.reason || 'Not specified'],
      ],
      ctaLabel: `View ${entity}`,
      ctaUrl: absoluteAppUrl(params.actionUrl),
    }),
  };
}

export function acceptedEmail(params: {
  recipientName: string;
  itemName: string;
  acceptedBy: string;
  actionUrl: string;
}) {
  return {
    subject: `Lead Accepted – ${params.itemName}`,
    ...workflowEmailContent({
      title: 'Lead Accepted',
      greeting: `Hello ${params.recipientName},`,
      intro: `${params.acceptedBy} accepted the lead in the CareYu Project Management System.`,
      details: [
        ['Lead', params.itemName],
        ['Accepted By', params.acceptedBy],
      ],
      ctaLabel: 'View Lead',
      ctaUrl: absoluteAppUrl(params.actionUrl),
    }),
  };
}

export function reminderEmail(params: {
  recipientName: string;
  itemName: string;
  stage?: string;
  assignedOn?: string;
  status?: string;
  actionUrl: string;
  entityLabel?: string;
}) {
  const entity = params.entityLabel || 'Lead';
  return {
    subject: `Reminder: Action Required – ${params.itemName}`,
    ...workflowEmailContent({
      title: 'Action Required',
      greeting: `Hello ${params.recipientName},`,
      intro: 'This is a reminder that the following item is still pending with you.',
      details: [
        ['Item', params.itemName],
        ['Current Stage', params.stage || ''],
        ['Assigned On', formatDateTime(params.assignedOn)],
        ['Current Status', params.status || ''],
      ],
      ctaLabel: `View ${entity}`,
      ctaUrl: absoluteAppUrl(params.actionUrl),
    }),
  };
}

export function escalationEmail(params: {
  recipientName: string;
  employeeName: string;
  itemName: string;
  assignedOn?: string;
  stage?: string;
  reminderCount: number;
  actionUrl: string;
  entityLabel?: string;
}) {
  const entity = params.entityLabel || 'Task';
  return {
    subject: `Escalation: Pending Action – ${params.itemName}`,
    ...workflowEmailContent({
      title: 'Escalation Required',
      greeting: `Hello ${params.recipientName},`,
      intro: `The following ${entity.toLowerCase()} has remained pending with ${params.employeeName}.`,
      details: [
        [entity, params.itemName],
        ['Assigned On', formatDateTime(params.assignedOn)],
        ['Current Stage', params.stage || ''],
        ['Reminder Count', String(params.reminderCount)],
      ],
      ctaLabel: `View ${entity}`,
      ctaUrl: absoluteAppUrl(params.actionUrl),
      closing: 'Please review and take appropriate action.',
    }),
  };
}

export function digestEmail(params: {
  recipientName: string;
  newCount: number;
  pendingCount: number;
  overdueCount: number;
}) {
  return {
    subject: 'CareYu Daily Work Summary',
    ...workflowEmailContent({
      title: 'CareYu Daily Work Summary',
      greeting: `Hello ${params.recipientName},`,
      intro: `You have ${params.pendingCount} pending action${params.pendingCount === 1 ? '' : 's'} today.`,
      details: [
        ['New', String(params.newCount)],
        ['Pending', String(params.pendingCount)],
        ['Overdue', String(params.overdueCount)],
      ],
      ctaLabel: 'Open Dashboard',
      ctaUrl: absoluteAppUrl('/dashboard'),
      closing: 'Open the dashboard to review and complete your assigned work.',
    }),
  };
}
