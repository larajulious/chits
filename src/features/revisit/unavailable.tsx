import { NavigationMenuButton } from '@/components/navigation/navigation-menu-button';
import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { AppHeader, EmptyState, Screen } from '@/components/ui/primitives';

export default function RevisitUnavailable() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <Screen><AppHeader title={tr("revisit.revisit")} leading={<NavigationMenuButton />} />
    <EmptyState title={tr("unavailable.revisitOnMobile")} description={tr("unavailable.openChitsOnIosOrAndroidToRevisit")} />
  </Screen>;
}
