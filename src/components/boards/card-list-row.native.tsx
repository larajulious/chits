import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { AttachmentContent } from '@/components/chat/message-row';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { NoteCard, NoteCategory, useNoteColors } from '@/components/ui/note-card';
import { mix } from '@/constants/style-tokens';
import { type ThemeTokens } from '@/constants/theme';
import { tintWithAccent } from '@/constants/board-appearance';
import { formatReminder, dateFormat } from '@/services/reminder-time';
import type { AttachmentLike, CardListItem } from '@/db/types';

function formatCardDate(timestamp: number) {
  return dateFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
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
  if (item.previewMediaType === 'photo') return titleLower.includes('photo') ? null : tr("cardlistrow.photoAttachment");
  // The exact generic-fallback title ("Video"/"Audio note") already has its
  // duration folded straight into the title clause by accessibleTitle below,
  // so this returns null for that exact case to avoid saying it twice. A
  // title that merely MENTIONS the word (e.g. "Demo video") still gets the
  // duration announced, just without repeating the redundant type word.
  const genericTitle = item.previewMediaType === 'video' ? tr("addcardattachmentsheet.video") : tr("messagerow.audioNote");
  if (item.title === genericTitle) return null;
  if (titleLower.includes(item.previewMediaType)) return seconds ? tr('common.seconds', { count: seconds }) + '.' : null;
  return (item.previewMediaType === 'video' ? tr('addcardattachmentsheet.video') : tr('messagerow.audioNote')) + (seconds ? ', ' + tr('common.seconds', { count: seconds }) : '') + '.';
}

// When the title IS the generic fallback, fold the duration into the title
// clause itself instead of dropping it silently — matches "Audio note, 42
// seconds." rather than a bare, less useful "Audio note.".
function accessibleTitle(item: CardListItem): string {
  const seconds = item.mediaDuration ? Math.round(item.mediaDuration / 1000) : null;
  if (!seconds) return item.title;
  if (item.previewMediaType === 'video' && item.title === tr("addcardattachmentsheet.video")) return tr('common.withDuration', { title: item.title, duration: tr('common.seconds', { count: seconds }) });
  if (item.previewMediaType === 'audio' && item.title === tr("messagerow.audioNote")) return tr('common.withDuration', { title: item.title, duration: tr('common.seconds', { count: seconds }) });
  return item.title;
}

const genericMediaTitles = () => new Set([tr("id.photo"), tr("addcardattachmentsheet.video"), tr("messagerow.audioNote"), tr("attachmentexportnaming.attachment")]);

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
  const preview = (item.checklistSummary ? item.checklistSummary.text : item.preview)?.trim() || null;
  if (item.checklistSummary) {
    const heading = preview?.split('\n')[0] ?? null;
    const explicitTitle = item.kind === 'card' && !item.preview?.trim().startsWith(title.replace(/…$/, ''));
    return { kind: 'text', title: explicitTitle ? title : heading, body: explicitTitle ? preview : preview?.slice(heading?.length ?? 0).trim() || null };
  }
  if (preview) {
    return preview.startsWith(title) || title.startsWith(preview)
      ? { kind: 'text', title: null, body: preview }
      : { kind: 'text', title, body: preview };
  }
  if (item.fileCount > 0 && !hasMedia) return { kind: 'file', name: title };
  if (genericMediaTitles().has(title)) return { kind: 'text', title: null, body: null };
  // A card keeps its explicit title as a title; an unorganized thought's
  // "title" is just its own text, so it reads as the note body.
  return item.kind === 'card' ? { kind: 'text', title, body: null } : { kind: 'text', title: null, body: title };
}

function fileKindLabel(name: string, count: number) {
  if (count > 1) return `${count} files`;
  const extension = name.match(/\.([a-z0-9]{1,6})$/i)?.[1];
  return extension ? `${extension.toUpperCase()} document` : tr("attachments.document");
}

// Unorganized notes sit on the theme's neutral paper; board notes take a soft
// tint of their board's color, like sticky notes, so a glance at the grid
// shows which notes belong together.
function paperColors(accent: string | null, dark: boolean, theme: Pick<ThemeTokens, 'cardPaper' | 'cardBase' | 'borderSubtle'>) {
  if (!accent) return { paper: theme.cardPaper, edge: theme.borderSubtle };
  return { paper: tintWithAccent(theme.cardBase, accent, dark ? 0.16 : 0.1), edge: tintWithAccent(theme.borderSubtle, accent, dark ? 0.3 : 0.35) };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

// A content-first note tile: a quiet paper surface, optional cover, a bounded
// preview and one line of metadata. Tapping opens the note; pressing springs
// the tile down, a long press opens its actions, and subtasks tick in place.
export const CardListRow = memo(function CardListRow({ item, onPress, onMore, onToggleSubtask }: { item: CardListItem; onPress: () => void; onMore: () => void; onToggleSubtask?: (subtaskId: string) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { scheme, tokens, styleTokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.get() }] }));
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
  const checklist = item.hidden ? null : item.checklistSummary;
  const showFileBadge = item.fileCount > 0 && content.kind !== 'file' && !item.hidden;
  const connectionCount = item.hidden ? 0 : item.connectionCount ?? 0;

  const paper = paperColors(accent, dark, tokens);
  const cardFill = tinted ? note.cardTint : paper.paper;
  const frame = mix(cardFill, tinted ? note.cardEdge : tokens.textSecondary, dark ? 0.24 : 0.12);
  const progressColor = tinted ? note.cardInk : dark ? '#E6A5B6' : '#802743';
  const hasCopy = content.kind !== 'text' || Boolean(content.title || content.body || checklist || item.subtaskPreview?.length || audio || item.reminderAt);
  // Half-width notes: the board name alone reads cleanly; the column is in the label for screen readers.
  const location = item.boardName ?? tr("index.unorganized");
  const mediaPhrase = mediaAccessibilityPhrase(item);
  const overflowPhrase = overflowCount > 0 ? tr('common.moreAttachments', { count: overflowCount }) : '';
  const reminderLabel = item.reminderAt ? formatReminder(new Date(item.reminderAt), new Date()) : null;
  // A reminder due within a day stands out in the accent; one that has
  // passed (until the list catches up) in the danger color. Sticky keeps its ink.
  const reminderDue = item.reminderAt ? item.reminderAt - Date.now() : null;
  const reminder = reminderDue === null ? null
    : tinted ? { fill: theme.surfaceElevated, ink: theme.textPrimary, icon: 'notifications-outline' as const }
      : reminderDue < 0 ? { fill: mix(cardFill, tokens.danger, dark ? 0.22 : 0.12), ink: tokens.danger, icon: 'notifications' as const }
        : reminderDue < DAY_MS ? { fill: mix(cardFill, tokens.accent, dark ? 0.22 : 0.3), ink: tokens.accentStrong, icon: 'notifications' as const }
          : { fill: mix(cardFill, theme.textPrimary, 0.06), ink: theme.textSecondary, icon: 'notifications-outline' as const };
  const accessibleLabel = `${item.hidden ? tr("entrydetailsheet.hiddenNote") : `Note. ${accessibleTitle(item)}`}. ${checklist ? tr("messages.ofChecklistItemsCompleted", { value1: checklist.completed, value2: checklist.total }) : ''}${mediaPhrase ? `${mediaPhrase} ` : ''}${overflowPhrase ? `${overflowPhrase} ` : ''}${item.pinned ? 'Pinned. ' : ''}${!item.hidden && item.subtaskCount ? tr("messages.ofSubtasksCompleted2", { value1: item.completedSubtaskCount, value2: item.subtaskCount }) : ''}${reminderLabel ? `Reminder ${reminderLabel}. ` : ''}${item.boardName ?? tr("index.unorganized")}${item.columnName ? `, ${item.columnName}` : ''}.`;

  return (
    <Animated.View style={pressStyle}>
    <NoteCard
      id={item.id}
      accent={accent}
      paper={paper.paper}
      border={frame}
      variant="collection"
      accessibilityRole="button"
      accessibilityLabel={connectionCount ? `${accessibleLabel} ${tr('connectednotes.connectedNotes')}, ${countLabel('link', connectionCount)}.` : accessibleLabel}
      accessibilityHint={tr("cardlistrow.opensNote")}
      onPress={onPress}
      onPressIn={() => { if (!reduceMotion) press.set(withSpring(0.965, PRESS_SPRING)); }}
      onPressOut={() => press.set(withSpring(1, PRESS_SPRING))}
      onLongPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onMore(); }}
      delayLongPress={350}
      pressedStyle={reduceMotion ? styles.reducedPressed : styles.springPressed}
      style={styles.card}
    >
      {picture ? (
        <View pointerEvents="none" style={[styles.picture, { borderTopLeftRadius: styleTokens.noteCard.radius.topLeft, borderTopRightRadius: styleTokens.noteCard.radius.topRight, backgroundColor: theme.surfaceElevated }]}>
          <AttachmentContent attachment={picture} variant="grid" />
          {picture.type === "video" ? <View style={styles.videoPlay}><Icon name="play" size={18} color="#FFFFFF" /></View> : null}
          {picture.type === "video" && picture.duration ? <View style={styles.durationBadge}><AppText weight="600" style={styles.durationBadgeText}>{formatDurationSeconds(picture.duration)}</AppText></View> : null}
          {overflowCount > 0 ? <View style={styles.overflowBadge}><AppText weight="700" style={styles.overflowBadgeText}>+{overflowCount}</AppText></View> : null}
        </View>
      ) : null}

      {hasCopy ? <View style={[styles.noteContent, !picture && styles.textOnlyContent, item.pinned && !picture && styles.besidePin]}>
        {content.kind === 'hidden' ? (
          <View style={styles.hiddenRow}>
            <Icon name="lock-closed-outline" size={18} color={theme.textMuted} />
            <AppText weight="600" style={[styles.hiddenTitle, { color: theme.textSecondary }]}>{tr("index.hiddenChit")}</AppText>
            <AppText style={[styles.hiddenCopy, { color: theme.textMuted }]}>{tr("cardlistrow.openToReveal")}</AppText>
          </View>
        ) : content.kind === "file" ? (
          <View style={styles.fileRow}>
            <View style={[styles.fileIcon, { borderRadius: r.tile, backgroundColor: theme.surfaceElevated }]}><Icon name={/\.pdf$/i.test(content.name) ? 'document-text-outline' : 'document-outline'} size={22} color={theme.textSecondary} /></View>
            <AppText weight="600" numberOfLines={2} style={[styles.fileName, { color: theme.textPrimary }]}>{content.name}</AppText>
            <AppText style={[styles.fileMeta, { color: theme.textMuted }]}>{fileKindLabel(content.name, item.fileCount)}</AppText>
          </View>
        ) : <>
          {content.title ? <AppText variant="display" weight="600" numberOfLines={2} style={[styles.title, { color: theme.textPrimary }]}>{content.title}</AppText> : null}
          {content.body ? <AppText variant="paragraph" numberOfLines={checklist || item.subtaskPreview?.length ? 3 : content.title ? 4 : 6} style={[content.title ? styles.bodyUnderTitle : styles.body, { color: content.title ? theme.textSecondary : theme.textPrimary }]}>{content.body}</AppText> : null}
          {checklist && !content.title && !content.body ? <AppText variant="display" weight="600" style={[styles.title, { color: theme.textPrimary }]}>{tr("cardlistrow.checklist")}</AppText> : null}
        </>}

        {checklist ? <View style={styles.checklist}>
          <View style={styles.progressLabels}>
            <AppText weight="600" style={[styles.progressCount, { color: theme.textSecondary }]}>{checklist.completed} {' '}{tr("id.of")}{' '}{checklist.total} {' '}{tr("cardlistrow.done")}</AppText>
            <AppText style={[styles.progressPercent, { color: theme.textMuted }]}>{checklist.percent}%</AppText>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: mix(cardFill, progressColor, 0.12) }]}>
            <View style={[styles.progressFill, { width: `${checklist.percent}%`, backgroundColor: progressColor }]} />
          </View>
          {checklist.remaining.map((text, index) => <View key={index} style={styles.checklistRow}>
            <View style={[styles.previewCheckbox, { borderColor: theme.textMuted }]} />
            <AppText variant="paragraph" numberOfLines={2} style={[styles.checklistText, { color: theme.textSecondary }]}>{text}</AppText>
          </View>)}
          {checklist.total - checklist.completed > 3 ? <AppText style={[styles.checklistMore, { color: theme.textMuted }]}>+{checklist.total - checklist.completed - 3} {' '}{tr("cardlistrow.more")}</AppText> : null}
        </View> : null}

        {!item.hidden && item.subtaskPreview?.length ? <View style={styles.checklist}>
          <AppText weight="600" style={[styles.progressCount, { color: theme.textSecondary }]}>{checklist ? tr("cardlistrow.cardTasks") : ''}{item.completedSubtaskCount} {' '}{tr("id.of")}{' '}{item.subtaskCount} {' '}{tr("cardlistrow.done")}</AppText>
          {item.subtaskPreview.slice(0, 3).map((subtask) => <Pressable
            key={subtask.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: subtask.isCompleted, disabled: !onToggleSubtask }}
            accessibilityLabel={subtask.title}
            disabled={!onToggleSubtask}
            hitSlop={{ top: 5, bottom: 5 }}
            onPress={(event) => { event.stopPropagation(); onToggleSubtask?.(subtask.id); }}
            style={({ pressed }) => [styles.checklistRow, pressed && styles.subtaskPressed]}
          >
            <View style={[styles.previewCheckbox, { borderColor: subtask.isCompleted ? progressColor : theme.textMuted, backgroundColor: subtask.isCompleted ? progressColor : 'transparent' }]}>{subtask.isCompleted ? <Icon name="checkmark" size={11} color={cardFill} /> : null}</View>
            <AppText variant="paragraph" numberOfLines={2} style={[styles.checklistText, { color: subtask.isCompleted ? theme.textMuted : theme.textSecondary }, subtask.isCompleted && styles.completedText]}>{subtask.title}</AppText>
          </Pressable>)}
          {item.subtaskCount > 3 ? <AppText style={[styles.checklistMore, { color: theme.textMuted }]}>+{item.subtaskCount - 3} {' '}{tr("cardlistrow.more")}</AppText> : null}
        </View> : null}

        {audio ? <View style={[styles.audioPill, { borderRadius: r.strip, backgroundColor: theme.accentSoft }]}>
          <View style={styles.waveform}>{[7, 14, 10, 18, 9, 14, 6].map((height, index) => <View key={index} style={[styles.waveformBar, { height, backgroundColor: theme.accentStrong }]} />)}</View>
          <AppText weight="600" style={[styles.audioText, { color: theme.accentStrong }]}>{audio.duration ? formatDurationSeconds(audio.duration) : tr("cardlistrow.voiceNote")}</AppText>
        </View> : null}
        {reminder && reminderLabel ? <View style={[styles.reminderChip, { backgroundColor: reminder.fill }]}>
          <Icon name={reminder.icon} size={12} color={reminder.ink} />
          <AppText weight="600" numberOfLines={1} style={[styles.reminderText, { color: reminder.ink }]}>{reminderLabel}</AppText>
        </View> : null}
      </View> : null}

      <View style={styles.footer}>
        <View style={styles.footerMeta}>
          {tinted ? <NoteCategory label={location} color={theme.textMuted} />
            : accent ? <View style={[styles.boardLabel, { backgroundColor: mix(cardFill, accent, dark ? 0.22 : 0.18) }]}>
              <View style={[styles.boardDot, { backgroundColor: accent, borderColor: mix(accent, theme.textPrimary, 0.25) }]} />
              <AppText weight="600" numberOfLines={1} style={[styles.location, { color: theme.textSecondary }]}>{location}</AppText>
            </View>
              : <AppText weight="500" numberOfLines={1} style={[styles.location, { color: theme.textMuted }]}>{location}</AppText>}
          <AppText style={[styles.date, { color: theme.textMuted }]}>{formatCardDate(item.updatedAt)}</AppText>
          {showFileBadge ? <View style={styles.badge}><Icon name="attach" size={13} color={theme.textMuted} /><AppText style={[styles.badgeText, { color: theme.textMuted }]}>{item.fileCount}</AppText></View> : null}
          {connectionCount > 0 ? <View style={styles.badge}><Icon name="link-outline" size={13} color={theme.textSecondary} /><AppText style={[styles.badgeText, { color: theme.textSecondary }]}>{connectionCount}</AppText></View> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("cardlistrow.cardActions")} hitSlop={6} onPress={(event) => { event.stopPropagation(); onMore(); }} style={({ pressed }) => [styles.more, pressed && { backgroundColor: mix(cardFill, theme.textPrimary, 0.08) }]}>
          <Icon name="ellipsis-horizontal" size={16} color={theme.textMuted} />
        </Pressable>
      </View>

      {item.pinned ? <View pointerEvents="none" style={[styles.pin, picture ? styles.pinOnPicture : { backgroundColor: mix(cardFill, theme.textPrimary, dark ? 0.14 : 0.07) }]}>
        <Icon name="pin" size={12} color={picture ? '#FFFFFF' : theme.textSecondary} />
      </View> : null}
    </NoteCard>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { minHeight: 112 },
  springPressed: {},
  reducedPressed: { opacity: 0.82 },
  noteContent: { minWidth: 0, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 2 },
  textOnlyContent: { minHeight: 64 },
  besidePin: { paddingRight: 38 },
  picture: { height: 128, overflow: 'hidden' },
  videoPlay: { position: 'absolute', alignSelf: 'center', top: 46, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  durationBadge: { position: 'absolute', left: 10, bottom: 10, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  durationBadgeText: { color: '#FFFFFF', fontSize: 11 },
  overflowBadge: { position: 'absolute', right: 10, bottom: 10, minWidth: 26, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.55)' },
  overflowBadgeText: { color: '#FFFFFF', fontSize: 11 },
  title: { fontSize: 16, lineHeight: 21.5, letterSpacing: -0.25 },
  body: { fontSize: 15, lineHeight: 21.5, letterSpacing: -0.15 },
  bodyUnderTitle: { marginTop: 4, fontSize: 14, lineHeight: 20 },
  checklist: { marginTop: 12, gap: 8 },
  progressLabels: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 },
  progressCount: { flexShrink: 1, fontSize: 12, lineHeight: 16 },
  progressPercent: { fontSize: 11.5, lineHeight: 16, fontVariant: ['tabular-nums'] },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 2 },
  progressFill: { height: '100%', borderRadius: 2 },
  checklistRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  subtaskPressed: { opacity: 0.6 },
  previewCheckbox: { width: 15, height: 15, marginTop: 2, borderWidth: 1.25, borderRadius: 4.5, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checklistText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18.5 },
  completedText: { textDecorationLine: 'line-through' },
  checklistMore: { fontSize: 11.5, lineHeight: 16, marginLeft: 23 },
  hiddenRow: { gap: 6, paddingTop: 2 },
  hiddenTitle: { fontSize: 14, lineHeight: 20 },
  hiddenCopy: { fontSize: 12, lineHeight: 17 },
  fileRow: { gap: 6 },
  fileIcon: { width: 38, height: 42, marginBottom: 3, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 13.5, lineHeight: 19 },
  fileMeta: { fontSize: 11.5, lineHeight: 16 },
  audioPill: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 36, marginTop: 10, paddingHorizontal: 10 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveformBar: { width: 2, borderRadius: 1, opacity: 0.7 },
  audioText: { flexShrink: 1, fontSize: 12, fontVariant: ['tabular-nums'] },
  reminderChip: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999 },
  reminderText: { flexShrink: 1, fontSize: 11.5, lineHeight: 15 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 14, paddingRight: 6, paddingTop: 8, paddingBottom: 8 },
  footerMeta: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 7 },
  boardLabel: { flexShrink: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5, paddingLeft: 6, paddingRight: 8, paddingVertical: 3, borderRadius: 999 },
  boardDot: { width: 7, height: 7, borderRadius: 3.5, borderWidth: StyleSheet.hairlineWidth },
  location: { flexShrink: 1, fontSize: 12, lineHeight: 16 },
  date: { flexShrink: 0, fontSize: 11.5, lineHeight: 16, fontVariant: ['tabular-nums'] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  badgeText: { fontSize: 11.5, lineHeight: 16, fontVariant: ['tabular-nums'] },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', top: 9, right: 9, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pinOnPicture: { backgroundColor: 'rgba(0,0,0,0.45)' },
});
