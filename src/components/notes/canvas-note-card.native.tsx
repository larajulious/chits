import { Image } from 'expo-image';
import { router } from 'expo-router';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { fileKindLabel, formatCardDate, getCardPreviewMedia, noteContent, paperFor } from '@/components/boards/card-list-row.native';
import { NoteMediaPreview } from './note-media-preview.native';
import { PAPERS, PAPER_INK, PAPER_INK_MUTED, PAPER_YELLOW, PushPin, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { mix } from '@/constants/style-tokens';
import type { CardListItem } from '@/db/types';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { CANVAS_MAX_FONT_SCALE, stableUnit, type CanvasCardFrame, type CanvasCardInput, type CanvasRect } from '@/services/note-canvas';
import { noteKey } from '@/services/note-order';
import type { NoteChecklistEntry } from '@/services/note-content';
import { formatReminder } from '@/services/reminder-time';

/** A note with its place on the board. */
const openBoard = (item: CardListItem) => { if (item.boardId) router.push({ pathname: '/board/[id]', params: { id: item.boardId } }); };

export type CanvasNote = CanvasRect & { key: string; item: CardListItem; z: number; tilt: number; frame: CanvasCardFrame };

export type CanvasCardHandlers = {
  onOpen: (item: CardListItem) => void;
  onMore: (item: CardListItem) => void;
  onToggleSubtask: (item: CardListItem, subtaskId: string) => void;
  onToggleChecklist: (item: CardListItem, entry: NoteChecklistEntry) => void;
  /** A finger is on a tick box: what it would do, so a slow press still ticks rather than lifts. */
  onInlineTouch: (action: () => void) => void;
  onInlineTap: (action: () => void) => void;
};

const MAX_ROWS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;
const PRESS_SPRING = { damping: 18, stiffness: 320, mass: 0.6 };
const scaling = { maxFontSizeMultiplier: CANVAS_MAX_FONT_SCALE };

type Row = { key: string; text: string; checked: boolean; toggle: (handlers: CanvasCardHandlers) => void };

/** What can be ticked on the board, the note's own checklist first. */
function tickableRows(item: CardListItem): { rows: Row[]; total: number; done: number } {
  if (item.hidden) return { rows: [], total: 0, done: 0 };
  const rows: Row[] = [
    ...(item.checklistItems ?? []).map((entry) => ({ key: `c${entry.messageId}:${entry.index}`, text: entry.text, checked: entry.checked, toggle: (handlers: CanvasCardHandlers) => handlers.onToggleChecklist(item, entry) })),
    ...(item.subtaskPreview ?? []).map((subtask) => ({ key: `s${subtask.id}`, text: subtask.title, checked: subtask.isCompleted, toggle: (handlers: CanvasCardHandlers) => handlers.onToggleSubtask(item, subtask.id) })),
  ];
  return { rows: rows.slice(0, MAX_ROWS), total: (item.checklistSummary?.total ?? 0) + item.subtaskCount, done: (item.checklistSummary?.completed ?? 0) + item.completedSubtaskCount };
}

function pictureOf(item: CardListItem) {
  const media = item.hidden ? null : getCardPreviewMedia(item);
  return media && media.type !== 'audio' ? media : null;
}

/** What a note shows, boiled down to the numbers its size comes from. */
export function canvasCardInput(item: CardListItem): CanvasCardInput {
  const media = item.hidden ? null : getCardPreviewMedia(item);
  const content = noteContent(item, Boolean(media));
  const { rows, total } = tickableRows(item);
  const proportions = item.mediaWidth && item.mediaHeight ? item.mediaWidth / item.mediaHeight : 4 / 3;
  return {
    title: content.kind === 'text' ? content.title : null,
    body: content.kind === 'text' ? content.body : null,
    hidden: content.kind === 'hidden',
    rows: rows.length, moreRows: total > rows.length, progress: total > 0,
    picture: pictureOf(item) ? proportions : null,
    audio: media?.type === 'audio', file: content.kind === 'file', reminder: Boolean(item.reminderAt),
  };
}

/** A board's color where the user chose one; other notes take a stable pastel of their own. */
export function canvasPaper(item: CardListItem) {
  if (item.hidden || item.boardAccent) return paperFor(item.hidden ? null : item.boardAccent, item.hidden);
  return { paper: PAPERS[Math.floor(stableUnit(noteKey(item)) * PAPERS.length)], muted: PAPER_INK_MUTED };
}

/** Yellow within a day and red once passed, the same slips the list uses. */
function reminderChip(at: number, wash: string) {
  const now = Date.now();
  const label = formatReminder(new Date(at), new Date(now));
  if (at < now) return { label, fill: '#F6C9C2', ink: '#8E2A22', icon: 'notifications' as const };
  return at - now < DAY_MS ? { label, fill: PAPER_YELLOW, ink: PAPER_INK, icon: 'notifications' as const } : { label, fill: wash, ink: PAPER_INK, icon: 'notifications-outline' as const };
}

/** A photo at board size: decoded to fit the card, kept warm in memory as notes come and go. */
function CardPhoto({ uri, wash, muted }: { uri: string; wash: string; muted: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <View style={[styles.fill, styles.center, { backgroundColor: wash }]}><Icon name="image-outline" size={22} color={muted} /></View>;
  return <Image source={uri} recyclingKey={uri} cachePolicy="memory-disk" allowDownscaling contentFit="cover" transition={0} onError={() => setFailed(true)} style={styles.fill} />;
}

function FullCard({ note, handlers }: { note: CanvasNote; handlers: CanvasCardHandlers }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { styleTokens } = useTheme();
  const { handBold } = useHandwriting();
  const fonts = useWelcomeFonts();
  const reduceMotion = useReducedMotion();
  const press = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.get() }] }));
  const { item, frame } = note;
  const radius = styleTokens.button.radius;
  const { paper, muted } = canvasPaper(item);
  const ink = PAPER_INK;
  const wash = mix(paper, '#FFFFFF', 0.55);
  const media = item.hidden ? null : getCardPreviewMedia(item);
  const picture = pictureOf(item);
  const audio = media?.type === 'audio' ? media : null;
  const content = noteContent(item, Boolean(media));
  const { rows, total, done } = tickableRows(item);
  const uri = picture?.type === 'photo' ? resolveAttachmentUri(picture.storagePath) : null;
  const overflow = Math.max(0, item.mediaCount - 1);
  const attachments = item.hidden ? 0 : item.fileCount;
  const connections = item.hidden ? 0 : item.connectionCount ?? 0;
  const location = item.boardName ?? tr('index.unorganized');
  const reminder = item.reminderAt ? reminderChip(item.reminderAt, wash) : null;
  const words = content.kind === 'hidden' ? tr('entrydetailsheet.hiddenNote') : content.kind === 'file' ? content.name : [content.title, content.body].filter(Boolean).join('. ') || item.title;

  return <Animated.View style={pressStyle}>
    <Pressable
      accessible={!(audio || picture?.type === 'video')}
      accessibilityRole="button"
      accessibilityLabel={`${words}. ${location}.`}
      accessibilityHint={tr('cardlistrow.opensNote')}
      onPress={() => handlers.onOpen(item)}
      onPressIn={() => { if (!reduceMotion) press.set(withSpring(0.975, PRESS_SPRING)); }}
      onPressOut={() => press.set(withSpring(1, PRESS_SPRING))}
      // Set so letting go after a hold never counts as a tap; the hold itself belongs to the board.
      onLongPress={noop}
      delayLongPress={300}
      style={{ width: note.width, height: note.height, borderRadius: radius, backgroundColor: paper, boxShadow: `0px 4px 10px ${desk.shadow}` }}
    >
      <View style={[styles.fill, styles.clip, { borderRadius: radius }]}>
        {/* The band of a real sticky's gum strip: all the paper texture a card needs. */}
        <View pointerEvents="none" style={styles.gum} />
        {picture ? <View pointerEvents={picture.type === 'video' ? 'auto' : 'none'} style={[styles.picture, { height: frame.pictureHeight, backgroundColor: wash, borderRadius: Math.max(2, radius - 8) }]}>
          {picture.type === 'video' ? <NoteMediaPreview attachment={picture} caption={item.title} color={paper} onEdit={() => handlers.onOpen(item)} onInlineTouch={handlers.onInlineTouch} onInlineTap={handlers.onInlineTap} /> : uri ? <CardPhoto uri={uri} wash={wash} muted={muted} /> : <View style={[styles.fill, styles.center]}><Icon name="image-outline" size={22} color={muted} /></View>}
          {overflow > 0 ? <View pointerEvents="none" style={[styles.overflow, picture.type === 'video' && { top: 6, bottom: undefined }]}><AppText weight="700" {...scaling} style={styles.overflowText}>+{overflow}</AppText></View> : null}
        </View> : null}
        <View style={styles.copy}>
          {content.kind === 'hidden' ? <View style={styles.stack}>
            <Icon name="lock-closed-outline" size={18} color={muted} />
            <AppText {...scaling} style={[handBold, styles.title, { color: ink }]}>{tr('index.hiddenChit')}</AppText>
            <AppText {...scaling} numberOfLines={1} style={[styles.small, { color: muted }]}>{tr('cardlistrow.openToReveal')}</AppText>
          </View> : content.kind === 'file' ? <View style={styles.stack}>
            <View style={[styles.fileIcon, { backgroundColor: wash, borderRadius: radius / 2 }]}><Icon name={/\.pdf$/i.test(content.name) ? 'document-text-outline' : 'document-outline'} size={20} color={muted} /></View>
            <AppText weight="600" {...scaling} numberOfLines={1} style={[styles.fileName, { color: ink }]}>{content.name}</AppText>
            <AppText {...scaling} numberOfLines={1} style={[styles.small, { color: muted }]}>{fileKindLabel(content.name, item.fileCount)}</AppText>
          </View> : <>
            {content.title && frame.titleLines ? <AppText {...scaling} numberOfLines={frame.titleLines} style={[handBold, styles.title, { color: ink }]}>{content.title}</AppText> : null}
            {content.body && frame.bodyLines ? <AppText family={fonts.text} {...scaling} numberOfLines={frame.bodyLines} style={[styles.body, { color: content.title ? muted : ink }]}>{content.body}</AppText> : null}
          </>}

          {total > 0 ? <View style={styles.progressRow}>
            <View style={[styles.progressTrack, { backgroundColor: 'rgba(43,38,32,0.14)' }]}><View style={[styles.progressFill, { width: `${Math.round(done / total * 100)}%`, backgroundColor: ink }]} /></View>
            <AppText weight="600" {...scaling} style={[styles.progressText, { color: muted }]}>{done}/{total}</AppText>
          </View> : null}
          {rows.map((row) => <Pressable
            key={row.key}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: row.checked }}
            accessibilityLabel={row.text}
            hitSlop={{ top: 3, bottom: 3 }}
            onPressIn={() => handlers.onInlineTouch(() => row.toggle(handlers))}
            onPress={(event) => { event.stopPropagation(); handlers.onInlineTap(() => row.toggle(handlers)); }}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={[styles.box, { borderColor: row.checked ? ink : muted, backgroundColor: row.checked ? ink : 'transparent' }]}>{row.checked ? <Icon name="checkmark" size={11} color={paper} /> : null}</View>
            <AppText family={fonts.text} {...scaling} numberOfLines={1} style={[styles.rowText, { color: row.checked ? muted : ink }, row.checked && styles.done]}>{row.text}</AppText>
          </Pressable>)}
          {total > rows.length ? <AppText {...scaling} style={[styles.more, { color: muted }]}>+{total - rows.length} {tr('cardlistrow.more')}</AppText> : null}

          {audio ? <View style={{ marginTop: 8 }}><NoteMediaPreview attachment={audio} caption={item.title} color={paper} width={note.width - 24} onEdit={() => handlers.onOpen(item)} onInlineTouch={handlers.onInlineTouch} onInlineTap={handlers.onInlineTap} /></View> : null}
          {reminder ? <View style={[styles.reminder, { backgroundColor: reminder.fill, borderRadius: radius / 2 }]}>
            <Icon name={reminder.icon} size={11} color={reminder.ink} />
            <AppText weight="600" {...scaling} numberOfLines={1} style={[styles.reminderText, { color: reminder.ink }]}>{reminder.label}</AppText>
          </View> : null}
        </View>

        <View style={styles.footer}>
          {item.boardAccent && !item.hidden ? <View style={[styles.dot, { backgroundColor: item.boardAccent, borderColor: mix(item.boardAccent, ink, 0.3) }]} /> : null}
          {item.boardId ? <Pressable accessibilityRole="link" accessibilityLabel={tr('id.openBoardValue', { value1: location })} hitSlop={6}
            onPressIn={() => handlers.onInlineTouch(() => openBoard(item))}
            onPress={(event) => { event.stopPropagation(); handlers.onInlineTap(() => openBoard(item)); }}
            onLongPress={noop} delayLongPress={300}
            style={({ pressed }) => [styles.location, pressed && { opacity: 0.6 }]}>
            <AppText family={fonts.text} {...scaling} numberOfLines={1} style={[styles.meta, { color: muted }]}>{location}</AppText>
          </Pressable> : <AppText family={fonts.text} {...scaling} numberOfLines={1} style={[styles.meta, styles.location, { color: muted }]}>{location}</AppText>}
          <AppText family={fonts.text} {...scaling} style={[styles.meta, { color: muted }]}>{formatCardDate(item.updatedAt)}</AppText>
          {attachments > 0 && content.kind !== 'file' ? <View style={styles.badge}><Icon name="attach" size={12} color={muted} /><AppText {...scaling} style={[styles.meta, { color: muted }]}>{attachments}</AppText></View> : null}
          {connections > 0 ? <View style={styles.badge}><Icon name="link-outline" size={12} color={muted} /><AppText {...scaling} style={[styles.meta, { color: muted }]}>{connections}</AppText></View> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={tr('cardlistrow.cardActions')} hitSlop={8} onPress={(event) => { event.stopPropagation(); handlers.onMore(item); }} style={({ pressed }) => [styles.action, pressed && { backgroundColor: wash }]}>
            <Icon name="ellipsis-horizontal" size={14} color={muted} />
          </Pressable>
        </View>
      </View>
    </Pressable>
    {item.pinned ? <View pointerEvents="none" style={styles.pin}><PushPin size={20} /></View> : null}
  </Animated.View>;
}

/** Too small to read: just the paper, which is all a zoomed-out board needs. */
function LiteCard({ note, handlers }: { note: CanvasNote; handlers: CanvasCardHandlers }) {
  const { styleTokens } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={note.item.hidden ? tr('entrydetailsheet.hiddenNote') : note.item.title} onPress={() => handlers.onOpen(note.item)} onLongPress={noop} delayLongPress={300}
    style={{ width: note.width, height: note.height, borderRadius: styleTokens.button.radius, backgroundColor: canvasPaper(note.item).paper }} />;
}

export const CanvasNoteCard = memo(function CanvasNoteCard({ note, lite, handlers }: { note: CanvasNote; lite: boolean; handlers: CanvasCardHandlers }) {
  return lite ? <LiteCard note={note} handlers={handlers} /> : <FullCard note={note} handlers={handlers} />;
});

function noop() {}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  clip: { overflow: 'hidden' },
  gum: { position: 'absolute', top: 0, left: 0, right: 0, height: 14, backgroundColor: 'rgba(255,255,255,0.2)' },
  picture: { marginTop: 8, marginHorizontal: 8, overflow: 'hidden' },
  overflow: { position: 'absolute', right: 6, bottom: 6, minWidth: 24, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center', borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.55)' },
  overflowText: { color: '#FFFFFF', fontSize: 11 },
  copy: { paddingHorizontal: 12, paddingTop: 12 },
  stack: { gap: 4 },
  title: { fontSize: 16, lineHeight: 21 },
  body: { fontSize: 14, lineHeight: 20 },
  small: { fontSize: 11.5, lineHeight: 16 },
  fileIcon: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  fileName: { fontSize: 13.5, lineHeight: 19 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 20, marginTop: 6 },
  progressTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressText: { fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 25 },
  rowPressed: { opacity: 0.6 },
  box: { width: 15, height: 15, borderWidth: 1.25, borderRadius: 4.5, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18 },
  done: { textDecorationLine: 'line-through' },
  more: { fontSize: 11.5, lineHeight: 18, marginLeft: 22 },
  reminder: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 7, paddingVertical: 3 },
  reminderText: { flexShrink: 1, fontSize: 11, lineHeight: 15 },
  footer: { position: 'absolute', left: 12, right: 5, bottom: 3, height: 28, flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 3.5, borderWidth: StyleSheet.hairlineWidth },
  meta: { fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  location: { flex: 1, minWidth: 0 },
  badge: { flexDirection: 'row', alignItems: 'center' },
  action: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', top: -9, left: '50%', marginLeft: -10 },
});
