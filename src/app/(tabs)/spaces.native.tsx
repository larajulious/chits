import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View, type LayoutRectangle, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '@/components/ui/icon';
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
import { spaceFullMessage } from '@/components/spaces/space-note-action';
import { LetterMagnets, SpaceSurface } from '@/components/spaces/space-surface';
import { StickyPaper } from '@/components/spaces/sticky-note';
import { useNoteSpaceName } from '@/components/spaces/use-notespace-name';
import { SheetDim, StickyOptionsSheet } from '@/components/spaces/sticky-options-sheet';
import { StickyViewSheet } from '@/components/spaces/sticky-view-sheet';
import { ReminderSheet } from '@/components/reminders/reminder-sheet';
import { removeCardReminder, removeMessageReminder, setCardReminder, setMessageReminder } from '@/services/reminders';
import { useTheme } from '@/components/theme-provider';
import { Toast } from '@/components/ui/primitives';
import { DEFAULT_STICKY_COLOR, SPACE_CAPACITY, SPACE_IDS, SPACE_LIST, SPACES, resolveSpaceId, toUnit, type SpaceId, type SpacePaperStyle } from '@/constants/spaces';
import { DARK_SURFACE, DOCK_ICONS, DOCK_LABELS, noteSeed } from '@/constants/spaces-theme';
import { createSpaceRepository } from '@/db/repositories';
import type { PinnedNote, SpaceCandidate } from '@/db/types';
import { subscribeToSpaceChanges } from '@/services/space-changes';
import { ChitsGuide } from '@/components/mascot/chits-guide.native';
import { useInkSurface, useSpaceStyles, useSpaceUI, type SpaceUI } from '@/components/spaces/ink-surface';

const EMPTY_COUNTS = Object.fromEntries(SPACE_IDS.map((id) => [id, 0])) as Record<SpaceId, number>;

// A card opens its details; a thought opens the board it was organized into, else Chat.
const openNote = (note: Pick<PinnedNote, 'kind' | 'noteId' | 'boardId'>) => router.push(note.kind === 'card' ? `/card/${note.noteId}` : note.boardId ? `/board/${note.boardId}` : `/chat?messageId=${note.noteId}`);

/**
 * Spaces (chits://spaces, also chits://pinned). Opens on the saved space, or
 * on Pick a Space the first time — decided before the first frame.
 */
export default function SpacesScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { spaceId, noteId, chitsGuided, chitsRelationship } = useLocalSearchParams<{ spaceId?: string; noteId?: string; chitsGuided?: string; chitsRelationship?: string }>();
  const [initial] = useState(() => resolveSpaceId(spaceId) ?? createSpaceRepository(database).getSelectedSpaceSync());
  if (!initial) return <Redirect href="/spaces/pick" />;
  return <SpaceBoard initialSpaceId={initial} focusNoteId={noteId} guided={chitsGuided === '1'} relationship={chitsRelationship === '1'} />;
}

function SpaceBoard({ initialSpaceId, focusNoteId, guided, relationship }: { initialSpaceId: SpaceId; focusNoteId?: string; guided: boolean; relationship: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { tokens: theme, styleTokens, styleColors } = useTheme();
  const inkSurface = useInkSurface();
  const ui = useSpaceUI();
  const styles = useSpaceStyles(createStyles);
  const repository = useMemo(() => createSpaceRepository(database), [database]);
  const insets = useSafeAreaInsets();
  const fonts = useSpaceFonts();
  const noteSpaceName = useNoteSpaceName();
  const window = useWindowDimensions();
  const [screenSize, setScreenSize] = useState({ width: window.width, height: window.height });
  const [spaceId, setSpaceId] = useState(initialSpaceId);
  const [notes, setNotes] = useState<PinnedNote[] | null>(null);
  const currentSpaceRef = useRef(initialSpaceId);
  const notesCacheRef = useRef<Partial<Record<SpaceId, PinnedNote[]>>>({});
  const switchRequestRef = useRef(0);
  const pendingSelectionRef = useRef<SpaceId | null>(null);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [board, setBoard] = useState<LayoutRectangle | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [reminderNote, setReminderNote] = useState<PinnedNote | null>(null);
  const [reminderAt, setReminderAt] = useState<number | null>(null);
  const [reminderKey, setReminderKey] = useState(0);
  const focusedOnce = useRef(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guideState, setGuideState] = useState<'placement' | 'success' | null>(guided ? 'placement' : null);
  const [toast, setToast] = useState<string | null>(null);
  const space = SPACES[spaceId];
  const count = counts[spaceId];
  const selected = notes?.find((note) => note.id === selectedId) ?? null;
  const viewing = notes?.find((note) => note.id === viewingId) ?? null;

  // Pick a Space (from the side panel) can choose another space while this
  // one waits underneath; coming back shows the one just picked.
  useFocusEffect(useCallback(() => {
    notesCacheRef.current = {};
    if (focusNoteId || pendingSelectionRef.current) return;
    const saved = repository.getSelectedSpaceSync();
    if (!saved || saved === currentSpaceRef.current) return;
    ++switchRequestRef.current;
    currentSpaceRef.current = saved;
    setSelectedId(null);
    setViewingId(null);
    setNotes(null);
    setSpaceId(saved);
  }, [repository, focusNoteId]));

  // Reloads on focus (a note may have changed elsewhere), on every space
  // switch, on any change to a space, and after a failed save (bump `reload`).
  // A slow read for a space the user already left is dropped, never shown.
  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((value) => value + 1), []);
  useFocusEffect(useCallback(() => {
    let active = true;
    let request = 0;
    const read = async () => {
      const reading = ++request;
      try {
        const list = await repository.list(spaceId);
        if (!active || reading !== request || spaceId !== currentSpaceRef.current) return;
        notesCacheRef.current[spaceId] = list;
        setNotes(list);
        if (!focusedOnce.current && focusNoteId) {
          const note = list.find((entry) => entry.noteId === focusNoteId);
          if (note) { focusedOnce.current = true; if (!guided) setViewingId(note.id); }
        }
        const nextCounts = await repository.counts();
        if (!active || reading !== request || spaceId !== currentSpaceRef.current) return;
        setCounts(nextCounts);
        // Each space holds at most twelve notes. Warm the other boards after
        // the visible one so switching can cross-fade without an empty frame.
        for (const next of SPACE_IDS) {
          if (!active || reading !== request || spaceId !== currentSpaceRef.current) return;
          if (next === spaceId || notesCacheRef.current[next]) continue;
          const nextNotes = await repository.list(next);
          if (active && reading === request && spaceId === currentSpaceRef.current) notesCacheRef.current[next] = nextNotes;
        }
      } catch {
        if (active && reading === request) setToast(tr("spaces.couldNotLoadThisSpaceTryAgain"));
      }
    };
    void read();
    const unsubscribe = subscribeToSpaceChanges(() => { notesCacheRef.current = {}; void read(); });
    return () => { active = false; unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `reload` only re-runs the read.
  }, [repository, spaceId, reload, focusNoteId, guided]));
  useEffect(() => {
    if (!guideState) return;
    const timer = setTimeout(() => setGuideState(null), guideState === 'success' ? 1800 : 10000);
    return () => clearTimeout(timer);
  }, [guideState]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);

  const switchSpace = useCallback((next: SpaceId) => {
    if (next === currentSpaceRef.current) return;
    const request = ++switchRequestRef.current;
    void Haptics.selectionAsync();
    const show = (list: PinnedNote[]) => {
      if (request !== switchRequestRef.current) return;
      currentSpaceRef.current = next;
      setSelectedId(null);
      setViewingId(null);
      setNotes(list);
      setSpaceId(next);
      pendingSelectionRef.current = next;
      void repository.setSelectedSpace(next).then(() => {
        if (pendingSelectionRef.current === next) pendingSelectionRef.current = null;
      }, () => {
        if (pendingSelectionRef.current === next) pendingSelectionRef.current = null;
        setToast(tr("spaces.couldNotSaveTheSelectedSpace"));
      });
    };
    const cached = notesCacheRef.current[next];
    if (cached) show(cached);
    else void repository.list(next).then((list) => {
      notesCacheRef.current[next] = list;
      show(list);
    }, () => { if (request === switchRequestRef.current) setToast(tr("spaces.couldNotOpenThisSpaceTryAgain")); });
  }, [repository]);

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
      // Gesture invokes this after render; swipeBy reads refs only on release.
      // eslint-disable-next-line react-hooks/refs
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
    void repository.savePosition(id, unit).then(() => {
      if (guided && notes?.find((note) => note.id === id)?.noteId === focusNoteId) setGuideState('success');
    }).catch(() => { setToast(tr("spaces.thatMoveCouldnTBeSaved")); load(); });
  }, [board, load, repository, guided, notes, focusNoteId]);
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
    run(() => repository.setColor(selected.id, color), tr("spaces.thatColorCouldnTBeSaved"));
  };
  const changePaperStyle = (paperStyle: SpacePaperStyle) => {
    if (!selected) return;
    void Haptics.selectionAsync();
    setNotes((current) => current?.map((note) => note.id === selected.id ? { ...note, paperStyle } : note) ?? current);
    run(() => repository.setPaperStyle(selected.id, paperStyle), tr("spaces.thatPaperStyleCouldnTBeSaved"));
  };
  const bringToFront = () => {
    if (!selected) return;
    setNotes((current) => (current ? [...current.filter((note) => note.id !== selected.id), selected] : current));
    setSelectedId(null);
    run(() => repository.bringToFront(selected.id), tr("spaces.thatCouldnTBeSaved"));
  };
  const moveTo = async (target: SpaceId) => {
    if (!selected) return;
    try {
      const result = await repository.moveToSpace(selected.id, target);
      if (result?.status === 'full') { setToast(spaceFullMessage()); return; }
      setSelectedId(null);
      setToast(tr("spaces.movedToValue", { value1: SPACES[target].name }));
    } catch { setToast(tr("spaces.thatNoteCouldnTBeMoved")); }
  };
  const remove = () => {
    if (!selected) return;
    setSelectedId(null);
    setNotes((current) => current?.filter((note) => note.id !== selected.id) ?? current);
    void repository.remove(selected.id).then(() => setToast(tr("spaces.removedFromValue", { value1: space.name })), () => { setToast(tr("spaces.thatNoteCouldnTBeRemoved")); load(); });
  };

  const openPicker = () => {
    if (count >= SPACE_CAPACITY) { setToast(spaceFullMessage()); return; }
    setPickerOpen(true);
  };
  const stick = async (candidate: SpaceCandidate) => {
    setPickerOpen(false);
    try {
      const result = await repository.stick(candidate.kind, candidate.id, spaceId);
      if (result.status === 'full') setToast(spaceFullMessage());
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch { setToast(tr("spaces.thatNoteCouldnTBeAdded")); }
  };
  const openReminder = (note: PinnedNote) => {
    setSelectedId(null);
    const table = note.kind === 'card' ? 'card_reminders' : 'message_reminders';
    const key = note.kind === 'card' ? 'card_id' : 'message_id';
    void database.getFirstAsync<{ scheduledAt: number }>(`SELECT scheduled_at AS scheduledAt FROM ${table} WHERE ${key} = ? AND completed_at IS NULL`, note.noteId)
      .then((row) => { setReminderAt(row?.scheduledAt ?? null); setReminderNote(note); setReminderKey((value) => value + 1); })
      .catch(() => setToast(tr("chat.couldNotOpenReminderTryAgain")));
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
        <Pressable accessibilityRole="button" accessibilityLabel={tr("spaces.nothingHereYetStickANoteOnYour", { value1: space.name })} onPress={openPicker} style={({ pressed }) => pressed && styles.pressed}>
          <StickyPaper note={EMPTY_NOTE} space={spaceId} seed={0} />
        </Pressable>
      </View> : null}
    </View>

    <View pointerEvents="box-none" style={[styles.topBar, { top }]}>
      {/* Each side is two buttons wide (the right has Chat and Share) so the name stays centered. */}
      <View style={styles.sideGroup}>
        <MagnetButton size={44} icon="add" accessibilityLabel={tr("spaces.stickANote")} onPress={openPicker} />
      </View>
      <View style={styles.middle}>
        <View accessible accessibilityRole="header" accessibilityLabel={tr("spaces.valueValueOfValueNotes", { value1: space.name, value2: count, value3: SPACE_CAPACITY })} style={styles.titles}>
          <LabelTape themed text={space.name} variant="dark" size="lg" rotation={-2} />
          <LabelTape themed text={tr("spaces.valueValueNotes", { value1: count, value2: SPACE_CAPACITY })} variant="red" size="sm" rotation={2} style={styles.countTape} />
        </View>
      </View>
      <View style={[styles.sideGroup, styles.sideGroupEnd]}>
        <RoundButton icon="chatbox-outline" label={tr("spaces.openChat")} onPress={() => { void Haptics.selectionAsync(); router.navigate('/chat'); }} />
        <RoundButton icon="share-outline" label={tr("spaces.shareYourValue", { value1: space.name })} disabled={!notes?.length} onPress={() => router.push({ pathname: '/spaces/share', params: { space: spaceId } })} />
      </View>
    </View>

    <View accessibilityRole="radiogroup" accessibilityLabel={tr("spaces.space")} style={[styles.dock, { bottom: dockBottom }, inkSurface({ fill: styleColors.controlFill, radius: styleTokens.nav.radius, edge: styleTokens.nav.edge })]}>
      {SPACE_LIST.map((item) => {
        const active = item.id === spaceId;
        return <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`${item.name}, ${countLabel('note', counts[item.id])}`} accessibilityState={{ selected: active }} onPress={() => switchSpace(item.id)} style={({ pressed }) => [active ? styles.dockPill : styles.dockIcon, active && inkSurface({ fill: styleColors.accentFill, radius: styles.dockPill.height / 2, edge: false }), pressed && styles.pressed]}>
          <MaterialCommunityIcons accessible={false} name={DOCK_ICONS[item.id]} size={active ? 20 : 23} color={active ? ui.accentText : ui.dockIcon} />
          {active ? <Text numberOfLines={1} style={[fonts.uiSemi, styles.dockLabel, { color: ui.accentText }]}>{DOCK_LABELS[item.id]}</Text> : null}
        </Pressable>;
      })}
    </View>
    <RoundButton icon="chevron-back" label={tr("search.goBack")} onPress={() => router.navigate({ pathname: '/', params: { view: 'cards' } })} size={DOCK_HEIGHT} style={[styles.bottomBack, { bottom: dockBottom }]} />
    {guideState ? <ChitsGuide text={guideState === 'success' ? tr("spaces.perfectSpot") : relationship ? tr("spaces.dropItAnywhereYouLikeItSStill") : tr("spaces.dropItAnywhereYouLike")} bottom={dockBottom + DOCK_HEIGHT + 12} onClose={() => setGuideState(null)} /> : null}

    {viewing && !selected ? <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <SheetDim label={tr("spaces.closeNote")} onPress={closeView} />
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
        onColor={recolor} onPaperStyle={changePaperStyle}
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
      if (result.ok) setToast(tr("chat.reminderSet"));
      return result;
    }} onRemove={async () => {
      if (!reminderNote) return;
      if (reminderNote.kind === 'card') await removeCardReminder(database, reminderNote.noteId);
      else await removeMessageReminder(database, reminderNote.noteId);
      setToast(tr("chat.reminderRemoved"));
    }} />
    <Toast message={toast} />
  </View></GestureDetector>;
}

/** A round paper button floating over the surface. */
function RoundButton({ icon, label, onPress, disabled = false, size = 44, style }: { icon: 'chevron-back' | 'share-outline' | 'chatbox-outline'; label: string; onPress: () => void; disabled?: boolean; size?: number; style?: StyleProp<ViewStyle> }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { styleTokens, styleColors } = useTheme();
  const inkSurface = useInkSurface();
  const ui = useSpaceUI();
  const styles = useSpaceStyles(createStyles);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.round, size !== 44 && { width: size, height: size, borderRadius: size / 2 }, inkSurface({ fill: styleColors.controlFill, radius: size === 44 ? styleTokens.header.iconButton.radius : size / 2, edge: styleTokens.header.iconButton.edge }, pressed), style, disabled && styles.disabled, pressed && styles.pressed]}>
    <Icon name={icon} size={icon === 'chevron-back' ? 24 : 21} color={ui.paper} style={icon === 'chevron-back' ? { marginLeft: -2 } : undefined} />
  </Pressable>;
}

const DOCK_HEIGHT = 60;
// The empty board's one note, stuck there to say what to do.
const EMPTY_NOTE = { title: null, get text() { return tr("spaces.emptyTapToAddANote"); }, hidden: false, color: DEFAULT_STICKY_COLOR, rotation: -2 };

const createStyles = (ui: SpaceUI) => StyleSheet.create({
  root: { flex: 1, backgroundColor: ui.ink },
  letters: { position: 'absolute', left: 22 },
  board: { position: 'absolute', left: 0, right: 0 },
  emptyWrap: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  sideGroup: { width: 44 * 2 + 8, flexDirection: 'row', gap: 8 },
  sideGroupEnd: { justifyContent: 'flex-end' },
  middle: { flex: 1, alignItems: 'center' },
  titles: { alignItems: 'center', paddingTop: 4 },
  countTape: { alignSelf: 'flex-end', marginTop: -3, marginRight: -14 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.ink, boxShadow: '0px 3px 8px rgba(0,0,0,0.22)' },
  dock: { position: 'absolute', left: 16, height: DOCK_HEIGHT, borderRadius: DOCK_HEIGHT / 2, backgroundColor: ui.ink, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, gap: 2, boxShadow: '0px 14px 28px rgba(0,0,0,0.38)' },
  dockPill: { height: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 24, backgroundColor: ui.accent },
  dockIcon: { width: 46, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  dockLabel: { fontSize: 14, color: ui.accentText },
  bottomBack: { position: 'absolute', right: 16 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
