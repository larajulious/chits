import { router } from 'expo-router';
import { AppHeader, EmptyState, HeaderIcon, IconButton, Screen } from '@/components/ui/primitives';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
export default function FocusUnavailable() {
  useLocale();
  return <Screen><AppHeader title={tr('focus.title')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} /><EmptyState title={tr('focus.title')} description={tr('focus.nativeOnly')} /></Screen>;
}
