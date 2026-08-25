export const MAX_FILE_SIZE = 12 * 1024 * 1024;

export const ALLOWED_FILE_TYPES = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'csv',
  'txt',
  'png',
  'jpg',
  'jpeg',
  'webp',
] as const;

export const BLOCKED_FILE_TYPES = ['exe', 'bat', 'cmd', 'com', 'msi', 'sh', 'ps1', 'dll', 'js', 'vbs'] as const;

export const ACCEPT_FILE_INPUT = ALLOWED_FILE_TYPES.map((ext) => `.${ext}`).join(',');

export function extensionOf(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

export function isBlockedFileType(fileName: string) {
  return (BLOCKED_FILE_TYPES as readonly string[]).includes(extensionOf(fileName));
}

export function isAllowedFileType(fileName: string) {
  if (isBlockedFileType(fileName)) return false;
  return (ALLOWED_FILE_TYPES as readonly string[]).includes(extensionOf(fileName));
}

export function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fileTypeError() {
  return `Unable to upload document. Please check the file type and size. Allowed: ${ALLOWED_FILE_TYPES.join(', ').toUpperCase()} up to ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB.`;
}
