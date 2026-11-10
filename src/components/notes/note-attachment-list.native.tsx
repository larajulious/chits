import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { AudioPlayer, VideoPoster, VideoViewer, attachmentFileIcon, attachmentSeconds, attachmentTypeLabel, formatAttachmentSeconds, formatAttachmentSize } from '@/components/chat/message-row';
import { PhotoAttachmentViewer } from '@/components/attachments/photo-attachment-viewer';
import { PdfViewer } from '@/components/pdf/pdf-viewer';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import type { AttachmentLike } from '@/db/types';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { isPdfAttachment } from '@/services/pdf-attachment';

/** One row: `saved` is false for something picked in this edit and not on the note yet. */
export type NoteAttachmentItem = { key: string; attachment: AttachmentLike; saved: boolean };

/** Up to about three and a half rows show before the list scrolls, so the note keeps its room. */
const LIST_MAX_HEIGHT = 228;

/**
 * A note's attachments as one list: photos kept outside the text, video,
 * audio and files. Each row opens or plays the way it does on the note
 * itself, and has its own delete. `footer` is the list's last row, for adding
 * another.
 */
export function NoteAttachmentList({ items, onRemove, onError, disabled = false, footer, style }: { items: NoteAttachmentItem[]; onRemove: (item: NoteAttachmentItem) => void; onError: (message: string) => void; disabled?: boolean; footer: ReactNode; style?: StyleProp<ViewStyle> }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const { rowStyle } = useDirection();
  const [viewing, setViewing] = useState<AttachmentLike | null>(null);
  const divider = { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSubtle };

  // Photos, video and PDFs open in Chits; any other file goes to the system's open-with sheet.
  const open = async (attachment: AttachmentLike) => {
    if (attachment.type === 'photo' || attachment.type === 'video' || isPdfAttachment(attachment)) { setViewing(attachment); return; }
    try {
      const uri = resolveAttachmentUri(attachment.storagePath);
      if (!uri || !await Sharing.isAvailableAsync()) throw new Error();
      await Sharing.shareAsync(uri, { mimeType: attachment.mimeType ?? undefined });
    } catch {
      onError(tr('messagerow.thisFileCouldNotBeOpened'));
    }
  };

  return <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, style]}>
    {items.length ? <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.list}>
      {items.map((item, index) => {
        const { attachment } = item;
        const video = attachment.type === 'video';
        const photo = attachment.type === 'photo';
        const seconds = attachmentSeconds(attachment.duration);
        const title = video || photo ? attachmentTypeLabel(attachment) : attachment.originalName ?? tr('attachments.document');
        const meta = (photo
          ? [attachment.width && attachment.height ? `${attachment.width} × ${attachment.height}` : null, formatAttachmentSize(attachment.size)]
          : video
            ? [seconds ? formatAttachmentSeconds(seconds) : null, formatAttachmentSize(attachment.size)]
            : [attachmentTypeLabel(attachment).replace(/ file$/, ''), formatAttachmentSize(attachment.size)]).filter(Boolean).join(' · ');
        return <View key={item.key} style={[styles.row, rowStyle, index > 0 && divider]}>
          {attachment.type === 'audio'
            // Audio plays right here, with its own play button and progress.
            ? <View style={styles.main}><AudioPlayer attachment={attachment} /></View>
            : <Pressable accessibilityRole="button" accessibilityLabel={meta ? `${title}, ${meta}` : title} accessibilityHint={photo ? tr('messagerow.opensThePhotoFullscreen') : video ? tr('messagerow.opensTheVideoPlayer') : isPdfAttachment(attachment) ? tr('messagerow.opensThePdfInChits') : undefined}
              onPress={() => void open(attachment)} style={({ pressed }) => [styles.main, styles.openRow, rowStyle, pressed && styles.pressed]}>
              <View style={[styles.thumb, { backgroundColor: theme.surfaceElevated }]}>
                {photo ? <Image source={resolveAttachmentUri(attachment.storagePath) ?? undefined} contentFit="cover" allowDownscaling style={StyleSheet.absoluteFill} />
                  : video ? <>
                    <VideoPoster attachment={attachment} style={StyleSheet.absoluteFill} />
                    <View style={styles.play}><Icon name="play" size={12} color="#FFFFFF" /></View>
                  </> : <Icon name={attachmentFileIcon(attachment)} size={20} color={theme.accentStrong} />}
              </View>
              <View style={styles.copy}>
                <AppText numberOfLines={1} style={[styles.title, { color: theme.textPrimary }]}>{title}</AppText>
                {meta ? <AppText numberOfLines={1} style={[styles.meta, { color: theme.textMuted }]}>{meta}</AppText> : null}
              </View>
            </Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={`${tr('attachments.deleteAttachment')}, ${title}`} accessibilityHint={item.saved ? tr('noteblockseditor.removedWhenYouSaveTheNote') : undefined}
            hitSlop={4} disabled={disabled} onPress={() => onRemove(item)} style={({ pressed }) => [styles.remove, pressed && { backgroundColor: theme.surfaceElevated }, disabled && styles.disabled]}>
            <Icon name="trash-outline" size={18} color={theme.textSecondary} />
          </Pressable>
        </View>;
      })}
    </ScrollView> : null}
    <View style={items.length ? divider : null}>{footer}</View>
    {viewing?.type === 'photo' ? <PhotoAttachmentViewer attachment={viewing} onDismiss={() => setViewing(null)} />
      : viewing?.type === 'video' ? <VideoViewer attachment={viewing} onDismiss={() => setViewing(null)} />
        : viewing ? <PdfViewer attachment={viewing} onDismiss={() => setViewing(null)} /> : null}
  </View>;
}

/**
 * The chip that folds the list away and back: "Attachments", with the count
 * once there's something attached. Locked open while a recording runs, since
 * the recording lives in the list.
 */
export function NoteAttachmentToggle({ count, open, onPress, disabled = false, style }: { count: number; open: boolean; onPress: () => void; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const { rowStyle } = useDirection();
  const label = count ? `${tr('attachments.attachments')} · ${count}` : tr('attachments.attachments');
  return <Pressable accessibilityRole="button" accessibilityLabel={count ? `${tr('attachments.attachments')}, ${count}` : tr('attachments.attachments')} accessibilityState={{ expanded: open, disabled }} hitSlop={4} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.toggle, rowStyle, pressed && styles.pressed, disabled && styles.disabled, style]}>
    <Icon name="attach-outline" size={17} color={theme.accentStrong} />
    <AppText numberOfLines={1} style={[styles.toggleLabel, { color: theme.accentStrong }]}>{label}</AppText>
    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={15} color={theme.accentStrong} />
  </Pressable>;
}

/** The list's last row: same height and inset as the others, in the accent. */
export function NoteAttachmentAddRow({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  const { rowStyle } = useDirection();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.openRow, styles.addRow, rowStyle, pressed && styles.pressed, disabled && styles.disabled]}>
    <View style={[styles.thumb, { backgroundColor: theme.accentSoft }]}><Icon name="add" size={22} color={theme.accentStrong} /></View>
    <AppText style={[styles.title, { color: theme.accentStrong }]}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  panel: { marginHorizontal: spacing.md, marginBottom: spacing.xs, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  list: { maxHeight: LIST_MAX_HEIGHT, flexGrow: 0 },
  row: { alignItems: 'center', paddingEnd: spacing.xxs },
  main: { flex: 1, minWidth: 0 },
  openRow: { minHeight: 60, alignItems: 'center', gap: spacing.sm, paddingStart: spacing.sm, paddingVertical: spacing.xs },
  addRow: { paddingEnd: spacing.sm },
  thumb: { width: 40, height: 40, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  play: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingLeft: 2 },
  copy: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 16 },
  remove: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  toggle: { minHeight: 44, alignItems: 'center', gap: 4 },
  toggleLabel: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
});
