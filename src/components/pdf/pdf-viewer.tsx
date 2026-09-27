import type { AttachmentLike } from '@/db/types';

// PDF previews are rendered natively (see pdf-viewer.native.tsx); the web
// build has no local attachment storage to preview from.
export function PdfViewer(_: { attachment: AttachmentLike; onDismiss: () => void }) {
  return null;
}
