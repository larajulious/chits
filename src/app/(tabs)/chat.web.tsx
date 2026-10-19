import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { StyleSheet, Text } from 'react-native';
import { useRouter } from 'expo-router';

import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';

export default function ChatWebPreview() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const router = useRouter();
  const { openDrawer } = useAppDrawer();
  const { tokens } = useTheme();
  return <Screen><AppHeader title="Chits" leading={<IconButton label={tr("archive.openNavigation")} onPress={openDrawer}><Text style={[styles.icon, { color: tokens.textPrimary }]}>☰</Text></IconButton>} trailing={<IconButton label={tr("chat.openSearch")} onPress={() => router.navigate('/search')}><Text style={[styles.icon, { color: tokens.textPrimary }]}>⌕</Text></IconButton>} /><EmptyState title={tr("chat.chitsIsReadyForMobile")} description={tr("chat.theOfflineChatDatabaseRunsOnIosAnd")} /></Screen>;
}
const styles = StyleSheet.create({ icon: { fontSize: 20 } });
