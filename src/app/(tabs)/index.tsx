import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { Text } from 'react-native';

export default function BoardsScreen() {
  const { openDrawer } = useAppDrawer();
  const { tokens } = useTheme();
  return <Screen><AppHeader title="Boards" leading={<IconButton label="Open navigation" onPress={openDrawer}><Text style={{ color: tokens.textPrimary, fontSize: 20 }}>☰</Text></IconButton>} /><EmptyState title="Boards live in the app" description="Open Chits on a device to organize locally stored thoughts." /></Screen>;
}
