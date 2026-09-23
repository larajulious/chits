import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AttachmentContent } from '@/components/chat/message-row';
import { useTheme } from '@/components/theme-provider';
import { radii, spacing } from '@/constants/theme';
import type { AttachmentLike, CardListItem } from '@/db/types';

const THUMBNAIL_SIZE = 68;

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
  if (!item.previewMediaType || !item.thumbnailUri) return null;
  return {
    id: item.id, type: item.previewMediaType, localUri: item.thumbnailUri,
    originalName: null, mimeType: null, size: null, duration: item.mediaDuration,
    width: null, height: null, createdAt: item.updatedAt,
  };
}

// A single compact square preview — the SAME footprint for photo, video, and
// audio, so a media card and a text-only card share nearly identical
// geometry (just this one small corner element differs). Deliberately NOT a
// full-width image: one large edge-to-edge photo was overpowering every
// text-only note in the list and breaking the list's scanning rhythm.
function CardThumbnail({ media, overflowCount }: { media: AttachmentLike; overflowCount: number }) {
  const { tokens: theme } = useTheme();
  return (
    <View style={styles.thumbnail}>
      {media.type === 'audio' ? (
        <View style={[styles.audioThumbnail, { backgroundColor: theme.accentSoft }]}>
          <Ionicons accessible={false} name="mic" size={20} color={theme.accentStrong} />
          {media.duration ? <Text style={[styles.audioThumbnailDuration, { color: theme.accentStrong }]}>{formatDurationSeconds(media.duration)}</Text> : null}
        </View>
      ) : (
        // pointerEvents="none": AttachmentContent's photo/video branches each
        // open their own fullscreen viewer on tap — here the whole card is the
        // one navigation target (opens Card Details), so touches on the
        // thumbnail must fall through to the outer Pressable rather than
        // compete with it.
        <View pointerEvents="none">
          <AttachmentContent attachment={media} variant="thumbnail" />
        </View>
      )}
      {overflowCount > 0 ? <View style={[styles.overflowBadge, { backgroundColor: 'rgba(0,0,0,0.66)' }]}><Text style={styles.overflowBadgeText}>+{overflowCount}</Text></View> : null}
    </View>
  );
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

// The global Cards view's row — a flattened, board-agnostic sibling of
// CardSurface (board/[id].native.tsx) built for a plain vertical list rather
// than a draggable column: same title/preview fallback data, no drag/move
// footer, board name + column name surfaced instead since a card here can be
// from any board. Every card — pinned, plain, or with media — shares this
// exact same anatomy/padding/typography; only the optional thumbnail differs.
// Memoized since this list can grow into the hundreds.
export const CardListRow = memo(function CardListRow({ item, onPress, onMore }: { item: CardListItem; onPress: () => void; onMore: () => void }) {
  const { tokens: theme } = useTheme();
  const hasPreview = Boolean(item.preview && item.preview !== item.title);
  const media = getCardPreviewMedia(item);
  const overflowCount = Math.max(0, item.mediaCount - 1);
  const fileBadge = item.fileCount > 0 ? { count: item.fileCount } : null;

  const location = item.boardName ? `${item.boardName} • ${item.columnName}` : 'Unorganized';
  const mediaPhrase = mediaAccessibilityPhrase(item);
  const overflowPhrase = overflowCount > 0 ? `${overflowCount} more attachment${overflowCount === 1 ? '' : 's'}.` : '';
  const accessibleLabel = `Card. ${accessibleTitle(item)}. ${mediaPhrase ? `${mediaPhrase} ` : ''}${overflowPhrase ? `${overflowPhrase} ` : ''}${item.boardName ?? 'Unorganized'}${item.columnName ? `, ${item.columnName}` : ''}.`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibleLabel}
      accessibilityHint={item.kind === 'thought' ? 'Opens in Chat' : 'Opens card details'}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.borderSubtle, borderLeftColor: item.boardAccent ?? theme.borderSubtle },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.top}>
        <View style={styles.copy}>
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={[styles.title, { color: theme.textPrimary }]}>{item.title}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Card actions" hitSlop={8} onPress={(event) => { event.stopPropagation(); onMore(); }} style={styles.more}>
              <Ionicons accessible={false} name="ellipsis-horizontal" size={18} color={theme.textMuted} />
            </Pressable>
          </View>
          {hasPreview ? <Text numberOfLines={2} style={[styles.preview, { color: theme.textSecondary }]}>{item.preview}</Text> : null}
        </View>
        {media ? <CardThumbnail media={media} overflowCount={overflowCount} /> : null}
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaLeft}>
          <Text numberOfLines={1} style={[styles.location, { color: theme.textMuted }]}>{location}</Text>
          {fileBadge ? <View style={styles.fileBadge}><Ionicons accessible={false} name="document-outline" size={11} color={theme.textMuted} /><Text style={[styles.fileBadgeText, { color: theme.textMuted }]}>{fileBadge.count}</Text></View> : null}
        </View>
        <Text style={[styles.date, { color: theme.textMuted }]}>{formatCardDate(item.updatedAt)}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { marginBottom: 10, borderRadius: radii.compactCard, borderWidth: StyleSheet.hairlineWidth, borderLeftWidth: 3, overflow: 'hidden', paddingVertical: 12, paddingHorizontal: 14 },
  pressed: { opacity: 0.6 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  copy: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { flex: 1, fontSize: 15, fontWeight: '600' },
  preview: { marginTop: 5, fontSize: 13, lineHeight: 18 },
  more: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginRight: -2 },
  // Fixed square (not full-width) — every card, media or not, keeps roughly
  // the same footprint. `overflow: 'hidden'` clips the inner AttachmentContent
  // (which is styled edge-to-edge for its own 'board'/'chat'/'detail' variants
  // elsewhere) down to this thumbnail's own rounded corners.
  thumbnail: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, borderRadius: 10, overflow: 'hidden' },
  audioThumbnail: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 3 },
  audioThumbnailDuration: { fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
  overflowBadge: { position: 'absolute', right: 4, bottom: 4, minWidth: 20, height: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  overflowBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: 9 },
  metaLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  location: { flexShrink: 1, fontSize: 12, fontWeight: '500' },
  fileBadge: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  fileBadgeText: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  date: { fontSize: 12 },
});
