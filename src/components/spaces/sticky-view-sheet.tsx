import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { Image } from 'expo-image';
import { useSQLiteContext } from 'expo-sqlite';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACES } from '@/constants/spaces';
import { magnetColor, noteSeed, PAPER_INK, paperColor, SPACE_UI } from '@/constants/spaces-theme';
import { createSpaceRepository } from '@/db/repositories';
import { PhotoAttachmentViewer } from '@/components/attachments/photo-attachment-viewer';
import type { PinnedNote, SpaceNoteDetail, SpaceNoteMedia } from '@/db/types';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { PinDecoration } from './pin-decoration';
import { Cassette, formatTapeTime } from './space-cassette';
import { useSpaceFonts } from './space-fonts';
import { photoCaption, stickyText } from './sticky-note';

type Props = {
  note: PinnedNote;
  onDismiss: () => void;
  /** Leaves Spaces for the note's home: Card Details, the thought's board, or the thought in Chat. */
  onOpen: () => void;
  onOptions: () => void;
};

/**
 * A sticky, read in full (a tap on the board): the same paper, pin and
 * handwriting, big enough for every thought on it — or, for a photo, video
 * or voice note, the same print or cassette, big enough to see or play, with
 * any other thoughts on a sticky below it. Opening the card or Chat is one more tap from here, not
 * the tap itself.
 */
export function StickyViewSheet({ note, onDismiss, onOpen, onOptions }: Props) {
  const database = useSQLiteContext();
  const repository = useMemo(() => createSpaceRepository(database), [database]);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const fonts = useSpaceFonts();
  const scrollRef = useRef<ScrollView>(null);
  const sheetWidth = Math.min(window.width - insets.left - insets.right, 600);
  const contentWidth = sheetWidth - 40;
  // Android's edge-to-edge root is taller than the visible app viewport.
  // Place the sheet above that clipped bottom region, including both insets.
  const bottomOffset = Platform.OS === 'android' ? insets.top + insets.bottom + 16 : 0;
  const visibleHeight = window.height - bottomOffset;
  const maxSheetHeight = Math.min(visibleHeight * 0.9, visibleHeight - insets.top - 12);
  const maxScrollHeight = Math.min(260, Math.max(120, maxSheetHeight - Math.max(insets.bottom, 12) - 210));
  // Tagged with the note it belongs to, so a different note never shows a stale read.
  const [loaded, setLoaded] = useState<{ noteId: string; detail: SpaceNoteDetail } | null>(null);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const detail = loaded?.noteId === note.noteId ? loaded.detail : null;
  const space = SPACES[note.spaceId];
  const paper = paperColor(note.color);
  const isCard = note.kind === 'card';

  useEffect(() => {
    let active = true;
    void repository.readNote(note.kind, note.noteId).then((next) => { if (active) setLoaded({ noteId: note.noteId, detail: next }); }, () => undefined);
    return () => { active = false; };
  }, [repository, note.kind, note.noteId]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onDismiss(); return true; });
    return () => subscription.remove();
  }, [onDismiss]);

  const media = note.hidden ? null : note.media;
  const title = note.hidden ? null : note.title?.trim() || null;
  const caption = media ? photoCaption(note) : null;
  // The main paper/print represents one thought. Keep the remaining card
  // thoughts separate, including ones whose text happens to match its title.
  const loadedThoughts = note.hidden ? [] : detail?.thoughts ?? (media
    ? [{ messageId: media.messageId, text: '', caption: media.caption }]
    : [{ messageId: note.noteId, text: stickyText({ title: null, text: note.text }), caption: null }]);
  const primaryMessageId = media?.messageId ?? loadedThoughts[0]?.messageId;
  const thoughts = loadedThoughts.map((thought, index) => ({
    messageId: thought.messageId,
    number: index + 1,
    text: ((media && thought.messageId === media.messageId ? thought.caption : thought.text) ?? '').trim(),
  }));
  const primaryThoughts = thoughts.filter((thought) =>
    (!isCard || thought.messageId === primaryMessageId) && thought.text && thought.text !== title && thought.text !== caption);
  const moreThoughts = isCard ? thoughts.filter((thought) => thought.messageId !== primaryMessageId) : [];
  const moreExpanded = expandedNoteId === note.id;
  const onBoard = !isCard && !!note.boardId;
  const context = detail?.context ?? (isCard || onBoard ? null : 'Chat');
  const open = isCard ? { label: 'Open card', icon: 'open-outline' as const } : onBoard ? { label: 'Open board', icon: 'grid-outline' as const } : { label: 'Open in Chat', icon: 'chatbubble-outline' as const };
  const heading = note.hidden ? 'Hidden Chit' : title ?? caption ?? (media ? MEDIA_NAMES[media.attachment.type] : thoughts[0]?.text.split('\n')[0] ?? 'Note');
  // A little of the sticky's own tilt, kept small enough to read comfortably.
  const tilt = Math.max(-1.5, Math.min(1.5, note.rotation / 2));
  const pin = <PinDecoration space={note.spaceId} color={magnetColor(noteSeed(note.id))} noteWidth={contentWidth} unit={1.2} seed={noteSeed(note.id)} />;

  return <>
    {bottomOffset > 0 ? <View pointerEvents="none" style={[styles.navigationBackdrop, { height: bottomOffset }]} /> : null}
    <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)} accessibilityViewIsModal style={[styles.sheet, { width: sheetWidth, left: insets.left + (window.width - insets.left - insets.right - sheetWidth) / 2, maxHeight: maxSheetHeight, bottom: bottomOffset, paddingBottom: Platform.OS === 'android' ? 12 : Math.max(insets.bottom, 12) + 8 }]}>
    <View style={styles.grabber} />
    <View style={styles.header}>
      <Text style={[fonts.label, styles.where]}>ON YOUR {space.name.toUpperCase()}</Text>
      {context ? <Text numberOfLines={1} style={[fonts.ui, styles.context]}>{context}</Text> : null}
    </View>

    {/* Room around the paper for its shadow, and above it for the fridge magnet. */}
    <ScrollView
      key={`${note.kind}:${note.noteId}`}
      ref={scrollRef}
      style={[styles.scroll, { maxHeight: maxScrollHeight }]}
      contentContainerStyle={styles.scrollContent}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator
      indicatorStyle="white"
    >
      {media?.attachment.type === 'audio'
        ? <SheetTape media={media} caption={caption} color={note.color} width={Math.min(contentWidth, 240)} tilt={tilt} pin={<PinDecoration space={note.spaceId} color={magnetColor(noteSeed(note.id))} noteWidth={Math.min(contentWidth, 240)} unit={1.2} seed={noteSeed(note.id)} />} />
        : media ? <View style={{ transform: [{ rotate: `${tilt}deg` }] }}>
          <SheetPrint media={media} caption={caption} maxWidth={Math.min(contentWidth, 260)} maxHeight={Math.min(window.height * 0.28, 220)} />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>{pin}</View>
        </View> : null}
      {/* Keep long paper upright: rotation expands its visual bounds beyond
          the scrollable area as additional thoughts increase its height. */}
      {!media || primaryThoughts.length ? <View style={media ? styles.paperUnder : undefined}>
        <View style={[styles.paper, { backgroundColor: paper.base, experimental_backgroundImage: `linear-gradient(176deg, ${paper.base} 0%, ${paper.base} 82%, ${paper.curl} 100%)` }]}>
          <View style={styles.paperContent}>
            {note.hidden ? <View accessible accessibilityLabel="Hidden Chit. Open it in Chat to see it." style={styles.hidden}>
              <Ionicons accessible={false} name="eye-off-outline" size={26} color={PAPER_INK} style={styles.hiddenIcon} />
              <Text style={[fonts.note, styles.hiddenText]}>Hidden Chit</Text>
              <Text style={[fonts.note, styles.hiddenHint]}>Open it in Chat to see it.</Text>
            </View> : <>
              {title && !media ? <Text accessibilityRole="header" selectable style={[fonts.note, styles.title]}>{title}</Text> : null}
              {primaryThoughts.map((thought, index) => <View key={thought.messageId} style={[styles.thoughtSection, (index > 0 || (title && !media)) ? styles.thoughtDivider : null]}>
                <Text selectable style={[fonts.note, styles.thought]}>{thought.text}</Text>
              </View>)}
            </>}
          </View>
        </View>
        {/* A print already carries the pin; the sticky under it just lies there. */}
        {media ? null : <View pointerEvents="none" style={StyleSheet.absoluteFill}>{pin}</View>}
      </View> : null}
      {moreExpanded ? <View style={styles.expandedThoughts} onLayout={({ nativeEvent }) => scrollRef.current?.scrollTo({ y: nativeEvent.layout.y, animated: true })}>
        {moreThoughts.map((thought) => <View key={thought.messageId} style={styles.expandedThought}>
          <Text style={[fonts.uiSemi, styles.thoughtLabel]}>THOUGHT {thought.number}</Text>
          <Text selectable style={[fonts.ui, styles.expandedThoughtText]}>{thought.text || 'Empty thought'}</Text>
        </View>)}
      </View> : null}
    </ScrollView>
    {moreThoughts.length > 0 ? <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${moreExpanded ? 'Hide' : 'See'} ${moreThoughts.length} more ${moreThoughts.length === 1 ? 'thought' : 'thoughts'} in this card`}
      accessibilityState={{ expanded: moreExpanded }}
      onPress={() => setExpandedNoteId((current) => current === note.id ? null : note.id)}
      style={({ pressed }) => [styles.moreToggle, pressed && styles.pressed]}
    >
      <Ionicons accessible={false} name="layers-outline" size={18} color={SPACE_UI.paper} />
      <Text style={[fonts.uiSemi, styles.moreToggleText]}>{moreExpanded ? 'Hide' : 'See'} {moreThoughts.length} more {moreThoughts.length === 1 ? 'thought' : 'thoughts'}</Text>
      <Ionicons accessible={false} name={moreExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={SPACE_UI.textMuted} />
    </Pressable> : null}
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Options for ${heading}`} onPress={onOptions} style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}>
        <Ionicons accessible={false} name="ellipsis-horizontal" size={20} color={SPACE_UI.paper} />
        <Text style={[fonts.uiSemi, styles.buttonLabel, { color: SPACE_UI.paper }]}>Options</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.button, styles.primary, pressed && styles.pressed]}>
        <Ionicons accessible={false} name={open.icon} size={19} color={SPACE_UI.accentText} />
        <Text style={[fonts.uiSemi, styles.buttonLabel, { color: SPACE_UI.accentText }]}>{open.label}</Text>
      </Pressable>
    </View>
  </Animated.View>
  </>;
}

/**
 * The note's photo or video as a large instant print: white border, wider
 * bottom edge with the caption in handwriting. A photo opens full screen; a
 * video plays right here.
 */
function SheetPrint({ media, caption, maxWidth, maxHeight }: { media: SpaceNoteMedia; caption: string | null; maxWidth: number; maxHeight: number }) {
  const fonts = useSpaceFonts();
  const [viewerOpen, setViewerOpen] = useState(false);
  const { attachment } = media;
  // The picture at its own shape, as wide as fits and never taller than maxHeight.
  const ratio = attachment.width && attachment.height ? Math.max(0.6, Math.min(1.8, attachment.width / attachment.height)) : 4 / 3;
  const inner = maxWidth - PRINT_BORDER * 2;
  const height = Math.min(inner / ratio, maxHeight);
  const width = height * ratio;
  return <View style={[styles.print, { width: width + PRINT_BORDER * 2 }]}>
    <View style={[styles.picture, { width, height }]}>
      {attachment.type === 'video'
        ? <SheetVideo storagePath={attachment.storagePath} />
        : <Pressable accessibilityRole="button" accessibilityLabel={caption ? `Photo: ${caption}` : 'Photo'} accessibilityHint="Opens the photo full screen" onPress={() => setViewerOpen(true)} style={StyleSheet.absoluteFill}>
          <Image source={resolveAttachmentUri(attachment.storagePath)} contentFit="cover" transition={120} style={StyleSheet.absoluteFill} />
        </Pressable>}
    </View>
    <View style={styles.printCaption}>
      {caption ? <Text selectable numberOfLines={2} style={[fonts.note, styles.printCaptionText]}>{caption}</Text> : null}
    </View>
    {viewerOpen ? <PhotoAttachmentViewer attachment={attachment} onDismiss={() => setViewerOpen(false)} /> : null}
  </View>;
}

function SheetVideo({ storagePath }: { storagePath: string }) {
  const player = useVideoPlayer(resolveAttachmentUri(storagePath) ?? '');
  // `as never`: expo-video types VideoView for web too; native gets the native player (same as Chat's viewer).
  return <VideoView player={player as never} nativeControls fullscreenOptions={{ enable: true }} contentFit="cover" style={StyleSheet.absoluteFill} />;
}

/**
 * A voice note as a big cassette with a deck's controls under it; the reels
 * turn while it plays. It stops when the sheet closes.
 */
function SheetTape({ media, caption, color, width, tilt, pin }: { media: SpaceNoteMedia; caption: string | null; color: string; width: number; tilt: number; pin: ReactNode }) {
  const fonts = useSpaceFonts();
  const player = useAudioPlayer(resolveAttachmentUri(media.attachment.storagePath) ?? '', { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const duration = status.duration || (media.attachment.duration ?? 0) / 1000;
  const currentTime = Math.max(0, Math.min(status.currentTime, duration || status.currentTime));
  const progress = duration ? Math.min(1, currentTime / duration) : 0;
  const unavailable = Boolean(status.error);
  // Never wait on `status.isLoaded`: the player only reports changes, so a short
  // local recording can be ready before this listens and never say so, leaving
  // the button dead. play() before it's ready simply starts once it is.
  const disabled = unavailable;
  const toggle = async () => {
    // Read from the player itself, not `status`, which can be a beat behind.
    if (player.playing) { player.pause(); return; }
    // At the end, play() would do nothing; start over from the top instead.
    if (player.duration > 0 && player.currentTime >= player.duration - 0.05) await player.seekTo(0).catch(() => undefined);
    player.play();
  };
  return <>
    <View style={{ transform: [{ rotate: `${tilt}deg` }] }}>
      <View style={styles.tape}><Cassette width={width} color={color} caption={caption} duration={media.attachment.duration} spinning={status.playing} /></View>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>{pin}</View>
    </View>
    <View style={styles.deck}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice note' : 'Play voice note'}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => void toggle()}
        style={({ pressed }) => [styles.play, disabled && styles.disabled, pressed && styles.pressed]}>
        <Ionicons accessible={false} name={status.playing ? 'pause' : 'play'} size={24} color={SPACE_UI.accentText} style={status.playing ? undefined : styles.playGlyph} />
      </Pressable>
      <View style={styles.deckTrack}>
        <View accessible accessibilityRole="progressbar" accessibilityLabel="Playback" accessibilityValue={{ min: 0, max: Math.max(1, Math.round(duration)), now: Math.round(currentTime) }} style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
        <View style={styles.times}>
          <Text style={[fonts.label, styles.timeText]}>{unavailable ? 'UNAVAILABLE' : formatTapeTime(currentTime * 1000)}</Text>
          <Text style={[fonts.label, styles.timeText]}>{formatTapeTime(duration * 1000)}</Text>
        </View>
      </View>
    </View>
  </>;
}

const MEDIA_NAMES = { photo: 'Photo', video: 'Video', audio: 'Voice note' } as const;
const PRINT_BORDER = 12;

const styles = StyleSheet.create({
  navigationBackdrop: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: SPACE_UI.ink },
  sheet: { position: 'absolute', bottom: 0, overflow: 'hidden', paddingHorizontal: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: SPACE_UI.ink, boxShadow: '0px -8px 30px rgba(0,0,0,0.35)' },
  grabber: { flexShrink: 0, alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: 10, marginBottom: 14, backgroundColor: SPACE_UI.inkBorder },
  header: { flexShrink: 0, gap: 2 },
  where: { fontSize: 11, letterSpacing: 1.6, color: SPACE_UI.textMuted },
  context: { fontSize: 14, color: SPACE_UI.textMuted },
  scroll: { flexGrow: 0, flexShrink: 1, minHeight: 0, marginHorizontal: -20, marginTop: 6, marginBottom: 8 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  paperUnder: { marginTop: 18, flexShrink: 0 },
  tape: { alignSelf: 'center' },
  deck: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 20 },
  play: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: SPACE_UI.accent },
  // The play triangle's weight sits left of its box; nudge it to look centered.
  playGlyph: { marginLeft: 3 },
  deckTrack: { flex: 1, gap: 8 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: SPACE_UI.inkRaised },
  trackFill: { height: 4, backgroundColor: SPACE_UI.paper },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  timeText: { fontSize: 11, letterSpacing: 1, color: SPACE_UI.textMuted },
  disabled: { opacity: 0.45 },
  print: { alignSelf: 'center', padding: PRINT_BORDER, paddingBottom: 0, borderRadius: 3, backgroundColor: SPACE_UI.paperWhite, boxShadow: '0px 10px 14px rgba(0,0,0,0.35)' },
  picture: { overflow: 'hidden', backgroundColor: '#2A2622' },
  printCaption: { minHeight: 46, justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 2 },
  printCaptionText: { fontSize: 21, lineHeight: 26, color: PAPER_INK },
  paper: { flexShrink: 0, borderRadius: 3, boxShadow: '0px 10px 14px rgba(0,0,0,0.35)' },
  paperContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 22 },
  title: { fontSize: 27, lineHeight: 32, color: PAPER_INK },
  thought: { fontSize: 20, lineHeight: 27, color: PAPER_INK },
  thoughtSection: { flexShrink: 0, minWidth: 0 },
  thoughtDivider: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(42,38,34,0.18)' },
  moreToggle: { flexShrink: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: SPACE_UI.inkRaised },
  moreToggleText: { flex: 1, fontSize: 14, color: SPACE_UI.paper },
  expandedThoughts: { paddingHorizontal: 12 },
  expandedThought: { paddingVertical: 14, gap: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: SPACE_UI.inkBorder },
  thoughtLabel: { fontSize: 10, letterSpacing: 1, color: SPACE_UI.textMuted },
  expandedThoughtText: { fontSize: 14, lineHeight: 20, color: SPACE_UI.paper },
  hidden: { alignItems: 'center', paddingVertical: 18 },
  hiddenIcon: { opacity: 0.55 },
  hiddenText: { marginTop: 4, fontSize: 22, lineHeight: 28, color: PAPER_INK, opacity: 0.7 },
  hiddenHint: { fontSize: 16, lineHeight: 21, color: PAPER_INK, opacity: 0.55 },
  actions: { flexShrink: 0, flexDirection: 'row', gap: 10 },
  button: { flex: 1, minHeight: 52, paddingHorizontal: 10, paddingVertical: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondary: { backgroundColor: SPACE_UI.inkRaised },
  primary: { backgroundColor: SPACE_UI.accent },
  buttonLabel: { flexShrink: 1, fontSize: 15, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
