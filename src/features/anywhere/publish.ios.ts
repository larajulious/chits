import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import { requireOptionalNativeModule } from 'expo';
import { serialWidgetPublisher } from './publish-queue';
export const publishWidget = serialWidgetPublisher(async (snapshot) => {
  if (!requireOptionalNativeModule('ExpoWidgets')) return;
  const { widgetsDirectory } = await import('expo-widgets');
  const { default: Widget } = await import('./widget');
  if (!widgetsDirectory) return;
  const image = `${widgetsDirectory.replace(/\/$/, '')}/chits-icon.png`;
  if (!(await FileSystem.getInfoAsync(image)).exists) {
    const asset = await Asset.fromModule(require('../../../assets/images/app_icon.png')).downloadAsync();
    if (asset.localUri) await FileSystem.copyAsync({ from: asset.localUri, to: image });
  }
  Widget.updateSnapshot({ ...snapshot, mascot: image });
});
