'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
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

function isImageName(name: string) {
  return ['jpg', 'jpeg', 'png', 'webp'].includes(extensionOf(name));
}

function isPendingId(id: string) {
  return id.startsWith('local-');
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
  const previewUrls = useRef<Record<string, string>>({});
  const [dragOver, setDragOver] = useState(false);
  const [documents, setDocuments] = useState<EntityDocument[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploadingIds, setUploadingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
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
    setDocuments((current) => {
      const pending = current.filter((item) => isPendingId(item.id));
      return [...pending, ...docs];
    });
    if (docs.length === 0 && hadError) setError(hadError);
    else setError(null);
  }, [typesKey]);

  useEffect(() => {
    if (entityId) void load(entityId);
  }, [entityId, load]);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const queueFiles = (files: File[]) => {
    files.forEach((file) => void uploadFile(file));
  };

  const uploadFile = async (file: File) => {
    if (!isAllowedFileType(file.name) || file.size > MAX_FILE_SIZE) {
      setError(fileTypeError());
      return;
    }
    setError(null);
    const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previewUrl = isImageName(file.name) ? URL.createObjectURL(file) : '';
    if (previewUrl) {
      previewUrls.current[localId] = previewUrl;
      setPreviews((current) => ({ ...current, [localId]: previewUrl }));
    }
    const optimistic: EntityDocument = {
      id: localId,
      file_name: file.name,
      original_file_name: file.name,
      file_type: typeLabel(file.name),
      file_size: formatSize(file.size),
      mime_type: file.type,
      uploaded_by: 'You',
      uploaded_by_id: '',
      uploaded_at: new Date().toISOString(),
      entity_type: entityType,
      entity_id: entityId || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setDocuments((current) => [optimistic, ...current]);
    setUploadingIds((current) => [...current, localId]);

    try {
      const id = await ensureEntity();
      if (!id) throw new Error('Save the record before uploading documents.');
      const result = await DocumentsApi.uploadFile(file, {
        entity_type: entityType,
        entity_id: id,
        file_type: typeLabel(file.name),
      });
      if (!result.ok) throw new Error(result.message);
      const saved = result.document;
      setDocuments((current) => current.map((item) => (item.id === localId ? saved : item)));
      if (previewUrl) {
        previewUrls.current[saved.id] = previewUrl;
        setPreviews((current) => {
          const next = { ...current, [saved.id]: previewUrl };
          delete next[localId];
          return next;
        });
      }
    } catch (err) {
      setDocuments((current) => current.filter((item) => item.id !== localId));
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        delete previewUrls.current[localId];
        setPreviews((current) => {
          const next = { ...current };
          delete next[localId];
          return next;
        });
      }
      setError(err instanceof Error ? err.message : fileTypeError());
    } finally {
      setUploadingIds((current) => current.filter((item) => item !== localId));
    }
  };

  const openFile = async (doc: EntityDocument, download = false) => {
    const localPreview = previews[doc.id];
    if (localPreview && download === false && isImageName(doc.file_name)) {
      window.open(localPreview, '_blank', 'noreferrer');
      return;
    }
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
    if (isPendingId(doc.id) || uploadingIds.includes(doc.id)) return;
    const result = await DocumentsApi.remove(doc.id);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setDocuments((current) => current.filter((item) => item.id !== doc.id));
    const preview = previewUrls.current[doc.id];
    if (preview) {
      URL.revokeObjectURL(preview);
      delete previewUrls.current[doc.id];
    }
    setPreviews((current) => {
      const next = { ...current };
      delete next[doc.id];
      return next;
    });
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
            queueFiles(Array.from(event.dataTransfer.files));
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
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
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
              queueFiles(Array.from(event.target.files || []));
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
        const uploading = isPendingId(doc.id) || uploadingIds.includes(doc.id);
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
                  {uploading ? (
                    <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-cyan-300">
                      <LoaderCircle className="h-3 w-3 animate-spin" /> Uploading…
                    </div>
                  ) : (
                    <>
                      <div className="text-[11px] text-slate-400">Uploaded by {doc.uploaded_by}</div>
                      <div className="text-[11px] text-slate-500">{formatLongDate(doc.uploaded_at)}</div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-1">
                {previewable && !uploading && (
                  <button type="button" onClick={() => void openFile(doc)} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-700">
                    <Eye className="h-3 w-3" /> Preview
                  </button>
                )}
                {!uploading && (
                  <button type="button" onClick={() => void openFile(doc, true)} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-700">
                    <Download className="h-3 w-3" /> Download
                  </button>
                )}
                {canEdit && !uploading && (
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
