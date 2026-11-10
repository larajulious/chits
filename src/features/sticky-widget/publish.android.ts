import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';

import { syncStickyPhotos, withStickyPhotos } from './photos';
import type { StickyWidgetPhoto, StickyWidgetSnapshot } from './snapshot';

const native = requireOptionalNativeModule<{ updateStickySnapshot?: (snapshot: string) => Promise<void> }>('ChitsAnywhere');

let tail = Promise.resolve();
/** Writes in order, so a slow older snapshot never replaces a newer one. */
export function publishStickyWidget(snapshot: StickyWidgetSnapshot, photos: StickyWidgetPhoto[]) {
  const next = tail.catch(() => undefined).then(async () => {
    if (!native?.updateStickySnapshot || !FileSystem.documentDirectory) return;
    // The provider runs in the app's process and decodes these app-private copies directly.
    const copies = await syncStickyPhotos(`${FileSystem.documentDirectory}sticky-widget/`, photos);
    await native.updateStickySnapshot(JSON.stringify(withStickyPhotos(snapshot, copies, (uri) => decodeURIComponent(uri.replace(/^file:\/\//, '')))));
  });
  tail = next;
  return next;
}
