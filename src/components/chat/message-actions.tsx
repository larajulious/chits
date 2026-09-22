import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetSurface } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import type { Message } from '@/db/types';

// Centralizes what "Copy chat" is allowed to put on the clipboard: only the
// human-authored text of the message, never a file URI, ID, or other internal
// detail. A message with an attachment but no description has nothing copyable.
export function getCopyableMessageText(message: Message): string | null {
  const text = message.text?.trim();
  return text || null;
}

type Props = { message: Message | null; onDismiss: () => void; onCopy: (message: Message) => void; onEdit: () => void; onPin: (message: Message) => void; onAddToBoard: () => void; onArchive: () => void; onDelete: () => void };

function ActionRow({ icon, label, onPress, destructive = false }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; destructive?: boolean }) {
  const { tokens: theme } = useTheme();
  const color = destructive ? theme.danger : theme.textPrimary;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
    <Ionicons accessible={false} name={icon} size={20} color={color} />
    <Text style={[styles.rowLabel, { color }]}>{label}</Text>
  </Pressable>;
}

export function MessageActions({ message, onDismiss, onCopy, onEdit, onPin, onAddToBoard, onArchive, onDelete }: Props) {
  const { tokens: theme } = useTheme();
  if (!message) return null;
  const hasAttachment = message.attachments.length > 0;
  const preview = message.text || (hasAttachment ? `${message.attachments[0].type === 'audio' ? 'Audio note' : message.attachments[0].type[0].toUpperCase() + message.attachments[0].type.slice(1)} attachment` : 'Thought');
  const copyable = getCopyableMessageText(message);
  return <Modal transparent animationType="slide" visible onRequestClose={onDismiss}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close thought actions" onPress={onDismiss} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <BottomSheetSurface>
          <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
          <Text numberOfLines={2} ellipsizeMode="tail" style={[styles.preview, { color: theme.textSecondary }]}>{preview}</Text>

          <View style={styles.group}>
            <ActionRow icon="pencil-outline" label={hasAttachment ? 'Edit description' : 'Edit'} onPress={onEdit} />
            {copyable ? <ActionRow icon="copy-outline" label="Copy chat" onPress={() => onCopy(message)} /> : null}
            <ActionRow icon="grid-outline" label="Add to board" onPress={onAddToBoard} />
          </View>

          <View style={[styles.group, styles.groupDivider, { borderTopColor: theme.borderSubtle }]}>
            <ActionRow icon={message.pinned ? 'pin' : 'pin-outline'} label={message.pinned ? 'Unpin' : 'Pin'} onPress={() => onPin(message)} />
            <ActionRow icon="archive-outline" label="Archive" onPress={onArchive} />
          </View>

          <View style={[styles.deleteGroup, { borderTopColor: theme.borderSubtle }]}>
            <ActionRow icon="trash-outline" label="Delete" onPress={onDelete} destructive />
          </View>
        </BottomSheetSurface>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.22)' },
  sheet: { width: '100%' },
  handle: { alignSelf: 'center', width: 36, height: 4, marginTop: spacing.xs, marginBottom: spacing.sm, borderRadius: 2 },
  preview: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, fontSize: 13, lineHeight: 18 },
  group: { paddingBottom: spacing.xxs },
  groupDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.xs, paddingTop: spacing.xs },
  deleteGroup: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.sm, paddingTop: spacing.xs, paddingBottom: spacing.sm },
  row: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg },
  rowPressed: { opacity: 0.6 },
  rowLabel: { fontSize: 16, fontWeight: '500' },
});
