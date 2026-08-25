'use client';

import React, { useEffect, useState } from 'react';
import { Download, Eye, X } from 'lucide-react';
import { DocumentsApi } from '@/lib/documentsApi';
import { formatRelativeTime } from '@/lib/format';
import { messageTypeMeta } from '@/lib/messageTypes';
import { ChatMessage, User } from '@/lib/types';

function isSafeHttpUrl(value?: string) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function MessageBubble({
  item,
  currentUser,
}: {
  item: ChatMessage;
  currentUser: User;
}) {
  const mine = item.sender_id === currentUser.id;
  const meta = messageTypeMeta(item.message_type);
  const Icon = meta.Icon;
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item.attachment_id || item.message_type !== 'IMAGE') return;
    let cancelled = false;
    void DocumentsApi.file(item.attachment_id).then((result) => {
      if (cancelled) return;
      if (result.ok && result.data.document.file_url) setFileUrl(result.data.document.file_url);
    });
    return () => {
      cancelled = true;
    };
  }, [item.attachment_id, item.message_type]);

  const openFile = async (download = false) => {
    if (!item.attachment_id) return;
    const result = await DocumentsApi.file(item.attachment_id);
    if (!result.ok || !result.data.document.file_url) {
      setError(result.ok ? 'File is not available.' : result.message);
      return;
    }
    const url = result.data.document.file_url;
    if (!download && item.message_type === 'IMAGE') {
      setFileUrl(url);
      setLightbox(true);
      return;
    }
    const link = document.createElement('a');
    link.href = url;
    if (download) link.download = item.file_name || 'download';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${mine ? 'ml-auto bg-cyan-700 text-white' : 'bg-slate-800 text-slate-100'}`}>
        <div className="flex items-center gap-1 text-[10px] opacity-80">
          <Icon className="h-3 w-3" />
          <span>{item.sender_name} • {formatRelativeTime(item.created_at)}</span>
        </div>
        {item.message_type === 'NOTE' && (
          <div className={`mt-1.5 rounded-md border px-2 py-2 ${mine ? 'border-cyan-500/40 bg-cyan-800/60' : 'border-amber-800 bg-amber-950/30'}`}>
            <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-80">
              <Icon className="h-3 w-3" /> Note
            </div>
            <div className="whitespace-pre-wrap">{item.message}</div>
          </div>
        )}
        {item.message_type === 'LINK' && isSafeHttpUrl(item.link_url || item.message) && (
          <a
            href={item.link_url || item.message}
            target="_blank"
            rel="noopener noreferrer"
            className={`mt-1.5 block break-all underline ${mine ? 'text-white' : 'text-cyan-300'}`}
          >
            {item.message && item.message !== item.link_url ? item.message : item.link_url}
          </a>
        )}
        {item.message_type === 'IMAGE' && (
          <button type="button" onClick={() => void openFile()} className="mt-1.5 block overflow-hidden rounded-md">
            {fileUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileUrl} alt={item.file_name || 'Image'} className="max-h-48 max-w-full rounded-md object-cover" />
            ) : (
              <div className="flex h-24 w-40 items-center justify-center rounded-md bg-black/20 text-[11px]">{item.file_name || 'Image'}</div>
            )}
            <div className="mt-1 truncate text-[11px] opacity-80">{item.file_name}</div>
          </button>
        )}
        {item.attachment_id && item.message_type !== 'IMAGE' && item.message_type !== 'TEXT' && item.message_type !== 'LINK' && item.message_type !== 'NOTE' && (
          <div className={`mt-1.5 rounded-md border p-2 ${mine ? 'border-cyan-500/40 bg-cyan-800/50' : 'border-slate-700 bg-slate-900/70'}`}>
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{item.file_name || meta.listLabel}</div>
                <div className="text-[10px] opacity-80">{meta.listLabel}{item.file_size ? ` · ${item.file_size}` : ''}</div>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => void openFile()} className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-[10px] font-bold">
                <Eye className="h-3 w-3" /> Open
              </button>
              <button type="button" onClick={() => void openFile(true)} className="inline-flex items-center gap-1 rounded border border-white/20 px-2 py-1 text-[10px] font-bold">
                <Download className="h-3 w-3" /> Download
              </button>
            </div>
          </div>
        )}
        {(!item.message_type || item.message_type === 'TEXT') && item.message && (
          <div className="mt-1 whitespace-pre-wrap">{item.message}</div>
        )}
        {error && <div className="mt-1 text-[10px] text-rose-200">{error}</div>}
      </div>
      {lightbox && fileUrl && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => setLightbox(false)}>
          <button type="button" className="absolute right-4 top-4 rounded bg-slate-900 p-1 text-slate-200" aria-label="Close preview">
            <X className="h-4 w-4" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={fileUrl} alt={item.file_name || 'Image'} className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" />
        </div>
      )}
    </>
  );
}
