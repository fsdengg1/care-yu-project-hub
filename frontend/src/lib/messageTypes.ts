import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  Presentation,
  StickyNote,
  type LucideIcon,
} from 'lucide-react';
import { ChatMessage, ChatMessageType, NotificationItem } from './types';

export interface MessageTypeMeta {
  type: ChatMessageType;
  heading: string;
  actionLabel: string;
  listLabel: string;
  Icon: LucideIcon;
  iconClass: string;
}

const META: Record<ChatMessageType, MessageTypeMeta> = {
  TEXT: { type: 'TEXT', heading: 'New Message', actionLabel: 'View Message', listLabel: 'Message', Icon: MessageCircle, iconClass: 'text-cyan-400' },
  LINK: { type: 'LINK', heading: 'New Link', actionLabel: 'View Link', listLabel: 'Link', Icon: Link2, iconClass: 'text-sky-400' },
  IMAGE: { type: 'IMAGE', heading: 'New Image', actionLabel: 'View Image', listLabel: 'Image', Icon: ImageIcon, iconClass: 'text-violet-400' },
  DOCUMENT: { type: 'DOCUMENT', heading: 'New Document', actionLabel: 'Open Document', listLabel: 'Document', Icon: FileText, iconClass: 'text-slate-300' },
  PDF: { type: 'PDF', heading: 'New PDF', actionLabel: 'Open Document', listLabel: 'PDF Document', Icon: FileText, iconClass: 'text-rose-300' },
  EXCEL: { type: 'EXCEL', heading: 'New Excel File', actionLabel: 'View File', listLabel: 'Excel Spreadsheet', Icon: FileSpreadsheet, iconClass: 'text-emerald-400' },
  WORD: { type: 'WORD', heading: 'New Document', actionLabel: 'Open Document', listLabel: 'Word Document', Icon: FileText, iconClass: 'text-blue-300' },
  POWERPOINT: { type: 'POWERPOINT', heading: 'New Presentation', actionLabel: 'View File', listLabel: 'PowerPoint Presentation', Icon: Presentation, iconClass: 'text-amber-400' },
  NOTE: { type: 'NOTE', heading: 'New Note', actionLabel: 'View Message', listLabel: 'Note', Icon: StickyNote, iconClass: 'text-amber-300' },
  FILE: { type: 'FILE', heading: 'New Document', actionLabel: 'Open Document', listLabel: 'Document', Icon: FileText, iconClass: 'text-slate-300' },
};

export function messageTypeMeta(type?: ChatMessageType | string | null): MessageTypeMeta {
  if (type && type in META) return META[type as ChatMessageType];
  return META.TEXT;
}

export function previewForMessage(item: Pick<ChatMessage, 'message' | 'message_type' | 'file_name' | 'link_url'>) {
  const meta = messageTypeMeta(item.message_type);
  if (item.message_type === 'NOTE') return `Note: ${item.message}`;
  if (item.message_type === 'LINK') return item.link_url || item.message || 'Link';
  if (item.file_name) return item.file_name;
  if (item.message_type && item.message_type !== 'TEXT') return meta.listLabel;
  return item.message;
}

export function notificationMessageMeta(item: NotificationItem) {
  return messageTypeMeta(item.message_type);
}
