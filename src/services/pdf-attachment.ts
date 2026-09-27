import type { AttachmentLike } from '@/db/types';

type PdfCandidate = Pick<AttachmentLike, 'type' | 'mimeType' | 'originalName' | 'storagePath'>;

// MIME types pickers and other apps use for "we don't know" — when one of these
// is all we have, the file extension decides instead.
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream', 'application/binary', 'application/unknown', 'application/force-download']);
const PDF_MIME_TYPES = new Set(['application/pdf', 'application/x-pdf', 'application/acrobat', 'applications/vnd.pdf', 'text/pdf', 'text/x-pdf']);

const hasPdfExtension = (value: string | null | undefined) => Boolean(value && /\.pdf$/i.test(value.split(/[?#]/)[0].trim()));

/**
 * True when an attachment should open in the in-app PDF viewer. The MIME type
 * is authoritative when it is specific; the `.pdf` extension (original name
 * first, then the stored file) is only a fallback for missing or generic MIME
 * types, so a mislabeled non-PDF file is never forced into the viewer.
 */
export function isPdfAttachment(attachment: PdfCandidate): boolean {
  if (attachment.type === 'photo' || attachment.type === 'video' || attachment.type === 'audio') return false;
  const mimeType = (attachment.mimeType ?? '').split(';')[0].trim().toLowerCase();
  if (PDF_MIME_TYPES.has(mimeType)) return true;
  if (!GENERIC_MIME_TYPES.has(mimeType)) return false;
  return hasPdfExtension(attachment.originalName) || hasPdfExtension(attachment.storagePath);
}

/** The filename shown in the viewer header and offered to Share / Open with / Save. */
export function pdfDisplayName(attachment: Pick<AttachmentLike, 'originalName'>): string {
  const name = attachment.originalName?.trim();
  if (!name) return 'Document.pdf';
  return hasPdfExtension(name) ? name : `${name}.pdf`;
}
