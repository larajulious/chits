import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { BlurTargetView, BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { Chip, ChipRow, EmptyState } from '@/components/ui/primitives';
import { DeskHeading, PaperDesk } from '@/components/desk/paper-desk';
import { spacing } from '@/constants/theme';
import type { CardListItem } from '@/db/types';
import { noteKey, reorder, type NoteOrderMode } from '@/services/note-order';
import { CardListRow } from './card-list-row.native';
import { findStickySection } from './cards-sticky-section';

/** A section with an empty title shows its notes without a heading. */
export type CardSection = { key: string; title: string; pinned?: boolean; count: number; data: CardListItem[] };
type Cell = { kind: 'header'; section: CardSection } | { kind: 'note'; item: CardListItem; column: number; section: CardSection };
type NoteCell = Extract<Cell, { kind: 'note' }>;
type Props = {
  sections: CardSection[];
  chips: { key: string; label: string; count: number }[];
  filter: string;
  onFilter: (key: string) => void;
  /** My order lets notes be dragged into place; the header switches it. */
  orderMode: NoteOrderMode;
  /** A section's notes in their new order after a drag; `moved` is the note that moved. */
  onArrange: (section: CardSection, keys: string[], moved: CardListItem) => void;
  onOpen: (item: CardListItem) => void;
  onMore: (item: CardListItem) => void;
  onToggleSubtask: (item: CardListItem, subtaskId: string) => void;
  onSectionChange: (section: CardSection | null) => void;
  bottomInset: number;
};

// The note being dragged in My order: where its cell sat when it lifted (in
// the list's own coordinates), and its section's order as it reads right now.
type Drag = { item: CardListItem; key: string; sectionKey: string; keys: string[]; left: number; top: number; width: number; column: number; moved: boolean };

const LIFT_MS = 320;
/** Travel before letting go counts as a drag rather than a hold (which opens the actions). */
const DRAG_SLOP = 10;
/** The least time between two reorders, so the grid settles before the next one. */
const REORDER_GAP_MS = 120;
/** How far into a note the finger must be before the dragged note takes its place. */
const TARGET_INSET = 0.2;
const EDGE = 56;
const MAX_SCROLL_STEP = 14;
const LIFT_SPRING = { damping: 22, stiffness: 340, mass: 0.6 };

function SectionHeading({ section }: { section: CardSection }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return <DeskHeading title={section.title} count={section.count} pinned={section.pinned} label={`${section.title}, ${countLabel('note', section.count)}`} style={styles.section} />;
}

/** Real cards remain recycled; only the active date label changes while scrolling. */
export function CardsCollection({ sections, chips, filter, onFilter, orderMode, onArrange, onOpen, onMore, onToggleSubtask, onSectionChange, bottomInset }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { width, fontScale } = useWindowDimensions();
  const { scheme, tokens, styleTokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const columns = width < 350 || fontScale >= 1.3 ? 1 : 2;
  const balanced = styleTokens.card.tinted;
  const arranging = orderMode === 'custom';
  const columnGap = 14;
  // Room above each paper for its tape or pin, and below for its shadow.
  const rowGap = 20;
  const listInset = spacing.md - columnGap / 2;
  const listPadding = balanced && columns > 1 ? listInset : 0;
  const target = useRef<View | null>(null);
  const list = useRef<FlashListRef<Cell>>(null);
  const [filterHeight, setFilterHeight] = useState(styleTokens.chip.height + styleTokens.chip.activeEdge + 16);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const viewHeight = useRef(0);
  const finger = useRef<{ x: number; y: number } | null>(null);
  const lastReorder = useRef(0);
  const scroller = useRef<ReturnType<typeof setInterval> | null>(null);
  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const lifted = useSharedValue(0);

  const collection = useMemo(() => {
    const cells: Cell[] = [];
    const headers: number[] = [];
    for (const section of sections) {
      // While a note is dragged its section reads in the drag's order.
      const data = drag?.sectionKey === section.key ? orderedBy(section.data, drag.keys) : section.data;
      if (section.title) {
        headers.push(cells.length);
        cells.push({ kind: 'header', section });
      }
      for (const [index, item] of data.entries()) cells.push({ kind: 'note', item, column: index % columns, section });
    }
    return { cells, headers };
  }, [sections, columns, drag]);
  const collectionRef = useRef(collection);
  useLayoutEffect(() => { collectionRef.current = collection; }, [collection]);

  // Inline headings scroll normally; their measured bottom edge determines
  // which section appears in the existing app header above the filters.
  const updateSection = useCallback((scrollOffset?: number) => {
    const current = list.current;
    if (!current) return;
    const active = findStickySection(collection.headers, scrollOffset ?? current.getAbsoluteLastScrollOffset(), filterHeight, current.getFirstItemOffset(), (index) => current.getLayout(index));
    const cell = active === undefined ? undefined : collection.cells[active];
    onSectionChange(cell?.kind === 'header' ? cell.section : null);
  }, [collection, filterHeight, onSectionChange]);

  useEffect(() => { updateSection(); }, [updateSection]);

  const cellPadding = (column: number) => balanced
    ? { paddingHorizontal: columns === 1 ? spacing.md : columnGap / 2, paddingBottom: rowGap }
    : { paddingLeft: columns === 1 || column === 0 ? spacing.md : columnGap / 2, paddingRight: columns === 1 || column === 1 ? spacing.md : columnGap / 2, paddingBottom: rowGap };

  // ── Drag to arrange (My order) ────────────────────────────────────────────
  // One long-press pan over the whole list rather than one per card: cells
  // recycle and move as the grid reflows, and a per-cell gesture would be
  // dropped with its cell mid-drag. Points are in the list's coordinates.

  /** The note cell under a point, with its frame; `inset` trims the frame top and bottom. */
  const noteAt = (x: number, y: number, inset = 0) => {
    const current = list.current;
    if (!current) return null;
    const scroll = current.getAbsoluteLastScrollOffset();
    const first = current.getFirstItemOffset();
    const { cells } = collectionRef.current;
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      if (cell.kind !== 'note') continue;
      const layout = current.getLayout(index);
      if (!layout) continue;
      const left = listPadding + layout.x;
      const top = first + layout.y - scroll;
      const trim = layout.height * inset;
      if (x >= left && x < left + layout.width && y >= top + trim && y < top + layout.height - trim) return { cell, left, top, width: layout.width };
    }
    return null;
  };

  const updateDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  const retarget = (x: number, y: number) => {
    const active = dragRef.current;
    if (!active || Date.now() - lastReorder.current < REORDER_GAP_MS) return;
    const hit = noteAt(x, y, TARGET_INSET);
    if (!hit || hit.cell.section.key !== active.sectionKey) return;
    const over = noteKey(hit.cell.item);
    if (over === active.key) return;
    const to = active.keys.indexOf(over);
    if (to < 0) return;
    lastReorder.current = Date.now();
    updateDrag({ ...active, keys: reorder(active.keys, active.keys.indexOf(active.key), to) });
    void Haptics.selectionAsync();
  };

  const stopScrolling = () => {
    if (scroller.current) clearInterval(scroller.current);
    scroller.current = null;
  };

  // Holding a note near the top or bottom edge scrolls the list, faster the closer it is.
  const startScrolling = () => {
    stopScrolling();
    scroller.current = setInterval(() => {
      const point = finger.current;
      const current = list.current;
      if (!point || !current || !dragRef.current) return;
      const top = filterHeight + EDGE;
      const bottom = viewHeight.current - bottomInset - EDGE;
      const step = point.y < top ? -MAX_SCROLL_STEP * Math.min(1, (top - point.y) / EDGE)
        : point.y > bottom ? MAX_SCROLL_STEP * Math.min(1, (point.y - bottom) / EDGE) : 0;
      if (!step) return;
      const offset = current.getAbsoluteLastScrollOffset();
      const next = Math.max(0, offset + step);
      if (next === offset) return;
      current.scrollToOffset({ offset: next, animated: false });
      retarget(point.x, point.y);
    }, 16);
  };

  const lift = (x: number, y: number) => {
    const hit = noteAt(x, y);
    if (!hit) return;
    finger.current = { x, y };
    lastReorder.current = 0;
    updateDrag({ item: hit.cell.item, key: noteKey(hit.cell.item), sectionKey: hit.cell.section.key, keys: hit.cell.section.data.map(noteKey), left: hit.left, top: hit.top, width: hit.width, column: hit.cell.column, moved: false });
    lifted.set(reduceMotion ? 1 : withSpring(1, LIFT_SPRING));
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    startScrolling();
  };

  const move = (x: number, y: number, dx: number, dy: number) => {
    const active = dragRef.current;
    if (!active) return;
    finger.current = { x, y };
    if (!active.moved && Math.hypot(dx, dy) > DRAG_SLOP) dragRef.current = { ...active, moved: true };
    retarget(x, y);
  };

  const finish = (commit: boolean) => {
    const active = dragRef.current;
    stopScrolling();
    finger.current = null;
    lifted.set(0);
    if (!active) return;
    updateDrag(null);
    if (!commit) return;
    // Held without moving: the long press it always was, so the actions open.
    if (!active.moved) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onMore(active.item);
      return;
    }
    const section = sections.find((entry) => entry.key === active.sectionKey);
    if (!section || section.data.every((item, index) => noteKey(item) === active.keys[index])) return;
    onArrange(section, active.keys, active.item);
  };

  // The gesture is built once; it reaches the latest handlers through a ref,
  // because rebuilding it mid-drag would cancel the drag.
  const handlers = useRef({ lift, move, finish });
  useLayoutEffect(() => { handlers.current = { lift, move, finish }; });
  const callLift = useCallback((x: number, y: number) => handlers.current.lift(x, y), []);
  const callMove = useCallback((x: number, y: number, dx: number, dy: number) => handlers.current.move(x, y, dx, dy), []);
  const callFinish = useCallback((commit: boolean) => handlers.current.finish(commit), []);
  // The callbacks read `handlers` only when a touch arrives, never during
  // render; the react-hooks/refs rule can't see that through runOnJS.
  /* eslint-disable react-hooks/refs */
  const gesture = useMemo(() => Gesture.Pan().enabled(arranging).activateAfterLongPress(LIFT_MS).failOffsetX([-DRAG_SLOP, DRAG_SLOP]).failOffsetY([-DRAG_SLOP, DRAG_SLOP])
    .onStart((event) => { dragX.set(0); dragY.set(0); runOnJS(callLift)(event.x, event.y); })
    .onUpdate((event) => { dragX.set(event.translationX); dragY.set(event.translationY); runOnJS(callMove)(event.x, event.y, event.translationX, event.translationY); })
    .onEnd(() => { runOnJS(callFinish)(true); })
    .onFinalize((_, success) => { if (!success) runOnJS(callFinish)(false); }), [arranging, callFinish, callLift, callMove, dragX, dragY]);
  /* eslint-enable react-hooks/refs */
  useEffect(() => stopScrolling, []);

  const liftStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.get() }, { translateY: dragY.get() }, { scale: 1 + 0.04 * lifted.get() }, { rotate: `${-1.5 * lifted.get()}deg` }] }));

  // Screen readers arrange with Move earlier / Move later on each note.
  const step = (cell: NoteCell, direction: -1 | 1) => {
    const keys = cell.section.data.map(noteKey);
    const from = keys.indexOf(noteKey(cell.item));
    const to = from + direction;
    if (from < 0 || to < 0 || to >= keys.length) return;
    onArrange(cell.section, reorder(keys, from, to), cell.item);
    void AccessibilityInfo.announceForAccessibility(tr('messages.movedToPositionOf', { value1: to + 1, value2: keys.length }));
  };
  const stepActions = [{ name: 'decrement', label: tr('id.moveEarlier') }, { name: 'increment', label: tr('id.moveLater') }];

  return <View style={styles.flex} onLayout={({ nativeEvent }) => { viewHeight.current = nativeEvent.layout.height; }}>
    <BlurTargetView ref={target} style={styles.flex}>
      {/* The desk starts under the filter row, so the row itself looks as it always has. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: filterHeight }]}><PaperDesk>{null}</PaperDesk></View>
      <GestureDetector gesture={gesture}>
        <View collapsable={false} style={styles.flex}>
          <FlashList key={`cards-${columns}`} ref={list} data={collection.cells} masonry numColumns={columns} optimizeItemArrangement={balanced}
            extraData={drag?.key} scrollEnabled={!drag}
            overrideItemLayout={(layout, cell) => { layout.span = cell.kind === 'header' ? columns : 1; }}
            keyExtractor={(cell) => cell.kind === 'header' ? `section-${cell.section.key}` : `${cell.item.kind}-${cell.item.id}`}
            getItemType={(cell) => cell.kind}
            onScroll={(event) => updateSection(event.nativeEvent.contentOffset.y)} scrollEventThrottle={32} onLoad={() => updateSection()} onContentSizeChange={() => updateSection()}
            renderItem={({ item: cell }) => cell.kind === 'header' ? (
              <View style={balanced && columns > 1 && { marginHorizontal: -listInset }}>
                <SectionHeading section={cell.section} />
              </View>
            ) : (
              // The dragged note's own spot stays as a faint gap while it travels.
              <View style={[cellPadding(cell.column), drag?.key === noteKey(cell.item) && styles.dragGap]}>
                <CardListRow item={cell.item} onPress={() => onOpen(cell.item)} onMore={() => onMore(cell.item)} onToggleSubtask={cell.item.kind === 'card' ? (subtaskId) => onToggleSubtask(cell.item, subtaskId) : undefined}
                  arranging={arranging} accessibilityActions={arranging ? stepActions : undefined}
                  onAccessibilityAction={arranging ? (event) => step(cell, event.nativeEvent.actionName === 'decrement' ? -1 : 1) : undefined} />
              </View>
            )}
            contentContainerStyle={{ paddingTop: filterHeight + 12, paddingHorizontal: listPadding, paddingBottom: bottomInset + spacing.md }}
            ListEmptyComponent={<EmptyState pose="search" title={tr("cardscollection.noCardsInThisFilter")} description={tr("cardscollection.chooseAnotherBoardOrAllCards")} />}
          />
        </View>
      </GestureDetector>
    </BlurTargetView>
    <View pointerEvents="box-none" style={styles.overlay}>
      <BlurView pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={45}
        tint={scheme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} style={StyleSheet.absoluteFill} />
      {/* Keep transparent chips readable even when bright photos scroll behind the blur. */}
      {scheme === 'dark' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.background, opacity: 0.9 }]} /> : null}
      <View onLayout={({ nativeEvent }) => { const next = Math.ceil(nativeEvent.layout.height); setFilterHeight((previous) => previous === next ? previous : next); }}>
        <ChipRow style={styles.chips}>
          {chips.map((chip) => <Chip key={chip.key} label={chip.label} count={chip.count} selected={chip.key === filter} accessibilityLabel={tr("cardscollection.filterByValueValueValue", { value1: chip.label, value2: chip.count, value3: chip.count === 1 ? 'card' : 'cards' })} onPress={() => onFilter(chip.key)} />)}
        </ChipRow>
      </View>
    </View>
    {/* The lifted note, under the finger and above everything else. */}
    {drag ? <Animated.View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[styles.dragLayer, { left: drag.left, top: drag.top, width: drag.width }, liftStyle]}>
      <View style={cellPadding(drag.column)}><CardListRow item={drag.item} onPress={noop} onMore={noop} arranging /></View>
    </Animated.View> : null}
  </View>;
}

function noop() {}

function orderedBy(items: CardListItem[], keys: string[]) {
  const byKey = new Map(items.map((item) => [noteKey(item), item]));
  return keys.flatMap((key) => byKey.get(key) ?? []);
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  chips: { marginVertical: 8 },
  section: { paddingHorizontal: spacing.md, paddingTop: 4, paddingBottom: 10 },
  dragGap: { opacity: 0.25 },
  dragLayer: { position: 'absolute', zIndex: 10, elevation: 10 },
});
