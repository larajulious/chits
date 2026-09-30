import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  // Tagged with the note it belongs to, so a different note never shows a stale read.
  const [loaded, setLoaded] = useState<{ noteId: string; detail: SpaceNoteDetail } | null>(null);
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
  // Until the full note loads, what the board already shows. A photo's own
  // thought reads as its words (not "Photo"), and nothing is written twice:
  // not a card title its first thought repeats, nor the print's caption.
  const loadedThoughts = detail?.thoughts ?? (note.hidden ? [] : media
    ? [{ messageId: media.messageId, text: '', caption: media.caption }]
    : [{ messageId: note.noteId, text: stickyText({ title: null, text: note.text }), caption: null }]);
  const thoughts = loadedThoughts
    .map((thought) => ((media && thought.messageId === media.messageId ? thought.caption : thought.text) ?? '').trim())
    .filter((thought, index) => thought && !(index === 0 && thought === title) && thought !== caption);
  const onBoard = !isCard && !!note.boardId;
  const context = detail?.context ?? (isCard || onBoard ? null : 'Chat');
  const open = isCard ? { label: 'Open card', icon: 'open-outline' as const } : onBoard ? { label: 'Open board', icon: 'grid-outline' as const } : { label: 'Open in Chat', icon: 'chatbubble-outline' as const };
  const heading = note.hidden ? 'Hidden Chit' : title ?? caption ?? (media ? MEDIA_NAMES[media.attachment.type] : thoughts[0]?.split('\n')[0] ?? 'Note');
  // A little of the sticky's own tilt, kept small enough to read comfortably.
  const tilt = Math.max(-1.5, Math.min(1.5, note.rotation / 2));
  const pin = <PinDecoration space={note.spaceId} color={magnetColor(noteSeed(note.id))} noteWidth={window.width - 40} unit={1.2} seed={noteSeed(note.id)} />;

  return <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)} accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
    <View style={styles.grabber} />
    <View style={styles.header}>
      <Text style={[fonts.label, styles.where]}>ON YOUR {space.name.toUpperCase()}</Text>
      {context ? <Text numberOfLines={1} style={[fonts.ui, styles.context]}>{context}</Text> : null}
    </View>

    {/* Room around the paper for its shadow, and above it for the fridge magnet. */}
    <ScrollView style={[styles.scroll, { maxHeight: window.height * 0.62 }]} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {media?.attachment.type === 'audio'
        ? <SheetTape media={media} caption={caption} color={note.color} width={Math.min(window.width - 40, 360)} tilt={tilt} pin={pin} />
        : media ? <View style={{ transform: [{ rotate: `${tilt}deg` }] }}>
          <SheetPrint media={media} caption={caption} maxWidth={window.width - 40} maxHeight={window.height * 0.42} />
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>{pin}</View>
        </View> : null}
      {!media || thoughts.length ? <View style={[media ? styles.paperUnder : null, { transform: [{ rotate: `${media ? -tilt : tilt}deg` }] }]}>
        <View style={[styles.paper, { backgroundColor: paper.base, experimental_backgroundImage: `linear-gradient(176deg, ${paper.base} 0%, ${paper.base} 82%, ${paper.curl} 100%)` }]}>
          <View style={styles.paperContent}>
            {note.hidden ? <View accessible accessibilityLabel="Hidden Chit. Open it in Chat to see it." style={styles.hidden}>
              <Ionicons accessible={false} name="eye-off-outline" size={26} color={PAPER_INK} style={styles.hiddenIcon} />
              <Text style={[fonts.note, styles.hiddenText]}>Hidden Chit</Text>
              <Text style={[fonts.note, styles.hiddenHint]}>Open it in Chat to see it.</Text>
            </View> : <>
              {title && !media ? <Text accessibilityRole="header" selectable style={[fonts.note, styles.title]}>{title}</Text> : null}
              {thoughts.map((thought, index) => <Fragment key={index}>
                {index > 0 || (title && !media) ? <View style={styles.rule} /> : null}
                <Text selectable style={[fonts.note, styles.thought]}>{thought}</Text>
              </Fragment>)}
            </>}
          </View>
        </View>
        {/* A print already carries the pin; the sticky under it just lies there. */}
        {media ? null : <View pointerEvents="none" style={StyleSheet.absoluteFill}>{pin}</View>}
      </View> : null}
    </ScrollView>

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
  </Animated.View>;
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
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: SPACE_UI.ink, boxShadow: '0px -8px 30px rgba(0,0,0,0.35)' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: 10, marginBottom: 14, backgroundColor: SPACE_UI.inkBorder },
  header: { gap: 2 },
  where: { fontSize: 11, letterSpacing: 1.6, color: SPACE_UI.textMuted },
  context: { fontSize: 14, color: SPACE_UI.textMuted },
  scroll: { marginHorizontal: -20, marginTop: 6, marginBottom: 8 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  paperUnder: { marginTop: 18 },
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
  paper: { borderRadius: 3, boxShadow: '0px 10px 14px rgba(0,0,0,0.35)' },
  paperContent: { paddingHorizontal: 20, paddingTop: 28, paddingBottom: 22 },
  title: { fontSize: 27, lineHeight: 32, color: PAPER_INK },
  thought: { fontSize: 20, lineHeight: 27, color: PAPER_INK },
  rule: { height: 1, marginVertical: 12, backgroundColor: PAPER_INK, opacity: 0.18 },
  hidden: { alignItems: 'center', paddingVertical: 18 },
  hiddenIcon: { opacity: 0.55 },
  hiddenText: { marginTop: 4, fontSize: 22, lineHeight: 28, color: PAPER_INK, opacity: 0.7 },
  hiddenHint: { fontSize: 16, lineHeight: 21, color: PAPER_INK, opacity: 0.55 },
  actions: { flexDirection: 'row', gap: 10 },
  button: { flex: 1, height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  secondary: { backgroundColor: SPACE_UI.inkRaised },
  primary: { backgroundColor: SPACE_UI.accent },
  buttonLabel: { fontSize: 15 },
  pressed: { opacity: 0.7 },
});
