import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { cancelAnimation, runOnJS, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { createRevisitRepository, type Relationship } from '@/db/revisit-repository';
import type { createNoteCanvasRepository } from '@/db/note-canvas-repository';
import type { CardListItem } from '@/db/types';
import { tr } from '@/localization/runtime';
import { arrangeConnectedNotes, connectionCurve, connectionGraph, curveBounds, curveHit, type ConnectionVisibility, type GraphNote } from '@/services/canvas-connections';
import { boundsOf, createCanvasIndex, fitCamera, queryCanvasIndex, type CanvasCamera, type CanvasPosition, type CanvasPrefs, type CanvasRect, type CanvasSize } from '@/services/note-canvas';
import { noteKey } from '@/services/note-order';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { pairKey, type NoteKey } from '@/services/revisit-engine';
import { createCanvasReader } from '@/services/canvas-read';
import type { CanvasNote } from './canvas-note-card.native';
import type { CanvasCameraApi } from './use-canvas-camera';
import type { CanvasEdge, CanvasMotion } from './canvas-connection-lines';

type Args = {
  notes: CanvasNote[]; frames: GraphNote[]; positions: Map<string, CanvasPosition> | null;
  setPositions: React.Dispatch<React.SetStateAction<Map<string, CanvasPosition> | null>>;
  repository: ReturnType<typeof createNoteCanvasRepository>; camera: CanvasCameraApi; view: CanvasSize | null;
  shownKeys: ReadonlySet<string>; filterKey: string; range: CanvasRect | null;
  dragKey: string | null;
  selected: string | null; setSelected: (key: string | null) => void;
  changePrefs: (value: Partial<CanvasPrefs>) => void; remember: () => void;
  onOpen: (item: CardListItem) => void; onMore: (item: CardListItem) => void; onToast: (message: string) => void;
};
export function useCanvasConnections(args: Args) {
  const { notes, frames, positions, setPositions, repository, camera, view, shownKeys, filterKey, range, dragKey, selected, setSelected, changePrefs, remember, onOpen, onMore, onToast } = args;
  const database = useSQLiteContext(); const linksRepository = useMemo(() => createRevisitRepository(database), [database]);
  const { actionSheet, confirm } = useAppDialog(); const reduced = useReducedMotion();
  const [links, setLinks] = useState<Relationship[] | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [visibility, setVisibility] = useState<ConnectionVisibility>('selected');
  const [focused, setFocused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const busyRef = useRef(false);
  const [undo, setUndo] = useState<{ before: Map<string, CanvasPosition>; after: Map<string, CanvasPosition> } | null>(null);
  const [arrangement, setArrangement] = useState<Map<string, CanvasPosition> | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const previousCamera = useRef<CanvasCamera | null>(null);
  const motion = useSharedValue<CanvasMotion>({ from: {}, to: {} }); const progress = useSharedValue(1);
  useLayoutEffect(() => { if (!busy) motion.set({ from: {}, to: {} }); }, [busy, motion]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; cancelAnimation(progress); }; }, [progress]);
  const reader = useMemo(() => createCanvasReader({ read: () => linksRepository.relationships(), onValue: setLinks, onError: () => onToast(tr('canvasConnections.loadFailed')) }), [linksRepository, onToast]);
  const refresh = reader.refresh;
  useFocusEffect(useCallback(() => { void refresh(); return reader.cancel; }, [reader, refresh]));
  useEffect(() => {
    const unsubscribe = subscribeToNoteChanges(() => { void refresh(); });
    return () => { unsubscribe(); reader.cancel(); };
  }, [reader, refresh]);
  useEffect(() => { if (!fresh) return; const timer = setTimeout(() => setFresh(null), 500); return () => clearTimeout(timer); }, [fresh]);
  const byKey = useMemo(() => new Map(notes.map((note) => [note.key, note])), [notes]);
  const graph = useMemo(() => connectionGraph(notes.map((note) => note.key), links ?? []), [links, notes]);
  const highlight = useMemo(() => {
    const key = source ?? focused ?? selected; const keys = new Set<string>();
    if (key && shownKeys.has(key)) { keys.add(key); if (!source) for (const next of graph.get(key) ?? []) if (shownKeys.has(next)) keys.add(next); }
    if (selectedEdge) { const edge = links?.find((link) => pairKey(link.note_a, link.note_b) === selectedEdge); if (edge) { keys.add(edge.note_a); keys.add(edge.note_b); } }
    return keys;
  }, [focused, graph, links, selected, selectedEdge, shownKeys, source]);
  const exitFocus = useCallback(() => {
    if (previousCamera.current) camera.fly(previousCamera.current, remember);
    previousCamera.current = null; setFocused(null);
  }, [camera, remember]);
  useFocusEffect(useCallback(() => {
    if (!source && !focused && !selected && !busy) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busyRef.current) return true;
      if (source) { setSource(null); setPicker(false); }
      else if (focused) exitFocus();
      else { setSelected(null); setSelectedEdge(null); }
      return true;
    });
    return () => subscription.remove();
  }, [busy, exitFocus, focused, selected, setSelected, source]));
  const previousFilter = useRef(filterKey);
  useEffect(() => {
    if (previousFilter.current === filterKey) return;
    previousFilter.current = filterKey;
    // A filter owns its own camera; don't restore the previous filter's focus view.
    previousCamera.current = null;
    setFocused(null); setSource(null); setPicker(false); setSelected(null); setSelectedEdge(null);
  }, [filterKey, setSelected]);
  const focusConnections = (key: string) => {
    if (!view) return;
    previousCamera.current ??= camera.read(); setSelected(key); setSelectedEdge(null); setFocused(key);
    const keys = new Set([key, ...graph.get(key) ?? []]);
    const group = notes.filter((note) => keys.has(note.key) && shownKeys.has(note.key));
    camera.fly(fitCamera(boundsOf(group), view), remember);
  };
  const animate = (before: Map<string, CanvasPosition>, after: Map<string, CanvasPosition>, undoing = false) => {
    if (busyRef.current || !after.size) return;
    busyRef.current = true; setBusy(true); setArrangement(after);
    motion.set({ from: Object.fromEntries(before), to: Object.fromEntries(after) }); progress.set(0);
    const finish = async () => {
      try {
        await repository.saveArrangement(before, after);
        if (!mounted.current) return;
        setPositions((current) => current ? new Map([...current, ...after]) : current);
        setUndo(undoing ? null : { before, after });
      } catch {
        if (!mounted.current) return;
        onToast(tr('notesCanvas.notSaved'));
        // Re-read after a conflict; preserve whichever positions actually won.
        const saved = await repository.load().catch(() => null);
        if (saved && mounted.current) setPositions(saved.positions);
      } finally {
        if (mounted.current) { setArrangement(null); busyRef.current = false; setBusy(false); }
      }
    };
    if (reduced) { progress.set(1); void finish(); }
    else progress.set(withTiming(1, { duration: 440 }, (done) => { if (done) runOnJS(finish)(); }));
  };
  const arrange = (key: string) => {
    if (!positions || busyRef.current) return;
    try {
      const after = arrangeConnectedNotes(frames, links ?? [], positions, key);
      const before = new Map([...after.keys()].map((member) => [member, positions.get(member)!]));
      animate(before, after);
    } catch { onToast(tr('canvasConnections.noRoom')); }
  };
  const connect = async (target: string) => {
    if (!source || busyRef.current) return;
    if (source === target) { onToast(tr('canvasConnections.chooseAnother')); return; }
    // Read fresh: never change an existing relationship's reference/follow-up type.
    busyRef.current = true; setBusy(true);
    try {
      const current = await linksRepository.relationships(source as NoteKey);
      if (current.some((link) => link.note_a === target || link.note_b === target)) { onToast(tr('canvasConnections.alreadyLinked')); return; }
      await linksRepository.link(source as NoteKey, target as NoteKey);
      setFresh(pairKey(source, target)); setSelected(source); setSource(null); setPicker(false); await refresh();
    } catch { onToast(tr('canvasConnections.saveFailed')); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const unlink = (link: Relationship) => confirm({ title: tr('canvasConnections.unlink'), message: tr('canvasConnections.unlinkMessage'), confirmText: tr('revisit.removeLink'), onConfirm: async () => {
    try { await linksRepository.unlink(link.note_a, link.note_b); setSelectedEdge(null); await refresh(); }
    catch (error) { onToast(tr('canvasConnections.saveFailed')); throw error; }
  } });
  const edgeActions = (link: Relationship) => {
    setSelectedEdge(pairKey(link.note_a, link.note_b)); setSelected(link.note_a);
    actionSheet({ title: tr('revisit.connection'), options: [
      ...[link.note_a, link.note_b].flatMap((key) => { const note = byKey.get(key); return note ? [{ label: tr('canvasConnections.goTo', { title: note.item.hidden ? tr('entrydetailsheet.hiddenNote') : note.item.title || tr('calendardata.untitledNote') }), icon: 'locate-outline' as const, onPress: () => { setSelected(key); if (view) camera.fly(fitCamera(note, view), remember); } }] : []; }),
      { label: tr('canvasConnections.unlink'), icon: 'unlink-outline', onPress: () => unlink(link) },
    ] });
  };
  const more = (item: CardListItem) => {
    if (busyRef.current) return;
    if (source) { void connect(noteKey(item)); return; }
    const key = noteKey(item); setSelected(key); setSelectedEdge(null);
    const connected = links?.filter((link) => link.note_a === key || link.note_b === key) ?? [];
    actionSheet({ title: item.hidden ? tr('entrydetailsheet.hiddenNote') : item.title || tr('calendardata.untitledNote'), options: [
      { label: tr('canvasConnections.connect'), icon: 'link-outline', disabled: links === null || item.hidden, onPress: () => { setSource(key); } },
      { label: tr('canvasConnections.focus'), icon: 'scan-outline', disabled: !connected.length, onPress: () => focusConnections(key) },
      { label: tr('canvasConnections.arrange'), icon: 'git-network-outline', disabled: !connected.length, onPress: () => arrange(key) },
      { label: tr('canvasConnections.manage'), icon: 'unlink-outline', disabled: !connected.length, onPress: () => actionSheet({ title: tr('canvasConnections.manage'), options: connected.map((link) => { const target = byKey.get(link.note_a === key ? link.note_b : link.note_a); return { label: target?.item.hidden ? tr('entrydetailsheet.hiddenNote') : target?.item.title || tr('calendardata.untitledNote'), icon: 'link-outline', onPress: () => edgeActions(link) }; }) }) },
      { label: tr('canvasConnections.noteActions'), icon: 'ellipsis-horizontal', onPress: () => onMore(item) },
    ] });
  };
  const open = (item: CardListItem) => {
    if (busyRef.current) return;
    const key = noteKey(item);
    if (source) { void connect(key); return; }
    if (selected !== key && visibility !== 'hidden' && graph.get(key)?.size) { setSelected(key); setSelectedEdge(null); return; }
    onOpen(item);
  };
  const edgeIndex = useMemo(() => createCanvasIndex((links ?? []).flatMap((link) => {
    const a = byKey.get(link.note_a); const b = byKey.get(link.note_b);
    if (!a || !b || !shownKeys.has(a.key) || !shownKeys.has(b.key)) return [];
    const id = pairKey(link.note_a, link.note_b);
    const visible = visibility === 'all' || (visibility === 'selected' && (a.key === selected || b.key === selected || id === selectedEdge));
    if (!visible) return [];
    const curve = connectionCurve(a, b); const initial = curveBounds(curve);
    const target = arrangement ? curveBounds(connectionCurve({ ...a, ...arrangement.get(a.key) }, { ...b, ...arrangement.get(b.key) })) : initial;
    const swept = boundsOf([initial, target])!;
    return [{ ...swept, link, curve, edge: { id, a, b, emphasized: highlight.has(a.key) && highlight.has(b.key), fresh: id === fresh } }];
  })), [arrangement, byKey, fresh, highlight, links, selected, selectedEdge, shownKeys, visibility]);
  const edges = useMemo<CanvasEdge[]>(() => {
    if (!range) return [];
    const visible = queryCanvasIndex(edgeIndex, range); const seen = new Set(visible.map((entry) => entry.edge.id));
    // A drag can cross several cells before the JS culler hears about it.
    if (dragKey) for (const cell of edgeIndex.values()) for (const entry of cell) if (!seen.has(entry.edge.id) && (entry.edge.a.key === dragKey || entry.edge.b.key === dragKey)) { visible.push(entry); seen.add(entry.edge.id); }
    return visible.map((entry) => entry.edge);
  }, [dragKey, edgeIndex, range]);
  const hit = (point: { x: number; y: number }) => {
    if (busyRef.current) return;
    const tolerance = 22 / camera.read().zoom;
    const edge = queryCanvasIndex(edgeIndex, { x: point.x - tolerance, y: point.y - tolerance, width: tolerance * 2, height: tolerance * 2 }).find((entry) => curveHit(entry.curve, point, tolerance));
    if (edge) edgeActions(edge.link); else { setSelected(null); setSelectedEdge(null); }
  };
  const controls = () => actionSheet({ title: tr('canvasConnections.visibility'), options: [
    ...(['selected', 'all', 'hidden'] as const).map((mode) => ({ label: tr(`canvasConnections.${mode}`), icon: mode === visibility ? 'checkmark-circle' as const : 'ellipse-outline' as const, onPress: () => { setVisibility(mode); changePrefs({ connections: mode }); } })),
    ...(links === null ? [{ label: tr('canvasConnections.retry'), icon: 'refresh-outline' as const, onPress: () => { void refresh(); } }] : []),
  ] });
  const selectSearch = useCallback((key: string) => { setSelected(key); setSelectedEdge(null); }, [setSelected]);
  return { links, selected, setSelected, source, picker, setPicker, visibility, setVisibility, focused, exitFocus, busy, arrangement, highlight, edges, hit, open, more, controls,
    motion, progress, linksRepository, connect, cancel: () => { if (!busyRef.current) { setSource(null); setPicker(false); } },
    undo: undo ? () => animate(undo.after, undo.before, true) : undefined,
    clearUndo: () => setUndo(null), clearSelection: () => { setSelected(null); setSelectedEdge(null); }, selectSearch,
  };
}
