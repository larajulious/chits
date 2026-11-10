import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import { syncStickyPhotos, withStickyPhotos } from './photos';
import { withoutNulls, type StickyWidgetPhoto, type StickyWidgetSnapshot } from './snapshot';

/** Edit Widget's note picker needs iOS 17; earlier systems don't offer the widget at all. */
const supported = () => Number.parseInt(String(Platform.Version), 10) >= 17 && Boolean(requireOptionalNativeModule('ExpoWidgets'));

let tail = Promise.resolve();
/** Writes in order, so a slow older snapshot never replaces a newer one. */
export function publishStickyWidget(snapshot: StickyWidgetSnapshot, photos: StickyWidgetPhoto[]) {
  const next = tail.catch(() => undefined).then(async () => {
    if (!supported()) return;
    const { widgetsDirectory } = await import('expo-widgets');
    const { default: Widget } = await import('./widget');
    if (!widgetsDirectory) return;
    // The widget extension reads the App Group container, never the app's own files.
    const copies = await syncStickyPhotos(widgetsDirectory, photos);
    // UserDefaults drops a write that holds any null, so none may reach it.
    Widget.updateSnapshot(withoutNulls(withStickyPhotos(snapshot, copies)));
  });
  tail = next;
  return next;
}
