import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { router } from 'expo-router';
import { AppHeader, EmptyState, HeaderIcon, IconButton, Screen } from '@/components/ui/primitives';

export default function RevisitUnavailable() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <Screen><AppHeader title={tr("revisit.revisit")} leading={<IconButton label={tr("search.goBack")} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    <EmptyState title={tr("unavailable.revisitOnMobile")} description={tr("unavailable.openChitsOnIosOrAndroidToRevisit")} />
  </Screen>;
}
