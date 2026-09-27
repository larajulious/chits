import type { AttachmentLike } from '@/db/types';

type Exportable = Pick<AttachmentLike, 'type' | 'storagePath' | 'originalName' | 'mimeType' | 'createdAt'>;

// Extension → MIME for the formats Chits stores. Used when an attachment's own
// MIME type is missing or generic, and to pick an extension when the original
// name has none.
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp', webm: 'video/webm',
  m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', caf: 'audio/x-caf', ogg: 'audio/ogg', amr: 'audio/amr',
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', json: 'application/json', zip: 'application/zip', rtf: 'application/rtf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pages: 'application/vnd.apple.pages', numbers: 'application/vnd.apple.numbers', key: 'application/vnd.apple.keynote',
};

// Non-standard spellings pickers/recorders report, mapped to what other apps expect.
const MIME_ALIASES: Record<string, string> = {
  'audio/m4a': 'audio/mp4', 'audio/x-m4a': 'audio/mp4', 'image/jpg': 'image/jpeg', 'image/pjpeg': 'image/jpeg', 'application/x-pdf': 'application/pdf',
};

const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/binary', 'application/unknown', 'application/force-download']);

const TYPE_FALLBACK_MIME: Partial<Record<AttachmentLike['type'], string>> = { photo: 'image/jpeg', video: 'video/mp4', audio: 'audio/mp4' };
const TYPE_BASE_NAME: Record<AttachmentLike['type'], string> = { photo: 'Photo', video: 'Video', audio: 'Voice note', file: 'Attachment', text: 'Attachment' };

function extensionOf(value: string | null | undefined): string | null {
  const last = value?.split(/[?#]/)[0].split('/').pop() ?? '';
  const match = last.match(/\.([a-z0-9]{1,8})$/i);
  return match ? match[1].toLowerCase() : null;
}

function stripExtension(name: string) {
  return name.replace(/\.[a-z0-9]{1,8}$/i, '');
}

function sanitize(name: string) {
  return name.replace(/[/\\:\u0000-\u001f]/g, '-').replace(/\s+/g, ' ').trim();
}

const pad = (value: number) => String(value).padStart(2, '0');

function timestampLabel(createdAt: number) {
  const date = new Date(createdAt || Date.now());
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}.${pad(date.getMinutes())}.${pad(date.getSeconds())}`;
}

function normalizedMime(mimeType: string | null | undefined): string | null {
  const value = (mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (GENERIC_MIME_TYPES.has(value) || !value.includes('/')) return null;
  return MIME_ALIASES[value] ?? value;
}

function extensionForMime(mimeType: string | null): string | null {
  if (!mimeType) return null;
  const preferred: Record<string, string> = { 'image/jpeg': 'jpg', 'audio/mp4': 'm4a', 'video/quicktime': 'mov' };
  if (preferred[mimeType]) return preferred[mimeType];
  return Object.entries(MIME_BY_EXTENSION).find(([, mime]) => mime === mimeType)?.[0] ?? null;
}

/**
 * The filename a user sees when saving a copy outside Chits. Keeps the
 * original name, but the extension always matches the bytes Chits actually
 * stored: photos are re-encoded to JPEG on import, so "IMG_1234.HEIC" exports
 * as "IMG_1234.jpg" rather than a JPEG mislabeled as HEIC.
 */
export function exportFileName(attachment: Exportable): string {
  const storedExtension = extensionOf(attachment.storagePath);
  const original = sanitize(attachment.originalName ?? '');
  const originalExtension = extensionOf(original);
  const base = original && !original.startsWith('.')
    ? (originalExtension ? stripExtension(original) : original)
    : `${TYPE_BASE_NAME[attachment.type] ?? 'Attachment'} ${timestampLabel(attachment.createdAt)}`;
  const extension = storedExtension ?? originalExtension ?? extensionForMime(normalizedMime(attachment.mimeType) ?? TYPE_FALLBACK_MIME[attachment.type] ?? null);
  const safeBase = base.trim() || TYPE_BASE_NAME[attachment.type] || 'Attachment';
  return extension ? `${safeBase}.${extension}` : safeBase;
}

/**
 * MIME type handed to the platform save UI: the attachment's own type when it
 * is specific (normalized), otherwise derived from the export filename's
 * extension, then from the attachment kind — octet-stream only as a last resort.
 */
export function exportMimeType(attachment: Pick<AttachmentLike, 'type' | 'mimeType'>, fileName: string): string {
  const fromExtension = MIME_BY_EXTENSION[extensionOf(fileName) ?? ''] ?? null;
  const own = normalizedMime(attachment.mimeType);
  // A photo's recorded type can predate re-encoding (e.g. image/heic); the stored bytes decide.
  if (attachment.type === 'photo' && fromExtension) return fromExtension;
  return own ?? fromExtension ?? TYPE_FALLBACK_MIME[attachment.type] ?? 'application/octet-stream';
}

export type ExportFailureCode = 'missing' | 'invalid_uri' | 'no_space' | 'permission' | 'failed';
// Where a successful download ended up, for the confirmation message.
export type ExportDestination = 'downloads' | 'photos' | 'chosen';
export type ExportOutcome = { status: 'saved'; uri?: string; destination?: ExportDestination } | { status: 'cancelled' } | { status: 'failed'; code: ExportFailureCode };

/**
 * How "Download" works for an attachment on a platform: straight into
 * Downloads/Chits on Android 10+, straight into Photos for iOS photos/videos,
 * otherwise the system save screen (iOS Files sheet; older Android "Save as").
 */
export function downloadMethod(platform: string, platformVersion: number | string, type: AttachmentLike['type']): 'downloads' | 'photos' | 'picker' {
  if (platform === 'android') return Number(platformVersion) >= 29 ? 'downloads' : 'picker';
  if (platform === 'ios' && (type === 'photo' || type === 'video')) return 'photos';
  return 'picker';
}

/** The action's label, matching what it will actually do. */
export function downloadActionLabel(platform: string, type: AttachmentLike['type']): string {
  if (platform !== 'ios') return 'Download';
  return type === 'photo' || type === 'video' ? 'Save to Photos' : 'Save to Files';
}

/** User-facing feedback for an export; null when nothing should be shown (cancel). */
export function exportFeedback(outcome: ExportOutcome): string | null {
  if (outcome.status === 'saved') return outcome.destination === 'downloads' ? 'Saved to Downloads/Chits' : outcome.destination === 'photos' ? 'Saved to Photos' : 'File saved successfully';
  if (outcome.status === 'cancelled') return null;
  if (outcome.code === 'missing') return 'This file is no longer on this device.';
  if (outcome.code === 'no_space') return 'Not enough storage space to save this file.';
  if (outcome.code === 'permission') return 'Chits can’t save to Photos. Allow it in Settings › Chits › Photos.';
  return 'Unable to save this file. Please try again.';
}

export function failureCodeFromNative(code: unknown): ExportFailureCode {
  if (code === 'ERR_FILE_MISSING') return 'missing';
  if (code === 'ERR_EXPORT_NO_SPACE') return 'no_space';
  if (code === 'ERR_EXPORT_PERMISSION') return 'permission';
  return 'failed';
}
