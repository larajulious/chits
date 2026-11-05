import { router } from 'expo-router';

import { AppHeader, EmptyState, HeaderIcon, IconButton, Screen } from '@/components/ui/primitives';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

/** The web preview has no local database to plan in. */
export default function PlanUnavailable() {
  useLocale();
  return <Screen>
    <AppHeader title={tr('plan.cta.plan')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    <EmptyState title={tr('plan.cta.plan')} description={tr('plan.unavailable')} />
  </Screen>;
}
