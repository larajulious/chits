import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { Text } from 'react-native';

export default function ArchiveScreen() { const { openDrawer } = useAppDrawer(); const { tokens } = useTheme(); return <Screen><AppHeader title="Archive" leading={<IconButton label="Open navigation" onPress={openDrawer}><Text style={{ color: tokens.textPrimary, fontSize: 20 }}>☰</Text></IconButton>} /><EmptyState title="Nothing archived" description="Archived thoughts and cards will stay recoverable here." /></Screen>; }
