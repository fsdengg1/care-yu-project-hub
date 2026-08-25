import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link2,
  Presentation,
  type LucideIcon,
} from 'lucide-react';
import { ForumCategory, ForumReactionKind, ForumThreadKind } from './types';

export const FORUM_CATEGORY_OPTIONS: Array<{ value: ForumCategory; label: string }> = [
  { value: 'GENERAL', label: 'General' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'PROJECT_DISCUSSION', label: 'Project Discussion' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'FEEDBACK', label: 'Feedback' },
  { value: 'IDEAS', label: 'Ideas' },
  { value: 'OTHER', label: 'Other' },
];

export const FORUM_REACTION_OPTIONS: Array<{ kind: ForumReactionKind; emoji: string; label: string }> = [
  { kind: 'LIKE', emoji: '👍', label: 'Like' },
  { kind: 'LOVE', emoji: '❤️', label: 'Love' },
  { kind: 'CHECK', emoji: '✅', label: 'Done' },
  { kind: 'CLAP', emoji: '👏', label: 'Clap' },
  { kind: 'CELEBRATE', emoji: '🎉', label: 'Celebrate' },
];

export const FORUM_EMOJI_CHOICES = ['👍', '❤️', '✅', '👏', '🎉', '😊', '🙌', '💡', '🔥', '📌', '❓', '✅'];

export const FORUM_THREAD_KIND_OPTIONS: Array<{
  value: ForumThreadKind;
  label: string;
  hint: string;
}> = [
  { value: 'DISCUSSION', label: 'Discussion', hint: 'Post a message or start a conversation' },
  { value: 'QUESTION', label: 'Question', hint: 'Ask the team — they can reply anytime' },
  { value: 'IDEA', label: 'Idea', hint: 'Share an idea for the team to consider' },
];

export function forumThreadKind(value?: string): ForumThreadKind {
  if (value === 'QUESTION' || value === 'IDEA' || value === 'DISCUSSION') return value;
  return 'DISCUSSION';
}

export function forumThreadKindLabel(value?: string) {
  return FORUM_THREAD_KIND_OPTIONS.find((item) => item.value === forumThreadKind(value))?.label || 'Discussion';
}

export function forumCategoryLabel(value?: string) {
  return FORUM_CATEGORY_OPTIONS.find((item) => item.value === value)?.label || value || 'General';
}

export function formatForumDate(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatForumDateLong(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function forumFileKind(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) return 'IMAGE';
  if (ext === 'pdf') return 'PDF';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'EXCEL';
  if (['ppt', 'pptx'].includes(ext)) return 'POWERPOINT';
  if (['doc', 'docx'].includes(ext)) return 'WORD';
  if (ext === 'txt') return 'TEXT';
  return 'DOCUMENT';
}

export function forumFileLabel(name: string, fileType?: string) {
  const kind = forumFileKind(name);
  if (kind === 'IMAGE') return 'Image';
  if (kind === 'PDF') return 'PDF';
  if (kind === 'EXCEL') return name.toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel';
  if (kind === 'POWERPOINT') return 'PowerPoint';
  if (kind === 'WORD') return 'Word';
  if (kind === 'TEXT') return 'TXT';
  return fileType || 'Document';
}

export function forumFileIcon(name: string): { Icon: LucideIcon; className: string } {
  const kind = forumFileKind(name);
  if (kind === 'IMAGE') return { Icon: ImageIcon, className: 'text-violet-400' };
  if (kind === 'PDF') return { Icon: FileText, className: 'text-rose-300' };
  if (kind === 'EXCEL') return { Icon: FileSpreadsheet, className: 'text-emerald-400' };
  if (kind === 'POWERPOINT') return { Icon: Presentation, className: 'text-amber-400' };
  if (kind === 'WORD') return { Icon: FileText, className: 'text-blue-300' };
  if (name.startsWith('http')) return { Icon: Link2, className: 'text-sky-400' };
  return { Icon: FileText, className: 'text-slate-300' };
}

export function stripHtml(value: string) {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
