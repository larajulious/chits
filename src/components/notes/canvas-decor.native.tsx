import type { SQLiteDatabase } from 'expo-sqlite';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { I18nManager, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { tr } from '@/localization/runtime';
import { clampDecorScale, decorSettingKey, hitDecor, MAX_DECOR, newDecorId, parseDecor, type DecorHitBox, type DecorPiece } from '@/services/canvas-decor';
import { CANVAS_HALF, clampZoom, panLimits } from '@/services/note-canvas';
import { DECOR_ART, DECOR_INK, decorXml, type DecorArt } from './canvas-decor-art';
import type { CanvasCameraApi } from './use-canvas-camera';

/** `left` follows the writing direction under RTL; the board's coordinates don't. */
const PHYSICAL_LEFT = I18nManager.isRTL ? 'right' : 'left';
const UPSERT_SETTING = 'INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at';
const SAVE_DELAY_MS = 400;
const EMPTY: DecorPiece[] = [];
/** Screen points of grace around a piece, and of room around the selection frame. */
const TOUCH_SLOP = 10;
const FRAME_PAD = 8;
const HANDLE = 28;

const MODE_NONE = 0;
const MODE_MOVE = 1;
const MODE_TURN = 2;
const MODE_PAN = 3;

export type DecorTransform = { x: number; y: number; scale: number; rot: number };

// ── Saved pieces, per filter ────────────────────────────────────────────────

/** The board's decorations for this filter: loaded when the filter changes, saved shortly after each change. */
export function useCanvasDecor({ database, filterKey, onToast }: { database: SQLiteDatabase; filterKey: string; onToast: (message: string) => void }) {
  const [loaded, setLoaded] = useState<{ filter: string; pieces: DecorPiece[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const current = useRef<{ filter: string; pieces: DecorPiece[] } | null>(null);
  const pending = useRef<{ filter: string; pieces: DecorPiece[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useRef(onToast);
  useEffect(() => { toast.current = onToast; });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const save = pending.current;
    pending.current = null;
    if (save) database.runAsync(UPSERT_SETTING, decorSettingKey(save.filter), JSON.stringify(save.pieces), Date.now()).catch(() => toast.current(tr('notesDecor.notSaved')));
  }, [database]);

  useEffect(() => {
    let active = true;
    flush();
    database.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', decorSettingKey(filterKey))
      .then((row) => parseDecor(row?.value, (key) => DECOR_ART.has(key)), () => [])
      .then((pieces) => {
        if (!active) return;
        current.current = { filter: filterKey, pieces };
        setLoaded(current.current);
      });
    return () => { active = false; };
  }, [database, filterKey, flush]);
  useEffect(() => () => flush(), [flush]);

  /** Every change goes through here: shown at once, written a moment later. */
  const change = useCallback((next: (pieces: DecorPiece[]) => DecorPiece[]) => {
    const base = current.current;
    if (!base || base.filter !== filterKey) return;
    const updated = { filter: base.filter, pieces: next(base.pieces) };
    current.current = updated;
    pending.current = updated;
    setLoaded(updated);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  }, [filterKey, flush]);

  const topZ = (pieces: DecorPiece[]) => pieces.reduce((top, piece) => Math.max(top, piece.z), 0) + 1;
  const add = useCallback((key: string, at: { x: number; y: number }, zoom: number) => {
    const art = DECOR_ART.get(key);
    const base = current.current;
    if (!art || !base) return;
    if (base.pieces.length >= MAX_DECOR) { toast.current(tr('notesDecor.full')); return; }
    // About the same size on screen whatever the zoom, with a little tilt of its own.
    const piece: DecorPiece = {
      id: newDecorId(), key, x: at.x, y: at.y, scale: clampDecorScale(1 / zoom), rot: Math.round(Math.random() * 16 - 8), behind: false, z: topZ(base.pieces),
      ...(art.textKey ? { text: tr(art.textKey) } : {}), ...(art.inks ? { ink: DECOR_INK } : {}),
    };
    change((pieces) => [...pieces, piece]);
    setSelectedId(piece.id);
  }, [change]);
  const commit = useCallback((id: string, transform: DecorTransform) => change((pieces) => pieces.map((piece) => piece.id === id ? { ...piece, ...transform, scale: clampDecorScale(transform.scale) } : piece)), [change]);
  const update = useCallback((id: string, patch: Partial<Pick<DecorPiece, 'text' | 'ink' | 'behind'>>) => change((pieces) => pieces.map((piece) => piece.id === id ? { ...piece, ...patch, z: patch.behind === undefined ? piece.z : topZ(pieces) } : piece)), [change]);
  const duplicate = useCallback((id: string, offset: number) => {
    const base = current.current;
    const source = base?.pieces.find((piece) => piece.id === id);
    if (!base || !source) return;
    if (base.pieces.length >= MAX_DECOR) { toast.current(tr('notesDecor.full')); return; }
    const copy = { ...source, id: newDecorId(), x: source.x + offset, y: source.y + offset, z: topZ(base.pieces) };
    change((pieces) => [...pieces, copy]);
    setSelectedId(copy.id);
  }, [change]);
  const remove = useCallback((id: string) => { change((pieces) => pieces.filter((piece) => piece.id !== id)); setSelectedId(null); }, [change]);
  const startEditing = useCallback(() => setEditing(true), []);
  const stopEditing = useCallback(() => { setEditing(false); setSelectedId(null); }, []);

  const pieces = loaded?.filter === filterKey ? loaded.pieces : EMPTY;
  const selected = editing && selectedId ? pieces.find((piece) => piece.id === selectedId) ?? null : null;
  return { pieces, editing, selected, startEditing, stopEditing, select: setSelectedId, add, commit, update, duplicate, remove };
}

// ── Drawing ────────────────────────────────────────────────────────────────

const DecorPieceView = memo(function DecorPieceView({ piece, hidden }: { piece: DecorPiece; hidden: boolean }) {
  const art = DECOR_ART.get(piece.key);
  const { id, text, ink } = piece;
  const xml = useMemo(() => art ? decorXml(art, { id, text, ink }) : null, [art, id, ink, text]);
  if (!art || !xml) return null;
  return <View pointerEvents="none" style={[styles.piece, {
    [PHYSICAL_LEFT]: CANVAS_HALF + piece.x - art.w / 2, top: CANVAS_HALF + piece.y - art.h / 2, width: art.w, height: art.h,
    opacity: hidden ? 0 : 1, transform: [{ rotate: `${piece.rot}deg` }, { scale: piece.scale }],
  }]}>
    <SvgXml xml={xml} width={art.w} height={art.h} />
  </View>;
});

/** The pieces on one side of the notes, inside the board's moving world. Drawn once; the camera moves them. */
export const DecorLayer = memo(function DecorLayer({ pieces, behind, hiddenId }: { pieces: DecorPiece[]; behind: boolean; hiddenId: string | null }) {
  const layer = useMemo(() => pieces.filter((piece) => piece.behind === behind).sort((a, b) => a.z - b.z), [behind, pieces]);
  return <>{layer.map((piece) => <DecorPieceView key={piece.id} piece={piece} hidden={piece.id === hiddenId} />)}</>;
});

// ── Editing ────────────────────────────────────────────────────────────────

type DecorBox = DecorHitBox & { scale: number; w: number; h: number };

/**
 * While decorating, this layer sits over the whole board and takes every touch,
 * so notes can't be opened or dragged by accident and the board's own gestures
 * stay exactly as they are. One finger on a piece moves it, on the blue dot
 * resizes and turns it, and on bare board pans. Two fingers resize and turn the
 * selected piece, or zoom the board when nothing is selected.
 *
 * The selected piece is drawn here, in screen space, from UI-thread values, so
 * it follows the fingers without React; its copy on the board hides meanwhile.
 * React hears only when a touch ends.
 */
export function DecorEditor({ camera, pieces, selected, onSelect, onCommit, onSettled }: {
  camera: CanvasCameraApi;
  pieces: DecorPiece[];
  selected: DecorPiece | null;
  onSelect: (id: string | null) => void;
  onCommit: (id: string, transform: DecorTransform) => void;
  onSettled: () => void;
}) {
  "use no memo"; // The gesture is built once and reads its callbacks through a ref at touch time.

  const boxes = useSharedValue<DecorBox[]>([]);
  const selId = useSharedValue('');
  const selW = useSharedValue(0);
  const selH = useSharedValue(0);
  const sx = useSharedValue(0);
  const sy = useSharedValue(0);
  const ss = useSharedValue(1);
  const sr = useSharedValue(0);
  const touching = useSharedValue(0);
  const mode = useSharedValue(MODE_NONE);
  const pinchMode = useSharedValue(MODE_NONE);
  const grabX = useSharedValue(0);
  const grabY = useSharedValue(0);
  const start = useSharedValue({ a: 0, d: 1, scale: 1, rot: 0, x: 0, y: 0, zoom: 1, focalX: 0, focalY: 0 });

  // Topmost first: pieces on the notes, then pieces under them, each by layer.
  useEffect(() => {
    const ordered = [...pieces].sort((a, b) => (a.behind === b.behind ? b.z - a.z : a.behind ? 1 : -1));
    boxes.set(ordered.flatMap((piece) => {
      const art = DECOR_ART.get(piece.key);
      return art ? [{ id: piece.id, x: piece.x, y: piece.y, halfW: (art.w * piece.scale) / 2, halfH: (art.h * piece.scale) / 2, rot: piece.rot, scale: piece.scale, w: art.w, h: art.h }] : [];
    }));
  }, [boxes, pieces]);

  // A selection from the toolbar or tray, or a commit, sets the live values; a touch in progress owns them.
  useEffect(() => {
    if (touching.get() > 0) return;
    const art = selected ? DECOR_ART.get(selected.key) : undefined;
    if (!selected || !art) { selId.set(''); return; }
    selId.set(selected.id); selW.set(art.w); selH.set(art.h);
    sx.set(selected.x); sy.set(selected.y); ss.set(selected.scale); sr.set(selected.rot);
  }, [selId, selW, selH, selected, ss, sr, sx, sy, touching]);

  const latest = useRef({ onSelect, onCommit, onSettled });
  useEffect(() => { latest.current = { onSelect, onCommit, onSettled }; });
  const select = useCallback((id: string | null) => latest.current.onSelect(id), []);
  const commit = useCallback((id: string, x: number, y: number, scale: number, rot: number) => latest.current.onCommit(id, { x, y, scale, rot }), []);
  const settled = useCallback(() => latest.current.onSettled(), []);

  /* eslint-disable react-hooks/refs */
  const gesture = useMemo(() => {
    const { x: camX, y: camY, zoom, minZoom, width, height, extent } = camera;

    /** Is a screen point on the selected piece's blue dot? */
    const onHandle = (px: number, py: number) => {
      'worklet';
      if (!selId.get()) return false;
      const z = zoom.get();
      const cx = camX.get() + sx.get() * z;
      const cy = camY.get() + sy.get() * z;
      const hw = (selW.get() * ss.get() * z) / 2 + FRAME_PAD;
      const hh = (selH.get() * ss.get() * z) / 2 + FRAME_PAD;
      const r = (sr.get() * Math.PI) / 180;
      const hx = cx + hw * Math.cos(r) - hh * Math.sin(r);
      const hy = cy + hw * Math.sin(r) + hh * Math.cos(r);
      return Math.hypot(px - hx, py - hy) <= HANDLE;
    };
    const take = (box: DecorBox) => {
      'worklet';
      selId.set(box.id); selW.set(box.w); selH.set(box.h);
      sx.set(box.x); sy.set(box.y); ss.set(box.scale); sr.set(box.rot);
    };
    const panCamera = (dx: number, dy: number) => {
      'worklet';
      const [left, top, right, bottom] = extent.get();
      const [minX, maxX] = panLimits(zoom.get(), width.get(), left, right, start.get().x);
      const [minY, maxY] = panLimits(zoom.get(), height.get(), top, bottom, start.get().y);
      camX.set(Math.max(minX, Math.min(maxX, start.get().x + dx)));
      camY.set(Math.max(minY, Math.min(maxY, start.get().y + dy)));
    };

    const pan = Gesture.Pan().maxPointers(1).minDistance(3)
      .onBegin((event) => {
        touching.set(touching.get() + 1);
        cancelAnimation(camX); cancelAnimation(camY); cancelAnimation(zoom);
        const z = zoom.get();
        const wx = (event.x - camX.get()) / z;
        const wy = (event.y - camY.get()) / z;
        if (onHandle(event.x, event.y)) {
          const cx = camX.get() + sx.get() * z;
          const cy = camY.get() + sy.get() * z;
          start.set({ ...start.get(), a: Math.atan2(event.y - cy, event.x - cx), d: Math.max(1, Math.hypot(event.x - cx, event.y - cy)), scale: ss.get(), rot: sr.get() });
          mode.set(MODE_TURN);
          return;
        }
        const id = hitDecor(boxes.get(), wx, wy, TOUCH_SLOP / z);
        if (id) {
          if (id !== selId.get()) {
            const box = boxes.get().find((item) => item.id === id);
            if (box) take(box);
            runOnJS(select)(id);
          }
          grabX.set(wx - sx.get()); grabY.set(wy - sy.get());
          mode.set(MODE_MOVE);
          return;
        }
        start.set({ ...start.get(), x: camX.get(), y: camY.get() });
        mode.set(MODE_PAN);
      })
      .onUpdate((event) => {
        const z = zoom.get();
        if (mode.get() === MODE_MOVE) {
          sx.set((event.x - camX.get()) / z - grabX.get());
          sy.set((event.y - camY.get()) / z - grabY.get());
        } else if (mode.get() === MODE_TURN) {
          const cx = camX.get() + sx.get() * z;
          const cy = camY.get() + sy.get() * z;
          const s = start.get();
          ss.set(clampDecorScale((s.scale * Math.hypot(event.x - cx, event.y - cy)) / s.d));
          sr.set(s.rot + ((Math.atan2(event.y - cy, event.x - cx) - s.a) * 180) / Math.PI);
        } else if (mode.get() === MODE_PAN) {
          panCamera(event.translationX, event.translationY);
        }
      })
      .onEnd(() => {
        if (mode.get() === MODE_PAN) runOnJS(settled)();
        else if (mode.get() !== MODE_NONE && selId.get()) runOnJS(commit)(selId.get(), sx.get(), sy.get(), ss.get(), sr.get());
      })
      .onFinalize(() => { mode.set(MODE_NONE); touching.set(Math.max(0, touching.get() - 1)); });

    const pinch = Gesture.Pinch()
      .onBegin(() => { touching.set(touching.get() + 1); })
      .onStart((event) => {
        cancelAnimation(camX); cancelAnimation(camY); cancelAnimation(zoom);
        if (selId.get()) {
          pinchMode.set(MODE_TURN);
          start.set({ ...start.get(), scale: ss.get() });
        } else {
          pinchMode.set(MODE_PAN);
          start.set({ ...start.get(), zoom: zoom.get(), x: camX.get(), y: camY.get(), focalX: event.focalX, focalY: event.focalY });
        }
      })
      .onUpdate((event) => {
        const s = start.get();
        if (pinchMode.get() === MODE_TURN) { ss.set(clampDecorScale(s.scale * event.scale)); return; }
        // The board point first under the fingers stays under them.
        const next = clampZoom(s.zoom * event.scale, minZoom.get());
        const ratio = next / s.zoom;
        zoom.set(next);
        camX.set(event.focalX - (s.focalX - s.x) * ratio);
        camY.set(event.focalY - (s.focalY - s.y) * ratio);
      })
      .onEnd(() => {
        if (pinchMode.get() === MODE_TURN && selId.get()) runOnJS(commit)(selId.get(), sx.get(), sy.get(), ss.get(), sr.get());
        else runOnJS(settled)();
      })
      .onFinalize(() => { pinchMode.set(MODE_NONE); touching.set(Math.max(0, touching.get() - 1)); });

    const rotation = Gesture.Rotation()
      .onBegin(() => { touching.set(touching.get() + 1); })
      .onStart(() => { start.set({ ...start.get(), rot: sr.get() }); })
      .onUpdate((event) => { if (selId.get()) sr.set(start.get().rot + (event.rotation * 180) / Math.PI); })
      .onEnd(() => { if (selId.get()) runOnJS(commit)(selId.get(), sx.get(), sy.get(), ss.get(), sr.get()); })
      .onFinalize(() => { touching.set(Math.max(0, touching.get() - 1)); });

    // A tap on bare board finishes with the selected piece.
    const tap = Gesture.Tap().maxDistance(10).onEnd((event, success) => {
      if (!success) return;
      const z = zoom.get();
      if (onHandle(event.x, event.y)) return;
      if (!hitDecor(boxes.get(), (event.x - camX.get()) / z, (event.y - camY.get()) / z, TOUCH_SLOP / z)) {
        selId.set('');
        runOnJS(select)(null);
      }
    });

    return Gesture.Simultaneous(pan, pinch, rotation, tap);
  }, [boxes, camera, commit, grabX, grabY, mode, pinchMode, select, selH, selId, selW, settled, sr, ss, start, sx, sy, touching]);
  /* eslint-enable react-hooks/refs */

  return <GestureDetector gesture={gesture}>
    <View collapsable={false} style={StyleSheet.absoluteFill}>
      {selected ? <SelectedPiece key={selected.id} piece={selected} camera={camera} x={sx} y={sy} scale={ss} rot={sr} /> : null}
    </View>
  </GestureDetector>;
}

/** The piece being edited, its dashed frame and the blue dot, placed from UI-thread values. */
function SelectedPiece({ piece, camera, x, y, scale, rot }: { piece: DecorPiece; camera: CanvasCameraApi; x: SharedValue; y: SharedValue; scale: SharedValue; rot: SharedValue }) {
  const art = DECOR_ART.get(piece.key) as DecorArt;
  const { w, h } = art;
  const { id, text, ink } = piece;
  const xml = useMemo(() => decorXml(art, { id, text, ink }), [art, id, ink, text]);
  const pieceStyle = useAnimatedStyle(() => {
    const z = camera.zoom.get();
    const cx = camera.x.get() + x.get() * z;
    const cy = camera.y.get() + y.get() * z;
    return { transform: [{ translateX: cx - w / 2 }, { translateY: cy - h / 2 }, { rotate: `${rot.get()}deg` }, { scale: scale.get() * z }] };
  });
  const frameStyle = useAnimatedStyle(() => {
    const z = camera.zoom.get();
    const cx = camera.x.get() + x.get() * z;
    const cy = camera.y.get() + y.get() * z;
    const fw = w * scale.get() * z + FRAME_PAD * 2;
    const fh = h * scale.get() * z + FRAME_PAD * 2;
    return { width: fw, height: fh, transform: [{ translateX: cx - fw / 2 }, { translateY: cy - fh / 2 }, { rotate: `${rot.get()}deg` }] };
  });
  const handleStyle = useAnimatedStyle(() => {
    const z = camera.zoom.get();
    const cx = camera.x.get() + x.get() * z;
    const cy = camera.y.get() + y.get() * z;
    const hw = (w * scale.get() * z) / 2 + FRAME_PAD;
    const hh = (h * scale.get() * z) / 2 + FRAME_PAD;
    const r = (rot.get() * Math.PI) / 180;
    return { transform: [{ translateX: cx + hw * Math.cos(r) - hh * Math.sin(r) - HANDLE / 2 }, { translateY: cy + hw * Math.sin(r) + hh * Math.cos(r) - HANDLE / 2 }] };
  });
  return <>
    <Animated.View pointerEvents="none" style={[styles.live, { [PHYSICAL_LEFT]: 0, width: w, height: h }, pieceStyle]}><SvgXml xml={xml} width={w} height={h} /></Animated.View>
    <Animated.View pointerEvents="none" style={[styles.live, styles.frame, { [PHYSICAL_LEFT]: 0 }, frameStyle]} />
    <Animated.View pointerEvents="none" accessibilityLabel={tr('notesDecor.resize')} style={[styles.live, styles.handle, { [PHYSICAL_LEFT]: 0 }, handleStyle]}>
      <Icon name="sync" size={13} color="#FFFFFF" />
    </Animated.View>
  </>;
}

type SharedValue = ReturnType<typeof useSharedValue<number>>;

const styles = StyleSheet.create({
  piece: { position: 'absolute' },
  live: { position: 'absolute', top: 0 },
  frame: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#5B9BEA', borderRadius: 10 },
  handle: { width: HANDLE, height: HANDLE, borderRadius: HANDLE / 2, backgroundColor: '#5B9BEA', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(0,0,0,0.25)' },
});
