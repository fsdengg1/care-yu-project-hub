'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Presentation,
  Trash2,
  Upload,
} from 'lucide-react';
import { DocumentsApi } from '@/lib/documentsApi';
import { ACCEPT_FILE_INPUT, ALLOWED_FILE_TYPES, fileTypeError, isAllowedFileType, MAX_FILE_SIZE } from '@/lib/fileConfig';
import { formatLongDate } from '@/lib/format';
import { EntityDocument } from '@/lib/types';

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function typeLabel(name: string) {
  const ext = extensionOf(name);
  if (ext === 'pdf') return 'PDF';
  if (ext === 'ppt' || ext === 'pptx') return 'PowerPoint';
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'Excel';
  if (ext === 'doc' || ext === 'docx') return 'Word';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') return 'Image';
  return 'Document';
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileGlyph({ name }: { name: string }) {
  const ext = extensionOf(name);
  if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return <FileSpreadsheet className="h-5 w-5 text-emerald-400" />;
  if (ext === 'ppt' || ext === 'pptx') return <Presentation className="h-5 w-5 text-amber-400" />;
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp') return <ImageIcon className="h-5 w-5 text-sky-400" />;
  return <FileText className="h-5 w-5 text-cyan-400" />;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function isImageName(name: string) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extensionOf(name));
}

export default function EntityDocumentUpload({
  entityType,
  entityId,
  canEdit,
  ensureEntity,
  title = 'Documents',
  listEntityTypes,
  compact = false,
}: {
  entityType: EntityDocument['entity_type'];
  entityId?: string;
  canEdit: boolean;
  ensureEntity: () => Promise<string | null>;
  title?: string;
  listEntityTypes?: EntityDocument['entity_type'][];
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [documents, setDocuments] = useState<EntityDocument[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const typesKey = (listEntityTypes?.length ? listEntityTypes : [entityType]).join(',');

  const load = useCallback(async (id: string) => {
    const types = typesKey.split(',') as EntityDocument['entity_type'][];
    const results = await Promise.all(types.map((type) => DocumentsApi.list(type, id)));
    const seen = new Set<string>();
    const docs: EntityDocument[] = [];
    let hadError: string | null = null;
    for (const result of results) {
      if (!result.ok) {
        hadError = result.message;
        continue;
      }
      for (const doc of result.documents) {
        if (seen.has(doc.id)) continue;
        seen.add(doc.id);
        docs.push(doc);
      }
    }
    setDocuments(docs);
    if (docs.length === 0 && hadError) setError(hadError);
    else setError(null);
    const images = docs.filter((doc) => isImageName(doc.file_name) || isImageName(doc.original_file_name));
    const nextPreviews: Record<string, string> = {};
    await Promise.all(
      images.map(async (doc) => {
        const file = await DocumentsApi.file(doc.id);
        if (file.ok && file.data.document.file_url) {
          nextPreviews[doc.id] = file.data.document.file_url;
        }
      })
    );
    setPreviews(nextPreviews);
  }, [typesKey]);

  useEffect(() => {
    if (entityId) void load(entityId);
  }, [entityId, load]);

  const uploadFile = async (file: File) => {
    if (!isAllowedFileType(file.name) || file.size > MAX_FILE_SIZE) {
      setError(fileTypeError());
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const id = await ensureEntity();
      if (!id) throw new Error('Save the record before uploading documents.');
      const dataUrl = await readFile(file);
      const result = await DocumentsApi.upload({
        file_name: file.name,
        original_file_name: file.name,
        file_type: typeLabel(file.name),
        file_size: formatSize(file.size),
        file_url: dataUrl,
        mime_type: file.type,
        entity_type: entityType,
        entity_id: id,
        size_bytes: file.size,
      });
      if (!result.ok) throw new Error(result.message || fileTypeError());
      await load(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : fileTypeError());
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (doc: EntityDocument, download = false) => {
    const result = await DocumentsApi.file(doc.id);
    if (!result.ok || !result.data.document.file_url) {
      setError(result.ok ? 'File is not available for preview.' : result.message);
      return;
    }
    const link = document.createElement('a');
    link.href = result.data.document.file_url;
    if (download) link.download = doc.original_file_name || doc.file_name;
    link.target = '_blank';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const remove = async (doc: EntityDocument) => {
    const result = await DocumentsApi.remove(doc.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDocuments((current) => current.filter((item) => item.id !== doc.id));
  };

  return (
    <div className="space-y-4">
      <h3 className={`font-semibold text-slate-200 ${compact ? 'text-sm' : ''}`}>{title}</h3>
      {canEdit && (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            Array.from(event.dataTransfer.files).forEach((file) => void uploadFile(file));
          }}
          className={`rounded-xl border-2 border-dashed p-8 text-center ${
            dragOver ? 'border-cyan-500 bg-cyan-950/20' : 'border-slate-700 bg-slate-950/60'
          }`}
        >
          <Paperclip className="mx-auto h-8 w-8 text-cyan-400" />
          <div className="mt-2 text-sm font-semibold text-slate-100">Drag & Drop files here</div>
          <p className="mt-1 text-slate-400">or</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" /> Browse Files
          </button>
          <p className="mt-3 text-[11px] text-slate-500">{ALLOWED_FILE_TYPES.join(' • ').toUpperCase()}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={ACCEPT_FILE_INPUT}
            onChange={(event) => {
              Array.from(event.target.files || []).forEach((file) => void uploadFile(file));
              event.target.value = '';
            }}
          />
        </div>
      )}
      {error && <div className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{error}</div>}
      {documents.length === 0 && !canEdit && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-4 text-center text-slate-500">No documents uploaded.</div>
      )}
      {documents.map((doc) => {
        const previewable = ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(extensionOf(doc.file_name));
        const previewSrc = previews[doc.id];
        return (
          <div key={doc.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt={doc.original_file_name || doc.file_name}
                    className="h-16 w-16 shrink-0 rounded-md border border-slate-700 object-cover"
                  />
                ) : (
                  <FileGlyph name={doc.file_name} />
                )}
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-100">{doc.original_file_name || doc.file_name}</div>
                  <div className="text-[11px] text-slate-400">{doc.file_size}</div>
                  <div className="text-[11px] text-slate-400">Uploaded by {doc.uploaded_by}</div>
                  <div className="text-[11px] text-slate-500">{formatLongDate(doc.uploaded_at)}</div>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {previewable && (
                  <button type="button" onClick={() => void openFile(doc)} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-700">
                    <Eye className="h-3 w-3" /> Preview
                  </button>
                )}
                <button type="button" onClick={() => void openFile(doc, true)} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-700">
                  <Download className="h-3 w-3" /> Download
                </button>
                {canEdit && (
                  <button type="button" onClick={() => void remove(doc)} className="inline-flex items-center gap-1 rounded border border-rose-900 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950">
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
