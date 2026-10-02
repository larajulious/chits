import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AttachmentContent } from '@/components/chat/message-row';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { NoteCard, NoteCategory, useNoteColors } from '@/components/ui/note-card';
import { mix } from '@/constants/style-tokens';
import { spacing, type ThemeTokens } from '@/constants/theme';
import { tintWithAccent } from '@/constants/board-appearance';
import { formatReminder } from '@/services/reminder-time';
import type { AttachmentLike, CardListItem } from '@/db/types';

function formatCardDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
}

// AttachmentLike.duration is milliseconds throughout the app (see attachment-
// picker.native.tsx/message-row.native.tsx); mm:ss to match those same spots.
function formatDurationSeconds(durationMs: number) {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

// The one place a card's preview media becomes a renderable attachment-shaped
// object — the SQL layer (listAllCardSummaries / listUnorganizedSummaries)
// already resolved WHICH attachment wins and from which source (linked
// message vs. card_attachments); this just adapts that flat result into the
// AttachmentLike shape AttachmentContent already knows how to render, so the
// UI never has to know or care where the media came from.
function getCardPreviewMedia(item: CardListItem): AttachmentLike | null {
  if (!item.previewMediaType || !item.thumbnailPath) return null;
  return {
    id: item.id, type: item.previewMediaType, storagePath: item.thumbnailPath,
    originalName: null, mimeType: null, size: null, duration: item.mediaDuration,
    width: null, height: null, createdAt: item.updatedAt,
  };
}

// A short, human phrase describing the media itself — omitted when the
// card's own title already says the same thing (e.g. a title that's just the
// generic fallback "Photo"/"Video"/"Audio note"), per the accessibility rule:
// don't announce the thumbnail separately if the card already communicates
// the media context.
function mediaAccessibilityPhrase(item: CardListItem): string | null {
  if (!item.previewMediaType) return null;
  const seconds = item.mediaDuration ? Math.round(item.mediaDuration / 1000) : null;
  const titleLower = item.title.toLowerCase();
  if (item.previewMediaType === 'photo') return titleLower.includes('photo') ? null : 'Photo attachment.';
  // The exact generic-fallback title ("Video"/"Audio note") already has its
  // duration folded straight into the title clause by accessibleTitle below,
  // so this returns null for that exact case to avoid saying it twice. A
  // title that merely MENTIONS the word (e.g. "Demo video") still gets the
  // duration announced, just without repeating the redundant type word.
  const genericTitle = item.previewMediaType === 'video' ? 'Video' : 'Audio note';
  if (item.title === genericTitle) return null;
  if (titleLower.includes(item.previewMediaType)) return seconds ? `${seconds} seconds.` : null;
  return item.previewMediaType === 'video' ? `Video${seconds ? `, ${seconds} seconds` : ''}.` : `Audio note${seconds ? `, ${seconds} seconds` : ''}.`;
}

// When the title IS the generic fallback, fold the duration into the title
// clause itself instead of dropping it silently — matches "Audio note, 42
// seconds." rather than a bare, less useful "Audio note.".
function accessibleTitle(item: CardListItem): string {
  const seconds = item.mediaDuration ? Math.round(item.mediaDuration / 1000) : null;
  if (!seconds) return item.title;
  if (item.previewMediaType === 'video' && item.title === 'Video') return `${item.title}, ${seconds} seconds`;
  if (item.previewMediaType === 'audio' && item.title === 'Audio note') return `${item.title}, ${seconds} seconds`;
  return item.title;
}

const GENERIC_MEDIA_TITLES = new Set(['Photo', 'Video', 'Audio note', 'Attachment']);

type NoteContent =
  | { kind: 'hidden' }
  | { kind: 'text'; title: string | null; body: string | null }
  | { kind: 'file'; name: string };

// What the note *says*, decided once so the layout below stays declarative.
// A quick thought is shown as its own words (body text, like handwriting on a
// note), and a bold title appears only when the card has a real one distinct
// from its text. Titles that merely restate the media ("Photo", "Video") are
// dropped because the picture already says it, and a file-only card becomes a
// document chip rather than a filename masquerading as a headline.
function noteContent(item: CardListItem, hasMedia: boolean): NoteContent {
  if (item.hidden) return { kind: 'hidden' };
  const title = item.title.trim();
  const preview = item.preview?.trim() || null;
  if (preview) {
    return preview.startsWith(title) || title.startsWith(preview)
      ? { kind: 'text', title: null, body: preview }
      : { kind: 'text', title, body: preview };
  }
  if (item.fileCount > 0 && !hasMedia) return { kind: 'file', name: title };
  if (GENERIC_MEDIA_TITLES.has(title)) return { kind: 'text', title: null, body: null };
  // A card keeps its explicit title as a title; an unorganized thought's
  // "title" is just its own text, so it reads as the note body.
  return item.kind === 'card' ? { kind: 'text', title, body: null } : { kind: 'text', title: null, body: title };
}

function fileKindLabel(name: string, count: number) {
  if (count > 1) return `${count} files`;
  const extension = name.match(/\.([a-z0-9]{1,6})$/i)?.[1];
  return extension ? `${extension.toUpperCase()} document` : 'Document';
}

// Unorganized notes sit on the theme's neutral paper; board notes take a soft
// tint of their board's color, like sticky notes, so a glance at the grid
// shows which notes belong together.
function paperColors(accent: string | null, dark: boolean, theme: Pick<ThemeTokens, 'cardPaper' | 'cardBase' | 'borderSubtle'>) {
  if (!accent) return { paper: theme.cardPaper, edge: theme.borderSubtle };
  return { paper: tintWithAccent(theme.cardBase, accent, dark ? 0.16 : 0.1), edge: tintWithAccent(theme.borderSubtle, accent, dark ? 0.3 : 0.35) };
}

// One note in the Cards grid, designed as a *note* rather than a list item: a
// sheet of paper whose content leads, with photos/videos inset at the top like
// a clipped picture, voice notes as an audio pill, files as a document chip,
// and a quiet footer saying where the note lives and when. Heights follow
// content, so a quick thought is as compact as it should be. Memoized since this list
// can grow into the hundreds.
export const CardListRow = memo(function CardListRow({ item, onPress, onMore }: { item: CardListItem; onPress: () => void; onMore: () => void }) {
  const { scheme, tokens, styleTokens } = useTheme();
  const dark = scheme === 'dark';
  const accent = item.hidden ? null : item.boardAccent;
  // Sticky notes are tinted paper whatever the page, so their text uses the
  // note's own ink rather than the page's text colors.
  const note = useNoteColors(accent);
  const tinted = styleTokens.card.tinted;
  const theme = tinted ? {
    ...tokens, textPrimary: note.cardInk, textSecondary: note.cardInkMuted, textMuted: note.cardInkMuted,
    surfaceElevated: mix(note.cardTint, '#FFFFFF', 0.55), accentSoft: mix(note.cardTint, '#FFFFFF', 0.55), accentStrong: note.cardInk,
  } : tokens;
  const r = styleTokens.noteCard.detailRadius;
  const media = item.hidden ? null : getCardPreviewMedia(item);
  const picture = media && media.type !== 'audio' ? media : null;
  const audio = media?.type === 'audio' ? media : null;
  const overflowCount = Math.max(0, item.mediaCount - 1);
  const content = noteContent(item, Boolean(media));
  const showFileBadge = item.fileCount > 0 && content.kind !== 'file' && !item.hidden;

  const paper = paperColors(accent, dark, tokens);
  // Half-width notes: the board name alone reads cleanly; the column is in the label for screen readers.
  const location = item.boardName ?? 'Unorganized';
  const mediaPhrase = mediaAccessibilityPhrase(item);
  const overflowPhrase = overflowCount > 0 ? `${overflowCount} more attachment${overflowCount === 1 ? '' : 's'}.` : '';
  const reminderLabel = item.reminderAt ? formatReminder(new Date(item.reminderAt), new Date()) : null;
  const accessibleLabel = `${item.hidden ? 'Hidden note' : `Note. ${accessibleTitle(item)}`}. ${mediaPhrase ? `${mediaPhrase} ` : ''}${overflowPhrase ? `${overflowPhrase} ` : ''}${item.pinned ? 'Pinned. ' : ''}${!item.hidden && item.subtaskCount ? `${item.completedSubtaskCount} of ${item.subtaskCount} subtasks completed. ` : ''}${reminderLabel ? `Reminder ${reminderLabel}. ` : ''}${item.boardName ?? 'Unorganized'}${item.columnName ? `, ${item.columnName}` : ''}.`;

  return (
    <NoteCard
      id={item.id}
      accent={accent}
      paper={paper.paper}
      border={paper.edge}
      accessibilityRole="button"
      accessibilityLabel={accessibleLabel}
      accessibilityHint={item.kind === 'thought' ? 'Opens in Chat' : 'Opens card details'}
      onPress={onPress}
    >
      <View style={styles.noteContent}>
      {picture ? (
        // pointerEvents="none": the whole note is the tap target (Card
        // Details / Chat); the picture must not open its own viewer.
        <View pointerEvents="none" style={[styles.picture, { borderRadius: r.media, backgroundColor: theme.surfaceElevated }]}>
          <AttachmentContent attachment={picture} variant="grid" />
          {picture.type === 'video' ? <View style={styles.videoPlay}><Icon name="play" size={20} color="#FFFFFF" /></View> : null}
          {picture.type === 'video' && picture.duration ? <View style={[styles.durationBadge, { borderRadius: r.badge }]}><AppText weight="600" style={styles.durationBadgeText}>{formatDurationSeconds(picture.duration)}</AppText></View> : null}
          {overflowCount > 0 ? <View style={styles.overflowBadge}><AppText weight="700" style={styles.overflowBadgeText}>+{overflowCount}</AppText></View> : null}
        </View>
      ) : null}

      {content.kind === 'hidden' ? (
        <View style={styles.hiddenRow}>
          <View style={[styles.hiddenIcon, { backgroundColor: theme.surfaceElevated }]}><Icon name="eye-off-outline" size={16} color={theme.textMuted} /></View>
          <View style={styles.flexCopy}>
            <AppText weight="600" style={[styles.hiddenTitle, { color: theme.textSecondary }]}>Hidden Chit</AppText>
            <AppText style={[styles.hiddenCopy, { color: theme.textMuted }]}>Content is hidden</AppText>
          </View>
        </View>
      ) : content.kind === 'file' ? (
        <View style={styles.fileRow}>
          <View style={[styles.fileIcon, { borderRadius: r.tile, backgroundColor: theme.surfaceElevated }]}><Icon name={/\.pdf$/i.test(content.name) ? 'document-text-outline' : 'document-outline'} size={20} color={theme.textSecondary} /></View>
          <View style={styles.flexCopy}>
            <AppText weight="600" numberOfLines={2} style={[styles.fileName, { color: theme.textPrimary }]}>{content.name}</AppText>
            <AppText style={[styles.fileMeta, { color: theme.textMuted }]}>{fileKindLabel(content.name, item.fileCount)}</AppText>
          </View>
        </View>
      ) : (
        <>
          {content.title ? <AppText variant="display" weight="700" numberOfLines={3} style={[styles.title, { color: theme.textPrimary }]}>{content.title}</AppText> : null}
          {content.body ? <AppText variant="paragraph" numberOfLines={content.title ? 5 : 8} style={[content.title ? styles.bodyUnderTitle : styles.body, { color: content.title ? theme.textSecondary : theme.textPrimary }]}>{content.body}</AppText> : null}
        </>
      )}

      {!item.hidden && item.subtaskPreview?.length ? (
        <View style={styles.checklist}>
          {item.subtaskPreview.map((subtask) => (
            <View key={subtask.id} style={styles.checklistRow}>
              <Icon name={subtask.isCompleted ? 'checkbox' : 'square-outline'} size={15} color={theme.textMuted} />
              <AppText variant="paragraph" numberOfLines={2} style={[styles.checklistText, { color: subtask.isCompleted ? theme.textMuted : theme.textPrimary }, subtask.isCompleted && styles.completedText]}>{subtask.title}</AppText>
            </View>
          ))}
          {item.subtaskCount > 4 ? <AppText style={[styles.checklistMore, { color: theme.textMuted }]}>+{item.subtaskCount - 4} more</AppText> : null}
          <AppText style={[styles.checklistProgress, { color: theme.textMuted }]}>{item.subtaskCount - item.completedSubtaskCount} remaining</AppText>
        </View>
      ) : null}

      {audio ? (
        <View style={[styles.audioPill, { borderRadius: r.strip, backgroundColor: theme.accentSoft }]}>
          <View style={styles.waveform}>{[7, 14, 10, 18, 9, 14, 6].map((height, index) => <View key={index} style={[styles.waveformBar, { height, backgroundColor: theme.accentStrong }]} />)}</View>
          <AppText weight="700" style={[styles.audioText, { color: theme.accentStrong }]}>Voice note{audio.duration ? ` · ${formatDurationSeconds(audio.duration)}` : ''}</AppText>
        </View>
      ) : null}
      {/* Secondary metadata, not a due date: a small muted bell and time. */}
      {reminderLabel ? (
        <View style={styles.reminderLine}>
          <Icon name="notifications-outline" size={12} color={theme.textMuted} />
          <AppText weight="600" numberOfLines={1} style={[styles.reminderText, { color: theme.textMuted }]}>{reminderLabel}</AppText>
        </View>
      ) : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <NoteCategory label={location} color={theme.textSecondary} />
        </View>
        <View style={styles.footerMeta}>
          {item.pinned ? <Icon name="pin" size={12} color={theme.textMuted} /> : null}
          {showFileBadge ? <View style={styles.fileBadge}><Icon name="attach" size={13} color={theme.textMuted} /><AppText weight="600" style={[styles.fileBadgeText, { color: theme.textMuted }]}>{item.fileCount}</AppText></View> : null}
          <AppText style={[styles.date, { color: theme.textMuted }]}>{formatCardDate(item.updatedAt)}</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Card actions" hitSlop={10} onPress={(event) => { event.stopPropagation(); onMore(); }} style={styles.more}>
          <Icon name="ellipsis-horizontal" size={17} color={theme.textMuted} />
        </Pressable>
      </View>
    </NoteCard>
  );
});

const styles = StyleSheet.create({
  noteContent: { minWidth: 0, alignSelf: 'stretch' },
  picture: { height: 118, marginBottom: 10, overflow: 'hidden' },
  videoPlay: { position: 'absolute', alignSelf: 'center', top: 39, width: 40, height: 40, borderRadius: 40 / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  durationBadge: { position: 'absolute', left: 7, bottom: 7, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: 'rgba(0,0,0,0.62)' },
  durationBadgeText: { color: '#FFFFFF', fontSize: 10 },
  overflowBadge: { position: 'absolute', right: 8, bottom: 8, minWidth: 26, height: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 20 / 2, backgroundColor: 'rgba(0,0,0,0.62)' },
  overflowBadgeText: { color: '#FFFFFF', fontSize: 11 },
  title: { fontSize: 16, lineHeight: 22, letterSpacing: -0.1 },
  body: { fontSize: 15.5, lineHeight: 22 },
  bodyUnderTitle: { marginTop: 5, fontSize: 14, lineHeight: 20 },
  checklist: { marginTop: 12, gap: 6 },
  checklistRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  checklistText: { flex: 1, minWidth: 0, fontSize: 12.5, lineHeight: 17 },
  completedText: { textDecorationLine: 'line-through' },
  checklistMore: { fontSize: 11.5, marginLeft: 21 },
  checklistProgress: { fontSize: 11, marginTop: 2 },
  flexCopy: { flex: 1, minWidth: 0 },
  hiddenRow: { gap: spacing.xs },
  hiddenIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 34 / 2 },
  hiddenTitle: { fontSize: 15, lineHeight: 20 },
  hiddenCopy: { fontSize: 12, lineHeight: 16 },
  fileRow: { gap: spacing.xs },
  fileIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 14, lineHeight: 19 },
  fileMeta: { marginTop: 1, fontSize: 12, lineHeight: 16 },
  audioPill: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34, marginTop: 10, paddingHorizontal: 9 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  // Fully rounded bar ends (radius ≥ half the 2pt width).
  waveformBar: { width: 2, borderRadius: 2, opacity: 0.8 },
  audioText: { fontSize: 12, fontVariant: ['tabular-nums'] },
  reminderLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10 },
  reminderText: { flexShrink: 1, fontSize: 11.5, fontVariant: ['tabular-nums'] },
  footer: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  footerLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fileBadge: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  fileBadgeText: { fontSize: 11, fontVariant: ['tabular-nums'] },
  date: { fontSize: 11.5, fontVariant: ['tabular-nums'] },
  more: { width: 26, height: 28, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
});
