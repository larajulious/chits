import { useAppDrawer } from '@/components/navigation/app-drawer';
import { IconButton, MenuIcon } from '@/components/ui/primitives';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

export function NavigationMenuButton({ disabled = false }: { disabled?: boolean }) {
  'use no memo'; // Refresh the translated label when the locale changes.
  useLocale();
  const { openDrawer } = useAppDrawer();
  return <IconButton label={tr('archive.openNavigation')} disabled={disabled} onPress={openDrawer}><MenuIcon /></IconButton>;
}
