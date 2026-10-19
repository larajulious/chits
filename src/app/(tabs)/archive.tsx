import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { Text } from 'react-native';

export default function ArchiveScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale(); const { openDrawer } = useAppDrawer(); const { tokens } = useTheme(); return <Screen><AppHeader title={tr("archive.archive")} leading={<IconButton label={tr("archive.openNavigation")} onPress={openDrawer}><Text style={{ color: tokens.textPrimary, fontSize: 20 }}>☰</Text></IconButton>} /><EmptyState title={tr("archive.nothingArchived")} description={tr("archive.archivedThoughtsAndCardsWillStayRecoverableHere")} /></Screen>; }
