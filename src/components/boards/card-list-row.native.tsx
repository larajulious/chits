import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { memo } from 'react';
import { Pressable, StyleSheet, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { AttachmentContent } from '@/components/chat/message-row';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PAPER_YELLOW, PushPin, Tape, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { mix, noteColors, stableTilt } from '@/constants/style-tokens';
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

// Notes are paper on the desk, always light whatever the appearance: a board's
// notes take a pastel of the board's color, so a glance at the grid shows which
// belong together; unorganized notes are cream; a hidden note is plain kraft.
function paperFor(accent: string | null, hidden: boolean) {
  if (hidden) return { paper: KRAFT, muted: PAPER_INK_MUTED };
  if (!accent) return { paper: PAPER_WHITE, muted: PAPER_INK_MUTED };
  const colors = noteColors(accent);
  return { paper: colors.cardTint, muted: colors.cardInkMuted };
}
const KRAFT = '#E6DCC8';
const DAY_MS = 24 * 60 * 60 * 1000;
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 };

// A content-first note on the desk: a paper with a fixed little tilt, tape on
// some and a pushpin on the pinned, an optional polaroid photo, a bounded
// preview and one line of metadata. Tapping opens the note; pressing springs
// it down, a long press opens its actions, and subtasks tick in place.
// `arranging` hands the long press to the list's drag (My order), which opens
// the actions itself when the note is held without moving.
export const CardListRow = memo(function CardListRow({ item, onPress, onMore, onToggleSubtask, arranging = false, accessibilityActions, onAccessibilityAction }: { item: CardListItem; onPress: () => void; onMore: () => void; onToggleSubtask?: (subtaskId: string) => void; arranging?: boolean; accessibilityActions?: AccessibilityActionInfo[]; onAccessibilityAction?: (event: AccessibilityActionEvent) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { hand, handBold } = useHandwriting();
  const reduceMotion = useReducedMotion();
  const tilt = stableTilt(`${item.kind}:${item.id}:paper`, 1.1);
  const taped = !item.pinned && stableTilt(`${item.id}:tape`, 1) > 0.2;
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt}deg` }, { scale: press.get() }] }));
  const accent = item.hidden ? null : item.boardAccent;
  const { paper, muted } = paperFor(accent, item.hidden);
  const ink = PAPER_INK;
  const media = item.hidden ? null : getCardPreviewMedia(item);
  const picture = media && media.type !== 'audio' ? media : null;
  const audio = media?.type === 'audio' ? media : null;
  const overflowCount = Math.max(0, item.mediaCount - 1);
  const content = noteContent(item, Boolean(media));
  const checklist = item.hidden ? null : item.checklistSummary;
  const showFileBadge = item.fileCount > 0 && content.kind !== 'file' && !item.hidden;
  const connectionCount = item.hidden ? 0 : item.connectionCount ?? 0;
  const wash = mix(paper, '#FFFFFF', 0.55);
  const rule = 'rgba(43,38,32,0.16)';
  const hasCopy = content.kind !== 'text' || Boolean(content.title || content.body || checklist || item.subtaskPreview?.length || audio || item.reminderAt);
  // Half-width notes: the board name alone reads cleanly; the column is in the label for screen readers.
  const location = item.boardName ?? tr("index.unorganized");
  const mediaPhrase = mediaAccessibilityPhrase(item);
  const overflowPhrase = overflowCount > 0 ? tr('common.moreAttachments', { count: overflowCount }) : '';
  const reminderLabel = item.reminderAt ? formatReminder(new Date(item.reminderAt), new Date()) : null;
  // A reminder due within a day is a yellow slip; one that has passed (until
  // the list catches up) a red one.
  const reminderDue = item.reminderAt ? item.reminderAt - Date.now() : null;
  const reminder = reminderDue === null ? null
    : reminderDue < 0 ? { fill: '#F6C9C2', ink: '#8E2A22', icon: 'notifications' as const }
      : reminderDue < DAY_MS ? { fill: PAPER_YELLOW, ink, icon: 'notifications' as const }
        : { fill: wash, ink, icon: 'notifications-outline' as const };
  const accessibleLabel = `${item.hidden ? tr("entrydetailsheet.hiddenNote") : `Note. ${accessibleTitle(item)}`}. ${checklist ? tr("messages.ofChecklistItemsCompleted", { value1: checklist.completed, value2: checklist.total }) : ''}${mediaPhrase ? `${mediaPhrase} ` : ''}${overflowPhrase ? `${overflowPhrase} ` : ''}${item.pinned ? 'Pinned. ' : ''}${!item.hidden && item.subtaskCount ? tr("messages.ofSubtasksCompleted2", { value1: item.completedSubtaskCount, value2: item.subtaskCount }) : ''}${reminderLabel ? `Reminder ${reminderLabel}. ` : ''}${item.boardName ?? tr("index.unorganized")}${item.columnName ? `, ${item.columnName}` : ''}.`;

  return (
    <Animated.View style={pressStyle}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={connectionCount ? `${accessibleLabel} ${tr('connectednotes.connectedNotes')}, ${countLabel('link', connectionCount)}.` : accessibleLabel}
      accessibilityHint={tr("cardlistrow.opensNote")}
      onPress={onPress}
      onPressIn={() => { if (!reduceMotion) press.set(withSpring(0.965, PRESS_SPRING)); }}
      onPressOut={() => press.set(withSpring(1, PRESS_SPRING))}
      // Still set while arranging, so letting go after a hold never counts as a tap.
      onLongPress={arranging ? () => {} : () => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onMore(); }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      delayLongPress={350}
      style={({ pressed }) => [styles.card, { backgroundColor: paper, boxShadow: `0px ${pressed ? 2 : 6}px ${pressed ? 5 : 12}px ${desk.shadow}` }, reduceMotion && pressed && styles.reducedPressed]}
    >
      {picture ? (
        <View pointerEvents="none" style={[styles.picture, { backgroundColor: wash, borderColor: rule }]}>
          <AttachmentContent attachment={picture} variant="paper" />
          {picture.type === "video" ? <View style={styles.videoPlay}><Icon name="play" size={18} color="#FFFFFF" /></View> : null}
          {picture.type === "video" && picture.duration ? <View style={styles.durationBadge}><AppText weight="600" style={styles.durationBadgeText}>{formatDurationSeconds(picture.duration)}</AppText></View> : null}
          {overflowCount > 0 ? <View style={styles.overflowBadge}><AppText weight="700" style={styles.overflowBadgeText}>+{overflowCount}</AppText></View> : null}
        </View>
      ) : null}

      {hasCopy ? <View style={[styles.noteContent, !picture && styles.textOnlyContent]}>
        {content.kind === 'hidden' ? (
          <View style={styles.hiddenRow}>
            <Icon name="lock-closed-outline" size={18} color={muted} />
            <AppText style={[handBold, styles.hiddenTitle, { color: ink }]}>{tr("index.hiddenChit")}</AppText>
            <AppText style={[styles.hiddenCopy, { color: muted }]}>{tr("cardlistrow.openToReveal")}</AppText>
          </View>
        ) : content.kind === "file" ? (
          <View style={styles.fileRow}>
            <View style={[styles.fileIcon, { backgroundColor: wash }]}><Icon name={/\.pdf$/i.test(content.name) ? 'document-text-outline' : 'document-outline'} size={22} color={muted} /></View>
            <AppText weight="600" numberOfLines={2} style={[styles.fileName, { color: ink }]}>{content.name}</AppText>
            <AppText style={[styles.fileMeta, { color: muted }]}>{fileKindLabel(content.name, item.fileCount)}</AppText>
          </View>
        ) : <>
          {content.title ? <AppText numberOfLines={2} style={[handBold, styles.title, { color: ink }]}>{content.title}</AppText> : null}
          {content.body ? <AppText numberOfLines={checklist || item.subtaskPreview?.length ? 3 : content.title ? 4 : 6} style={content.title ? [styles.bodyUnderTitle, { color: muted }] : [hand, styles.body, { color: ink }]}>{content.body}</AppText> : null}
          {checklist && !content.title && !content.body ? <AppText style={[handBold, styles.title, { color: ink }]}>{tr("cardlistrow.checklist")}</AppText> : null}
        </>}

        {checklist ? <View style={styles.checklist}>
          <View style={styles.progressLabels}>
            <AppText weight="600" style={[styles.progressCount, { color: muted }]}>{checklist.completed} {' '}{tr("id.of")}{' '}{checklist.total} {' '}{tr("cardlistrow.done")}</AppText>
            <AppText style={[styles.progressPercent, { color: muted }]}>{checklist.percent}%</AppText>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: rule }]}>
            <View style={[styles.progressFill, { width: `${checklist.percent}%`, backgroundColor: ink }]} />
          </View>
          {checklist.remaining.map((text, index) => <View key={index} style={styles.checklistRow}>
            <View style={[styles.previewCheckbox, { borderColor: muted }]} />
            <AppText variant="paragraph" numberOfLines={2} style={[styles.checklistText, { color: ink }]}>{text}</AppText>
          </View>)}
          {checklist.total - checklist.completed > 3 ? <AppText style={[styles.checklistMore, { color: muted }]}>+{checklist.total - checklist.completed - 3} {' '}{tr("cardlistrow.more")}</AppText> : null}
        </View> : null}

        {!item.hidden && item.subtaskPreview?.length ? <View style={styles.checklist}>
          <AppText weight="600" style={[styles.progressCount, { color: muted }]}>{checklist ? tr("cardlistrow.cardTasks") : ''}{item.completedSubtaskCount} {' '}{tr("id.of")}{' '}{item.subtaskCount} {' '}{tr("cardlistrow.done")}</AppText>
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
            <View style={[styles.previewCheckbox, { borderColor: subtask.isCompleted ? ink : muted, backgroundColor: subtask.isCompleted ? ink : 'transparent' }]}>{subtask.isCompleted ? <Icon name="checkmark" size={11} color={paper} /> : null}</View>
            <AppText variant="paragraph" numberOfLines={2} style={[styles.checklistText, { color: subtask.isCompleted ? muted : ink }, subtask.isCompleted && styles.completedText]}>{subtask.title}</AppText>
          </Pressable>)}
          {item.subtaskCount > 3 ? <AppText style={[styles.checklistMore, { color: muted }]}>+{item.subtaskCount - 3} {' '}{tr("cardlistrow.more")}</AppText> : null}
        </View> : null}

        {audio ? <View style={[styles.audioPill, { backgroundColor: wash }]}>
          <View style={styles.waveform}>{[7, 14, 10, 18, 9, 14, 6].map((height, index) => <View key={index} style={[styles.waveformBar, { height, backgroundColor: ink }]} />)}</View>
          <AppText weight="600" style={[styles.audioText, { color: ink }]}>{audio.duration ? formatDurationSeconds(audio.duration) : tr("cardlistrow.voiceNote")}</AppText>
        </View> : null}
        {reminder && reminderLabel ? <View style={[styles.reminderChip, { backgroundColor: reminder.fill }]}>
          <Icon name={reminder.icon} size={12} color={reminder.ink} />
          <AppText weight="600" numberOfLines={1} style={[styles.reminderText, { color: reminder.ink }]}>{reminderLabel}</AppText>
        </View> : null}
      </View> : null}

      <View style={[styles.footer, { borderTopColor: rule }]}>
        <View style={styles.footerMeta}>
          {accent ? <View style={[styles.boardDot, { backgroundColor: accent, borderColor: mix(accent, ink, 0.3) }]} /> : null}
          <AppText weight={accent ? '600' : '500'} numberOfLines={1} style={[styles.location, { color: muted }]}>{location}</AppText>
          <AppText style={[styles.date, { color: muted }]}>{formatCardDate(item.updatedAt)}</AppText>
          {showFileBadge ? <View style={styles.badge}><Icon name="attach" size={13} color={muted} /><AppText style={[styles.badgeText, { color: muted }]}>{item.fileCount}</AppText></View> : null}
          {connectionCount > 0 ? <View style={styles.badge}><Icon name="link-outline" size={13} color={muted} /><AppText style={[styles.badgeText, { color: muted }]}>{connectionCount}</AppText></View> : null}
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={tr("cardlistrow.cardActions")} hitSlop={6} onPress={(event) => { event.stopPropagation(); onMore(); }} style={({ pressed }) => [styles.more, pressed && { backgroundColor: wash }]}>
          <Icon name="ellipsis-horizontal" size={16} color={muted} />
        </Pressable>
      </View>
    </Pressable>
    {taped ? <Tape width={58} angle={stableTilt(`${item.id}:tape-angle`, 5)} /> : null}
    {item.pinned ? <View pointerEvents="none" style={styles.pin}><PushPin size={22} /></View> : null}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  card: { minHeight: 108, borderRadius: 3 },
  reducedPressed: { opacity: 0.82 },
  noteContent: { minWidth: 0, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 4 },
  textOnlyContent: { minHeight: 60, paddingTop: 16 },
  // A printed photo stuck on the paper: an even white margin, square corners,
  // a hairline edge. The photo fills it exactly (AttachmentContent's 'paper').
  picture: { height: 120, marginTop: 8, marginHorizontal: 8, borderRadius: 1, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  videoPlay: { position: 'absolute', alignSelf: 'center', top: 42, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  durationBadge: { position: 'absolute', left: 8, bottom: 8, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  durationBadgeText: { color: '#FFFFFF', fontSize: 11 },
  overflowBadge: { position: 'absolute', right: 8, bottom: 8, minWidth: 26, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.55)' },
  overflowBadgeText: { color: '#FFFFFF', fontSize: 11 },
  title: { fontSize: 19, lineHeight: 25 },
  body: { fontSize: 17, lineHeight: 23 },
  bodyUnderTitle: { marginTop: 3, fontSize: 14, lineHeight: 20 },
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
  hiddenRow: { gap: 4, paddingTop: 2 },
  hiddenTitle: { fontSize: 19, lineHeight: 25 },
  hiddenCopy: { fontSize: 12, lineHeight: 17 },
  fileRow: { gap: 6 },
  fileIcon: { width: 38, height: 42, marginBottom: 3, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  fileName: { fontSize: 13.5, lineHeight: 19 },
  fileMeta: { fontSize: 11.5, lineHeight: 16 },
  audioPill: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 36, marginTop: 10, paddingHorizontal: 10, borderRadius: 3 },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  waveformBar: { width: 2, borderRadius: 1, opacity: 0.7 },
  audioText: { flexShrink: 1, fontSize: 12, fontVariant: ['tabular-nums'] },
  reminderChip: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 2, transform: [{ rotate: '-1deg' }] },
  reminderText: { flexShrink: 1, fontSize: 11.5, lineHeight: 15 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, marginHorizontal: 14, paddingTop: 6, paddingBottom: 6, borderTopWidth: 1, borderStyle: 'dashed', marginRight: 6 },
  footerMeta: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  boardDot: { width: 7, height: 7, borderRadius: 3.5, borderWidth: StyleSheet.hairlineWidth },
  location: { flexShrink: 1, fontSize: 12, lineHeight: 16 },
  date: { flexShrink: 0, fontSize: 11.5, lineHeight: 16, fontVariant: ['tabular-nums'] },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  badgeText: { fontSize: 11.5, lineHeight: 16, fontVariant: ['tabular-nums'] },
  more: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', top: -10, left: '50%', marginLeft: -11 },
});
