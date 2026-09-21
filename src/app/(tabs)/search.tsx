import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { Text } from 'react-native';

export default function SearchScreen() {
  const { openDrawer } = useAppDrawer();
  const { tokens } = useTheme();
  return <Screen><AppHeader title="Search" leading={<IconButton label="Open navigation" onPress={openDrawer}><Text style={{ color: tokens.textPrimary, fontSize: 20 }}>☰</Text></IconButton>} /><EmptyState title="Find anything later" description="Search becomes useful once your chat has a little history." /></Screen>;
}
