import { NavigationMenuButton } from '@/components/navigation/navigation-menu-button';
import { AppHeader, EmptyState, Screen } from '@/components/ui/primitives';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
export default function FocusUnavailable() {
  useLocale();
  return <Screen><AppHeader title={tr('focus.title')} leading={<NavigationMenuButton />} /><EmptyState title={tr('focus.title')} description={tr('focus.nativeOnly')} /></Screen>;
}
