import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { EmptyState, Screen } from '@/components/ui/primitives';

export default function BoardWebScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <Screen><EmptyState title={tr("index.boardsLiveInTheApp")} description={tr("id.openChitsOnADeviceToViewLocally")} /></Screen>;
}
