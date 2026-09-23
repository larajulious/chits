import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { useAppDrawer } from '@/components/navigation/app-drawer';
import { useTheme } from '@/components/theme-provider';
import { Text } from 'react-native';

export default function AttachmentsScreen() { const { openDrawer } = useAppDrawer(); const { tokens } = useTheme(); return <Screen><AppHeader title="Attachments" leading={<IconButton label="Open navigation" onPress={openDrawer}><Text style={{ color: tokens.textPrimary, fontSize: 20 }}>☰</Text></IconButton>} /><EmptyState title="No attachments yet" description="Photos, videos, audio and files you attach to your notes will appear here." /></Screen>; }
