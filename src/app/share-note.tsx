import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { EmptyState, Screen } from '@/components/ui/primitives';

export default function ShareNoteWebScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <Screen><EmptyState title={tr("sharenote.shareNoteLivesInTheApp")} description={tr("sharenote.openChitsOnYourIphoneOrAndroidDevice")} /></Screen>;
}
