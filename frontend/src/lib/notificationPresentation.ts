import { NotificationItem } from './types';
import { messageTypeMeta } from './messageTypes';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH';

export type ToastActionKind = 'message' | 'task' | 'project' | 'announcement' | 'forum' | 'generic';

export interface NotificationPresentation {
  heading: string;
  source?: string;
  preview: string;
  detail?: string;
  actionLabel: string;
  priority: NotificationPriority;
  kind: ToastActionKind;
  messageType?: NotificationItem['message_type'];
}

export const NOTIFICATIONS_CHANGED_EVENT = 'careyu:notifications-changed';

export function emitNotificationsChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
}

const HIGH_TYPES = new Set<NotificationItem['type']>([
  'CRITICAL_ESCALATION',
  'PROJECT_AT_RISK',
  'DAILY_UPDATE_BLOCKED',
  'CRITICAL_DIRECT_ASSIGNMENT_TO_EMPLOYEE',
  'CRITICAL_ASSIGNMENT_TEAM_LEAD_NOTICE',
  'BLOCKER',
  'FORUM_PINNED',
]);

function preview(text: string, max = 90) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3).trimEnd()}...`;
}

export function notificationPriority(item: NotificationItem): NotificationPriority {
  if (HIGH_TYPES.has(item.type)) return 'HIGH';
  return 'NORMAL';
}

export function toastDurationMs(priority: NotificationPriority) {
  if (priority === 'HIGH') return 8000;
  if (priority === 'LOW') return 5000;
  return 6000;
}

export function notificationPresentation(item: NotificationItem): NotificationPresentation {
  const priority = notificationPriority(item);
  const body = preview(item.message);
  const chatMeta = messageTypeMeta(item.message_type);
  const isChat =
    item.type === 'DIRECT_MESSAGE' ||
    item.type === 'CHAT_MESSAGE' ||
    item.type === 'GROUP_MESSAGE' ||
    item.type === 'ANNOUNCEMENT';

  if (isChat) {
    const source =
      item.type === 'DIRECT_MESSAGE' || item.type === 'CHAT_MESSAGE'
        ? item.title.replace(/^New message from\s+/i, '').trim()
        : item.title;
    const actionLabel =
      item.type === 'ANNOUNCEMENT'
        ? item.message_type && item.message_type !== 'TEXT'
          ? chatMeta.actionLabel
          : 'View Announcement'
        : chatMeta.actionLabel;
    const heading =
      item.type === 'ANNOUNCEMENT' && (!item.message_type || item.message_type === 'TEXT')
        ? 'Announcement'
        : chatMeta.heading;
    return {
      heading,
      source: source || undefined,
      preview: body,
      actionLabel,
      priority,
      kind: item.type === 'ANNOUNCEMENT' ? 'announcement' : 'message',
      messageType: item.message_type,
    };
  }
  if (item.type === 'TASK_ASSIGNED') {
    const quoted = item.message.match(/"([^"]+)"/);
    const who = item.message.replace(/\s+assigned.*$/i, '').trim();
    return {
      heading: 'New Task Assigned',
      source: who ? `${who} assigned you a new task` : item.title,
      preview: quoted?.[1] || body,
      actionLabel: 'View Task',
      priority,
      kind: 'task',
    };
  }
  if (item.type === 'LIVE_DEMO') {
    return {
      heading: 'LIVE Case Demonstration',
      source: item.title,
      preview: body,
      actionLabel: 'View Lead',
      priority,
      kind: 'project',
    };
  }
  if (item.type === 'STAGE_COMPLETED') {
    const [stagePart, projectPart] = item.title.split(/\s+[–—-]\s+/);
    const who = item.message.match(/^(.*?)\s+completed/i)?.[1];
    return {
      heading: 'Stage Completed',
      source: stagePart || item.title,
      preview: projectPart || body,
      detail: who ? `Completed by ${who}` : undefined,
      actionLabel: item.entity_type === 'LEAD' ? 'View Lead' : 'View Project',
      priority,
      kind: 'project',
    };
  }
  if (item.type === 'DOCUMENT_ADDED') {
    return {
      heading: 'Document Uploaded',
      source: item.title,
      preview: body,
      actionLabel: 'View',
      priority,
      kind: 'generic',
    };
  }
  if (item.type === 'FORUM_POST') {
    return {
      heading: 'New Forum Thread',
      source: item.title,
      preview: body,
      actionLabel: 'View Thread',
      priority,
      kind: 'forum',
    };
  }
  if (item.type === 'FORUM_REPLY') {
    return {
      heading: 'Forum Reply',
      source: item.title,
      preview: body,
      actionLabel: 'View Thread',
      priority,
      kind: 'forum',
    };
  }
  if (item.type === 'FORUM_MENTION') {
    return {
      heading: 'You were mentioned',
      source: item.title,
      preview: body,
      actionLabel: 'View Thread',
      priority,
      kind: 'forum',
    };
  }
  if (item.type === 'FORUM_REACTION') {
    return {
      heading: 'Forum Reaction',
      source: item.title,
      preview: body,
      actionLabel: 'View Thread',
      priority,
      kind: 'forum',
    };
  }
  if (item.type === 'FORUM_PINNED') {
    return {
      heading: 'Pinned Thread',
      source: item.title,
      preview: body,
      actionLabel: 'View Thread',
      priority,
      kind: 'forum',
    };
  }
  return {
    heading: item.title || 'Notification',
    preview: body,
    actionLabel: 'View',
    priority,
    kind: 'generic',
  };
}

const shownKey = (userId: string) => `careyu-toast-shown-v1:${userId}`;

export function loadShownToastIds(userId: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(shownKey(userId));
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveShownToastIds(userId: string, ids: Set<string>) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(shownKey(userId), JSON.stringify([...ids]));
}

export function clearShownToastIds(userId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(shownKey(userId));
}
