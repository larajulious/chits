import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutRectangle, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { FadeIn, LinearTransition, measure, runOnJS, useAnimatedRef, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { ChitsLoader, useChitsLoading } from '@/components/ui/chits-loader';
import { GlassSurface } from '@/components/ui/glass-surface';
import { AttachmentContent } from '@/components/chat/message-row';
import { AddNoteSheet } from '@/components/boards/add-note-sheet';
import { ColumnManagementSheet } from '@/components/boards/column-management-sheet';
import { EditBoardSheet } from '@/components/boards/edit-board-sheet';
import { resolveBoardIcon, tintWithAccent, type BoardIconName } from '@/constants/board-appearance';
import { spacing } from '@/constants/theme';
import { createBoardRepository } from '@/db/repositories';
import { useTheme } from '@/components/theme-provider';
import type { Attachment, Board } from '@/db/types';

type Column = { id: string; name: string; position: number };
// The "Add column" placeholder is presentation-only — it is derived alongside
// `columns` for the carousel's FlatList `data`, but never stored, given an id, or
// touched by any business logic (column counts, drag targets, navigator position).
type CarouselItem = { kind: 'column'; column: Column } | { kind: 'add' };
type Card = { id: string; columnId: string; title: string | null; position: number; preview: string | null; attachmentCount: number; messageCount: number; mediaId: string | null; mediaMessageId: string | null; mediaType: 'photo' | 'video' | null; mediaUri: string | null; mediaMimeType: string | null; mediaSize: number | null; mediaDuration: number | null; mediaWidth: number | null; mediaHeight: number | null; mediaCreatedAt: number | null };
type DragState = { card: Card; sourceColumnId: string; destinationColumnId: string; fromIndex: number; toIndex: number; height: number; startY: number; overlayTop: number; startScrollY: number };
const EDGE_ZONE = 52;
const EDGE_DWELL_MS = 450;
const COLUMN_CARD_LIMIT = 300;
// Boards at or under this many total cards are preloaded in full on open, so column
// switching afterward performs no query at all. Larger boards fall back to the
// progressive per-column prefetch path (fetchColumn/ensurePrefetched below) instead
// of paying a multi-hundred-row query up front. Chosen as a conservative, cheap-for-
// local-SQLite ceiling rather than a measured limit — revisit with real board sizes.
const FULL_PRELOAD_CARD_LIMIT = 800;
// Dead-zone around each card's midpoint that the drag content boundary must clear
// before the insertion index flips, so it doesn't oscillate when the finger holds
// still near a boundary or drifts by a couple of pixels.
const REORDER_HYSTERESIS = 8;

function ColumnNavigator({ columns, cards, columnStatus, columnCounts, columnIndex, reduceMotion, accent, onSelect, onAddColumn }: { columns: Column[]; cards: Card[]; columnStatus: Record<string, 'loading' | 'loaded' | 'error'>; columnCounts: Record<string, number>; columnIndex: number; reduceMotion: boolean; accent: string; onSelect: (index: number) => void; onAddColumn: () => void }) {
  const { tokens: theme } = useTheme();
  const listRef = useRef<ScrollView>(null);
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const [viewportWidth, setViewportWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const indicatorInitialized = useRef(false);
  const active = columns[columnIndex];
  const activeLayout = active ? layouts[active.id] : undefined;
  // Prefer the live (loaded) count once a column has actually been fetched — that
  // stays accurate across local mutations without waiting on a fresh summary query —
  // and fall back to the lightweight board-open summary before that, so the rail is
  // usable instantly rather than showing "0 cards" for anything not yet prefetched.
  const counts = useMemo(() => {
    const live = new Map<string, number>();
    for (const card of cards) live.set(card.columnId, (live.get(card.columnId) ?? 0) + 1);
    const next = new Map<string, number>();
    for (const column of columns) next.set(column.id, columnStatus[column.id] === 'loaded' ? (live.get(column.id) ?? 0) : (columnCounts[column.id] ?? live.get(column.id) ?? 0));
    return next;
  }, [cards, columnCounts, columnStatus, columns]);
  useEffect(() => {
    if (!activeLayout) return;
    const nextX = activeLayout.x + (activeLayout.width - 24) / 2;
    indicatorX.set(reduceMotion || !indicatorInitialized.current ? nextX : withTiming(nextX, { duration: 220 }));
    indicatorInitialized.current = true;
    listRef.current?.scrollTo({ x: Math.max(0, activeLayout.x + activeLayout.width / 2 - viewportWidth / 2), animated: !reduceMotion });
  }, [activeLayout, indicatorX, reduceMotion, viewportWidth]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: indicatorX.get() }] }));
  return <GlassSurface style={[styles.navigatorSurface, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}><ScrollView ref={listRef} horizontal showsHorizontalScrollIndicator={false} onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} contentContainerStyle={styles.navigatorContent} style={styles.navigator}>
    <Animated.View pointerEvents="none" style={[styles.navigatorIndicator, { backgroundColor: accent }, indicatorStyle]} />
    {columns.map((column, index) => { const selected = index === columnIndex; const count = counts.get(column.id) ?? 0; return <Pressable key={column.id} accessibilityRole="tab" accessibilityLabel={`${column.name} column, ${count} ${count === 1 ? 'card' : 'cards'}, ${index + 1} of ${columns.length}`} accessibilityState={{ selected }} onLayout={(event) => { const { x, width } = event.nativeEvent.layout; setLayouts((current) => current[column.id]?.x === x && current[column.id]?.width === width ? current : { ...current, [column.id]: { x, width } }); }} onPress={() => onSelect(index)} style={({ pressed }) => [styles.navigatorItem, pressed && styles.navigatorItemPressed]}><View style={styles.navigatorNameFrame}><Text accessible={false} numberOfLines={1} style={[styles.navigatorName, styles.navigatorNameMeasure]}>{column.name}</Text><Text numberOfLines={1} style={[styles.navigatorName, styles.navigatorNameVisible, { color: selected ? theme.textPrimary : theme.textMuted }, selected && styles.navigatorNameSelected]}>{column.name}</Text></View></Pressable>; })}
    <Pressable accessibilityRole="button" accessibilityLabel="Add column" onPress={onAddColumn} style={({ pressed }) => [styles.navigatorAddItem, { borderColor: theme.borderSubtle }, pressed && styles.navigatorItemPressed]}><Ionicons accessible={false} name="add" size={16} color={theme.textMuted} /></Pressable>
  </ScrollView><Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.navigatorPosition, { color: theme.textMuted }]}>{columnIndex + 1} of {columns.length}</Text></GlassSurface>;
}

// Presentation-only CTA, not a real column: no id, no cards, excluded from every
// count/index/drag calculation. `variant="empty"` is used once, full-size, when the
// board has zero real columns; `variant="trailing"` is the permanent last item in
// the column carousel, sized to match a real column's footprint.
function AddColumnPlaceholder({ variant, width, marginHorizontal, onPress }: { variant: 'trailing' | 'empty'; width?: number; marginHorizontal?: number; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  const description = variant === 'empty' ? 'Create your first column to start organizing this board.' : 'Create another space for your notes';
  return <Pressable accessibilityRole="button" accessibilityLabel="Add column" accessibilityHint={description} onPress={onPress} style={({ pressed }) => [styles.addColumnFrame, variant === 'empty' ? styles.addColumnFrameEmpty : { width, marginHorizontal }, { borderColor: theme.borderSubtle }, pressed && styles.addColumnPressed]}>
    <View style={[styles.addColumnIcon, { borderColor: theme.borderSubtle }]}><Ionicons accessible={false} name="add" size={26} color={theme.textMuted} /></View>
    <Text style={[styles.addColumnTitle, { color: theme.textPrimary }]}>Add column</Text>
    <Text style={[styles.addColumnCopy, { color: theme.textSecondary }]}>{description}</Text>
  </Pressable>;
}

function DragDots() { const { tokens: theme } = useTheme(); return <View accessible={false} style={styles.dotGrid}>{Array.from({ length: 6 }, (_, index) => <View key={index} style={[styles.dot, { backgroundColor: theme.textMuted }]} />)}</View>; }

// Quiet loading placeholder for the active column only — adjacent/prefetching
// columns never show loading UI, since the user isn't looking at them yet. Reuses
// the real card's own style tokens (card/cardBody/cardTop/cardDivider) so its
// geometry matches the settled card exactly — swapping one for the other shouldn't
// move anything.
function ColumnSkeleton() {
  const { tokens: theme } = useTheme();
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={styles.skeletonStack}>{[0, 1, 2].map((index) => <View key={index} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle, opacity: 1 - index * 0.24 }]}>
    <View style={styles.cardBody}>
      <View style={styles.cardTop}>
        <View style={styles.cardOpen}>
          <View style={[styles.skeletonBar, styles.skeletonTitleBar, { backgroundColor: theme.surfaceElevated }]} />
          <View style={[styles.skeletonBar, styles.skeletonPreviewBar, { backgroundColor: theme.surfaceElevated }]} />
        </View>
        <View style={[styles.skeletonHandle, { backgroundColor: theme.surfaceElevated }]} />
      </View>
      <View style={[styles.cardDivider, { backgroundColor: theme.borderSubtle }]} />
      <View style={[styles.skeletonBar, styles.skeletonFooterBar, { backgroundColor: theme.surfaceElevated }]} />
    </View>
  </View>)}</View>;
}

function DragHandle({ index, total, translationY, handleRef, columnName, canMovePrevColumn, canMoveNextColumn, onBegin, onMove, onEnd, onCancel, onReorder, onMoveColumn }: { index: number; total: number; translationY: SharedValue<number>; handleRef: ReturnType<typeof useAnimatedRef<View>>; columnName: string; canMovePrevColumn: boolean; canMoveNextColumn: boolean; onBegin: () => void; onMove: (dx: number, dy: number, pageX: number, pageY: number) => void; onEnd: () => void; onCancel: () => void; onReorder: (direction: -1 | 1) => void; onMoveColumn: (direction: -1 | 1) => void }) {
  // failOffsetX/Y (not minDistance — that combines ambiguously with
  // activateAfterLongPress and was letting the timer fire mid-swipe) fails this
  // candidate outright the moment the finger travels past the tolerance in either
  // axis, before the hold completes, ceding the touch to the pager/scroll view
  // beneath. The handle gets a faster hold than the card body, not an instant one.
  // See the note on the card-wide gesture below re: activateAfterLongPress's own
  // hardcoded (non-configurable) movement cap on both platforms — keep this short.
  const gesture = useMemo(() => Gesture.Pan().activateAfterLongPress(200).failOffsetX([-10, 10]).failOffsetY([-10, 10]).onStart(() => {
    translationY.set(0);
    runOnJS(onBegin)();
  }).onUpdate((event) => {
    translationY.set(event.translationY);
    runOnJS(onMove)(event.translationX, event.translationY, event.absoluteX, event.absoluteY);
  }).onEnd(() => { runOnJS(onEnd)(); }).onFinalize((_, success) => { if (!success) runOnJS(onCancel)(); }), [onBegin, onCancel, onEnd, onMove, translationY]);
  const actions = [{ name: 'decrement', label: 'Move earlier' }, { name: 'increment', label: 'Move later' }, ...(canMovePrevColumn ? [{ name: 'movePrevColumn', label: 'Move to previous column' }] : []), ...(canMoveNextColumn ? [{ name: 'moveNextColumn', label: 'Move to next column' }] : [])];
  return <GestureDetector gesture={gesture}><Pressable ref={handleRef} collapsable={false} hitSlop={4} accessibilityRole="adjustable" accessibilityLabel={`Drag handle. Reorder card. Card ${index + 1} of ${total} in ${columnName}.`} accessibilityActions={actions} onPress={(event) => event.stopPropagation()} onAccessibilityAction={(event) => { const name = event.nativeEvent.actionName; if (name === 'decrement') onReorder(-1); if (name === 'increment') onReorder(1); if (name === 'movePrevColumn') onMoveColumn(-1); if (name === 'moveNextColumn') onMoveColumn(1); }} style={styles.dragHandle}><DragDots /></Pressable></GestureDetector>;
}

const CardSurface = memo(function CardSurface({ card, index, total, translationY, dragging = false, interactive = true, highlighted = false, accent, accentTint, accentBorderColor, columnName = '', canMovePrevColumn = false, canMoveNextColumn = false, onBeginDrag, onDragMove, onDragEnd, onDragCancel, onOpenMove, onReorder, onMoveColumn }: { card: Card; index: number; total: number; translationY?: SharedValue<number>; dragging?: boolean; interactive?: boolean; highlighted?: boolean; accent?: string; accentTint?: string; accentBorderColor?: string; columnName?: string; canMovePrevColumn?: boolean; canMoveNextColumn?: boolean; onBeginDrag?: () => void; onDragMove?: (dx: number, dy: number, pageX: number, pageY: number) => void; onDragEnd?: () => void; onDragCancel?: () => void; onOpenMove?: () => void; onReorder?: (direction: -1 | 1) => void; onMoveColumn?: (direction: -1 | 1) => void }) {
  const { tokens: theme } = useTheme();
  // The board's own accent, resolved by the caller — see the equivalent constants
  // in BoardScreen — falling back to the generic theme tokens when not passed
  // (e.g. any future standalone usage) so this component stays safe on its own.
  const resolvedAccent = accent ?? theme.accent;
  const resolvedAccentTint = accentTint ?? theme.accentSoft;
  const resolvedAccentBorder = accentBorderColor ?? theme.accentBorder;
  const handleRef = useAnimatedRef<View>();
  const footerRef = useAnimatedRef<View>();
  // Briefly tints the card that was just landed on from the Unorganized "Add to
  // board" redirect — a quick in/hold/out pulse, not a persistent state, so it
  // never needs to be told to turn back off.
  const highlightOpacity = useSharedValue(0);
  useEffect(() => { if (highlighted) highlightOpacity.set(withTiming(1, { duration: 150 }, () => { highlightOpacity.set(withDelay(650, withTiming(0, { duration: 300 }))); })); }, [highlighted, highlightOpacity]);
  const highlightStyle = useAnimatedStyle(() => ({ opacity: highlightOpacity.get() }));
  const media: Attachment | null = card.mediaId && card.mediaMessageId && card.mediaType && card.mediaUri ? { id: card.mediaId, messageId: card.mediaMessageId, type: card.mediaType, localUri: card.mediaUri, originalName: null, mimeType: card.mediaMimeType, size: card.mediaSize, duration: card.mediaDuration, width: card.mediaWidth, height: card.mediaHeight, createdAt: card.mediaCreatedAt ?? 0 } : null;
  const hasMetadata = Boolean(card.attachmentCount || card.messageCount > 1);
  const accessibleMetadata = [card.messageCount > 1 ? `${card.messageCount} thoughts` : null, card.attachmentCount ? `${card.attachmentCount} attachments` : null].filter(Boolean).join(', ');
  const draggable = interactive && translationY && onBeginDrag && onDragMove && onDragEnd && onDragCancel && onReorder;
  // Long-press anywhere on the card activates drag, but a touch that begins on the
  // handle (which owns its own faster long-press) or the footer controls (Move /
  // reorder buttons, which must stay independently and immediately tappable) must
  // not also start the card-wide drag gesture.
  const cardGesture = useMemo(() => {
    if (!draggable) return undefined;
    // Both a duration AND stillness are required — failOffsetX/Y (not minDistance,
    // which combines ambiguously with activateAfterLongPress and was letting the
    // long-press timer activate drag mid-swipe/mid-scroll) fails this pan candidate
    // outright once the finger travels past tolerance in either axis, so an ordinary
    // swipe or scroll starting on a card is never mistaken for a hold. Once activated,
    // movement is unrestricted.
    // NOTE: activateAfterLongPress also carries a *hardcoded, non-configurable*
    // movement cap in RNGH's native implementation on both platforms (10pt on iOS,
    // the system touch-slop on Android — see RNPanHandler.m / PanGestureHandler.kt),
    // independent of failOffsetX/Y above. A longer hold gives real-finger tremor more
    // time to exceed that fixed, tiny cap, which is why 450ms made drag nearly
    // impossible to trigger; keep this duration modest for that reason.
    return Gesture.Pan().activateAfterLongPress(320).failOffsetX([-10, 10]).failOffsetY([-10, 10])
      // measure() reads these refs on the UI thread when a touch lands, not during
      // this render; the react-hooks/refs rule can't see that from a worklet callback.
      // eslint-disable-next-line react-hooks/refs
      .onTouchesDown((event, manager) => {
        const touch = event.allTouches[0];
        if (!touch) return;
        const handleFrame = measure(handleRef);
        if (handleFrame && touch.absoluteX >= handleFrame.pageX && touch.absoluteX <= handleFrame.pageX + handleFrame.width && touch.absoluteY >= handleFrame.pageY && touch.absoluteY <= handleFrame.pageY + handleFrame.height) {
          manager.fail();
          return;
        }
        const footerFrame = measure(footerRef);
        if (footerFrame && touch.absoluteY >= footerFrame.pageY) {
          manager.fail();
        }
      })
      .onStart(() => { translationY.set(0); runOnJS(onBeginDrag)(); })
      .onUpdate((event) => { translationY.set(event.translationY); runOnJS(onDragMove)(event.translationX, event.translationY, event.absoluteX, event.absoluteY); })
      .onEnd(() => { runOnJS(onDragEnd)(); })
      .onFinalize((_, success) => { if (!success) runOnJS(onDragCancel)(); });
  }, [draggable, footerRef, handleRef, onBeginDrag, onDragCancel, onDragEnd, onDragMove, translationY]);
  const cardSurface = <Pressable disabled={!interactive} accessibilityRole="button" accessibilityLabel={`Open ${card.title || card.preview || 'untitled thought'}${accessibleMetadata ? `, ${accessibleMetadata}` : ''}`} accessibilityHint="Opens card details" onPress={() => router.push(`/card/${card.id}`)} style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, dragging && styles.cardDragging, pressed && interactive && styles.cardPressed]}>
    <Animated.View pointerEvents="none" accessible={false} style={[StyleSheet.absoluteFill, styles.cardHighlight, { backgroundColor: resolvedAccentTint, borderColor: resolvedAccentBorder }, highlightStyle]} />
    {media ? <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.cardMedia, { borderBottomColor: theme.borderSubtle }]}><AttachmentContent attachment={media} variant="board" /></View> : null}
    <View style={styles.cardBody}>
      <View style={styles.cardTop}>
        <View style={styles.cardOpen}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.textPrimary }]}>{card.title || card.preview || 'Untitled thought'}</Text>
          {card.preview && card.preview !== card.title ? <Text numberOfLines={2} style={[styles.preview, { color: theme.textSecondary }]}>{card.preview}</Text> : null}
        </View>
        {draggable && onMoveColumn ? <DragHandle index={index} total={total} translationY={translationY} handleRef={handleRef} columnName={columnName} canMovePrevColumn={canMovePrevColumn} canMoveNextColumn={canMoveNextColumn} onBegin={onBeginDrag} onMove={onDragMove} onEnd={onDragEnd} onCancel={onDragCancel} onReorder={onReorder} onMoveColumn={onMoveColumn} /> : <View style={styles.dragHandle}><DragDots /></View>}
      </View>

      {hasMetadata ? <View style={styles.meta}>
        {card.messageCount > 1 ? <View style={styles.metaItem}><Ionicons accessible={false} name="layers-outline" size={14} color={theme.textMuted} /><Text style={[styles.metaText, { color: theme.textMuted }]}>{card.messageCount} thoughts</Text></View> : null}
        {card.attachmentCount ? <View style={styles.metaItem}><Ionicons accessible={false} name="attach-outline" size={14} color={theme.textMuted} /><Text style={[styles.metaText, { color: theme.textMuted }]}>{card.attachmentCount} {card.attachmentCount === 1 ? 'attachment' : 'attachments'}</Text></View> : null}
      </View> : null}

      <View style={[styles.cardDivider, { backgroundColor: theme.borderSubtle }]} />
      <View ref={footerRef} collapsable={false} style={styles.cardControls}>
        <Pressable disabled={!interactive} accessibilityRole="button" accessibilityLabel="Move to another column" onPress={(event) => { event.stopPropagation(); onOpenMove?.(); }} style={({ pressed }) => [styles.move, { backgroundColor: theme.surfaceElevated }, !interactive && styles.reorderButtonDisabled, pressed && styles.controlPressed]}><Ionicons accessible={false} name="swap-horizontal-outline" size={17} color={resolvedAccent} /><Text style={[styles.moveText, { color: resolvedAccent }]}>Move</Text></Pressable>
        <View style={[styles.reorderGroup, { backgroundColor: theme.surfaceElevated }]}>
          <Pressable disabled={!interactive || index === 0} accessibilityRole="button" accessibilityLabel="Move card up" accessibilityState={{ disabled: !interactive || index === 0 }} onPress={(event) => { event.stopPropagation(); onReorder?.(-1); }} style={({ pressed }) => [styles.reorderButton, (index === 0 || !interactive) && styles.reorderButtonDisabled, pressed && styles.reorderButtonPressed]}><Ionicons accessible={false} name="arrow-up-outline" size={17} color={resolvedAccent} /></Pressable>
          <View style={[styles.reorderDivider, { backgroundColor: theme.borderSubtle }]} />
          <Pressable disabled={!interactive || index === total - 1} accessibilityRole="button" accessibilityLabel="Move card down" accessibilityState={{ disabled: !interactive || index === total - 1 }} onPress={(event) => { event.stopPropagation(); onReorder?.(1); }} style={({ pressed }) => [styles.reorderButton, (index === total - 1 || !interactive) && styles.reorderButtonDisabled, pressed && styles.reorderButtonPressed]}><Ionicons accessible={false} name="arrow-down-outline" size={17} color={resolvedAccent} /></Pressable>
        </View>
      </View>
    </View>
  </Pressable>;
  return cardGesture ? <GestureDetector gesture={cardGesture}>{cardSurface}</GestureDetector> : cardSurface;
});

const BoardCardRow = memo(function BoardCardRow({ card, index, total, translationY, highlighted, accent, accentTint, accentBorderColor, columnName, canMovePrevColumn, canMoveNextColumn, onBeginDrag, onDragMove, onDragEnd, onDragCancel, onOpenMove, onReorder, onMoveColumn }: { card: Card; index: number; total: number; translationY: SharedValue<number>; highlighted?: boolean; accent?: string; accentTint?: string; accentBorderColor?: string; columnName?: string; canMovePrevColumn?: boolean; canMoveNextColumn?: boolean; onBeginDrag: (card: Card, index: number) => void; onDragMove: (dx: number, dy: number, pageX: number, pageY: number) => void; onDragEnd: () => void; onDragCancel: () => void; onOpenMove: (card: Card) => void; onReorder: (card: Card, index: number, direction: -1 | 1) => void; onMoveColumn?: (card: Card, direction: -1 | 1) => void }) {
  const begin = useCallback(() => onBeginDrag(card, index), [card, index, onBeginDrag]);
  const openMove = useCallback(() => onOpenMove(card), [card, onOpenMove]);
  const moveEarlierOrLater = useCallback((direction: -1 | 1) => onReorder(card, index, direction), [card, index, onReorder]);
  const moveColumn = useCallback((direction: -1 | 1) => onMoveColumn?.(card, direction), [card, onMoveColumn]);
  return <CardSurface card={card} index={index} total={total} translationY={translationY} highlighted={highlighted} accent={accent} accentTint={accentTint} accentBorderColor={accentBorderColor} columnName={columnName} canMovePrevColumn={canMovePrevColumn} canMoveNextColumn={canMoveNextColumn} onBeginDrag={begin} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel} onOpenMove={openMove} onReorder={moveEarlierOrLater} onMoveColumn={onMoveColumn ? moveColumn : undefined} />;
});

function reorder(items: Card[], from: number, to: number) { const next = [...items]; const [item] = next.splice(from, 1); next.splice(Math.max(0, Math.min(to, next.length)), 0, item); return next.map((card, position) => ({ ...card, position })); }

export default function BoardScreen() {
  const database = useSQLiteContext(); const { id, highlightColumnId, highlightCardId } = useLocalSearchParams<{ id: string; highlightColumnId?: string; highlightCardId?: string }>(); const repository = useMemo(() => createBoardRepository(database), [database]); const { tokens: theme } = useTheme();
  // Set once by the initial load below (guarded so a later refreshActiveColumn or
  // re-render never re-applies a stale redirect from Unorganized).
  const highlightAppliedRef = useRef(false);
  const { width: screenWidth } = useWindowDimensions();
  const columnWidth = Math.min(520, Math.max(272, Math.round(screenWidth * (screenWidth < 390 ? 0.78 : 0.74))));
  const columnGap = spacing.sm;
  const columnInterval = columnWidth + columnGap;
  const carouselInset = Math.max(spacing.md, (screenWidth - columnWidth) / 2 - columnGap / 2);
  const [board, setBoard] = useState<Board | null | undefined>();
  const showBoardLoader = useChitsLoading(board === undefined);
  const [columns, setColumns] = useState<Column[]>([]); const [cards, setCards] = useState<Card[]>([]); const [columnIndex, setColumnIndex] = useState(0); const [moveCard, setMoveCard] = useState<Card | null>(null); const [settingsOpen, setSettingsOpen] = useState(false); const [addColumnOrigin, setAddColumnOrigin] = useState<'menu' | 'placeholder'>('menu'); const [renameOpen, setRenameOpen] = useState(false); const [error, setError] = useState<string | null>(null); const [drag, setDrag] = useState<DragState | null>(null); const [navigatorDockHeight, setNavigatorDockHeight] = useState(0); const [reduceMotion, setReduceMotion] = useState(false);
  // Contextual capture ("+ Add note"): the target column for the open composer
  // sheet, the id of the card it just created (so only that one card plays an
  // entrance animation, not every card that happens to mount as columns page in and
  // out of view), and a lightweight confirmation toast.
  const [addNoteColumn, setAddNoteColumn] = useState<Column | null>(null);
  const [justAddedCardId, setJustAddedCardId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!justAddedCardId) return; const timer = setTimeout(() => setJustAddedCardId(null), 1200); return () => clearTimeout(timer); }, [justAddedCardId]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);
  // Board-level load lifecycle. Once 'ready', a typical (<=FULL_PRELOAD_CARD_LIMIT
  // cards) board has every card summary already in `cards` — switching columns is
  // then pure UI state, no query. Oversized boards still reach 'ready' quickly (board
  // + columns + counts only) and fall back to the per-column loading below.
  const [boardStatus, setBoardStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const boardStatusRef = useRef(boardStatus); useEffect(() => { boardStatusRef.current = boardStatus; }, [boardStatus]);
  // Per-column data lifecycle, kept separate from the pager's UI lifecycle: a column
  // that scrolls off-screen (or is virtualized away) keeps its cards here rather than
  // losing them, and `columnStatusRef` dedupes concurrent prefetch requests for the
  // same column (scroll, navigator tap, and drag-edge triggers can all fire at once).
  const [columnStatus, setColumnStatus] = useState<Record<string, 'loading' | 'loaded' | 'error'>>({});
  const [columnCounts, setColumnCounts] = useState<Record<string, number>>({});
  const columnStatusRef = useRef<Record<string, 'loading' | 'loaded' | 'error'>>({});
  const columnIndexRef = useRef(0);
  const boardListRef = useRef<FlatList<CarouselItem>>(null); const scrollRef = useRef<ScrollView>(null); const scrollYRef = useRef(0); const viewportRef = useRef({ top: 0, height: 0 }); const layoutsRef = useRef<Record<string, LayoutRectangle>>({}); const placeholderYRef = useRef(0); const dragRef = useRef<DragState | null>(null); const lastDragPageYRef = useRef(0);
  const edgeDwellRef = useRef<-1 | 1 | null>(null); const edgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gestureTranslationX = useSharedValue(0); const gestureTranslationY = useSharedValue(0); const scrollCompensation = useSharedValue(0); const liftProgress = useSharedValue(0); const edgeGlowLeft = useSharedValue(0); const edgeGlowRight = useSharedValue(0);
  const animatedDragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: gestureTranslationX.get() }, { translateY: gestureTranslationY.get() + scrollCompensation.get() }, { scale: 1 + liftProgress.get() * 0.022 }] }));
  const edgeGlowLeftStyle = useAnimatedStyle(() => ({ opacity: edgeGlowLeft.get() }));
  const edgeGlowRightStyle = useAnimatedStyle(() => ({ opacity: edgeGlowRight.get() }));
  const clearEdgeDwell = useCallback(() => { if (edgeTimerRef.current) { clearTimeout(edgeTimerRef.current); edgeTimerRef.current = null; } edgeDwellRef.current = null; edgeGlowLeft.set(reduceMotion ? 0 : withTiming(0, { duration: 120 })); edgeGlowRight.set(reduceMotion ? 0 : withTiming(0, { duration: 120 })); }, [edgeGlowLeft, edgeGlowRight, reduceMotion]);
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => subscription.remove(); }, []);
  useEffect(() => { columnIndexRef.current = columnIndex; }, [columnIndex]);
  // The one place a column's cards are actually queried. Status lives in a ref (read
  // synchronously by every prefetch trigger below, so two triggers firing in the same
  // tick — e.g. a swipe and the edge-zone check — never issue the same query twice)
  // and is mirrored into state only so loading/error UI can react to it.
  // Returns a promise so a caller that's about to optimistically mutate this same
  // column (move/moveToAdjacentColumn) can await it first — otherwise a fetch that
  // was already in flight could land after the optimistic update and clobber it.
  // Callers that just want to warm the cache (scroll, navigator, drag-edge) ignore it.
  const fetchColumn = useCallback((columnId: string | undefined, options?: { force?: boolean }): Promise<void> => {
    if (!columnId) return Promise.resolve();
    const current = columnStatusRef.current[columnId];
    if (!options?.force && (current === 'loading' || current === 'loaded')) return Promise.resolve();
    columnStatusRef.current[columnId] = 'loading';
    setColumnStatus((prev) => ({ ...prev, [columnId]: 'loading' }));
    return repository.listCardsByColumn(columnId, COLUMN_CARD_LIMIT).then((rows) => {
      columnStatusRef.current[columnId] = 'loaded';
      setColumnStatus((prev) => ({ ...prev, [columnId]: 'loaded' }));
      setCards((prev) => [...prev.filter((card) => card.columnId !== columnId), ...rows]);
    }).catch(() => {
      columnStatusRef.current[columnId] = 'error';
      setColumnStatus((prev) => ({ ...prev, [columnId]: 'error' }));
    });
  }, [repository]);
  // Priority order: the column itself first (so its own query is queued ahead of its
  // neighbors'), then outward by one column on each side (current ±1, per the target
  // prefetch window).
  const ensurePrefetched = useCallback((centerIndex: number, radius = 1) => {
    const active = columns[centerIndex]; if (active) fetchColumn(active.id);
    for (let offset = 1; offset <= radius; offset++) { fetchColumn(columns[centerIndex + offset]?.id); fetchColumn(columns[centerIndex - offset]?.id); }
  }, [columns, fetchColumn]);
  // Derived purely for the FlatList's `data` — every count/index/drag calculation
  // below still reads `columns` directly, never this.
  const carouselItems = useMemo<CarouselItem[]>(() => [...columns.map((column): CarouselItem => ({ kind: 'column', column })), { kind: 'add' }], [columns]);
  const currentColumn = columns[columnIndex];
  const currentCards = useMemo(() => currentColumn ? cards.filter((card) => card.columnId === currentColumn.id).sort((a, b) => a.position - b.position) : [], [cards, currentColumn]);
  // Read by callbacks that are passed as BoardCardRow props (beginDrag, evaluateTarget,
  // reorderAccessible, moveToAdjacentColumn) so those callbacks' identities don't
  // change on every column navigation — only `currentColumn`/`currentCards` do, and
  // recreating them would break React.memo on every mounted card, not just the one
  // the user actually interacted with.
  const currentColumnRef = useRef(currentColumn); useEffect(() => { currentColumnRef.current = currentColumn; }, [currentColumn]);
  const currentCardsRef = useRef(currentCards); useEffect(() => { currentCardsRef.current = currentCards; }, [currentCards]);
  // The one full board load: board + columns + every card summary (for a typical
  // board) in a small, fixed number of queries. After this resolves, column
  // switching is pure UI state — see the acceptance criterion this phase is named
  // for. Used on first open and for explicit structural mutations (add/delete
  // column); NOT re-run on every screen focus (see refreshActiveColumn below).
  const load = useCallback(async () => {
    if (!id) return;
    setBoardStatus((current) => current === 'ready' ? current : 'loading');
    try {
      const [nextBoard, nextColumns, summaries] = await Promise.all([repository.getById(id), repository.listColumns(id), repository.listColumnSummaries(id)]);
      const counts: Record<string, number> = {}; let total = 0;
      for (const summary of summaries) { counts[summary.id] = summary.cardCount; total += summary.cardCount; }
      setColumnCounts(counts);
      // Arriving from Unorganized's "Add to board" redirect: land on the exact
      // destination column instead of whatever index this screen instance would
      // otherwise default to.
      const highlightColumnIndex = highlightColumnId ? nextColumns.findIndex((column) => column.id === highlightColumnId) : -1;
      const boundedIndex = highlightColumnIndex >= 0 ? highlightColumnIndex : Math.min(columnIndexRef.current, Math.max(nextColumns.length - 1, 0));
      if (total <= FULL_PRELOAD_CARD_LIMIT) {
        const rows = await repository.listBoardCardSummaries(id, FULL_PRELOAD_CARD_LIMIT + 50);
        setCards(rows);
        const loaded: Record<string, 'loaded'> = {}; for (const column of nextColumns) loaded[column.id] = 'loaded';
        columnStatusRef.current = loaded; setColumnStatus(loaded);
      } else {
        // Oversized board: fall back to progressive per-column loading instead of one
        // very large query. Board itself still reaches 'ready' immediately below —
        // the per-column skeleton/error states (already built) cover the rest.
        const active = nextColumns[boundedIndex]; if (active) fetchColumn(active.id, { force: true });
        fetchColumn(nextColumns[boundedIndex + 1]?.id); fetchColumn(nextColumns[boundedIndex - 1]?.id);
      }
      setBoard(nextBoard); setColumns(nextColumns); setColumnIndex(boundedIndex);
      if (nextBoard) void repository.markOpened('board', id);
      setBoardStatus('ready');
      if (highlightCardId && !highlightAppliedRef.current) {
        highlightAppliedRef.current = true;
        setJustAddedCardId(highlightCardId);
        boardListRef.current?.scrollToOffset({ offset: boundedIndex * columnInterval, animated: false });
        // The active lane's cards (and layoutsRef) only exist once this render
        // actually commits — one frame isn't always enough on a cold mount, so wait
        // a second before reading the card's measured position.
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const layout = layoutsRef.current[highlightCardId];
          if (layout) scrollRef.current?.scrollTo({ y: Math.max(0, layout.y - spacing.md), animated: true });
        }));
      }
    } catch {
      setBoardStatus('error');
    }
  }, [columnInterval, fetchColumn, highlightCardId, highlightColumnId, id, repository]);
  // A card's title/preview/messages can change from the Card Detail screen, which
  // this screen has no other way to learn about. Rather than re-running the full
  // board load on every focus (which would fight "returning should preserve loaded
  // cards/scroll/navigator position"), just re-fetch the one column the user is
  // looking at — force-bypassing the loaded/loading dedupe — and leave everything
  // else (other columns' arrays, scroll position, column index) untouched.
  const refreshActiveColumn = useCallback(() => { const activeId = currentColumnRef.current?.id; if (activeId) void fetchColumn(activeId, { force: true }); }, [fetchColumn]);
  useFocusEffect(useCallback(() => {
    if (boardStatusRef.current !== 'ready') { void load(); return; }
    refreshActiveColumn();
  }, [load, refreshActiveColumn]));
  const goToColumn = useCallback((nextIndex: number) =>{ const bounded = Math.max(0, Math.min(columns.length - 1, nextIndex)); if (drag) return; ensurePrefetched(bounded); boardListRef.current?.scrollToOffset({ offset: bounded * columnInterval, animated: bounded !== columnIndex }); if (bounded === columnIndex) return; setColumnIndex(bounded); void Haptics.selectionAsync(); }, [columnIndex, columnInterval, columns.length, drag, ensurePrefetched]);
  const settleColumn = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => { const nextIndex = Math.max(0, Math.min(columns.length - 1, Math.round(event.nativeEvent.contentOffset.x / columnInterval))); ensurePrefetched(nextIndex); if (nextIndex === columnIndex) return; setColumnIndex(nextIndex); void Haptics.selectionAsync(); }, [columnIndex, columnInterval, columns.length, ensurePrefetched]);
  // Fires while the board is mid-swipe (throttled): as soon as the user has crossed
  // ~15% into the gesture toward a neighbor, start that column's fetch rather than
  // waiting for the swipe to fully settle.
  const handleBoardScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (drag) return;
    const raw = event.nativeEvent.contentOffset.x / columnInterval;
    const lower = Math.max(0, Math.floor(raw)); const upper = Math.min(columns.length - 1, Math.ceil(raw));
    if (Math.abs(raw - Math.round(raw)) > 0.15) { fetchColumn(columns[lower]?.id); fetchColumn(columns[upper]?.id); }
  }, [columnInterval, columns, drag, fetchColumn]);
  // Per-item Reanimated layout transition, shared by reference across every card row
  // and the placeholder, so a neighbor sliding aside during reorder animates on the
  // UI thread with exact, tunable spring physics — replacing the old global
  // LayoutAnimation.configureNext, which had to be re-armed imperatively before every
  // mutation and couldn't be tuned per-element. Reduced motion gets an instant snap.
  const cardLayoutTransition = useMemo(() => reduceMotion ? undefined : LinearTransition.springify().damping(20).stiffness(220).mass(0.6).overshootClamping(1), [reduceMotion]);
  const beginDrag = useCallback((card: Card, index: number) => { const column = currentColumnRef.current; const layout = layoutsRef.current[card.id]; if (!layout || dragRef.current || !column) return; const next = { card, sourceColumnId: column.id, destinationColumnId: column.id, fromIndex: index, toIndex: index, height: layout.height, startY: layout.y, overlayTop: 76 + layout.y - scrollYRef.current, startScrollY: scrollYRef.current }; gestureTranslationX.set(0); gestureTranslationY.set(0); scrollCompensation.set(0);
    // ~150ms settle, minimal overshoot — communicates "picked up," not "bounced."
    liftProgress.set(reduceMotion ? 0 : withSpring(1, { damping: 26, stiffness: 380, mass: 0.6 })); dragRef.current = next; setDrag(next); setError(null); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, [gestureTranslationX, gestureTranslationY, liftProgress, reduceMotion, scrollCompensation]);
  // Insertion index is computed from the finger's absolute position against each
  // card's measured layout, not from the drag's start-relative delta: that stays
  // correct even after the board has paged to a different column mid-drag.
  const evaluateTarget = useCallback((pageY: number) => { const active = dragRef.current; if (!active) return; const contentY = pageY - viewportRef.current.top - 76 + scrollYRef.current; const others = currentCardsRef.current.filter((card) => card.id !== active.card.id);
    // Hysteresis: a card already "passed" (before the committed toIndex) keeps
    // counting until the finger clears its midpoint by REORDER_HYSTERESIS px, and one
    // not yet passed needs to clear it by the same margin before it counts — without
    // this, sitting still with the content boundary exactly at a card's midpoint (or
    // natural finger tremor) flips the insertion point back and forth every frame.
    let nextIndex = 0;
    others.forEach((card, cardIndex) => {
      const layout = layoutsRef.current[card.id]; if (!layout) return;
      const midpoint = layout.y + layout.height / 2;
      const threshold = cardIndex < active.toIndex ? midpoint - REORDER_HYSTERESIS : midpoint + REORDER_HYSTERESIS;
      if (contentY > threshold) nextIndex += 1;
    });
    nextIndex = Math.max(0, Math.min(others.length, nextIndex)); if (nextIndex === active.toIndex) return; const next = { ...active, toIndex: nextIndex }; dragRef.current = next; setDrag(next); void Haptics.selectionAsync(); }, []);
  const crossColumn = useCallback((direction: -1 | 1) => { const active = dragRef.current; if (!active) return; const fromIndex = columns.findIndex((column) => column.id === active.destinationColumnId); const destinationIndex = fromIndex + direction; const destination = columns[destinationIndex]; if (!destination) return;
    // Rebase the scroll reference to the destination column's current (unrelated)
    // scroll position, and zero the compensation shared value immediately, so the
    // overlay doesn't jump when it starts tracking a different ScrollView's deltas.
    const next = { ...active, destinationColumnId: destination.id, toIndex: 0, startScrollY: scrollYRef.current }; dragRef.current = next; setDrag(next); scrollCompensation.set(0); setColumnIndex(destinationIndex); boardListRef.current?.scrollToOffset({ offset: destinationIndex * columnInterval, animated: !reduceMotion }); fetchColumn(columns[destinationIndex + direction]?.id); void Haptics.selectionAsync(); }, [columnInterval, columns, fetchColumn, reduceMotion, scrollCompensation]);
  // Narrow zones at the screen edges: dwelling in one (without leaving) pages the
  // board to the adjacent column while the drag stays active. Returns the side the
  // finger currently sits in, so callers can prioritize edge-paging over vertical
  // auto-scroll near a corner.
  const evaluateEdge = useCallback((pageX: number) => { const active = dragRef.current; if (!active) { clearEdgeDwell(); return null; } const destIndex = columns.findIndex((column) => column.id === active.destinationColumnId); const canGoLeft = destIndex > 0; const canGoRight = destIndex >= 0 && destIndex < columns.length - 1; const side: -1 | 1 | null = pageX <= EDGE_ZONE && canGoLeft ? -1 : pageX >= screenWidth - EDGE_ZONE && canGoRight ? 1 : null;
    if (side === null) { if (edgeDwellRef.current !== null) clearEdgeDwell(); return null; }
    // Prefetch the moment the finger enters the zone, well before the dwell timer (and
    // thus the actual page change) completes — fetchColumn dedupes, so this is cheap
    // even though it re-runs on every frame the finger sits in the zone.
    fetchColumn(columns[destIndex + side]?.id);
    if (edgeDwellRef.current !== side) {
      if (edgeTimerRef.current) clearTimeout(edgeTimerRef.current);
      edgeDwellRef.current = side;
      edgeGlowLeft.set(reduceMotion ? (side === -1 ? 1 : 0) : withTiming(side === -1 ? 1 : 0, { duration: 140 }));
      edgeGlowRight.set(reduceMotion ? (side === 1 ? 1 : 0) : withTiming(side === 1 ? 1 : 0, { duration: 140 }));
      edgeTimerRef.current = setTimeout(() => { edgeTimerRef.current = null; edgeDwellRef.current = null; edgeGlowLeft.set(0); edgeGlowRight.set(0); crossColumn(side); }, EDGE_DWELL_MS);
    }
    return side; }, [clearEdgeDwell, columns, crossColumn, edgeGlowLeft, edgeGlowRight, fetchColumn, reduceMotion, screenWidth]);
  const moveDrag = useCallback((dx: number, dy: number, pageX: number, pageY: number) => { const active = dragRef.current; if (!active) return; gestureTranslationX.set(dx); lastDragPageYRef.current = pageY;
    const side = evaluateEdge(pageX);
    if (!side) { const viewport = viewportRef.current; const edge = 72; let scrollDelta = 0; if (pageY < viewport.top + edge) scrollDelta = -Math.ceil(10 * (1 - Math.max(0, pageY - viewport.top) / edge)); if (pageY > viewport.top + viewport.height - edge) scrollDelta = Math.ceil(10 * (1 - Math.max(0, viewport.top + viewport.height - pageY) / edge)); if (scrollDelta) scrollRef.current?.scrollTo({ y: Math.max(0, scrollYRef.current + scrollDelta), animated: false }); }
    evaluateTarget(pageY); }, [evaluateEdge, evaluateTarget, gestureTranslationX]);
  const clearDrag = useCallback(() => { dragRef.current = null; setDrag(null); lastDragPageYRef.current = 0; clearEdgeDwell(); gestureTranslationX.set(0); gestureTranslationY.set(0); scrollCompensation.set(0); liftProgress.set(0); }, [clearEdgeDwell, gestureTranslationX, gestureTranslationY, liftProgress, scrollCompensation]);
  const finalizeDrag = useCallback(async (cancelled: boolean, targetIndex: number) => { const active = dragRef.current; if (!active) { clearDrag(); return; } if (cancelled || (active.destinationColumnId === active.sourceColumnId && targetIndex === active.fromIndex)) { clearDrag(); return; } const previousCards = cards; if (active.destinationColumnId !== active.sourceColumnId) {
      const destinationCards = cards.filter((card) => card.columnId === active.destinationColumnId && card.id !== active.card.id).sort((a, b) => a.position - b.position);
      const inserted = [...destinationCards]; inserted.splice(Math.max(0, Math.min(targetIndex, inserted.length)), 0, { ...active.card, columnId: active.destinationColumnId });
      const normalizedDestination = inserted.map((card, position) => ({ ...card, position }));
      setCards((all) => [...all.filter((card) => card.columnId !== active.sourceColumnId && card.columnId !== active.destinationColumnId), ...all.filter((card) => card.columnId === active.sourceColumnId && card.id !== active.card.id).sort((a, b) => a.position - b.position).map((card, position) => ({ ...card, position })), ...normalizedDestination]);
      const destinationColumnIndex = columns.findIndex((column) => column.id === active.destinationColumnId);
      setColumnIndex(destinationColumnIndex);
      boardListRef.current?.scrollToOffset({ offset: destinationColumnIndex * columnInterval, animated: true });
      requestAnimationFrame(() => {
        const destinationY = 76 - active.overlayTop;
        liftProgress.set(withSpring(0, { damping: 24, stiffness: 300 }));
        const complete = () => clearDrag();
        if (reduceMotion) { gestureTranslationX.set(0); gestureTranslationY.set(destinationY); complete(); return; }
        gestureTranslationX.set(withSpring(0, { damping: 24, stiffness: 300 }));
        gestureTranslationY.set(withSpring(destinationY, { damping: 24, stiffness: 300, mass: 0.72 }, (finished) => { if (finished) runOnJS(complete)(); }));
      });
      void repository.moveCard(active.card.id, active.destinationColumnId, targetIndex).then(() => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }).catch(() => { setCards(previousCards); setError('Chits could not save that card move. The card was returned.'); });
      return;
    }
    const sourceCards = cards.filter((card) => card.columnId === active.sourceColumnId).sort((a, b) => a.position - b.position);
    const ordered = reorder(sourceCards, active.fromIndex, targetIndex); setCards((all) => [...all.filter((card) => card.columnId !== active.sourceColumnId), ...ordered]); clearDrag(); try { await repository.moveCard(active.card.id, active.sourceColumnId, targetIndex); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { setCards(previousCards); setError('Chits could not save that card position. Try again.'); } }, [cards, clearDrag, columnInterval, columns, gestureTranslationX, gestureTranslationY, liftProgress, reduceMotion, repository]);
  const settleDrag = useCallback((cancelled: boolean) => { const active = dragRef.current; if (!active) return; const targetIndex = cancelled ? active.fromIndex : active.toIndex; if (active.destinationColumnId !== active.sourceColumnId && !cancelled) { void finalizeDrag(false, targetIndex); return; }
    if (cancelled && active.destinationColumnId !== active.sourceColumnId) {
      // Cancelling mid cross-column drag: page the board back to the source column
      // too, so the visible column matches where the card actually stayed.
      const sourceIndex = columns.findIndex((column) => column.id === active.sourceColumnId);
      if (sourceIndex >= 0) { setColumnIndex(sourceIndex); boardListRef.current?.scrollToOffset({ offset: sourceIndex * columnInterval, animated: !reduceMotion }); }
    }
    if (cancelled && (active.toIndex !== active.fromIndex || active.destinationColumnId !== active.sourceColumnId)) { const next = { ...active, destinationColumnId: active.sourceColumnId, toIndex: active.fromIndex }; dragRef.current = next; setDrag(next); } requestAnimationFrame(() => { const targetY = cancelled ? active.startY : (placeholderYRef.current || active.startY); const destination = targetY - active.startY - scrollCompensation.get(); liftProgress.set(withSpring(0, { damping: 22, stiffness: 280 })); gestureTranslationX.set(withSpring(0, { damping: 22, stiffness: 280 })); if (reduceMotion) { gestureTranslationY.set(destination); void finalizeDrag(cancelled, targetIndex); return; } gestureTranslationY.set(withSpring(destination, { damping: 22, stiffness: 280, mass: 0.72 }, (finished) => { if (finished) runOnJS(finalizeDrag)(cancelled, targetIndex); })); }); }, [columnInterval, columns, finalizeDrag, gestureTranslationX, gestureTranslationY, liftProgress, reduceMotion, scrollCompensation]);
  const reorderAccessible = useCallback(async (card: Card, index: number, direction: -1 | 1) => { const column = currentColumnRef.current; if (!column) return; const target = index + direction; if (target < 0 || target >= currentCardsRef.current.length) { await AccessibilityInfo.announceForAccessibility('Card cannot move further.'); return; }
    let previousCards: Card[] = []; const ordered = reorder(currentCardsRef.current, index, target);
    setCards((all) => { previousCards = all; return [...all.filter((item) => item.columnId !== column.id), ...ordered]; });
    try { await repository.moveCard(card.id, column.id, target); await Haptics.selectionAsync(); await AccessibilityInfo.announceForAccessibility(`Moved to position ${target + 1} of ${ordered.length}.`); } catch { setCards(previousCards); setError('Chits could not save that card position. Try again.'); } }, [repository]);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => { scrollYRef.current = event.nativeEvent.contentOffset.y; const active = dragRef.current; if (!active) return; scrollCompensation.set(scrollYRef.current - active.startScrollY); evaluateTarget(lastDragPageYRef.current); }, [evaluateTarget, scrollCompensation]);
  const finishDrag = useCallback(() => settleDrag(false), [settleDrag]);
  const cancelDrag = useCallback(() => settleDrag(true), [settleDrag]);
  const openCardMove = useCallback((card: Card) => setMoveCard(card), []);
  const reorderCard = useCallback((card: Card, index: number, direction: -1 | 1) => { void reorderAccessible(card, index, direction); }, [reorderAccessible]);
  const moveToAdjacentColumn = useCallback(async (card: Card, direction: -1 | 1) => { const fromIndex = columnIndexRef.current; const destination = columns[fromIndex + direction]; if (!destination) return; await fetchColumn(destination.id);
    let previousCards: Card[] = []; let destinationIndex = 0;
    // Derived inside the updater, not from the closed-over `cards`, so it reflects
    // whatever fetchColumn just merged in rather than a pre-fetch snapshot.
    setCards((current) => { previousCards = current; const destinationCards = current.filter((item) => item.columnId === destination.id && item.id !== card.id); destinationIndex = destinationCards.length; const movedCard = { ...card, columnId: destination.id, position: destinationIndex }; return [...current.filter((item) => item.id !== card.id), movedCard]; });
    setColumnIndex(fromIndex + direction); boardListRef.current?.scrollToOffset({ offset: (fromIndex + direction) * columnInterval, animated: !reduceMotion });
    try { await repository.moveCard(card.id, destination.id, destinationIndex); await Haptics.selectionAsync(); await AccessibilityInfo.announceForAccessibility(`Moved to ${destination.name}.`); } catch (cause) { setCards(previousCards); setColumnIndex(fromIndex); setError(cause instanceof Error ? cause.message : 'Chits could not move that card.'); } }, [columnInterval, columns, fetchColumn, reduceMotion, repository]);
  const move = async (destination: Column) => { if (!moveCard) return; const movingCard = moveCard; await fetchColumn(destination.id);
    let previousCards: Card[] = []; let destinationIndex = 0;
    setCards((current) => { previousCards = current; const destinationCards = current.filter((card) => card.columnId === destination.id && card.id !== movingCard.id); destinationIndex = destinationCards.length; const movedCard = { ...movingCard, columnId: destination.id, position: destinationIndex }; return [...current.filter((card) => card.id !== movingCard.id), movedCard]; });
    setMoveCard(null); const nextColumnIndex = columns.findIndex((column) => column.id === destination.id); setColumnIndex(nextColumnIndex); requestAnimationFrame(() => boardListRef.current?.scrollToOffset({ offset: nextColumnIndex * columnInterval, animated: true })); try { await repository.moveCard(movingCard.id, destination.id, destinationIndex); await Haptics.selectionAsync(); } catch (cause) { setCards(previousCards); setError(cause instanceof Error ? cause.message : 'Chits could not move that card.'); } };
  const addColumn = async (name: string) => { if (!id) throw new Error('This board is no longer available.'); await repository.addColumn(id, name.trim()); await load(); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
  // New columns are always appended, so the pre-add column count is exactly the new
  // column's index — used to focus and scroll to it once it lands, animating the
  // "Add column" placeholder smoothly down to its permanent last position.
  const addColumnFromPlaceholder = async (name: string) => { const newIndex = columns.length; await addColumn(name); setColumnIndex(newIndex); requestAnimationFrame(() => boardListRef.current?.scrollToOffset({ offset: newIndex * columnInterval, animated: !reduceMotion })); };
  const openAddColumnSheet = useCallback(() => { setAddColumnOrigin('placeholder'); setSettingsOpen(true); }, []);
  const openAddNote = useCallback((column: Column) => setAddNoteColumn(column), []);
  const closeAddNote = useCallback(() => setAddNoteColumn(null), []);
  // Contextual capture: creates the note directly with this board+column already
  // attached (createNoteCard), then splices the resulting card straight into local
  // state — no Unorganized round-trip, no board reload/flicker. Position is computed
  // the same way the repository computes it server-side (append after the column's
  // current cards), safe here because this is a local-first, single-writer app.
  const submitAddNote = useCallback(async (text: string) => {
    if (!id || !addNoteColumn) return;
    const targetColumn = addNoteColumn;
    const position = cards.filter((card) => card.columnId === targetColumn.id).length;
    const { cardId } = await repository.createNoteCard({ boardId: id, columnId: targetColumn.id, text });
    const newCard: Card = { id: cardId, columnId: targetColumn.id, title: text.trim().slice(0, 120) || null, position, preview: text.trim(), attachmentCount: 0, messageCount: 1, mediaId: null, mediaMessageId: null, mediaType: null, mediaUri: null, mediaMimeType: null, mediaSize: null, mediaDuration: null, mediaWidth: null, mediaHeight: null, mediaCreatedAt: null };
    setCards((current) => [...current, newCard]);
    setColumnCounts((current) => ({ ...current, [targetColumn.id]: (current[targetColumn.id] ?? 0) + 1 }));
    setJustAddedCardId(cardId);
    setToast(`Added to ${targetColumn.name}`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [addNoteColumn, cards, id, repository]);
  const saveBoardAppearance = async (next: { name: string; icon: BoardIconName | null; accent: string | null }) => { if (!board) throw new Error('This board is no longer available.'); const previousBoard = board; setBoard({ ...board, name: next.name, icon: next.icon, accent: next.accent, updatedAt: Date.now() }); try { await repository.updateBoard(board.id, next); await Haptics.selectionAsync(); } catch (cause) { setBoard(previousBoard); throw cause; } };
  const renameColumn = async (name: string) => { if (!currentColumn) throw new Error('That column is no longer available.'); await repository.renameColumn(currentColumn.id, name.trim()); setColumns((current) => current.map((column) => column.id === currentColumn.id ? { ...column, name: name.trim() } : column)); await Haptics.selectionAsync(); };
  const deleteColumn = async (destinationColumnId?: string) => { if (!currentColumn) throw new Error('That column is no longer available.'); await repository.deleteColumn(currentColumn.id, destinationColumnId); await load(); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
  const getDeleteCardCount = async () => { if (!currentColumn) throw new Error('That column is no longer available.'); return repository.getColumnCardCount(currentColumn.id); };
  const reorderColumn = async (direction: -1 | 1) => { const next = columnIndex + direction; if (next < 0 || next >= columns.length || !id) return; const previousColumns = columns; const reordered = [...columns]; [reordered[columnIndex], reordered[next]] = [reordered[next], reordered[columnIndex]]; setColumns(reordered); setColumnIndex(next); try { await repository.reorderColumns(id, reordered.map((column) => column.id)); await Haptics.selectionAsync(); } catch (cause) { setColumns(previousColumns); setColumnIndex(columnIndex); throw cause; } };
  // One board-level error rather than per-column ones: a failed initial load means
  // there's no board/columns/cards to show at all, so there's nothing column-specific
  // to localize the error to.
  if (boardStatus === 'error') return <Screen><AppHeader title="Board" leading={<IconButton label="Go back" onPress={() => router.back()}><Text style={[styles.back, { color: theme.textPrimary }]}>‹</Text></IconButton>} /><EmptyState title="Couldn’t load this board" description="Something went wrong loading it." /><Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={() => void load()} style={({ pressed }) => [styles.retryButton, { backgroundColor: theme.accent }, pressed && styles.addPressed]}><Text style={[styles.retryButtonText, { color: theme.accentText }]}>Try again</Text></Pressable></Screen>;
  if (board === undefined) return <Screen>{showBoardLoader ? <View style={styles.boardLoader}><ChitsLoader label="Loading board…" /></View> : null}</Screen>;
  if (!board) return <Screen><AppHeader title="Board" leading={<IconButton label="Go back" onPress={() => router.back()}><Text style={[styles.back, { color: theme.textPrimary }]}>‹</Text></IconButton>} /><EmptyState title="Board unavailable" description="It may have been archived." /></Screen>;
  // Instant count for a column: prefer the live loaded array once it's actually been
  // fetched, otherwise the lightweight board-open summary — never waits on card
  // hydration just to show "N cards".
  const columnCardCount = (column: Column | undefined, laneCardsLength: number) => column && columnStatus[column.id] !== 'loaded' ? (columnCounts[column.id] ?? laneCardsLength) : laneCardsLength;
  const activeCardCount = columnCardCount(currentColumn, currentCards.length);
  const metadata = `${columnIndex + 1} of ${columns.length} columns · ${activeCardCount} ${activeCardCount === 1 ? 'card' : 'cards'}`;
  // The board's own accent, resolved once, stands in everywhere this screen would
  // otherwise reach for the generic theme accent — full strength for solid fills/
  // text-on-accent, a soft *opaque* tint (mixed into the screen's own background,
  // not layered with alpha — see tintWithAccent) for backgrounds, and the accent
  // itself for borders/highlights, all falling back to the theme's tokens when the
  // board has no accent set.
  const accent = board.accent ?? theme.accent;
  const accentOn = board.accent ? '#FFFFFF' : theme.accentText;
  const accentTint = board.accent ? tintWithAccent(theme.background, board.accent, 0.08) : theme.accentSoft;
  const accentBorderColor = board.accent ?? theme.accentBorder;
  const reservedNavigatorHeight = board.showColumnNavigator ? navigatorDockHeight : 0;
  const addButtonBottom = board.showColumnNavigator && navigatorDockHeight
    ? navigatorDockHeight - spacing.md
    : spacing.md;
  // Renders one column's card rows. While a drag is in progress, this is called for
  // up to two columns: the drag's destination (shows a live placeholder at the
  // insertion point) and, if different, its source (keeps rendering — even once no
  // longer the visually active column — so the invisible card instance that owns the
  // live gesture never gets unmounted mid-drag; see the `showFullLane` note below).
  const buildLaneRows = (column: Column, laneCards: Card[]): ReactNode[] => {
    const isSource = drag?.sourceColumnId === column.id;
    const isDestination = drag?.destinationColumnId === column.id;
    if (!drag || (!isSource && !isDestination)) { const columnPosition = columns.findIndex((item) => item.id === column.id); return laneCards.map((card, index) => <Animated.View key={`card:${card.id}`} layout={cardLayoutTransition} entering={!reduceMotion && card.id === justAddedCardId ? FadeIn.duration(240) : undefined} onLayout={(event) => { layoutsRef.current[card.id] = event.nativeEvent.layout; }}><BoardCardRow card={card} index={index} total={laneCards.length} translationY={gestureTranslationY} highlighted={card.id === justAddedCardId} accent={accent} accentTint={accentTint} accentBorderColor={accentBorderColor} columnName={column.name} canMovePrevColumn={columnPosition > 0} canMoveNextColumn={columnPosition >= 0 && columnPosition < columns.length - 1} onBeginDrag={beginDrag} onDragMove={moveDrag} onDragEnd={finishDrag} onDragCancel={cancelDrag} onOpenMove={openCardMove} onReorder={reorderCard} onMoveColumn={moveToAdjacentColumn} /></Animated.View>); }
    const rows: ReactNode[] = [];
    const displayCards = isSource ? laneCards.filter((card) => card.id !== drag.card.id) : laneCards;
    const placeholderIndex = isDestination ? drag.toIndex : undefined;
    const total = laneCards.length + (isDestination && !isSource ? 1 : 0);
    const placeholder = <Animated.View key={`placeholder:${drag.card.id}`} layout={cardLayoutTransition} onLayout={(event) => { placeholderYRef.current = event.nativeEvent.layout.y; }} style={[styles.placeholder, { height: drag.height, borderColor: accentBorderColor, backgroundColor: accentTint }]} />;
    for (const card of displayCards) {
      const trueIndex = laneCards.findIndex((item) => item.id === card.id);
      const filteredIndex = isSource && trueIndex > drag.fromIndex ? trueIndex - 1 : trueIndex;
      if (isDestination && filteredIndex === placeholderIndex) rows.push(placeholder);
      rows.push(<Animated.View key={`card:${card.id}`} layout={cardLayoutTransition} onLayout={(event) => { layoutsRef.current[card.id] = event.nativeEvent.layout; }}><BoardCardRow card={card} index={trueIndex} total={total} translationY={gestureTranslationY} accent={accent} accentTint={accentTint} accentBorderColor={accentBorderColor} columnName={column.name} onBeginDrag={beginDrag} onDragMove={moveDrag} onDragEnd={finishDrag} onDragCancel={cancelDrag} onOpenMove={openCardMove} onReorder={reorderCard} onMoveColumn={moveToAdjacentColumn} /></Animated.View>);
    }
    if (isDestination && placeholderIndex === displayCards.length) rows.push(placeholder);
    // Must stay the same element TYPE (Animated.View) as the normal-flow card wrapper
    // above, not a plain View — React only preserves a component instance across a
    // re-render when both key AND type match. The instant drag activates, this same
    // key moves from the plain map into this responderKeeper slot; if the type
    // differed, React would unmount+remount it right then, destroying the native
    // gesture recognizer mid-stream (drag would lift but never track movement again).
    if (isSource) rows.push(<Animated.View key={`card:${drag.card.id}`} style={styles.responderKeeper}><BoardCardRow card={drag.card} index={drag.fromIndex} total={total} translationY={gestureTranslationY} accent={accent} accentTint={accentTint} accentBorderColor={accentBorderColor} columnName={column.name} onBeginDrag={beginDrag} onDragMove={moveDrag} onDragEnd={finishDrag} onDragCancel={cancelDrag} onOpenMove={openCardMove} onReorder={reorderCard} onMoveColumn={moveToAdjacentColumn} /></Animated.View>);
    return rows;
  };
  return <Screen><View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="chevron-back" size={24} color={theme.textPrimary} /></Pressable>
      <View accessible={false} style={[styles.boardMark, { backgroundColor: board.accent ?? theme.accentSoft }]}><Ionicons accessible={false} name={resolveBoardIcon(board.icon)} size={19} color={board.accent ? '#FFFFFF' : theme.accentStrong} /></View>
      <View style={styles.headerCopy}><Text numberOfLines={1} accessibilityRole="header" style={[styles.boardTitle, { color: theme.textPrimary }]}>{board.name}</Text><Text numberOfLines={1} style={[styles.boardSubtitle, { color: theme.textSecondary }]}>{metadata}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push('/search')} style={({ pressed }) => [styles.headerButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="search-outline" size={21} color={theme.textPrimary} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Edit board" onPress={() => setRenameOpen(true)} style={({ pressed }) => [styles.headerButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="pencil-outline" size={21} color={theme.textPrimary} /></Pressable>
    </View>
    <View style={styles.pager} accessibilityLabel={`${board.name} board. Column ${columnIndex + 1} of ${columns.length}. ${activeCardCount} ${activeCardCount === 1 ? 'card' : 'cards'}.`}>{columns.length ? <View style={styles.carousel} onLayout={(event) => { const height = event.nativeEvent.layout.height; event.currentTarget.measureInWindow((_, y) => { viewportRef.current = { top: y, height }; }); }}>
      <FlatList
        ref={boardListRef}
        style={styles.boardList}
        horizontal
        data={carouselItems}
        keyExtractor={(item) => item.kind === 'column' ? item.column.id : '__add_column__'}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToInterval={columnInterval}
        snapToAlignment="start"
        scrollEnabled={!drag}
        onScroll={handleBoardScroll}
        scrollEventThrottle={48}
        onMomentumScrollEnd={settleColumn}
        getItemLayout={(_, index) => ({ length: columnInterval, offset: columnInterval * index, index })}
        initialNumToRender={carouselItems.length}
        windowSize={Math.max(21, carouselItems.length * 2)}
        contentContainerStyle={[styles.boardTrack, { paddingHorizontal: carouselInset, paddingBottom: reservedNavigatorHeight ? spacing.sm : spacing.md }]}
        renderItem={({ item, index }) => {
          if (item.kind === 'add') return <AddColumnPlaceholder variant="trailing" width={columnWidth} marginHorizontal={columnGap / 2} onPress={openAddColumnSheet} />;
          const column = item.column;
          const active = index === columnIndex;
          const isSource = drag?.sourceColumnId === column.id;
          const isDestination = drag?.destinationColumnId === column.id;
          const dropTarget = Boolean(isDestination && !isSource);
          // Every column's border stays in the board's own accent family, not just
          // the active one — otherwise an inactive column falls back to plain grey
          // right next to an active one tinted by the accent, which reads as a bug
          // rather than a resting state.
          const columnBorder = active || dropTarget
            ? accentBorderColor
            : board.accent ? `${board.accent}40` : theme.borderSubtle;
          // `columnIndex` only commits on momentum-end (or immediately on a navigator
          // tap, before its animated scroll even visually arrives) — never mid-swipe.
          // A column one swipe away is the only one that can be exposed by the
          // current gesture, so it must already show real, stable card content (not
          // the lightweight neighborCards preview) well before the finger gets there,
          // or releasing the swipe pops a different-shaped column into view.
          const isAdjacent = Math.abs(index - columnIndex) <= 1;
          // The source column of an in-progress drag keeps its full lane mounted
          // even once the board has paged away from it (see buildLaneRows above) —
          // it just renders off-screen, holding the live gesture, until drop.
          const showFullLane = isAdjacent || isSource;
          const laneCards = cards.filter((card) => card.columnId === column.id).sort((a, b) => a.position - b.position);
          const showList = laneCards.length > 0 || isDestination;
          const status = columnStatus[column.id];
          // A column that's never been queried (or is mid-fetch) is not the same as
          // one that's genuinely empty — conflating them would flash a false "nothing
          // here yet" while a prefetch is still in flight.
          const notYetLoaded = !showList && status !== 'loaded' && status !== 'error';
          const loadFailed = !showList && status === 'error';
          return <View style={[styles.columnFrame, { width: columnWidth, marginHorizontal: columnGap / 2, backgroundColor: accentTint, borderColor: columnBorder }, active && styles.activeColumn, dropTarget && styles.dropTargetColumn]}>
            <View style={styles.columnHeader}>
              <View style={[styles.columnIcon, { backgroundColor: theme.surface }]}><Ionicons accessible={false} name="albums-outline" size={19} color={accent} /></View>
              <View style={styles.columnHeaderCopy}><Text numberOfLines={1} style={[styles.columnTitle, { color: theme.textPrimary }]}>{column.name}</Text><Text style={[styles.columnCount, { color: theme.textSecondary }]}>{columnCardCount(column, laneCards.length)} {columnCardCount(column, laneCards.length) === 1 ? 'card' : 'cards'}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Add note to ${column.name}`} onPress={() => openAddNote(column)} style={({ pressed }) => [styles.columnMenu, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="add" size={22} color={theme.textSecondary} /></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${column.name} column`} onPress={() => { if (!active) goToColumn(index); setSettingsOpen(true); }} style={({ pressed }) => [styles.columnMenu, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="ellipsis-horizontal" size={20} color={theme.textSecondary} /></Pressable>
            </View>
            {showFullLane ? <ScrollView ref={active ? scrollRef : undefined} style={styles.activeLane} contentContainerStyle={[styles.cards, { paddingBottom: reservedNavigatorHeight ? reservedNavigatorHeight + spacing.md : spacing.lg }]} scrollEventThrottle={16} onScroll={active ? handleScroll : undefined} scrollEnabled={active} showsVerticalScrollIndicator={false}>{showList ? <View style={styles.cardList}>
              {buildLaneRows(column, laneCards)}
              <Animated.View key="add-note-row" layout={cardLayoutTransition}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Add note to ${column.name}`} onPress={() => openAddNote(column)} style={({ pressed }) => [styles.addNoteRow, { borderColor: theme.borderSubtle, backgroundColor: theme.surface }, pressed && styles.emptyDropPressed]}>
                  <Ionicons accessible={false} name="add" size={18} color={accent} />
                  <Text style={[styles.addNoteText, { color: accent }]}>Add note</Text>
                </Pressable>
              </Animated.View>
            </View> : notYetLoaded ? <ColumnSkeleton />
            : loadFailed ? <Pressable accessibilityRole="button" accessibilityLabel={`Retry loading ${column.name}`} onPress={() => fetchColumn(column.id, { force: true })} style={({ pressed }) => [styles.emptyDrop, { borderColor: accentBorderColor, backgroundColor: theme.surface }, pressed && styles.emptyDropPressed]}><View style={[styles.emptyIcon, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name="refresh" size={24} color={theme.textMuted} /></View><Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Couldn’t load this column</Text><Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>Tap to retry.</Text></Pressable>
            : <View style={[styles.emptyDrop, { borderColor: accentBorderColor, backgroundColor: theme.surface }]}><View style={[styles.emptyIcon, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name="document-text-outline" size={24} color={theme.textMuted} /></View><Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>No notes here yet</Text><Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>Add something directly or move a note here.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Add note to ${column.name}`} onPress={() => openAddNote(column)} style={({ pressed }) => [styles.emptyAddButton, { backgroundColor: accent }, pressed && styles.emptyDropPressed]}><Ionicons accessible={false} name="add" size={16} color={accentOn} /><Text style={[styles.emptyAddText, { color: accentOn }]}>Add note</Text></Pressable></View>}</ScrollView> : <View pointerEvents="none" style={styles.neighborCards}>{status === 'loaded' || laneCards.length ? <>{laneCards.slice(0, 3).map((card) => <View key={card.id} style={[styles.neighborCard, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}><Text numberOfLines={2} style={[styles.neighborCardTitle, { color: theme.textPrimary }]}>{card.title || card.preview || 'Untitled thought'}</Text></View>)}{!laneCards.length ? <View style={[styles.neighborEmpty, { borderColor: accentBorderColor }]}><Ionicons accessible={false} name="add" size={20} color={theme.textMuted} /><Text style={[styles.neighborEmptyText, { color: theme.textMuted }]}>Add a card</Text></View> : null}</> : [0, 1].map((key) => <View key={key} style={[styles.neighborCard, styles.neighborCardSkeleton, { backgroundColor: theme.surfaceElevated }]} />)}</View>}
          </View>;
        }}
      />
      {drag ? <Animated.View pointerEvents="none" style={[styles.dragLayer, { top: drag.overlayTop, left: (screenWidth - columnWidth) / 2 + spacing.md, width: columnWidth - spacing.xl }, animatedDragStyle]}><CardSurface card={drag.card} index={drag.fromIndex} total={Math.max(1, currentCards.length)} dragging interactive={false} accent={accent} accentTint={accentTint} accentBorderColor={accentBorderColor} /></Animated.View> : null}
      {drag ? <Animated.View pointerEvents="none" style={[styles.edgeGlow, styles.edgeGlowLeft, { backgroundColor: accentTint }, edgeGlowLeftStyle]} /> : null}
      {drag ? <Animated.View pointerEvents="none" style={[styles.edgeGlow, styles.edgeGlowRight, { backgroundColor: accentTint }, edgeGlowRightStyle]} /> : null}
      {board.showColumnNavigator ? <View onLayout={(event) => setNavigatorDockHeight(Math.ceil(event.nativeEvent.layout.height))} style={styles.navigatorDock}><ColumnNavigator columns={columns} cards={cards} columnStatus={columnStatus} columnCounts={columnCounts} columnIndex={columnIndex} reduceMotion={reduceMotion} accent={accent} onSelect={goToColumn} onAddColumn={openAddColumnSheet} /></View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Add from Unorganized" accessibilityHint="Opens unorganized thoughts to add to this board" onPress={() => router.push('/unorganized')} style={({ pressed }) => [styles.add, { bottom: addButtonBottom, backgroundColor: accent }, pressed && styles.addPressed]}><Ionicons accessible={false} name="add-outline" size={28} color={accentOn} /></Pressable>
    </View> : <View style={styles.carousel}><AddColumnPlaceholder variant="empty" onPress={openAddColumnSheet} /></View>}</View>{error ? <Text accessibilityRole="alert" style={[styles.error, { backgroundColor: theme.danger }]}>{error}</Text> : null}
    <Modal visible={!!moveCard} transparent animationType="fade" onRequestClose={() => setMoveCard(null)}><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setMoveCard(null)} /><View style={[styles.modal, { backgroundColor: theme.surface }]}><Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Move to…</Text><Text style={[styles.modalCopy, { color: theme.textSecondary }]}>Choose a destination column.</Text>{columns.map((column) => <Pressable key={column.id} onPress={() => void move(column)} style={[styles.option, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.optionText, { color: theme.textPrimary }]}>{column.name}</Text><Text style={[styles.optionArrow, { color: theme.textMuted }]}>›</Text></Pressable>)}</View></View></Modal>
    <ColumnManagementSheet
      visible={settingsOpen}
      columns={columns}
      currentIndex={columnIndex}
      initialPage={addColumnOrigin === 'placeholder' ? 'add' : 'manage'}
      closeOnAdd={addColumnOrigin === 'placeholder'}
      onClose={() => { setSettingsOpen(false); setAddColumnOrigin('menu'); }}
      onRename={renameColumn}
      onMove={reorderColumn}
      onAdd={addColumnOrigin === 'placeholder' ? addColumnFromPlaceholder : addColumn}
      onGetDeleteCardCount={getDeleteCardCount}
      onDelete={deleteColumn}
    />
    <EditBoardSheet visible={renameOpen} board={{ name: board.name, icon: board.icon as BoardIconName | null, accent: board.accent }} onClose={() => setRenameOpen(false)} onSave={saveBoardAppearance} />
    <AddNoteSheet visible={!!addNoteColumn} boardName={board.name} columnName={addNoteColumn?.name ?? ''} onClose={closeAddNote} onSubmit={submitAddNote} />
    {toast ? <View pointerEvents="none" accessibilityLiveRegion="polite" style={styles.toastWrap}><View style={[styles.toast, { backgroundColor: theme.textPrimary }]}><Text style={[styles.toastText, { color: theme.background }]}>{toast}</Text></View></View> : null}
  </Screen>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, textAlign: 'center', textAlignVertical: 'center' }, boardLoader: { flex: 1, alignItems: 'center', justifyContent: 'center' }, back: { fontSize: 30, lineHeight: 30 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  boardMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xxs }, boardTitle: { fontSize: 23, lineHeight: 28, fontWeight: '800' }, boardSubtitle: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  headerButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 }, headerButtonPressed: { opacity: 0.58, transform: [{ scale: 0.96 }] },
  pager: { flex: 1 }, carousel: { flex: 1 }, boardList: { flex: 1 }, boardTrack: { flexGrow: 1, alignItems: 'stretch', paddingTop: spacing.xs },
  columnFrame: { flex: 1, overflow: 'hidden', borderRadius: 26, borderWidth: StyleSheet.hairlineWidth }, activeColumn: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, dropTargetColumn: { borderWidth: 2 },
  columnHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, columnIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, columnHeaderCopy: { flex: 1, minWidth: 0 }, columnTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800' }, columnCount: { marginTop: 2, fontSize: 13, lineHeight: 17, fontWeight: '500' }, columnMenu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  activeLane: { flex: 1 }, cards: { flexGrow: 1, paddingHorizontal: spacing.md, paddingBottom: spacing.lg }, cardList: { position: 'relative', gap: spacing.sm },
  emptyDrop: { minHeight: 320, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.md, marginBottom: spacing.lg, padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderRadius: 22 }, emptyDropPressed: { opacity: 0.7 }, emptyIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, marginBottom: spacing.sm }, emptyTitle: { fontSize: 17, fontWeight: '700' }, emptyCopy: { marginTop: spacing.xs, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  emptyAddButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: 20, marginTop: spacing.md },
  emptyAddText: { fontWeight: '700', fontSize: 14 },
  // Ghost/secondary treatment — a ~52pt dashed row, same horizontal bounds as a
  // card, deliberately quieter than the solid card surfaces above it.
  addNoteRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed' },
  addNoteText: { fontSize: 14, fontWeight: '700' },
  neighborCards: { flex: 1, gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.lg }, neighborCard: { minHeight: 112, justifyContent: 'center', padding: spacing.md, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth }, neighborCardTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700' }, neighborCardSkeleton: { borderWidth: 0, opacity: 0.5 }, neighborEmpty: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderStyle: 'dashed', borderRadius: 22 }, neighborEmptyText: { fontSize: 14, fontWeight: '600' },
  skeletonStack: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingTop: spacing.xs }, skeletonBar: { borderRadius: 6 }, skeletonTitleBar: { width: '68%', height: 18 }, skeletonPreviewBar: { width: '92%', height: 14, marginTop: spacing.xs }, skeletonHandle: { width: 44, height: 44, borderRadius: 12, marginTop: -spacing.xs, marginRight: -spacing.xs }, skeletonFooterBar: { height: 40, borderRadius: 12 },
  navigatorDock: { position: 'absolute', right: 0, bottom: 0, left: 0, zIndex: 10, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm }, navigatorSurface: { borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, navigator: { height: 44 }, navigatorContent: { position: 'relative', minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'center', gap: spacing.xs }, navigatorIndicator: { position: 'absolute', bottom: 2, left: 0, width: 24, height: 2, borderRadius: 1 }, navigatorItem: { maxWidth: 176, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }, navigatorItemPressed: { opacity: 0.58 }, navigatorNameFrame: { maxWidth: 152, minHeight: 20, justifyContent: 'center' }, navigatorName: { maxWidth: 152, flexShrink: 1, fontSize: 14, lineHeight: 20 }, navigatorNameMeasure: { opacity: 0, fontWeight: '800' }, navigatorNameVisible: { position: 'absolute', right: 0, left: 0, fontWeight: '500', textAlign: 'center' }, navigatorNameSelected: { fontWeight: '800' }, navigatorPosition: { height: 16, fontSize: 10, lineHeight: 13, fontWeight: '600', textAlign: 'center', letterSpacing: 0.2 }, navigatorAddItem: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: 1, borderStyle: 'dashed' },
  addColumnFrame: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', paddingHorizontal: spacing.lg }, addColumnFrameEmpty: { marginHorizontal: spacing.md, marginVertical: spacing.md }, addColumnPressed: { opacity: 0.6 }, addColumnIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', marginBottom: spacing.xs }, addColumnTitle: { fontSize: 17, fontWeight: '700' }, addColumnCopy: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 200 },
  card: { overflow: 'hidden', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, cardHighlight: { zIndex: 1, borderRadius: 22, borderWidth: 2 }, cardMedia: { width: '100%', borderBottomWidth: StyleSheet.hairlineWidth }, cardBody: { padding: 20, gap: spacing.md }, cardPressed: { opacity: 0.78 }, cardDragging: { zIndex: 30, elevation: 12, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } }, cardTop: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs }, cardOpen: { flex: 1, minWidth: 0, justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '800', lineHeight: 26 }, dragHandle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.xs, marginRight: -spacing.xs }, dotGrid: { width: 14, height: 20, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'space-between', gap: 3 }, dot: { width: 4, height: 4, borderRadius: 2 }, preview: { marginTop: spacing.xs, fontSize: 15, lineHeight: 22 }, meta: { minHeight: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, metaText: { fontSize: 11, lineHeight: 15, fontWeight: '600' }, cardDivider: { height: StyleSheet.hairlineWidth }, cardControls: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, move: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: 12 }, moveText: { fontSize: 13, fontWeight: '700' }, reorderGroup: { height: 40, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: 12 }, reorderButton: { width: 42, height: 40, alignItems: 'center', justifyContent: 'center' }, reorderDivider: { width: StyleSheet.hairlineWidth, height: 20 }, reorderButtonDisabled: { opacity: 0.26 }, reorderButtonPressed: { opacity: 0.55 }, controlPressed: { opacity: 0.62 }, placeholder: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 22 }, responderKeeper: { position: 'absolute', top: 0, right: 0, left: 0, opacity: 0, zIndex: -1 }, dragLayer: { position: 'absolute', zIndex: 50, elevation: 14 }, edgeGlow: { position: 'absolute', top: 0, bottom: 0, width: 28, zIndex: 40 }, edgeGlowLeft: { left: 0, borderTopRightRadius: 26, borderBottomRightRadius: 26 }, edgeGlowRight: { right: 0, borderTopLeftRadius: 26, borderBottomLeftRadius: 26 },
  add: { position: 'absolute', left: '50%', marginLeft: -30, width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30, zIndex: 20, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, addPressed: { opacity: 0.76, transform: [{ scale: 0.96 }] },
  retryButton: { alignSelf: 'center', minHeight: 44, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, retryButtonText: { fontWeight: '700', fontSize: 15 }, error: { color: '#fff', textAlign: 'center', padding: spacing.sm }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.3)' }, modal: { padding: spacing.lg, borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: spacing.sm }, modalTitle: { fontSize: 20, fontWeight: '700' }, modalCopy: { marginBottom: spacing.sm }, option: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth }, optionText: { fontSize: 16, flex: 1 }, optionArrow: { fontSize: 25 },
  toastWrap: { position: 'absolute', right: 0, bottom: 96, left: 0, alignItems: 'center' }, toast: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 }, toastText: { fontSize: 14, fontWeight: '600' },
});
