'use client';

import React, { useRef, useState } from 'react';
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Presentation,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { LeadApi } from '@/lib/leadApi';
import { formatRelativeTime } from '@/lib/format';
import { LeadDocument } from '@/lib/types';
import { ACCEPT_FILE_INPUT, ALLOWED_FILE_TYPES, fileTypeError, isAllowedFileType, MAX_FILE_SIZE } from '@/lib/fileConfig';

export type LocalUpload = {
  localId: string;
  file?: File;
  fileName: string;
  fileType: string;
  fileSize: string;
  progress: number;
  status: 'uploading' | 'uploaded' | 'failed';
  error?: string;
  document?: LeadDocument;
  dataUrl?: string;
};

function extensionOf(name: string) {
  return name.split('.').pop()?.toLowerCase() || '';
}

function typeLabel(name: string) {
  const ext = extensionOf(name);
  if (ext === 'pdf') return 'PDF';
  if (ext === 'ppt' || ext === 'pptx') return 'PowerPoint';
  if (ext === 'xls' || ext === 'xlsx') return 'Excel';
  if (ext === 'doc' || ext === 'docx') return 'Word';
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return 'Image';
  return 'Document';
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileGlyph({ name }: { name: string }) {
  const ext = extensionOf(name);
  if (ext === 'xls' || ext === 'xlsx') return <FileSpreadsheet className="h-5 w-5 text-emerald-400" />;
  if (ext === 'ppt' || ext === 'pptx') return <Presentation className="h-5 w-5 text-amber-400" />;
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') return <ImageIcon className="h-5 w-5 text-sky-400" />;
  return <FileText className="h-5 w-5 text-cyan-400" />;
}

function readFile(file: File, onProgress: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 90));
    };
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

export default function LeadDocumentUpload({
  leadId,
  documents,
  canEdit,
  ensureLead,
  onDocumentsChange,
  error,
}: {
  leadId?: string;
  documents: LeadDocument[];
  canEdit: boolean;
  ensureLead: () => Promise<string | null>;
  onDocumentsChange: (docs: LeadDocument[]) => void;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const setUpload = (localId: string, patch: Partial<LocalUpload>) => {
    setUploads((current) => current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
  };

  const uploadFile = async (file: File, reuseLocalId?: string) => {
    if (!isAllowedFileType(file.name) || file.size > MAX_FILE_SIZE) {
      setLocalError(fileTypeError());
      return;
    }
    setLocalError(null);
    const ext = extensionOf(file.name);
    const localId = reuseLocalId || `up-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (reuseLocalId) {
      setUpload(localId, { status: 'uploading', progress: 8, error: undefined });
    } else {
      setUploads((current) => [
        {
          localId,
          file,
          fileName: file.name,
          fileType: typeLabel(file.name),
          fileSize: formatSize(file.size),
          progress: 8,
          status: 'uploading',
        },
        ...current,
      ]);
    }

    try {
      const lead = await ensureLead();
      if (!lead) throw new Error('Save the lead draft before uploading documents.');
      const dataUrl = await readFile(file, (pct) => setUpload(localId, { progress: pct }));
      setUpload(localId, { progress: 95, dataUrl });
      const result = await LeadApi.addDocument(lead, {
        file_name: file.name,
        category: ext === 'pdf' ? 'RFQ' : ext === 'jpg' || ext === 'jpeg' || ext === 'png' ? 'Images' : 'Other',
        file_type: typeLabel(file.name),
        file_size: formatSize(file.size),
        file_url: dataUrl,
        mime_type: file.type,
      });
      if (!result?.documents) throw new Error('Upload failed. Please retry.');
      const saved = result.documents.find((item) => item.file_name === file.name) || result.documents[0];
      setUpload(localId, { status: 'uploaded', progress: 100, document: saved, dataUrl });
      onDocumentsChange(result.documents);
    } catch (err) {
      setUpload(localId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || !canEdit) return;
    Array.from(files).forEach((file) => void uploadFile(file));
  };

  const removeDocument = async (doc: LeadDocument) => {
    if (!leadId) return;
    const result = await LeadApi.deleteDocument(leadId, doc.id);
    if (result?.documents) onDocumentsChange(result.documents);
    setUploads((current) => current.filter((item) => item.document?.id !== doc.id));
  };

  const openFile = (doc: LeadDocument) => {
    if (!doc.file_url) return;
    const link = document.createElement('a');
    link.href = doc.file_url;
    link.download = doc.file_name;
    link.target = '_blank';
    link.rel = 'noreferrer';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const previewable = (doc: LeadDocument) => {
    const ext = extensionOf(doc.file_name);
    return Boolean(doc.file_url) && ['pdf', 'jpg', 'jpeg', 'png'].includes(ext);
  };

  const shownIds = new Set(uploads.map((item) => item.document?.id).filter(Boolean));
  const persisted = documents.filter((doc) => !shownIds.has(doc.id));

  return (
    <div className="space-y-4">
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
            handleFiles(event.dataTransfer.files);
          }}
          className={`rounded-xl border-2 border-dashed p-8 text-center ${
            dragOver ? 'border-cyan-500 bg-cyan-950/20' : 'border-slate-700 bg-slate-950/60'
          }`}
        >
          <Paperclip className="mx-auto h-8 w-8 text-cyan-400" />
          <div className="mt-2 text-sm font-semibold text-slate-100">Upload Documents</div>
          <p className="mt-1 text-slate-400">Drag & drop files here or</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500"
          >
            <Upload className="h-4 w-4" /> Upload Documents
          </button>
          <p className="mt-3 text-[11px] text-slate-500">{ALLOWED_FILE_TYPES.join(' • ').toUpperCase()}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            accept={ACCEPT_FILE_INPUT}
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      )}

      {(localError || error) && (
        <div className="rounded-lg border border-rose-900 bg-rose-950/40 px-3 py-2 text-rose-300">{localError || error}</div>
      )}

      {(uploads.length > 0 || persisted.length > 0) && (
        <div className="space-y-2">
          <h3 className="font-semibold text-slate-200">Uploaded Documents</h3>
          {uploads.map((item) => (
            <div key={item.localId} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <FileGlyph name={item.fileName} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-100">{item.fileName}</div>
                    <div className="text-[11px] text-slate-400">
                      {item.fileType} • {item.fileSize} • {item.status === 'uploading' ? 'Uploading…' : item.status === 'failed' ? 'Upload failed' : 'Uploaded just now'}
                    </div>
                    {item.status === 'uploading' && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-800">
                        <div className="h-full bg-cyan-500" style={{ width: `${item.progress}%` }} />
                      </div>
                    )}
                    {item.status === 'uploaded' && <div className="mt-1 text-[11px] text-emerald-400">Uploaded successfully</div>}
                    {item.status === 'failed' && <div className="mt-1 text-[11px] text-rose-300">Upload failed</div>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                {item.status === 'uploaded' && item.document && (
                  <>
                    {item.dataUrl && ['pdf', 'jpg', 'jpeg', 'png'].includes(extensionOf(item.fileName)) && (
                      <button type="button" onClick={() => item.document && openFile(item.document)} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-700">
                        <Eye className="h-3 w-3" /> View
                      </button>
                    )}
                    {item.document.file_url && (
                      <button type="button" onClick={() => item.document && openFile(item.document)} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-700">
                        <Download className="h-3 w-3" /> Download
                      </button>
                    )}
                    {canEdit && (
                      <button type="button" onClick={() => item.document && void removeDocument(item.document)} className="inline-flex items-center gap-1 rounded border border-rose-900 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950">
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    )}
                  </>
                )}
                {item.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => item.file && void uploadFile(item.file, item.localId)}
                    className="inline-flex items-center gap-1 rounded border border-amber-800 px-2 py-1 text-[11px] text-amber-200"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry
                  </button>
                )}
                </div>
              </div>
            </div>
          ))}
          {persisted.map((doc) => (
            <AttachmentRow
              key={doc.id}
              doc={doc}
              canEdit={canEdit}
              previewable={previewable(doc)}
              onView={() => openFile(doc)}
              onDownload={() => openFile(doc)}
              onDelete={() => void removeDocument(doc)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentRow({
  doc,
  canEdit,
  previewable,
  onView,
  onDownload,
  onDelete,
}: {
  doc: LeadDocument;
  canEdit: boolean;
  previewable: boolean;
  onView: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <FileGlyph name={doc.file_name} />
          <div className="min-w-0">
            <div className="truncate font-semibold text-slate-100">{doc.file_name}</div>
            <div className="text-[11px] text-slate-400">
              {doc.file_type} • {doc.file_size} • Uploaded {formatRelativeTime(doc.upload_date)}
            </div>
            <div className="mt-1 text-[11px] text-emerald-400">Uploaded successfully</div>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {previewable && (
            <button type="button" onClick={onView} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-700">
              <Eye className="h-3 w-3" /> View
            </button>
          )}
          {doc.file_url && (
            <button type="button" onClick={onDownload} className="inline-flex items-center gap-1 rounded border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-cyan-700">
              <Download className="h-3 w-3" /> Download
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 rounded border border-rose-900 px-2 py-1 text-[11px] text-rose-300 hover:bg-rose-950">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
