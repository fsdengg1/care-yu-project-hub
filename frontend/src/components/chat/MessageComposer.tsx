'use client';

import React, { useRef, useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link2,
  Paperclip,
  Presentation,
  Send,
  StickyNote,
} from 'lucide-react';
import { ChatApi } from '@/lib/chatApi';
import { ACCEPT_FILE_INPUT, fileTypeError, formatFileSize, isAllowedFileType, MAX_FILE_SIZE } from '@/lib/fileConfig';
import { ChatMessage, ChatMessageType, ConversationType } from '@/lib/types';

function readFile(file: File, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 90));
    };
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function fileKind(name: string): ChatMessageType {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return 'IMAGE';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'EXCEL';
  if (ext === 'ppt' || ext === 'pptx') return 'POWERPOINT';
  if (ext === 'doc' || ext === 'docx') return 'WORD';
  return 'DOCUMENT';
}

export default function MessageComposer({
  conversationId,
  expectedType,
  allowAttachments = true,
  onSent,
  onError,
}: {
  conversationId: string;
  expectedType: ConversationType;
  allowAttachments?: boolean;
  onSent: (message: ChatMessage) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const [accept, setAccept] = useState(ACCEPT_FILE_INPUT);
  const [forcedType, setForcedType] = useState<ChatMessageType | undefined>();
  const [linkOpen, setLinkOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ title: '', url: '' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ name: string; pct: number; status: string } | null>(null);

  const sendText = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    const result = await ChatApi.send(conversationId, { message: draft.trim(), message_type: 'TEXT' });
    setBusy(false);
    if (!result.ok || result.data.conversation.type !== expectedType) {
      onError(result.ok ? 'Message was not saved in this section.' : result.message);
      return;
    }
    setDraft('');
    onSent(result.data.message);
  };

  const sendLink = async () => {
    const result = await ChatApi.send(conversationId, {
      message: linkForm.title.trim() || linkForm.url.trim(),
      link_url: linkForm.url.trim(),
      message_type: 'LINK',
    });
    if (!result.ok || result.data.conversation.type !== expectedType) {
      onError(result.ok ? 'Link was not saved in this section.' : result.message);
      return;
    }
    setLinkOpen(false);
    setLinkForm({ title: '', url: '' });
    onSent(result.data.message);
  };

  const sendNote = async () => {
    if (!note.trim()) return;
    const result = await ChatApi.send(conversationId, { message: note.trim(), message_type: 'NOTE' });
    if (!result.ok || result.data.conversation.type !== expectedType) {
      onError(result.ok ? 'Note was not saved in this section.' : result.message);
      return;
    }
    setNoteOpen(false);
    setNote('');
    onSent(result.data.message);
  };

  const upload = async (file: File) => {
    if (!allowAttachments) {
      onError('You do not have permission to attach files here.');
      return;
    }
    if (!isAllowedFileType(file.name) || file.size > MAX_FILE_SIZE) {
      onError(fileTypeError());
      return;
    }
    setBusy(true);
    setProgress({ name: file.name, pct: 5, status: 'Uploading...' });
    try {
      const dataUrl = await readFile(file, (pct) => setProgress({ name: file.name, pct, status: 'Uploading...' }));
      setProgress({ name: file.name, pct: 95, status: 'Uploading...' });
      const result = await ChatApi.attach(conversationId, {
        file_name: file.name,
        original_file_name: file.name,
        file_type: fileKind(file.name),
        file_size: formatFileSize(file.size),
        file_url: dataUrl,
        mime_type: file.type,
        size_bytes: file.size,
        message_type: forcedType || fileKind(file.name),
      });
      if (!result.ok || result.data.conversation.type !== expectedType) {
        throw new Error(result.ok ? 'File was not saved in this section.' : result.message);
      }
      setProgress({ name: file.name, pct: 100, status: 'Uploaded' });
      onSent(result.data.message);
      window.setTimeout(() => setProgress(null), 800);
    } catch (err) {
      setProgress(null);
      onError(err instanceof Error ? err.message : fileTypeError());
    } finally {
      setBusy(false);
      setForcedType(undefined);
      setAccept(ACCEPT_FILE_INPUT);
    }
  };

  const pick = (kind: ChatMessageType, acceptValue: string) => {
    setForcedType(kind);
    setAccept(acceptValue);
    setMenu(false);
    window.setTimeout(() => fileRef.current?.click(), 0);
  };

  return (
    <div className="border-t border-slate-800 p-3">
      {progress && (
        <div className="mb-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-[11px] text-slate-300">
          <div className="flex justify-between">
            <span>{progress.status}</span>
            <span>{progress.name}</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div className="h-full bg-cyan-500" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      )}
      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void sendText();
        }}
      >
        {allowAttachments && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((open) => !open)}
              className="rounded-md border border-slate-800 p-2 text-slate-300 hover:bg-slate-800"
              aria-label="Attach"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            {menu && (
              <div className="absolute bottom-11 left-0 z-20 w-44 rounded-lg border border-slate-800 bg-slate-900 p-1 shadow-xl">
                <button type="button" onClick={() => pick('DOCUMENT', '.pdf,.doc,.docx,.txt')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
                  <FileText className="h-3.5 w-3.5" /> Document
                </button>
                <button type="button" onClick={() => pick('IMAGE', '.png,.jpg,.jpeg,.webp')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
                  <ImageIcon className="h-3.5 w-3.5" /> Image
                </button>
                <button type="button" onClick={() => pick('EXCEL', '.xls,.xlsx,.csv')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </button>
                <button type="button" onClick={() => pick('PDF', '.pdf')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
                  <FileText className="h-3.5 w-3.5 text-rose-300" /> PDF
                </button>
                <button type="button" onClick={() => pick('POWERPOINT', '.ppt,.pptx')} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
                  <Presentation className="h-3.5 w-3.5" /> PowerPoint
                </button>
                <button type="button" onClick={() => { setMenu(false); setLinkOpen(true); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
                  <Link2 className="h-3.5 w-3.5" /> Link
                </button>
                <button type="button" onClick={() => { setMenu(false); setNoteOpen(true); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-800">
                  <StickyNote className="h-3.5 w-3.5" /> Note
                </button>
              </div>
            )}
          </div>
        )}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100"
        />
        <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-cyan-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">
          <Send className="h-3.5 w-3.5" /> Send
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
            event.target.value = '';
          }}
        />
      </form>

      {linkOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs">
            <h3 className="text-sm font-bold text-slate-100">Send link</h3>
            <input value={linkForm.title} onChange={(event) => setLinkForm({ ...linkForm, title: event.target.value })} placeholder="Label (optional)" className="mt-3 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <input value={linkForm.url} onChange={(event) => setLinkForm({ ...linkForm, url: event.target.value })} placeholder="https://example.com" className="mt-2 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setLinkOpen(false)} className="rounded border border-slate-700 px-3 py-1.5">Cancel</button>
              <button type="button" onClick={() => void sendLink()} className="rounded bg-cyan-600 px-3 py-1.5 font-bold text-white">Send</button>
            </div>
          </div>
        </div>
      )}
      {noteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs">
            <h3 className="text-sm font-bold text-slate-100">Send note</h3>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Write a note..." className="mt-3 w-full rounded border border-slate-800 bg-slate-950 p-2 text-slate-100" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setNoteOpen(false)} className="rounded border border-slate-700 px-3 py-1.5">Cancel</button>
              <button type="button" onClick={() => void sendNote()} className="rounded bg-cyan-600 px-3 py-1.5 font-bold text-white">Send</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
