import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomSheetSurface } from '@/components/ui/primitives';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import type { Message } from '@/db/types';
import { exportActionLabel } from '@/services/attachment-export';
import type { SpaceNoteAction } from '@/components/spaces/space-note-action';

// Centralizes what "Copy chat" is allowed to put on the clipboard: only the
// human-authored text of the message, never a file URI, ID, or other internal
// detail. A message with an attachment but no description has nothing copyable.
export function getCopyableMessageText(message: Message): string | null {
  const text = message.text?.trim();
  return text || null;
}

type Props = {
  message: Message | null;
  temporarilyRevealed: boolean;
  onDismiss: () => void;
  /** Runs once the sheet has fully closed — the earliest another modal can be shown on iOS. */
  onClosed?: () => void;
  onCopy: (message: Message) => void;
  onEdit: () => void;
  onPin: (message: Message) => void;
  /** "Stick to Fridge" / "Remove from Fridge" for this thought, once looked up. */
  spaceAction?: SpaceNoteAction | null;
  onSpaceAction?: (action: SpaceNoteAction) => void;
  onAddToBoard: () => void;
  onReminder?: (message: Message) => void;
  onDownload: (message: Message) => void;
  onShareNote: (message: Message) => void;
  onReveal: (message: Message) => void;
  onHideAgain: (message: Message) => void;
  onHideContent: (message: Message) => void;
  onShowContent: (message: Message) => void;
  onArchive: () => void;
  onDelete: () => void;
};

function ActionRow({ icon, label, onPress, destructive = false }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; destructive?: boolean }) {
  const { tokens: theme } = useTheme();
  const color = destructive ? theme.danger : theme.textPrimary;
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
    <Icon name={icon} size={20} color={color} />
    <AppText style={[styles.rowLabel, { color }]}>{label}</AppText>
  </Pressable>;
}

export function MessageActions({ message: current, temporarilyRevealed, onDismiss, onClosed, onCopy, onEdit, onPin, spaceAction, onSpaceAction, onAddToBoard, onReminder, onDownload, onShareNote, onReveal, onHideAgain, onHideContent, onShowContent, onArchive, onDelete }: Props) {
  const { tokens: theme } = useTheme();
  // Stays mounted (showing the last message) until the native modal has really
  // closed, like AppDialog: iOS can't present another modal (e.g. the delete
  // confirmation) while this one is still up or dismissing.
  const [shown, setShown] = useState<Message | null>(current);
  if (current && current !== shown) setShown(current);
  const finishClosing = () => { setShown(null); onClosed?.(); };
  useEffect(() => {
    // Android has no onDismiss; its modal is gone by the next frame.
    if (current || !shown || Platform.OS === 'ios') return;
    const frame = requestAnimationFrame(finishClosing);
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reacts to the sheet closing.
  }, [current]);
  const message = current ?? shown;
  if (!message) return null;
  const hasAttachment = message.attachments.length > 0;
  const covered = message.isHiddenContent && !temporarilyRevealed;
  const preview = covered ? 'Hidden Chit' : message.text || (hasAttachment ? `${message.attachments[0].type === 'audio' ? 'Audio note' : message.attachments[0].type[0].toUpperCase() + message.attachments[0].type.slice(1)} attachment` : 'Thought');
  const copyable = getCopyableMessageText(message);
  return <Modal transparent animationType="slide" visible={Boolean(current)} onRequestClose={onDismiss} onDismiss={Platform.OS === 'ios' ? finishClosing : undefined}>
    <View style={styles.backdrop}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close thought actions" onPress={onDismiss} style={StyleSheet.absoluteFill} />
      <SafeAreaView edges={['bottom']} style={styles.sheet}>
        <BottomSheetSurface>
          <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
          <AppText numberOfLines={2} ellipsizeMode="tail" style={[styles.preview, { color: theme.textSecondary }]}>{preview}</AppText>

          <View style={styles.group}>
            {covered ? <ActionRow icon="eye-outline" label="Reveal" onPress={() => onReveal(message)} /> : null}
            {!covered && copyable ? <ActionRow icon="copy-outline" label="Copy chat" onPress={() => onCopy(message)} /> : null}
            {!covered ? <ActionRow icon="pencil-outline" label={hasAttachment ? 'Edit description' : 'Edit'} onPress={onEdit} /> : null}
            {!covered && hasAttachment ? <ActionRow icon="download-outline" label={exportActionLabel(message.attachments[0])} onPress={() => onDownload(message)} /> : null}
            {!covered ? <ActionRow icon="images-outline" label="Share Note" onPress={() => onShareNote(message)} /> : null}
            <ActionRow icon={message.organization ? 'grid' : 'grid-outline'} label={message.organization ? `Go to ${message.organization.boardName}` : 'Add to Board'} onPress={onAddToBoard} />
            {onReminder ? <ActionRow icon="notifications-outline" label="Reminder" onPress={() => onReminder(message)} /> : null}
          </View>

          <View style={[styles.group, styles.groupDivider, { borderTopColor: theme.borderSubtle }]}>
            {!covered ? <ActionRow icon={message.pinned ? 'pin' : 'pin-outline'} label={message.pinned ? 'Unpin' : 'Pin'} onPress={() => onPin(message)} /> : null}
            {spaceAction?.noteId === message.id && onSpaceAction ? <ActionRow icon={spaceAction.icon} label={spaceAction.label} onPress={() => onSpaceAction(spaceAction)} /> : null}
            {message.isHiddenContent && temporarilyRevealed ? <ActionRow icon="eye-off-outline" label="Hide again" onPress={() => onHideAgain(message)} /> : null}
            {message.isHiddenContent
              ? <ActionRow icon="eye-outline" label="Show content" onPress={() => onShowContent(message)} />
              : <ActionRow icon="eye-off-outline" label="Hide content" onPress={() => onHideContent(message)} />}
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
