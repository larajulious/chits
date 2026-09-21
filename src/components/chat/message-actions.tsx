import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheetSurface } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import type { Message } from '@/db/types';

type Props = { message: Message | null; onDismiss: () => void; onEdit: () => void; onPin: (message: Message) => void; onAddToBoard: () => void; onArchive: () => void; onDelete: () => void };

export function MessageActions({ message, onDismiss, onEdit, onPin, onAddToBoard, onArchive, onDelete }: Props) {
  const { tokens: theme } = useTheme();
  if (!message) return null;
  const hasAttachment = message.attachments.length > 0;
  const preview = message.text || (hasAttachment ? `${message.attachments[0].type === 'audio' ? 'Audio note' : message.attachments[0].type[0].toUpperCase() + message.attachments[0].type.slice(1)} attachment` : 'Thought');
  const action = (label: string, onPress: () => void, destructive = false) => <Pressable accessibilityRole="button" onPress={onPress} style={[styles.action, { borderColor: theme.borderSubtle }]}><Text style={[styles.actionText, { color: destructive ? theme.danger : theme.textPrimary }]}>{label}</Text></Pressable>;
  return <Modal transparent animationType="slide" visible onRequestClose={onDismiss}><View style={styles.backdrop}><Pressable accessibilityRole="button" accessibilityLabel="Close thought actions" onPress={onDismiss} style={StyleSheet.absoluteFill} /><View style={styles.sheet}><BottomSheetSurface><View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} /><Text numberOfLines={2} style={[styles.preview, { color: theme.textSecondary }]}>{preview}</Text>{action(hasAttachment ? 'Edit description' : 'Edit', onEdit)}{action(message.pinned ? 'Unpin' : 'Pin', () => onPin(message))}{action('Add to board', onAddToBoard)}{action('Archive', onArchive)}{action('Delete', onDelete, true)}{action('Cancel', onDismiss)}</BottomSheetSurface></View></View></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.22)' },
  sheet: { width: '100%' }, handle: { alignSelf: 'center', width: 36, height: 4, marginTop: spacing.xs, marginBottom: spacing.sm, borderRadius: 2 },
  preview: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, fontSize: 14, lineHeight: 20 },
  action: { minHeight: 52, justifyContent: 'center', paddingHorizontal: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  actionText: { fontSize: 17, textAlign: 'center' },
});
