import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutRectangle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS } from 'react-native-reanimated';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DraggableSticky, RaisedSticky } from '@/components/spaces/draggable-sticky';
import { LabelTape } from '@/components/spaces/label-tape';
import { MagnetButton } from '@/components/spaces/magnet-button';
import { NotePicker } from '@/components/spaces/note-picker';
import { useSpaceFonts } from '@/components/spaces/space-fonts';
import { SPACE_FULL_MESSAGE } from '@/components/spaces/space-note-action';
import { LetterMagnets, SpaceSurface } from '@/components/spaces/space-surface';
import { StickyPaper } from '@/components/spaces/sticky-note';
import { useNoteSpaceName } from '@/components/spaces/use-notespace-name';
import { SheetDim, StickyOptionsSheet } from '@/components/spaces/sticky-options-sheet';
import { StickyViewSheet } from '@/components/spaces/sticky-view-sheet';
import { ReminderSheet } from '@/components/reminders/reminder-sheet';
import { removeCardReminder, removeMessageReminder, setCardReminder, setMessageReminder } from '@/services/reminders';
import { useTheme } from '@/components/theme-provider';
import { Toast } from '@/components/ui/primitives';
import { DEFAULT_STICKY_COLOR, SPACE_CAPACITY, SPACE_IDS, SPACE_LIST, SPACES, resolveSpaceId, toUnit, type SpaceId } from '@/constants/spaces';
import { DARK_SURFACE, DOCK_ICONS, DOCK_LABELS, noteSeed, SPACE_UI } from '@/constants/spaces-theme';
import { createSpaceRepository } from '@/db/repositories';
import type { PinnedNote, SpaceCandidate } from '@/db/types';
import { subscribeToSpaceChanges } from '@/services/space-changes';

const EMPTY_COUNTS = Object.fromEntries(SPACE_IDS.map((id) => [id, 0])) as Record<SpaceId, number>;

// A card opens its details; a thought opens the board it was organized into, else Chat.
const openNote = (note: Pick<PinnedNote, 'kind' | 'noteId' | 'boardId'>) => router.push(note.kind === 'card' ? `/card/${note.noteId}` : note.boardId ? `/board/${note.boardId}` : `/chat?messageId=${note.noteId}`);

/**
 * Spaces (chits://spaces, also chits://pinned). Opens on the saved space, or
 * on Pick a Space the first time — decided before the first frame.
 */
export default function SpacesScreen() {
  const database = useSQLiteContext();
  const { spaceId, noteId } = useLocalSearchParams<{ spaceId?: string; noteId?: string }>();
  const [initial] = useState(() => resolveSpaceId(spaceId) ?? createSpaceRepository(database).getSelectedSpaceSync());
  if (!initial) return <Redirect href="/spaces/pick" />;
  return <SpaceBoard initialSpaceId={initial} focusNoteId={noteId} />;
}

function SpaceBoard({ initialSpaceId, focusNoteId }: { initialSpaceId: SpaceId; focusNoteId?: string }) {
  const database = useSQLiteContext();
  const { tokens: theme } = useTheme();
  const repository = useMemo(() => createSpaceRepository(database), [database]);
  const insets = useSafeAreaInsets();
  const fonts = useSpaceFonts();
  const noteSpaceName = useNoteSpaceName();
  const window = useWindowDimensions();
  const [screenSize, setScreenSize] = useState({ width: window.width, height: window.height });
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [notes, setNotes] = useState<PinnedNote[] | null>(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [board, setBoard] = useState<LayoutRectangle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [reminderNote, setReminderNote] = useState<PinnedNote | null>(null);
  const [reminderAt, setReminderAt] = useState<number | null>(null);
  const [reminderKey, setReminderKey] = useState(0);
  const focusedOnce = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const space = SPACES[spaceId];
  const count = counts[spaceId];
  const selected = notes?.find((note) => note.id === selectedId) ?? null;
  const viewing = notes?.find((note) => note.id === viewingId) ?? null;

  // Pick a Space (from the side panel) can choose another space while this
  // one waits underneath; coming back shows the one just picked.
  useFocusEffect(useCallback(() => {
    if (focusNoteId) return;
    const saved = repository.getSelectedSpaceSync();
    if (!saved || saved === spaceId) return;
    setSelectedId(null);
    setViewingId(null);
    setNotes(null);
    setSpaceId(saved);
  }, [repository, spaceId, focusNoteId]));

  // Reloads on focus (a note may have changed elsewhere), on every space
  // switch, on any change to a space, and after a failed save (bump `reload`).
  // A slow read for a space the user already left is dropped, never shown.
  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((value) => value + 1), []);
  useFocusEffect(useCallback(() => {
    let active = true;
    const read = async () => {
      const [list, nextCounts] = await Promise.all([repository.list(spaceId), repository.counts()]);
      if (!active) return;
      setNotes(list);
      setCounts(nextCounts);
      if (!focusedOnce.current && focusNoteId) {
        const note = list.find((entry) => entry.noteId === focusNoteId);
        if (note) { focusedOnce.current = true; setViewingId(note.id); }
      }
    };
    void read();
    const unsubscribe = subscribeToSpaceChanges(() => { void read(); });
    return () => { active = false; unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reload` only re-runs the read.
  }, [repository, spaceId, reload, focusNoteId]));
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);

  const switchSpace = useCallback((next: SpaceId) => {
    if (next === spaceId) return;
    void Haptics.selectionAsync();
    setSelectedId(null);
    setViewingId(null);
    setNotes(null);
    setSpaceId(next);
    void repository.setSelectedSpace(next).catch(() => undefined);
  }, [repository, spaceId]);

  // Swiping across the space steps through the dock's order: left for the
  // next space, right for the one before. A swipe that starts on a sticky
  // drags the sticky instead (it takes a move of 4pt; this waits for 24pt
  // sideways), and nothing swipes while a sheet or the picker is open. The
  // space doesn't follow the finger: it just cross-fades, as a dock tap does.
  const index = SPACE_IDS.indexOf(spaceId);
  const swipeBy = useCallback((step: 1 | -1) => {
    const next = SPACE_IDS[index + step];
    if (next) switchSpace(next);
  }, [index, switchSpace]);
  const overlayOpen = Boolean(selectedId || viewingId || pickerOpen);
  const swipe = useMemo(() => {
    const first = index === 0;
    const last = index === SPACE_IDS.length - 1;
    return Gesture.Pan()
      .enabled(!overlayOpen)
      .activeOffsetX([-24, 24])
      .failOffsetY([-18, 18])
      .onEnd((event) => {
        const far = Math.abs(event.translationX) > 70 || Math.abs(event.velocityX) > 600;
        if (far && event.translationX < 0 && !last) runOnJS(swipeBy)(1);
        else if (far && event.translationX > 0 && !first) runOnJS(swipeBy)(-1);
      });
  }, [index, overlayOpen, swipeBy]);

  const onLift = useCallback(() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, []);
  const onDrop = useCallback((id: string, x: number, y: number) => {
    if (!board) return;
    const unit = toUnit({ x, y }, board);
    // Shown where it was dropped, on top, right away; saved once.
    setNotes((current) => {
      const note = current?.find((item) => item.id === id);
      return current && note ? [...current.filter((item) => item.id !== id), { ...note, ...unit }] : current;
    });
    void repository.savePosition(id, unit).catch(() => { setToast('That move couldn’t be saved.'); load(); });
  }, [board, load, repository]);
  // A tap reads the note right here, over the space; leaving for the card or
  // Chat is the sheet's own button.
  const onOpen = useCallback((id: string) => { void Haptics.selectionAsync(); setViewingId(id); }, []);
  const closeView = useCallback(() => setViewingId(null), []);
  const onOptions = useCallback((id: string) => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectedId(id); }, []);
  const closeOptions = useCallback(() => setSelectedId(null), []);

  const run = (action: () => Promise<unknown>, failure: string) => { void action().catch(() => { setToast(failure); load(); }); };
  const recolor = (color: string) => {
    if (!selected) return;
    void Haptics.selectionAsync();
    setNotes((current) => current?.map((note) => (note.id === selected.id ? { ...note, color } : note)) ?? current);
    run(() => repository.setColor(selected.id, color), 'That color couldn’t be saved.');
  };
  const bringToFront = () => {
    if (!selected) return;
    setNotes((current) => (current ? [...current.filter((note) => note.id !== selected.id), selected] : current));
    setSelectedId(null);
    run(() => repository.bringToFront(selected.id), 'That couldn’t be saved.');
  };
  const moveTo = async (target: SpaceId) => {
    if (!selected) return;
    try {
      const result = await repository.moveToSpace(selected.id, target);
      if (result?.status === 'full') { setToast(SPACE_FULL_MESSAGE); return; }
      setSelectedId(null);
      setToast(`Moved to ${SPACES[target].name}`);
    } catch { setToast('That note couldn’t be moved.'); }
  };
  const remove = () => {
    if (!selected) return;
    setSelectedId(null);
    setNotes((current) => current?.filter((note) => note.id !== selected.id) ?? current);
    void repository.remove(selected.id).then(() => setToast(`Removed from ${space.name}`), () => { setToast('That note couldn’t be removed.'); load(); });
  };

  const openPicker = () => {
    if (count >= SPACE_CAPACITY) { setToast(SPACE_FULL_MESSAGE); return; }
    setPickerOpen(true);
  };
  const stick = async (candidate: SpaceCandidate) => {
    setPickerOpen(false);
    try {
      const result = await repository.stick(candidate.kind, candidate.id, spaceId);
      if (result.status === 'full') setToast(SPACE_FULL_MESSAGE);
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { setToast('That note couldn’t be added.'); }
  };
  const openReminder = (note: PinnedNote) => {
    setSelectedId(null);
    const table = note.kind === 'card' ? 'card_reminders' : 'message_reminders';
    const key = note.kind === 'card' ? 'card_id' : 'message_id';
    void database.getFirstAsync<{ scheduledAt: number }>(`SELECT scheduled_at AS scheduledAt FROM ${table} WHERE ${key} = ? AND completed_at IS NULL`, note.noteId)
      .then((row) => { setReminderAt(row?.scheduledAt ?? null); setReminderNote(note); setReminderKey((value) => value + 1); })
      .catch(() => setToast('Could not open reminder. Try again.'));
  };

  const empty = notes !== null && notes.length === 0;
  // Controls float over the surface, inside the safe areas; notes live between them.
  const top = insets.top + 16;
  const dockBottom = insets.bottom + 16;
  const boardTop = top + 44 + 26;
  const boardBottom = dockBottom + DOCK_HEIGHT + 8;
  return <GestureDetector gesture={swipe}><View style={styles.root} onLayout={({ nativeEvent: { layout } }) => setScreenSize((current) => (current.width === layout.width && current.height === layout.height ? current : { width: layout.width, height: layout.height }))}>
    <StatusBar style={DARK_SURFACE[spaceId] ? 'light' : 'dark'} />
    {/* The space, edge to edge (under the status bar too). Switching cross-fades it. */}
    <Animated.View key={spaceId} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={StyleSheet.absoluteFill}>
      <SpaceSurface spaceId={spaceId} width={screenSize.width} height={screenSize.height} />
      {spaceId === 'fridge' ? <View pointerEvents="none" style={[styles.letters, { bottom: boardBottom + 6 }]}><LetterMagnets name={noteSpaceName} maxWidth={screenSize.width - 44} /></View> : null}
    </Animated.View>

    {/* collapsable={false}: the board must stay a real view, or it's flattened
        away and the stickies' own zIndex (up to 1000 mid-drag) stacks them over
        the sheets, top bar and dock drawn after it. */}
    <View collapsable={false} style={[styles.board, { top: boardTop, bottom: boardBottom }]} onLayout={({ nativeEvent: { layout } }) => setBoard((current) => (current && current.width === layout.width && current.height === layout.height && current.x === layout.x && current.y === layout.y ? current : layout))}>
      {/* Keyed by space, so a switch fades the old notes out and the new ones in with the surface. */}
      {board && notes ? <Animated.View key={spaceId} collapsable={false} entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} pointerEvents="box-none" style={StyleSheet.absoluteFill}>{notes.map((note, index) => <DraggableSticky key={note.id} note={note} order={index} seed={noteSeed(note.id)} board={board} pinStyle={space.pinStyle} onLift={onLift} onDrop={onDrop} onOpen={onOpen} onOptions={onOptions} />)}</Animated.View> : null}
      {empty ? <View style={styles.emptyWrap} pointerEvents="box-none">
        <Pressable accessibilityRole="button" accessibilityLabel={`Nothing here yet. Stick a note on your ${space.name}.`} onPress={openPicker} style={({ pressed }) => pressed && styles.pressed}>
          <StickyPaper note={EMPTY_NOTE} space={spaceId} seed={0} />
        </Pressable>
      </View> : null}
    </View>

    <View pointerEvents="box-none" style={[styles.topBar, { top }]}>
      {/* Each side is two buttons wide (the right has Chat and Share) so the name stays centered. */}
      <View style={styles.sideGroup}>
        <RoundButton icon="chevron-back" label="Go back" onPress={() => (router.canGoBack() ? router.back() : router.navigate('/'))} />
      </View>
      <View style={styles.middle}>
        <View accessible accessibilityRole="header" accessibilityLabel={`${space.name}, ${count} of ${SPACE_CAPACITY} notes`} style={styles.titles}>
          <LabelTape text={space.name} variant="dark" size="lg" rotation={-2} />
          <LabelTape text={`${count} / ${SPACE_CAPACITY} notes`} variant="red" size="sm" rotation={2} style={styles.countTape} />
        </View>
      </View>
      <View style={[styles.sideGroup, styles.sideGroupEnd]}>
        <RoundButton icon="chatbox-outline" label="Open Chat" onPress={() => { void Haptics.selectionAsync(); router.navigate('/chat'); }} />
        <RoundButton icon="share-outline" label={`Share your ${space.name}`} disabled={!notes?.length} onPress={() => router.push({ pathname: '/spaces/share', params: { space: spaceId } })} />
      </View>
    </View>

    <View accessibilityRole="radiogroup" accessibilityLabel="Space" style={[styles.dock, { bottom: dockBottom }]}>
      {SPACE_LIST.map((item) => {
        const active = item.id === spaceId;
        return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`${item.name}, ${counts[item.id]} ${counts[item.id] === 1 ? 'note' : 'notes'}`} accessibilityState={{ selected: active }} onPress={() => switchSpace(item.id)} style={({ pressed }) => [active ? styles.dockPill : styles.dockIcon, pressed && styles.pressed]}>
          <MaterialCommunityIcons accessible={false} name={DOCK_ICONS[item.id]} size={active ? 20 : 23} color={active ? SPACE_UI.ink : SPACE_UI.dockIcon} />
          {active ? <Text numberOfLines={1} style={[fonts.uiSemi, styles.dockLabel]}>{DOCK_LABELS[item.id]}</Text> : null}
        </Pressable>;
      })}
    </View>
    <MagnetButton size={DOCK_HEIGHT} icon="add" accessibilityLabel="Stick a note" onPress={openPicker} style={[styles.magnet, { bottom: dockBottom }]} />

    {viewing && !selected ? <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <SheetDim label="Close note" onPress={closeView} />
      <StickyViewSheet
        note={viewing}
        viewportHeight={screenSize.height}
        onDismiss={closeView}
        onOpen={() => { setViewingId(null); openNote(viewing); }}
        onOptions={() => { setViewingId(null); setSelectedId(viewing.id); }}
      />
    </View> : null}
    {selected && board ? <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <SheetDim onPress={closeOptions} />
      <View pointerEvents="none" style={{ position: 'absolute', left: board.x, top: board.y, width: board.width, height: board.height }}>
        <RaisedSticky note={selected} seed={noteSeed(selected.id)} board={board} pinStyle={space.pinStyle} />
      </View>
      <StickyOptionsSheet
        note={selected}
        counts={counts}
        onDismiss={closeOptions}
        onColor={recolor}
        onOpen={() => { setSelectedId(null); openNote(selected); }}
        onBringToFront={bringToFront}
        onMove={(target) => void moveTo(target)}
        onRemove={remove}
        onReminder={() => openReminder(selected)}
      />
    </View> : null}
    <NotePicker visible={pickerOpen} spaceName={space.name} onClose={() => setPickerOpen(false)} onPick={(candidate) => void stick(candidate)} />
    <ReminderSheet key={reminderKey} visible={reminderNote !== null} existing={reminderAt} accent={theme.accent} accentOn={theme.accentText} onClose={() => setReminderNote(null)} onSave={async (date) => {
      if (!reminderNote) return { ok: false, reason: 'failed' };
      const result = reminderNote.kind === 'card' ? await setCardReminder(database, reminderNote.noteId, date.getTime()) : await setMessageReminder(database, reminderNote.noteId, date.getTime());
      if (result.ok) setToast('Reminder set');
      return result;
    }} onRemove={async () => {
      if (!reminderNote) return;
      if (reminderNote.kind === 'card') await removeCardReminder(database, reminderNote.noteId);
      else await removeMessageReminder(database, reminderNote.noteId);
      setToast('Reminder removed');
    }} />
    <Toast message={toast} />
  </View></GestureDetector>;
}

/** A round paper button floating over the surface. */
function RoundButton({ icon, label, onPress, disabled = false }: { icon: 'chevron-back' | 'share-outline' | 'chatbox-outline'; label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.round, disabled && styles.disabled, pressed && styles.pressed]}>
    <Ionicons accessible={false} name={icon} size={icon === 'chevron-back' ? 24 : 21} color={SPACE_UI.ink} style={icon === 'chevron-back' ? { marginLeft: -2 } : undefined} />
  </Pressable>;
}

const DOCK_HEIGHT = 60;
// The empty board's one note, stuck there to say what to do.
const EMPTY_NOTE = { title: null, text: 'Empty.\nTap + to\nadd a note.', hidden: false, color: DEFAULT_STICKY_COLOR, rotation: -2 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_UI.ink },
  letters: { position: 'absolute', left: 22 },
  board: { position: 'absolute', left: 0, right: 0 },
  emptyWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sideGroup: { width: 44 * 2 + 8, flexDirection: 'row', gap: 8 },
  sideGroupEnd: { justifyContent: 'flex-end' },
  middle: { flex: 1, alignItems: 'center' },
  titles: { alignItems: 'center', paddingTop: 4 },
  countTape: { alignSelf: 'flex-end', marginTop: -3, marginRight: -14 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(251,250,246,0.94)', boxShadow: '0px 3px 8px rgba(0,0,0,0.22)' },
  dock: { position: 'absolute', left: 16, height: DOCK_HEIGHT, borderRadius: DOCK_HEIGHT / 2, backgroundColor: SPACE_UI.ink, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 2, boxShadow: '0px 14px 28px rgba(0,0,0,0.38)' },
  dockPill: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 24, backgroundColor: SPACE_UI.paper },
  dockIcon: { width: 46, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  dockLabel: { fontSize: 14, color: SPACE_UI.ink },
  magnet: { position: 'absolute', right: 16 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
