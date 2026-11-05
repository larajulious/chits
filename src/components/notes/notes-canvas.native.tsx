import * as Haptics from 'expo-haptics';
import { useSQLiteContext } from 'expo-sqlite';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { I18nManager, StyleSheet, View, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { DOT_SPACING, DeskDots } from '@/components/desk/desk-surface';
import { useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { createNoteCanvasRepository } from '@/db/note-canvas-repository';
import type { CardListItem } from '@/db/types';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { addToCanvasIndex, boundsOf, canvasCardFrame, canvasRangeKey, canvasTilt, CANVAS_HALF, clampToWorld, clampZoom, createCanvasIndex, fitCamera, floorZoom, focusCamera, frameCamera, homeCamera, nextTapZoom, noteAtPoint, openingCamera, parseCanvasRange, placeBoard, placeNear, queryCanvasIndex, zoomAround, type CanvasCamera, type CanvasPosition, type CanvasPrefs, type CanvasRect } from '@/services/note-canvas';
import { noteKey } from '@/services/note-order';
import { CanvasCameraControls, CanvasHint } from './canvas-camera-controls';
import { CanvasNoteCard, canvasCardInput, canvasPaper, type CanvasCardHandlers, type CanvasNote } from './canvas-note-card.native';
import { NotesMiniMap, type MiniMapNote } from './notes-mini-map';
import { useCanvasCamera, type CanvasCameraApi } from './use-canvas-camera';
import { DRAG_ACTIVE, DRAG_NONE, useCanvasGestures, type CanvasDrag } from './use-canvas-gestures';

type Phase = 'steady' | 'entering' | 'leaving';
type Props = Pick<CanvasCardHandlers, 'onOpen' | 'onMore' | 'onToggleSubtask' | 'onToggleChecklist'> & {
  /** Every note on the board, in the list's sort order, whatever the filter shows. */
  notes: CardListItem[];
  shownKeys: ReadonlySet<string>;
  filterKey: string;
  /** A note to bring into view; `nonce` lets the same note be asked for twice. */
  focus: { key: string; nonce: number } | null;
  onFocusDone: (found: boolean) => void;
  onToast: (message: string) => void;
  bottomInset: number;
  /** Rises and falls as the camera moves, for anything that reacts to activity. */
  activity: SharedValue<number>;
  paper: string;
  footer?: ReactNode;
  emptyState?: ReactNode;
};

const LIFT_SPRING = { damping: 22, stiffness: 340, mass: 0.6 };
const SETTLE_SPRING = { damping: 17, stiffness: 190, mass: 0.7 };
const DRAG_SLOP = 10;
const ZOOM_STEP = 1.4;
const SAVE_DELAY_MS = 500;
const FILTER_FADE_MS = 200;
const HIGHLIGHT_MS = 2200;
/** Dots fade out as the board shrinks, and the layer only has to reach this far. */
const DOTS_GONE = 0.7;
/** `left` follows the writing direction under RTL; the board's coordinates don't. */
const PHYSICAL_LEFT = I18nManager.isRTL ? 'right' : 'left';

/** The board's dot grain moves and scales with the world, drawn once and wrapped around one dot's width. */
const CanvasDots = memo(function CanvasDots({ camera, width, height }: { camera: CanvasCameraApi; width: number; height: number }) {
  const layerWidth = Math.ceil(width / DOTS_GONE) + DOT_SPACING * 2;
  const layerHeight = Math.ceil(height / DOTS_GONE) + DOT_SPACING * 2;
  const style = useAnimatedStyle(() => {
    const zoom = camera.zoom.get();
    const step = DOT_SPACING * zoom;
    const offsetX = ((camera.x.get() % step) + step) % step - step;
    const offsetY = ((camera.y.get() % step) + step) % step - step;
    return { opacity: Math.max(0, Math.min(1, (zoom - DOTS_GONE) / 0.15)), transform: [{ translateX: offsetX }, { translateY: offsetY }, { scale: zoom }] };
  });
  return <Animated.View pointerEvents="none" style={[styles.dots, { [PHYSICAL_LEFT]: 0, width: layerWidth, height: layerHeight }, style]}><DeskDots faint width={layerWidth} height={layerHeight} /></Animated.View>;
});

/** One note at its spot. Filter changes fade it; panning only ever mounts or unmounts it. */
const CanvasSlot = memo(function CanvasSlot({ note, lite, phase, away, handlers }: { note: CanvasNote; lite: boolean; phase: Phase; away: boolean; handlers: CanvasCardHandlers }) {
  const reduced = useReducedMotion();
  const appear = useSharedValue(phase === 'entering' && !reduced ? 0 : 1);
  useEffect(() => {
    if (phase === 'steady') return;
    const target = phase === 'entering' ? 1 : 0;
    appear.set(reduced ? target : withTiming(target, { duration: FILTER_FADE_MS }));
  }, [appear, phase, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: appear.get(), transform: [{ scale: 0.95 + 0.05 * appear.get() }, { rotate: `${note.tilt}deg` }] }));
  return <Animated.View style={[styles.slot, { [PHYSICAL_LEFT]: note.x + CANVAS_HALF, top: note.y + CANVAS_HALF, width: note.width, height: note.height }, away && styles.away, style]}>
    <CanvasNoteCard note={note} lite={lite} handlers={handlers} />
  </Animated.View>;
}, (previous, next) => previous.note.item === next.note.item && previous.note.x === next.note.x && previous.note.y === next.note.y && previous.note.width === next.note.width && previous.note.height === next.note.height
  && previous.lite === next.lite && previous.phase === next.phase && previous.away === next.away && previous.handlers === next.handlers);

/** The lifted note: it follows the finger on the UI thread, above everything else. */
function CanvasDragGhost({ note, lite, camera, drag, handlers }: { note: CanvasNote; lite: boolean; camera: CanvasCameraApi; drag: CanvasDrag; handlers: CanvasCardHandlers }) {
  const desk = useDesk();
  const reduced = useReducedMotion();
  const follow = useAnimatedStyle(() => {
    const zoom = camera.zoom.get();
    const lifted = drag.lifted.get();
    return { transform: [
      { translateX: (drag.fingerX.get() - camera.x.get()) / zoom - drag.grabX.get() + CANVAS_HALF },
      { translateY: (drag.fingerY.get() - camera.y.get()) / zoom - drag.grabY.get() + CANVAS_HALF },
      { scale: 1 + (reduced ? 0 : 0.05) * lifted },
      { rotate: `${note.tilt}deg` },
    ] };
  });
  const shadow = useAnimatedStyle(() => ({ opacity: drag.lifted.get() }));
  return <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.ghost, { [PHYSICAL_LEFT]: 0, width: note.width, height: note.height }, follow]}>
    <Animated.View style={[StyleSheet.absoluteFill, styles.deepShadow, { boxShadow: `0px 16px 22px ${desk.shadow}` }, shadow]} />
    <CanvasNoteCard note={note} lite={lite} handlers={handlers} />
  </Animated.View>;
}

/** A ring around a note just found, drawn over it so the note itself never re-renders. */
function FoundRing({ rect, tilt, ink }: { rect: CanvasRect; tilt: number; ink: string }) {
  const reduced = useReducedMotion();
  const { styleTokens } = useTheme();
  const glow = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    glow.set(withSequence(withTiming(1, { duration: 220 }), withTiming(0.45, { duration: 360 }), withTiming(1, { duration: 300 }), withDelay(500, withTiming(0, { duration: 420 }))));
  }, [glow, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: glow.get() }));
  return <Animated.View pointerEvents="none" style={[styles.ring, { [PHYSICAL_LEFT]: rect.x + CANVAS_HALF - 6, top: rect.y + CANVAS_HALF - 6, width: rect.width + 12, height: rect.height + 12, borderColor: ink, borderRadius: styleTokens.button.radius + 6, transform: [{ rotate: `${tilt}deg` }] }, style]} />;
}

/**
 * The Notes board. The camera is three shared values on one transformed layer,
 * so a pan or pinch runs entirely on the UI thread and React renders nothing.
 * React hears about the camera only when it crosses a grid cell (canvasRangeKey),
 * and then mounts just the notes in those cells; notes already there are memoized
 * and stay put, so a board costs about the same at 50 notes or 5,000.
 */
export function NotesCanvas({ notes, shownKeys, filterKey, focus, onFocusDone, onToast, onOpen, onMore, onToggleSubtask, onToggleChecklist, bottomInset, activity, paper, footer, emptyState }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const repository = useMemo(() => createNoteCanvasRepository(database), [database]);
  const { fontScale } = useWindowDimensions();
  const desk = useDesk();
  const reduced = useReducedMotion();
  const camera = useCanvasCamera();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const [positions, setPositions] = useState<Map<string, CanvasPosition> | null>(null);
  const [miniMap, setMiniMap] = useState(false);
  const [hint, setHint] = useState(false);
  const [ready, setReady] = useState(false);
  const [rangeKey, setRangeKey] = useState<string | null>(null);
  const [drag, setDrag] = useState<CanvasNote | null>(null);
  const [found, setFound] = useState<(CanvasRect & { tilt: number }) | null>(null);
  const prefs = useRef<CanvasPrefs | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewFilter = useRef(filterKey);
  const dragNote = useRef<CanvasNote | null>(null);
  const liftedAt = useRef({ x: 0, y: 0 });
  const inlineTouch = useRef<(() => void) | null>(null);
  const ignoreTapsUntil = useRef(0);
  const bottomClearance = useSharedValue(bottomInset);

  // ── Where notes are ───────────────────────────────────────────────────────

  useEffect(() => {
    let active = true;
    void repository.load().then((saved) => {
      if (!active) return;
      prefs.current = saved.prefs;
      setMiniMap(saved.prefs.miniMap);
      setHint(!saved.prefs.hintDone);
      setPositions(saved.positions);
    }).catch(() => { if (active) setPositions(new Map()); });
    return () => { active = false; };
  }, [repository]);

  const frames = useMemo(() => new Map(notes.map((item) => [noteKey(item), canvasCardFrame(canvasCardInput(item), fontScale)])), [fontScale, notes]);
  const placed = useMemo<CanvasNote[]>(() => positions ? notes.flatMap((item) => {
    const key = noteKey(item);
    const spot = positions.get(key);
    const frame = frames.get(key);
    return spot && frame ? [{ key, item, x: spot.x, y: spot.y, z: spot.z, width: frame.width, height: frame.height, tilt: canvasTilt(key), frame }] : [];
  }) : [], [frames, notes, positions]);
  const byKey = useMemo(() => new Map(placed.map((note) => [note.key, note])), [placed]);
  const shown = useMemo(() => placed.filter((note) => shownKeys.has(note.key)), [placed, shownKeys]);
  const index = useMemo(() => createCanvasIndex(shown), [shown]);
  const bounds = useMemo(() => boundsOf(shown), [shown]);
  // The floating nav and the dock cover the bottom, so framing stops above them.
  const view = useMemo(() => size ? { width: size.width, height: Math.max(120, size.height - bottomInset - dockHeight) } : null, [bottomInset, dockHeight, size]);
  useEffect(() => { bottomClearance.set(bottomInset + dockHeight); }, [bottomClearance, bottomInset, dockHeight]);
  useEffect(() => { if (view) camera.minZoom.set(floorZoom(bounds, view)); }, [bounds, camera, view]);
  useEffect(() => { if (bounds) camera.extent.set([bounds.x, bounds.y, bounds.x + bounds.width, bounds.y + bounds.height]); }, [bounds, camera]);

  // Only notes without a spot get one. An untouched board is laid out in sort
  // order; a note that turns up later goes near what's on screen. Either way
  // nothing already placed moves.
  useEffect(() => {
    if (!positions || !view) return;
    const missing = notes.filter((item) => !positions.has(noteKey(item)));
    if (!missing.length) return;
    let added: [string, CanvasPosition][];
    if (!positions.size) added = [...placeBoard(notes.map((item) => ({ key: noteKey(item), width: frames.get(noteKey(item))!.width, height: frames.get(noteKey(item))!.height })))];
    else {
      const occupied = createCanvasIndex<CanvasRect>(placed);
      const { x, y, zoom } = camera.read();
      const center = { x: (view.width / 2 - x) / zoom, y: (view.height / 2 - y) / zoom };
      const visible = { x: -x / zoom, y: -y / zoom, width: view.width / zoom, height: view.height / zoom };
      added = missing.map((item) => {
        const key = noteKey(item);
        const frame = frames.get(key)!;
        const spot = placeNear(frame, center, occupied, visible);
        addToCanvasIndex(occupied, { ...spot, width: frame.width, height: frame.height });
        return [key, { ...spot, z: 0 }];
      });
    }
    // The spots depend on the live camera, so this can't be worked out during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPositions(new Map([...positions, ...added]));
    // A failed save costs nothing: the same notes are placed again next time.
    repository.savePlacements(added).catch(() => {});
  }, [camera, frames, notes, placed, positions, repository, view]);

  // ── Remembering the view ──────────────────────────────────────────────────

  const writePrefs = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (prefs.current) repository.savePrefs(prefs.current).catch(() => {});
  }, [repository]);
  const remember = useCallback(() => {
    if (!prefs.current) return;
    prefs.current.views[viewFilter.current] = camera.read();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(writePrefs, SAVE_DELAY_MS);
  }, [camera, writePrefs]);
  useEffect(() => () => { if (saveTimer.current) writePrefs(); }, [writePrefs]);
  const changePrefs = useCallback((change: Partial<CanvasPrefs>) => {
    if (!prefs.current) return;
    prefs.current = { ...prefs.current, ...change };
    writePrefs();
  }, [writePrefs]);
  const fly = useCallback((target: CanvasCamera) => camera.fly(target, remember), [camera, remember]);

  // Opening at the saved view, or at the start of the board the first time.
  useEffect(() => {
    if (ready || !view || !positions || notes.some((item) => !positions.has(noteKey(item)))) return;
    camera.jump(prefs.current?.views[filterKey] ?? openingCamera(bounds, view));
    // A latch, not derived: a note arriving later must not unmount the board.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReady(true);
  }, [bounds, camera, filterKey, notes, positions, ready, view]);

  // Each filter keeps its own view. Its first visit brings its notes into frame
  // at the current zoom, since they may be far from where the last filter was.
  useEffect(() => {
    if (!ready || !view || viewFilter.current === filterKey || !prefs.current) return;
    prefs.current.views[viewFilter.current] = camera.read();
    viewFilter.current = filterKey;
    fly(prefs.current.views[filterKey] ?? frameCamera(bounds, view, camera.read().zoom));
  }, [bounds, camera, filterKey, fly, ready, view]);

  // ── Which notes are mounted ───────────────────────────────────────────────

  useAnimatedReaction(
    () => camera.width.get() > 0 ? canvasRangeKey(camera.x.get(), camera.y.get(), camera.zoom.get(), camera.width.get(), camera.height.get()) : null,
    (next, previous) => { if (next !== null && next !== previous) runOnJS(setRangeKey)(next); },
  );
  useAnimatedReaction(() => Math.abs(camera.x.get()) + Math.abs(camera.y.get()), (distance) => { activity.set(distance); });
  const range = useMemo(() => rangeKey ? parseCanvasRange(rangeKey) : null, [rangeKey]);

  // Filter changes fade notes in and out. Worked out during render, so a leaving
  // note is never gone for a frame before its fade begins.
  const [seen, setSeen] = useState({ filter: filterKey, keys: shownKeys });
  const [transition, setTransition] = useState<{ entering: Set<string>; leaving: Set<string> } | null>(null);
  if (seen.filter !== filterKey || seen.keys !== shownKeys) {
    setSeen({ filter: filterKey, keys: shownKeys });
    if (seen.filter !== filterKey) setTransition({ entering: new Set([...shownKeys].filter((key) => !seen.keys.has(key))), leaving: new Set([...seen.keys].filter((key) => !shownKeys.has(key))) });
  }
  useEffect(() => {
    if (!transition) return;
    const timer = setTimeout(() => setTransition(null), FILTER_FADE_MS + 40);
    return () => clearTimeout(timer);
  }, [transition]);

  const mounted = useMemo(() => {
    if (!range || !ready) return [];
    const list = queryCanvasIndex(index, range.rect);
    if (transition) for (const key of transition.leaving) { const note = byKey.get(key); if (note) list.push(note); }
    return list.sort((a, b) => a.z - b.z || (a.key < b.key ? -1 : 1));
  }, [byKey, index, range, ready, transition]);

  const mapNotes = useMemo<MiniMapNote[]>(() => shown.map((note) => ({ x: note.x, y: note.y, width: note.width, height: note.height, fill: canvasPaper(note.item).paper })), [shown]);

  // ── Touch ─────────────────────────────────────────────────────────────────

  const worldPoint = (screenX: number, screenY: number) => {
    const { x, y, zoom } = camera.read();
    return { x: (screenX - x) / zoom, y: (screenY - y) / zoom };
  };
  const endDrag = () => { dragNote.current = null; setDrag(null); };

  const { gesture, drag: dragValues } = useCanvasGestures(camera, bottomClearance, {
    onPick: (screenX, screenY) => {
      liftedAt.current = { x: screenX, y: screenY };
      const point = worldPoint(screenX, screenY);
      // A held tick box stays a tick box.
      const note = inlineTouch.current ? null : noteAtPoint(index, point.x, point.y);
      if (!note) { dragValues.phase.set(DRAG_NONE); return; }
      dragValues.grabX.set(point.x - note.x);
      dragValues.grabY.set(point.y - note.y);
      dragValues.phase.set(DRAG_ACTIVE);
      dragValues.lifted.set(reduced ? 1 : withSpring(1, LIFT_SPRING));
      dragValues.setEdgePanning(true);
      dragNote.current = note;
      setDrag(note);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onDrop: (commit, screenX, screenY) => {
      const note = dragNote.current;
      const inline = inlineTouch.current;
      const moved = Math.hypot(screenX - liftedAt.current.x, screenY - liftedAt.current.y) > DRAG_SLOP;
      inlineTouch.current = null;
      dragValues.phase.set(DRAG_NONE);
      dragValues.setEdgePanning(false);
      if (!note) {
        if (commit && inline && !moved) inline();
        remember();
        return;
      }
      if (commit && moved && positions) {
        const point = worldPoint(screenX, screenY);
        const spot = clampToWorld(Math.round(point.x - dragValues.grabX.get()), Math.round(point.y - dragValues.grabY.get()), note);
        const top = placed.reduce((highest, entry) => Math.max(highest, entry.z), 0);
        const next = { ...spot, z: top + 1 };
        const previous = positions.get(note.key);
        setPositions(new Map(positions).set(note.key, next));
        repository.savePosition(note.key, next).catch(() => {
          setPositions((current) => current && previous ? new Map(current).set(note.key, previous) : current);
          onToast(tr('notesCanvas.notSaved'));
        });
        void Haptics.selectionAsync();
      } else if (commit) {
        // Held without moving: the long press it always was, so the actions open.
        onMore(note.item);
      }
      const finished = () => endDrag();
      if (reduced) { dragValues.lifted.set(0); finished(); }
      else dragValues.lifted.set(withSpring(0, SETTLE_SPRING, (done) => { if (done) runOnJS(finished)(); }));
      remember();
    },
    onDoubleTap: (screenX, screenY) => {
      const point = worldPoint(screenX, screenY);
      if (noteAtPoint(index, point.x, point.y)) return;
      const current = camera.read();
      fly(zoomAround(current, clampZoom(nextTapZoom(current.zoom), camera.minZoom.get()), screenX, screenY));
    },
    onSettled: remember,
    onPanStart: () => {
      inlineTouch.current = null;
      if (hint) { setHint(false); changePrefs({ hintDone: true }); }
    },
    onCaughtGlide: () => { ignoreTapsUntil.current = Date.now() + 250; },
  });

  // Stable, so a memoized note never re-renders for a handler it already had.
  const latest = useRef({ onOpen, onMore, onToggleSubtask, onToggleChecklist });
  useEffect(() => { latest.current = { onOpen, onMore, onToggleSubtask, onToggleChecklist }; });
  const handlers = useMemo<CanvasCardHandlers>(() => ({
    onOpen: (item) => { if (Date.now() >= ignoreTapsUntil.current) latest.current.onOpen(item); },
    onMore: (item) => latest.current.onMore(item),
    onToggleSubtask: (item, id) => latest.current.onToggleSubtask(item, id),
    onToggleChecklist: (item, entry) => latest.current.onToggleChecklist(item, entry),
    onInlineTouch: (action) => { inlineTouch.current = action; },
    onInlineTap: (action) => { inlineTouch.current = null; action(); },
  }), []);

  // ── Going to a note ───────────────────────────────────────────────────────

  useEffect(() => {
    if (!focus || !ready || !view) return;
    const note = byKey.get(focus.key);
    if (!note) {
      // Still waiting for a spot is fine; a note that isn't here at all is not.
      if (!notes.some((item) => noteKey(item) === focus.key)) onFocusDone(false);
      return;
    }
    if (!shownKeys.has(note.key)) return;
    onFocusDone(true);
    // The ring waits for the camera, so it's seen arriving rather than off in the distance.
    camera.fly(focusCamera(note, view, camera.read().zoom), () => {
      setFound({ x: note.x, y: note.y, width: note.width, height: note.height, tilt: note.tilt });
      remember();
    });
  }, [byKey, camera, focus, notes, onFocusDone, ready, remember, shownKeys, view]);
  useEffect(() => {
    if (!found) return;
    const timer = setTimeout(() => setFound(null), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [found]);

  // ── Controls ──────────────────────────────────────────────────────────────

  const zoomBy = (factor: number) => {
    if (!view) return;
    const current = camera.read();
    fly(zoomAround(current, clampZoom(current.zoom * factor, camera.minZoom.get()), view.width / 2, view.height / 2));
  };
  const fit = useCallback(() => { if (view) fly(fitCamera(bounds, view)); }, [bounds, fly, view]);
  const reset = () => { if (view) fly(homeCamera(bounds, view)); };
  const jumpTo = useCallback((x: number, y: number) => {
    if (!view) return;
    const { zoom } = camera.read();
    fly({ x: view.width / 2 - x * zoom, y: view.height / 2 - y * zoom, zoom });
  }, [camera, fly, view]);
  const toggleMiniMap = () => {
    const next = !miniMap;
    setMiniMap(next);
    changePrefs({ miniMap: next });
  };
  const dismissHint = () => { setHint(false); changePrefs({ hintDone: true }); };

  const worldStyle = useAnimatedStyle(() => {
    const zoom = camera.zoom.get();
    return { transform: [{ translateX: camera.x.get() - CANVAS_HALF * zoom }, { translateY: camera.y.get() - CANVAS_HALF * zoom }, { scale: zoom }] };
  });
  const lite = range?.lite ?? false;
  const overlayBottom = bottomInset + dockHeight + 10;
  const hasNotes = shown.length > 0;

  return <View style={[styles.flex, { backgroundColor: paper }]} onLayout={({ nativeEvent: { layout } }) => {
    camera.width.set(layout.width);
    camera.height.set(layout.height);
    setSize((previous) => previous?.width === layout.width && previous.height === layout.height ? previous : { width: layout.width, height: layout.height });
  }}>
    <GestureDetector gesture={gesture}>
      <View collapsable={false} style={styles.viewport}>
        {size ? <CanvasDots camera={camera} width={size.width} height={size.height} /> : null}
        <Animated.View style={[styles.world, { [PHYSICAL_LEFT]: 0 }, worldStyle]}>
          {mounted.map((note) => <CanvasSlot key={note.key} note={note} lite={lite} away={drag?.key === note.key} handlers={handlers}
            phase={transition?.entering.has(note.key) ? 'entering' : transition?.leaving.has(note.key) ? 'leaving' : 'steady'} />)}
          {found ? <FoundRing rect={found} tilt={found.tilt} ink={desk.ink} /> : null}
          {drag ? <CanvasDragGhost note={drag} lite={lite} camera={camera} drag={dragValues} handlers={handlers} /> : null}
        </Animated.View>
      </View>
    </GestureDetector>
    {ready && !hasNotes ? <View pointerEvents="none" style={[styles.empty, { paddingBottom: bottomInset + dockHeight }]}>{emptyState}</View> : null}
    {hasNotes && miniMap && bounds ? <NotesMiniMap notes={mapNotes} bounds={bounds} camera={camera} paper={paper} onJump={jumpTo} onFit={fit} /> : null}
    {hasNotes && hint ? <CanvasHint bottom={overlayBottom} paper={paper} onDismiss={dismissHint} /> : null}
    {footer ? <View onLayout={({ nativeEvent }) => setDockHeight(Math.ceil(nativeEvent.layout.height))} style={[styles.dock, { bottom: bottomInset, backgroundColor: paper }]}>{footer}</View> : null}
    {/* Last, so it opens over the dock rather than under it. */}
    {hasNotes ? <CanvasCameraControls paper={paper} miniMap={miniMap} onZoomIn={() => zoomBy(ZOOM_STEP)} onZoomOut={() => zoomBy(1 / ZOOM_STEP)} onFit={fit} onReset={reset} onToggleMiniMap={toggleMiniMap} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  viewport: { flex: 1, overflow: 'hidden' },
  dots: { position: 'absolute', top: 0, transformOrigin: [0, 0, 0] },
  world: { position: 'absolute', top: 0, width: CANVAS_HALF * 2, height: CANVAS_HALF * 2, transformOrigin: [0, 0, 0] },
  slot: { position: 'absolute' },
  away: { opacity: 0 },
  ghost: { position: 'absolute', top: 0, zIndex: 10 },
  deepShadow: { borderRadius: 12 },
  ring: { position: 'absolute', borderWidth: 3 },
  empty: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  dock: { position: 'absolute', left: 0, right: 0 },
});
