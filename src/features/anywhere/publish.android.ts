import { requireOptionalNativeModule } from 'expo';
import { serialWidgetPublisher } from './publish-queue';
const native = requireOptionalNativeModule<{ updateSnapshot: (snapshot: string) => Promise<void> }>('ChitsAnywhere');
export const publishWidget = serialWidgetPublisher(async (snapshot) => {
  await native?.updateSnapshot(JSON.stringify(snapshot));
});
