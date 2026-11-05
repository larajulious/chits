import { NavigationMenuButton } from '@/components/navigation/navigation-menu-button';
import { AppHeader, EmptyState, Screen } from '@/components/ui/primitives';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
export default function SpinUnavailable() {
  useLocale();
  return <Screen><AppHeader title={tr('spin.title')} leading={<NavigationMenuButton />} /><EmptyState title={tr('spin.title')} description={tr('focus.nativeOnly')} /></Screen>;
}
