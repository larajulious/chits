import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { resolveAttachmentUri } from '@/services/attachment-storage';
import type { StickyWidgetPhoto, StickyWidgetSnapshot } from './snapshot';

/** Long edge of a print's picture: sharp on a large widget, small enough for the widget's memory. */
const EDGE = 640;
const PREFIX = 'sticky-';

/**
 * Small JPEG copies of the photos printed on Spaces, in a folder the widget
 * can read, made once per attachment. Copies no print uses any more are
 * removed, so a deleted photo never lingers there. Returns attachment → copy.
 */
export async function syncStickyPhotos(directory: string, photos: StickyWidgetPhoto[]): Promise<Map<string, string>> {
  const folder = directory.endsWith('/') ? directory : `${directory}/`;
  const copies = new Map<string, string>();
  const name = (attachmentId: string) => `${PREFIX}${attachmentId.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
  try { await FileSystem.makeDirectoryAsync(folder, { intermediates: true }); } catch { /* Already there. */ }
  for (const photo of photos) {
    const target = `${folder}${name(photo.attachmentId)}`;
    try {
      if (!(await FileSystem.getInfoAsync(target)).exists) {
        const source = resolveAttachmentUri(photo.storagePath);
        if (!source) continue;
        const landscape = (photo.width ?? 1) >= (photo.height ?? 1);
        const longest = Math.max(photo.width ?? 0, photo.height ?? 0);
        const made = await manipulateAsync(source, longest && longest <= EDGE ? [] : [{ resize: landscape ? { width: EDGE } : { height: EDGE } }], { compress: 0.78, format: SaveFormat.JPEG });
        await FileSystem.moveAsync({ from: made.uri, to: target });
      }
      copies.set(photo.attachmentId, target);
    } catch { /* That print shows its blank frame. */ }
  }
  const keep = new Set([...copies.keys()].map(name));
  try {
    for (const file of await FileSystem.readDirectoryAsync(folder)) {
      if (file.startsWith(PREFIX) && !keep.has(file)) await FileSystem.deleteAsync(`${folder}${file}`, { idempotent: true });
    }
  } catch { /* Nothing to tidy. */ }
  return copies;
}

/** The snapshot with each print's picture pointing at its copy. */
export function withStickyPhotos(snapshot: StickyWidgetSnapshot, copies: Map<string, string>, path: (uri: string) => string = (uri) => uri): StickyWidgetSnapshot {
  return { ...snapshot, spaces: snapshot.spaces.map((space) => ({ ...space, notes: space.notes.map((note) => note.media ? { ...note, media: { ...note.media, image: copies.has(note.media.attachmentId) ? path(copies.get(note.media.attachmentId)!) : null } } : note) })) };
}
