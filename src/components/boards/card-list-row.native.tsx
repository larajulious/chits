import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AttachmentContent } from '@/components/chat/message-row';
import { useTheme } from '@/components/theme-provider';
import { radii, spacing } from '@/constants/theme';
import { tintWithAccent } from '@/constants/board-appearance';
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

// Unorganized notes sit on a warm, neutral paper; board notes take a soft
// tint of their board's color, like sticky notes, so a glance at the grid
// shows which notes belong together.
const WARM_PAPER = '#FBFAF6';
function paperColors(accent: string | null, dark: boolean, surface: string, border: string) {
  if (dark) return { paper: accent ? tintWithAccent(surface, accent, 0.16) : surface, edge: accent ? tintWithAccent(border, accent, 0.3) : border };
  return { paper: accent ? tintWithAccent('#FFFFFF', accent, 0.1) : WARM_PAPER, edge: accent ? tintWithAccent(border, accent, 0.35) : border };
}

// One note in the Cards grid, designed as a *note* rather than a list item: a
// sheet of paper whose content leads, with photos/videos inset at the top like
// a clipped picture, voice notes as an audio pill, files as a document chip,
// and a quiet footer pinned to the bottom saying where the note lives (the
// board's color as a small dot) and when. Every variant shares the same paper,
// padding and footer so the grid keeps one rhythm. Memoized since this list
// can grow into the hundreds.
export const CardListRow = memo(function CardListRow({ item, onPress, onMore }: { item: CardListItem; onPress: () => void; onMore: () => void }) {
  const { scheme, tokens: theme } = useTheme();
  const dark = scheme === 'dark';
  const media = item.hidden ? null : getCardPreviewMedia(item);
  const picture = media && media.type !== 'audio' ? media : null;
  const audio = media?.type === 'audio' ? media : null;
  const overflowCount = Math.max(0, item.mediaCount - 1);
  const content = noteContent(item, Boolean(media));
  const showFileBadge = item.fileCount > 0 && content.kind !== 'file' && !item.hidden;

  const paper = paperColors(item.hidden ? null : item.boardAccent, dark, theme.surface, theme.borderSubtle);
  // Half-width notes: the board name alone reads cleanly; the column is in the label for screen readers.
  const location = item.boardName ?? 'Unorganized';
  const mediaPhrase = mediaAccessibilityPhrase(item);
  const overflowPhrase = overflowCount > 0 ? `${overflowCount} more attachment${overflowCount === 1 ? '' : 's'}.` : '';
  const accessibleLabel = `${item.hidden ? 'Hidden note' : `Note. ${accessibleTitle(item)}`}. ${mediaPhrase ? `${mediaPhrase} ` : ''}${overflowPhrase ? `${overflowPhrase} ` : ''}${item.pinned ? 'Pinned. ' : ''}${item.boardName ?? 'Unorganized'}${item.columnName ? `, ${item.columnName}` : ''}.`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibleLabel}
      accessibilityHint={item.kind === 'thought' ? 'Opens in Chat' : 'Opens card details'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.note,
        { backgroundColor: paper.paper, borderColor: paper.edge },
        !dark && styles.paperShadow,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.noteContent}>
      {picture ? (
        // pointerEvents="none": the whole note is the tap target (Card
        // Details / Chat); the picture must not open its own viewer.
        <View pointerEvents="none" style={[styles.picture, { backgroundColor: theme.surfaceElevated }]}>
          <AttachmentContent attachment={picture} variant="grid" />
          {overflowCount > 0 ? <View style={styles.overflowBadge}><Text style={styles.overflowBadgeText}>+{overflowCount}</Text></View> : null}
        </View>
      ) : null}

      {content.kind === 'hidden' ? (
        <View style={styles.hiddenRow}>
          <View style={[styles.hiddenIcon, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name="eye-off-outline" size={16} color={theme.textMuted} /></View>
          <View style={styles.flexCopy}>
            <Text style={[styles.hiddenTitle, { color: theme.textSecondary }]}>Hidden Chit</Text>
            <Text style={[styles.hiddenCopy, { color: theme.textMuted }]}>Content is hidden</Text>
          </View>
        </View>
      ) : content.kind === 'file' ? (
        <View style={styles.fileRow}>
          <View style={[styles.fileIcon, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name={/\.pdf$/i.test(content.name) ? 'document-text-outline' : 'document-outline'} size={20} color={theme.textSecondary} /></View>
          <View style={styles.flexCopy}>
            <Text numberOfLines={2} style={[styles.fileName, { color: theme.textPrimary }]}>{content.name}</Text>
            <Text style={[styles.fileMeta, { color: theme.textMuted }]}>{fileKindLabel(content.name, item.fileCount)}</Text>
          </View>
        </View>
      ) : (
        <>
          {content.title ? <Text numberOfLines={3} style={[styles.title, { color: theme.textPrimary }]}>{content.title}</Text> : null}
          {content.body ? <Text numberOfLines={content.title ? 5 : 8} style={[content.title ? styles.bodyUnderTitle : styles.body, { color: content.title ? theme.textSecondary : theme.textPrimary }]}>{content.body}</Text> : null}
        </>
      )}

      {audio ? (
        <View style={[styles.audioPill, { backgroundColor: theme.accentSoft }]}>
          <Ionicons accessible={false} name="mic" size={14} color={theme.accentStrong} />
          <Text style={[styles.audioText, { color: theme.accentStrong }]}>Voice note{audio.duration ? ` · ${formatDurationSeconds(audio.duration)}` : ''}</Text>
        </View>
      ) : null}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {item.boardName
            ? <View style={[styles.boardDot, { backgroundColor: item.boardAccent ?? theme.textMuted }]} />
            : <Ionicons accessible={false} name="file-tray-outline" size={13} color={theme.textMuted} />}
          <Text numberOfLines={1} style={[styles.location, { color: theme.textSecondary }]}>{location}</Text>
        </View>
        <View style={styles.footerMeta}>
          {item.pinned ? <Ionicons accessible={false} name="pin" size={12} color={theme.textMuted} /> : null}
          {showFileBadge ? <View style={styles.fileBadge}><Ionicons accessible={false} name="attach" size={13} color={theme.textMuted} /><Text style={[styles.fileBadgeText, { color: theme.textMuted }]}>{item.fileCount}</Text></View> : null}
          <Text style={[styles.date, { color: theme.textMuted }]}>{formatCardDate(item.updatedAt)}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Card actions" hitSlop={10} onPress={(event) => { event.stopPropagation(); onMore(); }} style={styles.more}>
          <Ionicons accessible={false} name="ellipsis-horizontal" size={17} color={theme.textMuted} />
        </Pressable>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  // flex: 1 + space-between: notes in a grid row share a height and keep their footer at the bottom.
  note: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0, justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8, borderRadius: radii.contentCard, borderWidth: StyleSheet.hairlineWidth },
  // A soft lift so the note reads as paper on the page, not a table row.
  paperShadow: { shadowColor: '#000000', shadowOpacity: 0.07, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  noteContent: { minWidth: 0, alignSelf: 'stretch' },
  picture: { height: 118, marginBottom: 10, borderRadius: 12, overflow: 'hidden' },
  overflowBadge: { position: 'absolute', right: 8, bottom: 8, minWidth: 26, height: 20, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.62)' },
  overflowBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  title: { fontSize: 15.5, lineHeight: 20, fontWeight: '700', letterSpacing: -0.1 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyUnderTitle: { marginTop: 4, fontSize: 13.5, lineHeight: 19 },
  flexCopy: { flex: 1, minWidth: 0 },
  hiddenRow: { gap: spacing.xs },
  hiddenIcon: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  hiddenTitle: { fontSize: 15, lineHeight: 20, fontWeight: '600' },
  hiddenCopy: { fontSize: 12, lineHeight: 16 },
  fileRow: { gap: spacing.xs },
  fileIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  fileName: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  fileMeta: { marginTop: 1, fontSize: 12, lineHeight: 16 },
  audioPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28, marginTop: 10, paddingHorizontal: 10, borderRadius: radii.pill },
  audioText: { fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  footer: { minHeight: 28, flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12 },
  footerLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  boardDot: { width: 8, height: 8, borderRadius: 4 },
  location: { flexShrink: 1, fontSize: 12, fontWeight: '600' },
  fileBadge: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  fileBadgeText: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  date: { fontSize: 11.5, fontVariant: ['tabular-nums'] },
  more: { width: 26, height: 28, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
});
