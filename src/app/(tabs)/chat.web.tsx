import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';

export default function ChatWebPreview() {
  const router = useRouter();
  const { openDrawer } = useAppDrawer();
  const { tokens } = useTheme();
  return <Screen><AppHeader title="Chits" leading={<IconButton label="Open navigation" onPress={openDrawer}><Text style={[styles.icon, { color: tokens.textPrimary }]}>☰</Text></IconButton>} trailing={<IconButton label="Open search" onPress={() => router.navigate('/search')}><Text style={[styles.icon, { color: tokens.textPrimary }]}>⌕</Text></IconButton>} /><EmptyState title="Chits is ready for mobile" description="The offline chat database runs on iOS and Android. Web remains a navigation preview while Expo SQLite web is alpha." /></Screen>;
}
const styles = StyleSheet.create({ icon: { fontSize: 20 } });
