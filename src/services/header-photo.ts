import { normalizeStoredAttachmentPath } from './attachment-path';

export const HEADER_PHOTO_KEY = 'custom_header_photo';
/**
 * `asset` is a bundled picture (Default's built-in header) drawn in place of
 * `storagePath`, and `ink` the dark header ink a light bundled picture wears
 * instead of white; stored photos never have either.
 */
export type HeaderPhoto = { storagePath: string; width: number; height: number; x: number; y: number; zoom: number; overlay: number; asset?: number; ink?: { text: string; muted: string } };
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function parseHeaderPhoto(value?: string | null): HeaderPhoto | null {
  try {
    const data = JSON.parse(value ?? 'null');
    if (!data || typeof data.storagePath !== 'string') return null;
    const storagePath = normalizeStoredAttachmentPath(data.storagePath);
    if (!storagePath?.startsWith('chits-attachments/headers/') || !(data.width > 0 && data.height > 0) || !Number.isFinite(data.width) || !Number.isFinite(data.height)) return null;
    return { storagePath, width: data.width, height: data.height, x: clamp(finite(data.x, 0.5), 0, 1), y: clamp(finite(data.y, 0.5), 0, 1), zoom: clamp(finite(data.zoom, 1), 1, 3), overlay: clamp(finite(data.overlay, 0.6), 0.6, 0.8) };
  } catch { return null; }
}

/** Normalized focal position survives changes in header height and orientation. */
export function headerPhotoFrame(photo: HeaderPhoto, width: number, height: number) {
  const scale = Math.max(width / photo.width, height / photo.height) * photo.zoom;
  const imageWidth = Math.max(width, photo.width * scale);
  const imageHeight = Math.max(height, photo.height * scale);
  return { width: imageWidth, height: imageHeight, left: -(imageWidth - width) * photo.x, top: -(imageHeight - height) * photo.y };
}
