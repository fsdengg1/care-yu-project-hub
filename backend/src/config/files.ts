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

export type AllowedFileType = (typeof ALLOWED_FILE_TYPES)[number];

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

export function isAllowedMimeType(fileName: string, mimeType?: string) {
  if (!mimeType) return true;
  if (/executable|x-msdownload|x-sh|x-bat|javascript|x-msdos-program/i.test(mimeType)) return false;
  const ext = extensionOf(fileName);
  if (ext === 'pdf') return mimeType === 'application/pdf' || mimeType === 'application/octet-stream';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp') return mimeType.startsWith('image/');
  return true;
}

export function fileTypeError() {
  return `Unable to upload document. Please check the file type and size. Allowed: ${ALLOWED_FILE_TYPES.join(', ').toUpperCase()} up to ${Math.round(MAX_FILE_SIZE / (1024 * 1024))} MB.`;
}
