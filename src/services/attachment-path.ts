export const ATTACHMENT_STORAGE_ROOT = 'chits-attachments';

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

function safeRelativePath(value: string): string | null {
  const path = value.replace(/^\/+/, '').replace(/\\/g, '/');
  if (!path || path.includes('\0')) return null;
  const segments = path.split('/');
  if (segments.some((segment) => {
    if (!segment) return true;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\');
    } catch {
      return true;
    }
  })) return null;
  return path;
}

/**
 * Converts a legacy sandbox URI into the stable path stored in SQLite.
 * It intentionally rebuilds from a recognizable persistent-directory marker
 * without first checking the stale absolute URI, because an iOS container UUID
 * can change while the file remains present in the current Documents directory.
 */
export function normalizeStoredAttachmentPath(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  const ownedRootMarker = `/${ATTACHMENT_STORAGE_ROOT.toLowerCase()}/`;
  const ownedRootIndex = lower.indexOf(ownedRootMarker);
  if (ownedRootIndex >= 0) return safeRelativePath(normalized.slice(ownedRootIndex + 1));

  const documentsMarker = '/documents/';
  const documentsIndex = lower.indexOf(documentsMarker);
  if (documentsIndex >= 0) return safeRelativePath(normalized.slice(documentsIndex + documentsMarker.length));

  if (SCHEME.test(normalized) || normalized.startsWith('/')) return null;
  return safeRelativePath(normalized);
}

export function isStoredAttachmentPath(value: string | null | undefined): value is string {
  return normalizeStoredAttachmentPath(value) === value;
}
