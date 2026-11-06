import { router } from 'expo-router';
import { AppHeader, HeaderIcon, IconButton } from '@/components/ui/primitives';
import { NavigationMenuButton } from '@/components/navigation/navigation-menu-button';
import { CanvasLibrary } from '@/features/whiteboard/library.native';
import { CanvasPage } from '@/features/whiteboard/presentation';

export default function CanvasesScreen() {
  return <CanvasPage header={<AppHeader title="Chits Canvas" leading={<NavigationMenuButton />} trailing={<IconButton label="New Canvas" onPress={() => router.push('/canvas-new')}><HeaderIcon name="add" size={24} /></IconButton>} />}>
    <CanvasLibrary />
  </CanvasPage>;
}
