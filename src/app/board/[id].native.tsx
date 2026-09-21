import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, FlatList, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type LayoutRectangle, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';
import { AppHeader, EmptyState, IconButton, Screen } from '@/components/ui/primitives';
import { GlassSurface } from '@/components/ui/glass-surface';
import { AttachmentContent } from '@/components/chat/message-row';
import { ColumnManagementSheet } from '@/components/boards/column-management-sheet';
import { RenameBoardSheet } from '@/components/boards/rename-board-sheet';
import { spacing } from '@/constants/theme';
import { createBoardRepository } from '@/db/repositories';
import { useTheme } from '@/components/theme-provider';
import type { Attachment, Board } from '@/db/types';

type Column = { id: string; name: string; position: number };
type Card = { id: string; columnId: string; title: string | null; position: number; preview: string | null; attachmentCount: number; messageCount: number; mediaId: string | null; mediaMessageId: string | null; mediaType: 'photo' | 'video' | null; mediaUri: string | null; mediaMimeType: string | null; mediaSize: number | null; mediaDuration: number | null; mediaWidth: number | null; mediaHeight: number | null; mediaCreatedAt: number | null };
type DragState = { card: Card; sourceColumnId: string; destinationColumnId: string; fromIndex: number; toIndex: number; height: number; startY: number; overlayTop: number; startScrollY: number; horizontalConsumed: boolean };

function ColumnNavigator({ columns, cards, columnIndex, reduceMotion, onSelect }: { columns: Column[]; cards: Card[]; columnIndex: number; reduceMotion: boolean; onSelect: (index: number) => void }) {
  const { tokens: theme } = useTheme();
  const listRef = useRef<ScrollView>(null);
  const [layouts, setLayouts] = useState<Record<string, { x: number; width: number }>>({});
  const [viewportWidth, setViewportWidth] = useState(0);
  const indicatorX = useSharedValue(0);
  const indicatorInitialized = useRef(false);
  const active = columns[columnIndex];
  const activeLayout = active ? layouts[active.id] : undefined;
  const counts = useMemo(() => {
    const next = new Map<string, number>();
    for (const card of cards) next.set(card.columnId, (next.get(card.columnId) ?? 0) + 1);
    return next;
  }, [cards]);
  useEffect(() => {
    if (!activeLayout) return;
    const nextX = activeLayout.x + (activeLayout.width - 24) / 2;
    indicatorX.set(reduceMotion || !indicatorInitialized.current ? nextX : withTiming(nextX, { duration: 220 }));
    indicatorInitialized.current = true;
    listRef.current?.scrollTo({ x: Math.max(0, activeLayout.x + activeLayout.width / 2 - viewportWidth / 2), animated: !reduceMotion });
  }, [activeLayout, indicatorX, reduceMotion, viewportWidth]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: indicatorX.get() }] }));
  return <GlassSurface style={[styles.navigatorSurface, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}><ScrollView ref={listRef} horizontal showsHorizontalScrollIndicator={false} onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} contentContainerStyle={styles.navigatorContent} style={styles.navigator}>
    <Animated.View pointerEvents="none" style={[styles.navigatorIndicator, { backgroundColor: theme.accent }, indicatorStyle]} />
    {columns.map((column, index) => { const selected = index === columnIndex; const count = counts.get(column.id) ?? 0; return <Pressable key={column.id} accessibilityRole="tab" accessibilityLabel={`${column.name} column, ${count} ${count === 1 ? 'card' : 'cards'}, ${index + 1} of ${columns.length}`} accessibilityState={{ selected }} onLayout={(event) => { const { x, width } = event.nativeEvent.layout; setLayouts((current) => current[column.id]?.x === x && current[column.id]?.width === width ? current : { ...current, [column.id]: { x, width } }); }} onPress={() => onSelect(index)} style={({ pressed }) => [styles.navigatorItem, pressed && styles.navigatorItemPressed]}><View style={styles.navigatorNameFrame}><Text accessible={false} numberOfLines={1} style={[styles.navigatorName, styles.navigatorNameMeasure]}>{column.name}</Text><Text numberOfLines={1} style={[styles.navigatorName, styles.navigatorNameVisible, { color: selected ? theme.textPrimary : theme.textMuted }, selected && styles.navigatorNameSelected]}>{column.name}</Text></View></Pressable>; })}
  </ScrollView><Text accessibilityElementsHidden importantForAccessibility="no" style={[styles.navigatorPosition, { color: theme.textMuted }]}>{columnIndex + 1} of {columns.length}</Text></GlassSurface>;
}

function DragDots() { const { tokens: theme } = useTheme(); return <View accessible={false} style={styles.dotGrid}>{Array.from({ length: 6 }, (_, index) => <View key={index} style={[styles.dot, { backgroundColor: theme.textMuted }]} />)}</View>; }

function DragHandle({ index, total, translationY, onBegin, onMove, onEnd, onCancel, onReorder }: { index: number; total: number; translationY: SharedValue<number>; onBegin: () => void; onMove: (dx: number, dy: number, pageX: number, pageY: number) => void; onEnd: () => void; onCancel: () => void; onReorder: (direction: -1 | 1) => void }) {
  const gesture = useMemo(() => Gesture.Pan().activateAfterLongPress(220).minDistance(1).onStart(() => {
    translationY.set(0);
    runOnJS(onBegin)();
  }).onUpdate((event) => {
    translationY.set(event.translationY);
    runOnJS(onMove)(event.translationX, event.translationY, event.absoluteX, event.absoluteY);
  }).onEnd(() => { runOnJS(onEnd)(); }).onFinalize((_, success) => { if (!success) runOnJS(onCancel)(); }), [onBegin, onCancel, onEnd, onMove, translationY]);
  return <GestureDetector gesture={gesture}><Pressable collapsable={false} hitSlop={4} accessibilityRole="adjustable" accessibilityLabel={`Drag handle. Reorder card. Card ${index + 1} of ${total}.`} accessibilityActions={[{ name: 'decrement', label: 'Move earlier' }, { name: 'increment', label: 'Move later' }]} onPress={(event) => event.stopPropagation()} onAccessibilityAction={(event) => { if (event.nativeEvent.actionName === 'decrement') onReorder(-1); if (event.nativeEvent.actionName === 'increment') onReorder(1); }} style={styles.dragHandle}><DragDots /></Pressable></GestureDetector>;
}

const CardSurface = memo(function CardSurface({ card, index, total, translationY, dragging = false, interactive = true, onBeginDrag, onDragMove, onDragEnd, onDragCancel, onOpenMove, onReorder }: { card: Card; index: number; total: number; translationY?: SharedValue<number>; dragging?: boolean; interactive?: boolean; onBeginDrag?: () => void; onDragMove?: (dx: number, dy: number, pageX: number, pageY: number) => void; onDragEnd?: () => void; onDragCancel?: () => void; onOpenMove?: () => void; onReorder?: (direction: -1 | 1) => void }) {
  const { tokens: theme } = useTheme();
  const media: Attachment | null = card.mediaId && card.mediaMessageId && card.mediaType && card.mediaUri ? { id: card.mediaId, messageId: card.mediaMessageId, type: card.mediaType, localUri: card.mediaUri, originalName: null, mimeType: card.mediaMimeType, size: card.mediaSize, duration: card.mediaDuration, width: card.mediaWidth, height: card.mediaHeight, createdAt: card.mediaCreatedAt ?? 0 } : null;
  const hasMetadata = Boolean(card.attachmentCount || card.messageCount > 1);
  const accessibleMetadata = [card.messageCount > 1 ? `${card.messageCount} thoughts` : null, card.attachmentCount ? `${card.attachmentCount} attachments` : null].filter(Boolean).join(', ');
  return <Pressable disabled={!interactive} accessibilityRole="button" accessibilityLabel={`Open ${card.title || card.preview || 'untitled thought'}${accessibleMetadata ? `, ${accessibleMetadata}` : ''}`} accessibilityHint="Opens card details" onPress={() => router.push(`/card/${card.id}`)} style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, dragging && styles.cardDragging, pressed && interactive && styles.cardPressed]}>
    {media ? <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.cardMedia, { borderBottomColor: theme.borderSubtle }]}><AttachmentContent attachment={media} variant="board" /></View> : null}
    <View style={styles.cardBody}>
      <View style={styles.cardTop}>
        <View style={styles.cardOpen}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.textPrimary }]}>{card.title || card.preview || 'Untitled thought'}</Text>
          {card.preview && card.preview !== card.title ? <Text numberOfLines={2} style={[styles.preview, { color: theme.textSecondary }]}>{card.preview}</Text> : null}
        </View>
        {interactive && translationY && onBeginDrag && onDragMove && onDragEnd && onDragCancel && onReorder ? <DragHandle index={index} total={total} translationY={translationY} onBegin={onBeginDrag} onMove={onDragMove} onEnd={onDragEnd} onCancel={onDragCancel} onReorder={onReorder} /> : <View style={styles.dragHandle}><DragDots /></View>}
      </View>

      {hasMetadata ? <View style={styles.meta}>
        {card.messageCount > 1 ? <View style={styles.metaItem}><Ionicons accessible={false} name="layers-outline" size={14} color={theme.textMuted} /><Text style={[styles.metaText, { color: theme.textMuted }]}>{card.messageCount} thoughts</Text></View> : null}
        {card.attachmentCount ? <View style={styles.metaItem}><Ionicons accessible={false} name="attach-outline" size={14} color={theme.textMuted} /><Text style={[styles.metaText, { color: theme.textMuted }]}>{card.attachmentCount} {card.attachmentCount === 1 ? 'attachment' : 'attachments'}</Text></View> : null}
      </View> : null}

      <View style={[styles.cardDivider, { backgroundColor: theme.borderSubtle }]} />
      <View style={styles.cardControls}>
        <Pressable disabled={!interactive} accessibilityRole="button" accessibilityLabel="Move to another column" onPress={(event) => { event.stopPropagation(); onOpenMove?.(); }} style={({ pressed }) => [styles.move, { backgroundColor: theme.surfaceElevated }, !interactive && styles.reorderButtonDisabled, pressed && styles.controlPressed]}><Ionicons accessible={false} name="swap-horizontal-outline" size={17} color={theme.accent} /><Text style={[styles.moveText, { color: theme.accent }]}>Move</Text></Pressable>
        <View style={[styles.reorderGroup, { backgroundColor: theme.surfaceElevated }]}>
          <Pressable disabled={!interactive || index === 0} accessibilityRole="button" accessibilityLabel="Move card up" accessibilityState={{ disabled: !interactive || index === 0 }} onPress={(event) => { event.stopPropagation(); onReorder?.(-1); }} style={({ pressed }) => [styles.reorderButton, (index === 0 || !interactive) && styles.reorderButtonDisabled, pressed && styles.reorderButtonPressed]}><Ionicons accessible={false} name="arrow-up-outline" size={17} color={theme.accent} /></Pressable>
          <View style={[styles.reorderDivider, { backgroundColor: theme.borderSubtle }]} />
          <Pressable disabled={!interactive || index === total - 1} accessibilityRole="button" accessibilityLabel="Move card down" accessibilityState={{ disabled: !interactive || index === total - 1 }} onPress={(event) => { event.stopPropagation(); onReorder?.(1); }} style={({ pressed }) => [styles.reorderButton, (index === total - 1 || !interactive) && styles.reorderButtonDisabled, pressed && styles.reorderButtonPressed]}><Ionicons accessible={false} name="arrow-down-outline" size={17} color={theme.accent} /></Pressable>
        </View>
      </View>
    </View>
  </Pressable>;
});

const BoardCardRow = memo(function BoardCardRow({ card, index, total, translationY, onBeginDrag, onDragMove, onDragEnd, onDragCancel, onOpenMove, onReorder }: { card: Card; index: number; total: number; translationY: SharedValue<number>; onBeginDrag: (card: Card, index: number) => void; onDragMove: (dx: number, dy: number, pageX: number, pageY: number) => void; onDragEnd: () => void; onDragCancel: () => void; onOpenMove: (card: Card) => void; onReorder: (card: Card, index: number, direction: -1 | 1) => void }) {
  const begin = useCallback(() => onBeginDrag(card, index), [card, index, onBeginDrag]);
  const openMove = useCallback(() => onOpenMove(card), [card, onOpenMove]);
  const moveEarlierOrLater = useCallback((direction: -1 | 1) => onReorder(card, index, direction), [card, index, onReorder]);
  return <CardSurface card={card} index={index} total={total} translationY={translationY} onBeginDrag={begin} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel} onOpenMove={openMove} onReorder={moveEarlierOrLater} />;
});

function reorder(items: Card[], from: number, to: number) { const next = [...items]; const [item] = next.splice(from, 1); next.splice(Math.max(0, Math.min(to, next.length)), 0, item); return next.map((card, position) => ({ ...card, position })); }

export default function BoardScreen() {
  const database = useSQLiteContext(); const { id } = useLocalSearchParams<{ id: string }>(); const repository = useMemo(() => createBoardRepository(database), [database]); const { tokens: theme } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const columnWidth = Math.min(520, Math.max(272, Math.round(screenWidth * (screenWidth < 390 ? 0.78 : 0.74))));
  const columnGap = spacing.sm;
  const columnInterval = columnWidth + columnGap;
  const carouselInset = Math.max(spacing.md, (screenWidth - columnWidth) / 2 - columnGap / 2);
  const [board, setBoard] = useState<Board | null | undefined>(); const [columns, setColumns] = useState<Column[]>([]); const [cards, setCards] = useState<Card[]>([]); const [columnIndex, setColumnIndex] = useState(0); const [moveCard, setMoveCard] = useState<Card | null>(null); const [settingsOpen, setSettingsOpen] = useState(false); const [renameOpen, setRenameOpen] = useState(false); const [error, setError] = useState<string | null>(null); const [drag, setDrag] = useState<DragState | null>(null); const [navigatorDockHeight, setNavigatorDockHeight] = useState(0); const [reduceMotion, setReduceMotion] = useState(false);
  const boardListRef = useRef<FlatList<Column>>(null); const scrollRef = useRef<ScrollView>(null); const scrollYRef = useRef(0); const viewportRef = useRef({ top: 0, height: 0 }); const layoutsRef = useRef<Record<string, LayoutRectangle>>({}); const placeholderYRef = useRef(0); const dragRef = useRef<DragState | null>(null); const lastDragDyRef = useRef(0);
  const gestureTranslationX = useSharedValue(0); const gestureTranslationY = useSharedValue(0); const scrollCompensation = useSharedValue(0); const liftProgress = useSharedValue(0);
  const animatedDragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: gestureTranslationX.get() }, { translateY: gestureTranslationY.get() + scrollCompensation.get() }, { scale: 1 + liftProgress.get() * 0.022 }] }));
  useEffect(() => { void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion); const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion); return () => subscription.remove(); }, []);
  const load = useCallback(async () => { if (!id) return; const [nextBoard, nextColumns, nextCards] = await Promise.all([repository.getById(id), repository.listColumns(id), repository.listKanbanCards(id)]); setBoard(nextBoard); setColumns(nextColumns); setCards(nextCards); setColumnIndex((current) => Math.min(current, Math.max(nextColumns.length - 1, 0))); if (nextBoard) void repository.markOpened('board', id); }, [id, repository]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const currentColumn = columns[columnIndex];
  const currentCards = useMemo(() => currentColumn ? cards.filter((card) => card.columnId === currentColumn.id).sort((a, b) => a.position - b.position) : [], [cards, currentColumn]);
  const goToColumn = useCallback((nextIndex: number) => { const bounded = Math.max(0, Math.min(columns.length - 1, nextIndex)); if (drag) return; boardListRef.current?.scrollToOffset({ offset: bounded * columnInterval, animated: bounded !== columnIndex }); if (bounded === columnIndex) return; setColumnIndex(bounded); void Haptics.selectionAsync(); }, [columnIndex, columnInterval, columns.length, drag]);
  const settleColumn = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => { const nextIndex = Math.max(0, Math.min(columns.length - 1, Math.round(event.nativeEvent.contentOffset.x / columnInterval))); if (nextIndex === columnIndex) return; setColumnIndex(nextIndex); void Haptics.selectionAsync(); }, [columnIndex, columnInterval, columns.length]);
  const configureReorderAnimation = useCallback(() => { if (!reduceMotion) LayoutAnimation.configureNext({ duration: 150, update: { type: LayoutAnimation.Types.easeInEaseOut }, create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity }, delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity } }); }, [reduceMotion]);
  const beginDrag = useCallback((card: Card, index: number) => { const layout = layoutsRef.current[card.id]; if (!layout || dragRef.current || !currentColumn) return; const next = { card, sourceColumnId: currentColumn.id, destinationColumnId: currentColumn.id, fromIndex: index, toIndex: index, height: layout.height, startY: layout.y, overlayTop: 76 + layout.y - scrollYRef.current, startScrollY: scrollYRef.current, horizontalConsumed: false }; gestureTranslationX.set(0); gestureTranslationY.set(0); scrollCompensation.set(0); liftProgress.set(reduceMotion ? 0 : withSpring(1, { damping: 20, stiffness: 260, mass: 0.7 })); dragRef.current = next; setDrag(next); setError(null); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }, [currentColumn, gestureTranslationX, gestureTranslationY, liftProgress, reduceMotion, scrollCompensation]);
  const evaluateTarget = useCallback((dy: number) => { const active = dragRef.current; if (!active || active.destinationColumnId !== active.sourceColumnId) return; const contentCenter = active.startY + active.height / 2 + dy + scrollYRef.current - active.startScrollY; const others = currentCards.filter((card) => card.id !== active.card.id); let nextIndex = 0; for (const card of others) { const layout = layoutsRef.current[card.id]; if (layout && contentCenter > layout.y + layout.height / 2) nextIndex += 1; } nextIndex = Math.max(0, Math.min(others.length, nextIndex)); if (nextIndex === active.toIndex) return; configureReorderAnimation(); const next = { ...active, toIndex: nextIndex }; dragRef.current = next; setDrag(next); void Haptics.selectionAsync(); }, [configureReorderAnimation, currentCards]);
  const moveDrag = useCallback((dx: number, dy: number, _pageX: number, pageY: number) => { const active = dragRef.current; if (!active) return; gestureTranslationX.set(dx); lastDragDyRef.current = dy; if (!active.horizontalConsumed && Math.abs(dx) > Math.min(112, columnWidth * 0.32)) { const sourceIndex = columns.findIndex((column) => column.id === active.sourceColumnId); const destinationIndex = sourceIndex + (dx > 0 ? 1 : -1); const destination = columns[destinationIndex]; if (destination) { const next = { ...active, destinationColumnId: destination.id, toIndex: 0, horizontalConsumed: true }; dragRef.current = next; setDrag(next); void Haptics.selectionAsync(); } }
    const viewport = viewportRef.current; const edge = 72; let scrollDelta = 0; if (pageY < viewport.top + edge) scrollDelta = -Math.ceil(10 * (1 - Math.max(0, pageY - viewport.top) / edge)); if (pageY > viewport.top + viewport.height - edge) scrollDelta = Math.ceil(10 * (1 - Math.max(0, viewport.top + viewport.height - pageY) / edge)); if (scrollDelta) scrollRef.current?.scrollTo({ y: Math.max(0, scrollYRef.current + scrollDelta), animated: false }); evaluateTarget(dy); }, [columnWidth, columns, evaluateTarget, gestureTranslationX]);
  const clearDrag = useCallback(() => { dragRef.current = null; setDrag(null); lastDragDyRef.current = 0; gestureTranslationX.set(0); gestureTranslationY.set(0); scrollCompensation.set(0); liftProgress.set(0); }, [gestureTranslationX, gestureTranslationY, liftProgress, scrollCompensation]);
  const finalizeDrag = useCallback(async (cancelled: boolean, targetIndex: number) => { const active = dragRef.current; if (!active) { clearDrag(); return; } if (cancelled || (active.destinationColumnId === active.sourceColumnId && targetIndex === active.fromIndex)) { clearDrag(); return; } const previousCards = cards; if (active.destinationColumnId !== active.sourceColumnId) {
      const destinationCards = cards.filter((card) => card.columnId === active.destinationColumnId && card.id !== active.card.id).sort((a, b) => a.position - b.position);
      const inserted = [...destinationCards]; inserted.splice(Math.max(0, Math.min(targetIndex, inserted.length)), 0, { ...active.card, columnId: active.destinationColumnId });
      const normalizedDestination = inserted.map((card, position) => ({ ...card, position }));
      setCards((all) => [...all.filter((card) => card.columnId !== active.sourceColumnId && card.columnId !== active.destinationColumnId), ...all.filter((card) => card.columnId === active.sourceColumnId && card.id !== active.card.id).sort((a, b) => a.position - b.position).map((card, position) => ({ ...card, position })), ...normalizedDestination]);
      const destinationColumnIndex = columns.findIndex((column) => column.id === active.destinationColumnId);
      setColumnIndex(destinationColumnIndex);
      boardListRef.current?.scrollToOffset({ offset: destinationColumnIndex * columnInterval, animated: true });
      configureReorderAnimation();
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
    const ordered = reorder(sourceCards, active.fromIndex, targetIndex); setCards((all) => [...all.filter((card) => card.columnId !== active.sourceColumnId), ...ordered]); clearDrag(); try { await repository.moveCard(active.card.id, active.sourceColumnId, targetIndex); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { setCards(previousCards); setError('Chits could not save that card position. Try again.'); } }, [cards, clearDrag, columnInterval, columns, configureReorderAnimation, gestureTranslationX, gestureTranslationY, liftProgress, reduceMotion, repository]);
  const settleDrag = useCallback((cancelled: boolean) => { const active = dragRef.current; if (!active) return; const targetIndex = cancelled ? active.fromIndex : active.toIndex; if (active.destinationColumnId !== active.sourceColumnId && !cancelled) { void finalizeDrag(false, targetIndex); return; } if (cancelled && active.toIndex !== active.fromIndex) { configureReorderAnimation(); const next = { ...active, destinationColumnId: active.sourceColumnId, toIndex: active.fromIndex }; dragRef.current = next; setDrag(next); } requestAnimationFrame(() => { const targetY = cancelled ? active.startY : (placeholderYRef.current || active.startY); const destination = targetY - active.startY - scrollCompensation.get(); liftProgress.set(withSpring(0, { damping: 22, stiffness: 280 })); gestureTranslationX.set(withSpring(0, { damping: 22, stiffness: 280 })); if (reduceMotion) { gestureTranslationY.set(destination); void finalizeDrag(cancelled, targetIndex); return; } gestureTranslationY.set(withSpring(destination, { damping: 22, stiffness: 280, mass: 0.72 }, (finished) => { if (finished) runOnJS(finalizeDrag)(cancelled, targetIndex); })); }); }, [configureReorderAnimation, finalizeDrag, gestureTranslationX, gestureTranslationY, liftProgress, reduceMotion, scrollCompensation]);
  const reorderAccessible = useCallback(async (card: Card, index: number, direction: -1 | 1) => { if (!currentColumn) return; const target = index + direction; if (target < 0 || target >= currentCards.length) { await AccessibilityInfo.announceForAccessibility('Card cannot move further.'); return; } const previousCards = cards; const ordered = reorder(currentCards, index, target); configureReorderAnimation(); setCards((all) => [...all.filter((item) => item.columnId !== currentColumn.id), ...ordered]); try { await repository.moveCard(card.id, currentColumn.id, target); await Haptics.selectionAsync(); await AccessibilityInfo.announceForAccessibility(`Moved to position ${target + 1} of ${ordered.length}.`); } catch { setCards(previousCards); setError('Chits could not save that card position. Try again.'); } }, [cards, configureReorderAnimation, currentCards, currentColumn, repository]);
  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => { scrollYRef.current = event.nativeEvent.contentOffset.y; const active = dragRef.current; if (!active) return; scrollCompensation.set(scrollYRef.current - active.startScrollY); evaluateTarget(lastDragDyRef.current); }, [evaluateTarget, scrollCompensation]);
  const finishDrag = useCallback(() => settleDrag(false), [settleDrag]);
  const cancelDrag = useCallback(() => settleDrag(true), [settleDrag]);
  const openCardMove = useCallback((card: Card) => setMoveCard(card), []);
  const reorderCard = useCallback((card: Card, index: number, direction: -1 | 1) => { void reorderAccessible(card, index, direction); }, [reorderAccessible]);
  const move = async (destination: Column) => { if (!moveCard) return; const previousCards = cards; const destinationCards = cards.filter((card) => card.columnId === destination.id && card.id !== moveCard.id); const destinationIndex = destinationCards.length; const movedCard = { ...moveCard, columnId: destination.id, position: destinationIndex }; setCards((current) => [...current.filter((card) => card.id !== moveCard.id), movedCard]); setMoveCard(null); const nextColumnIndex = columns.findIndex((column) => column.id === destination.id); setColumnIndex(nextColumnIndex); requestAnimationFrame(() => boardListRef.current?.scrollToOffset({ offset: nextColumnIndex * columnInterval, animated: true })); try { await repository.moveCard(moveCard.id, destination.id, destinationIndex); await Haptics.selectionAsync(); } catch (cause) { setCards(previousCards); setError(cause instanceof Error ? cause.message : 'Chits could not move that card.'); } };
  const addColumn = async (name: string) => { if (!id) throw new Error('This board is no longer available.'); await repository.addColumn(id, name.trim()); await load(); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
  const renameBoard = async (name: string) => { if (!board) throw new Error('This board is no longer available.'); const previousBoard = board; const nextName = name.trim(); setBoard({ ...board, name: nextName, updatedAt: Date.now() }); try { await repository.renameBoard(board.id, nextName); await Haptics.selectionAsync(); } catch (cause) { setBoard(previousBoard); throw cause; } };
  const renameColumn = async (name: string) => { if (!currentColumn) throw new Error('That column is no longer available.'); await repository.renameColumn(currentColumn.id, name.trim()); setColumns((current) => current.map((column) => column.id === currentColumn.id ? { ...column, name: name.trim() } : column)); await Haptics.selectionAsync(); };
  const deleteColumn = async (destinationColumnId?: string) => { if (!currentColumn) throw new Error('That column is no longer available.'); await repository.deleteColumn(currentColumn.id, destinationColumnId); await load(); await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };
  const getDeleteCardCount = async () => { if (!currentColumn) throw new Error('That column is no longer available.'); return repository.getColumnCardCount(currentColumn.id); };
  const reorderColumn = async (direction: -1 | 1) => { const next = columnIndex + direction; if (next < 0 || next >= columns.length || !id) return; const previousColumns = columns; const reordered = [...columns]; [reordered[columnIndex], reordered[next]] = [reordered[next], reordered[columnIndex]]; setColumns(reordered); setColumnIndex(next); try { await repository.reorderColumns(id, reordered.map((column) => column.id)); await Haptics.selectionAsync(); } catch (cause) { setColumns(previousColumns); setColumnIndex(columnIndex); throw cause; } };
  if (board === undefined) return <Screen><Text style={[styles.loading, { color: theme.textSecondary }]}>Loading board…</Text></Screen>;
  if (!board) return <Screen><AppHeader title="Board" leading={<IconButton label="Go back" onPress={() => router.back()}><Text style={[styles.back, { color: theme.textPrimary }]}>‹</Text></IconButton>} /><EmptyState title="Board unavailable" description="It may have been archived." /></Screen>;
  const metadata = `${columnIndex + 1} of ${columns.length} columns · ${currentCards.length} ${currentCards.length === 1 ? 'card' : 'cards'}`;
  const reservedNavigatorHeight = board.showColumnNavigator ? navigatorDockHeight : 0;
  const addButtonBottom = board.showColumnNavigator && navigatorDockHeight
    ? navigatorDockHeight - spacing.md
    : spacing.md;
  const displayCards = drag ? currentCards.filter((card) => card.id !== drag.card.id) : currentCards;
  const placeholderIndex = drag && currentColumn?.id === drag.destinationColumnId ? drag.toIndex : drag?.fromIndex;
  const cardRows: ReactNode[] = [];
  for (const card of displayCards) {
    const originalIndex = currentCards.findIndex((item) => item.id === card.id);
    const displayIndex = drag && originalIndex > drag.fromIndex ? originalIndex - 1 : originalIndex;
    if (drag && displayIndex === placeholderIndex) cardRows.push(<View key={`placeholder:${drag.card.id}`} onLayout={(event) => { placeholderYRef.current = event.nativeEvent.layout.y; }} style={[styles.placeholder, { height: drag.height, borderColor: theme.accentBorder, backgroundColor: theme.accentSoft }]} />);
    cardRows.push(<View key={`card:${card.id}`} onLayout={(event) => { layoutsRef.current[card.id] = event.nativeEvent.layout; }}><BoardCardRow card={card} index={originalIndex} total={currentCards.length} translationY={gestureTranslationY} onBeginDrag={beginDrag} onDragMove={moveDrag} onDragEnd={finishDrag} onDragCancel={cancelDrag} onOpenMove={openCardMove} onReorder={reorderCard} /></View>);
  }
  if (drag && placeholderIndex === displayCards.length) cardRows.push(<View key={`placeholder:${drag.card.id}`} onLayout={(event) => { placeholderYRef.current = event.nativeEvent.layout.y; }} style={[styles.placeholder, { height: drag.height, borderColor: theme.accentBorder, backgroundColor: theme.accentSoft }]} />);
  if (drag && currentColumn?.id === drag.sourceColumnId) cardRows.push(<View key={`card:${drag.card.id}`} style={[styles.responderKeeper, { top: drag.startY }]}><BoardCardRow card={drag.card} index={drag.fromIndex} total={currentCards.length} translationY={gestureTranslationY} onBeginDrag={beginDrag} onDragMove={moveDrag} onDragEnd={finishDrag} onDragCancel={cancelDrag} onOpenMove={openCardMove} onReorder={reorderCard} /></View>);
  return <Screen><View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => router.back()} style={({ pressed }) => [styles.headerButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="chevron-back" size={24} color={theme.textPrimary} /></Pressable>
      <View style={styles.headerCopy}><Text numberOfLines={1} accessibilityRole="header" style={[styles.boardTitle, { color: theme.textPrimary }]}>{board.name}</Text><Text numberOfLines={1} style={[styles.boardSubtitle, { color: theme.textSecondary }]}>{metadata}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Search" onPress={() => router.push('/search')} style={({ pressed }) => [styles.headerButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="search-outline" size={21} color={theme.textPrimary} /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Rename board" onPress={() => setRenameOpen(true)} style={({ pressed }) => [styles.headerButton, { backgroundColor: theme.surfaceElevated }, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="pencil-outline" size={21} color={theme.textPrimary} /></Pressable>
    </View>
    <View style={styles.pager} accessibilityLabel={`${board.name} board. Column ${columnIndex + 1} of ${columns.length}. ${currentCards.length} ${currentCards.length === 1 ? 'card' : 'cards'}.`}>{columns.length ? <View style={styles.carousel} onLayout={(event) => { const height = event.nativeEvent.layout.height; event.currentTarget.measureInWindow((_, y) => { viewportRef.current = { top: y, height }; }); }}>
      <FlatList
        ref={boardListRef}
        horizontal
        data={columns}
        keyExtractor={(column) => column.id}
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToInterval={columnInterval}
        snapToAlignment="start"
        scrollEnabled={!drag}
        onMomentumScrollEnd={settleColumn}
        getItemLayout={(_, index) => ({ length: columnInterval, offset: columnInterval * index, index })}
        contentContainerStyle={[styles.boardTrack, { paddingHorizontal: carouselInset, paddingBottom: reservedNavigatorHeight ? spacing.sm : spacing.md }]}
        renderItem={({ item: column, index }) => {
          const active = index === columnIndex;
          const dropTarget = Boolean(drag && drag.destinationColumnId === column.id && drag.destinationColumnId !== drag.sourceColumnId);
          const laneCards = cards.filter((card) => card.columnId === column.id).sort((a, b) => a.position - b.position);
          return <View style={[styles.columnFrame, { width: columnWidth, marginHorizontal: columnGap / 2, backgroundColor: theme.accentSoft, borderColor: active || dropTarget ? theme.accentBorder : theme.borderSubtle }, active && styles.activeColumn, dropTarget && styles.dropTargetColumn]}>
            <View style={styles.columnHeader}>
              <View style={[styles.columnIcon, { backgroundColor: theme.surface }]}><Ionicons accessible={false} name="albums-outline" size={19} color={theme.accent} /></View>
              <View style={styles.columnHeaderCopy}><Text numberOfLines={1} style={[styles.columnTitle, { color: theme.textPrimary }]}>{column.name}</Text><Text style={[styles.columnCount, { color: theme.textSecondary }]}>{laneCards.length} {laneCards.length === 1 ? 'card' : 'cards'}</Text></View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Manage ${column.name} column`} onPress={() => { if (!active) goToColumn(index); setSettingsOpen(true); }} style={({ pressed }) => [styles.columnMenu, pressed && styles.headerButtonPressed]}><Ionicons accessible={false} name="ellipsis-horizontal" size={20} color={theme.textSecondary} /></Pressable>
            </View>
            {active ? <ScrollView ref={scrollRef} style={styles.activeLane} contentContainerStyle={[styles.cards, { paddingBottom: reservedNavigatorHeight ? reservedNavigatorHeight + spacing.md : spacing.lg }]} scrollEventThrottle={16} onScroll={handleScroll} showsVerticalScrollIndicator={false}>{laneCards.length ? <View style={styles.cardList}>
              {cardRows}
            </View> : <Pressable accessibilityRole="button" accessibilityLabel={`Add a card to ${column.name}`} onPress={() => router.push('/unorganized')} style={({ pressed }) => [styles.emptyDrop, { borderColor: theme.accentBorder, backgroundColor: theme.surface }, pressed && styles.emptyDropPressed]}><View style={[styles.emptyIcon, { backgroundColor: theme.surfaceElevated }]}><Ionicons accessible={false} name="add" size={24} color={theme.textMuted} /></View><Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>Add a card</Text><Text style={[styles.emptyCopy, { color: theme.textSecondary }]}>Drag a card here or tap to add</Text></Pressable>}</ScrollView> : <View pointerEvents="none" style={styles.neighborCards}>{laneCards.slice(0, 3).map((card) => <View key={card.id} style={[styles.neighborCard, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}><Text numberOfLines={2} style={[styles.neighborCardTitle, { color: theme.textPrimary }]}>{card.title || card.preview || 'Untitled thought'}</Text></View>)}{!laneCards.length ? <View style={[styles.neighborEmpty, { borderColor: theme.accentBorder }]}><Ionicons accessible={false} name="add" size={20} color={theme.textMuted} /><Text style={[styles.neighborEmptyText, { color: theme.textMuted }]}>Add a card</Text></View> : null}</View>}
          </View>;
        }}
      />
      {drag ? <Animated.View pointerEvents="none" style={[styles.dragLayer, { top: drag.overlayTop, left: (screenWidth - columnWidth) / 2 + spacing.md, width: columnWidth - spacing.xl }, animatedDragStyle]}><CardSurface card={drag.card} index={drag.fromIndex} total={Math.max(1, currentCards.length)} dragging interactive={false} /></Animated.View> : null}
      {board.showColumnNavigator ? <View onLayout={(event) => setNavigatorDockHeight(Math.ceil(event.nativeEvent.layout.height))} style={styles.navigatorDock}><ColumnNavigator columns={columns} cards={cards} columnIndex={columnIndex} reduceMotion={reduceMotion} onSelect={goToColumn} /></View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Add from Unorganized" accessibilityHint="Opens unorganized thoughts to add to this board" onPress={() => router.push('/unorganized')} style={({ pressed }) => [styles.add, { bottom: addButtonBottom, backgroundColor: theme.accent }, pressed && styles.addPressed]}><Ionicons accessible={false} name="add-outline" size={28} color={theme.accentText} /></Pressable>
    </View> : <EmptyState title="Start with a column" description="Add a column to give this board a place for cards." />}</View>{error ? <Text accessibilityRole="alert" style={[styles.error, { backgroundColor: theme.danger }]}>{error}</Text> : null}
    <Modal visible={!!moveCard} transparent animationType="fade" onRequestClose={() => setMoveCard(null)}><View style={styles.backdrop}><Pressable style={StyleSheet.absoluteFill} onPress={() => setMoveCard(null)} /><View style={[styles.modal, { backgroundColor: theme.surface }]}><Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Move to…</Text><Text style={[styles.modalCopy, { color: theme.textSecondary }]}>Choose a destination column.</Text>{columns.map((column) => <Pressable key={column.id} onPress={() => void move(column)} style={[styles.option, { borderTopColor: theme.borderSubtle }]}><Text style={[styles.optionText, { color: theme.textPrimary }]}>{column.name}</Text><Text style={[styles.optionArrow, { color: theme.textMuted }]}>›</Text></Pressable>)}</View></View></Modal>
    <ColumnManagementSheet visible={settingsOpen} columns={columns} currentIndex={columnIndex} onClose={() => setSettingsOpen(false)} onRename={renameColumn} onMove={reorderColumn} onAdd={addColumn} onGetDeleteCardCount={getDeleteCardCount} onDelete={deleteColumn} />
    <RenameBoardSheet visible={renameOpen} boardName={board.name} onClose={() => setRenameOpen(false)} onSave={renameBoard} />
  </Screen>;
}

const styles = StyleSheet.create({
  loading: { flex: 1, textAlign: 'center', textAlignVertical: 'center' }, back: { fontSize: 30, lineHeight: 30 },
  header: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  headerCopy: { flex: 1, minWidth: 0, paddingHorizontal: spacing.xxs }, boardTitle: { fontSize: 23, lineHeight: 28, fontWeight: '800' }, boardSubtitle: { marginTop: 2, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  headerButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 23 }, headerButtonPressed: { opacity: 0.58, transform: [{ scale: 0.96 }] },
  pager: { flex: 1 }, carousel: { flex: 1 }, boardTrack: { flexGrow: 1, alignItems: 'stretch', paddingTop: spacing.xs },
  columnFrame: { flex: 1, overflow: 'hidden', borderRadius: 26, borderWidth: StyleSheet.hairlineWidth }, activeColumn: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 2 }, dropTargetColumn: { borderWidth: 2 },
  columnHeader: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm }, columnIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, columnHeaderCopy: { flex: 1, minWidth: 0 }, columnTitle: { fontSize: 20, lineHeight: 25, fontWeight: '800' }, columnCount: { marginTop: 2, fontSize: 13, lineHeight: 17, fontWeight: '500' }, columnMenu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  activeLane: { flex: 1 }, cards: { flexGrow: 1, paddingHorizontal: spacing.md, paddingBottom: spacing.lg }, cardList: { position: 'relative', gap: spacing.sm },
  emptyDrop: { minHeight: 320, alignItems: 'center', justifyContent: 'center', marginHorizontal: spacing.md, marginBottom: spacing.lg, padding: spacing.lg, borderWidth: 1, borderStyle: 'dashed', borderRadius: 22 }, emptyDropPressed: { opacity: 0.7 }, emptyIcon: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 26, marginBottom: spacing.sm }, emptyTitle: { fontSize: 17, fontWeight: '700' }, emptyCopy: { marginTop: spacing.xs, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  neighborCards: { flex: 1, gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.lg }, neighborCard: { minHeight: 112, justifyContent: 'center', padding: spacing.md, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth }, neighborCardTitle: { fontSize: 17, lineHeight: 23, fontWeight: '700' }, neighborEmpty: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: 1, borderStyle: 'dashed', borderRadius: 22 }, neighborEmptyText: { fontSize: 14, fontWeight: '600' },
  navigatorDock: { position: 'absolute', right: 0, bottom: 0, left: 0, zIndex: 10, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.sm }, navigatorSurface: { borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 4 }, navigator: { height: 44 }, navigatorContent: { position: 'relative', minHeight: 44, paddingHorizontal: spacing.md, alignItems: 'center', gap: spacing.xs }, navigatorIndicator: { position: 'absolute', bottom: 2, left: 0, width: 24, height: 2, borderRadius: 1 }, navigatorItem: { maxWidth: 176, minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm }, navigatorItemPressed: { opacity: 0.58 }, navigatorNameFrame: { maxWidth: 152, minHeight: 20, justifyContent: 'center' }, navigatorName: { maxWidth: 152, flexShrink: 1, fontSize: 14, lineHeight: 20 }, navigatorNameMeasure: { opacity: 0, fontWeight: '800' }, navigatorNameVisible: { position: 'absolute', right: 0, left: 0, fontWeight: '500', textAlign: 'center' }, navigatorNameSelected: { fontWeight: '800' }, navigatorPosition: { height: 16, fontSize: 10, lineHeight: 13, fontWeight: '600', textAlign: 'center', letterSpacing: 0.2 },
  card: { overflow: 'hidden', borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 }, cardMedia: { width: '100%', borderBottomWidth: StyleSheet.hairlineWidth }, cardBody: { padding: 20, gap: spacing.md }, cardPressed: { opacity: 0.78 }, cardDragging: { zIndex: 30, elevation: 12, shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 7 } }, cardTop: { minHeight: 48, flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs }, cardOpen: { flex: 1, minWidth: 0, justifyContent: 'center' }, title: { fontSize: 20, fontWeight: '800', lineHeight: 26 }, dragHandle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -spacing.xs, marginRight: -spacing.xs }, dotGrid: { width: 14, height: 20, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', justifyContent: 'space-between', gap: 3 }, dot: { width: 4, height: 4, borderRadius: 2 }, preview: { marginTop: spacing.xs, fontSize: 15, lineHeight: 22 }, meta: { minHeight: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm }, metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 }, metaText: { fontSize: 11, lineHeight: 15, fontWeight: '600' }, cardDivider: { height: StyleSheet.hairlineWidth }, cardControls: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, move: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: spacing.sm, borderRadius: 12 }, moveText: { fontSize: 13, fontWeight: '700' }, reorderGroup: { height: 40, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', borderRadius: 12 }, reorderButton: { width: 42, height: 40, alignItems: 'center', justifyContent: 'center' }, reorderDivider: { width: StyleSheet.hairlineWidth, height: 20 }, reorderButtonDisabled: { opacity: 0.26 }, reorderButtonPressed: { opacity: 0.55 }, controlPressed: { opacity: 0.62 }, placeholder: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 22 }, responderKeeper: { position: 'absolute', right: 0, left: 0, opacity: 0, zIndex: -1 }, dragLayer: { position: 'absolute', zIndex: 50, elevation: 14 },
  add: { position: 'absolute', left: '50%', marginLeft: -30, width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 30, zIndex: 20, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, addPressed: { opacity: 0.76, transform: [{ scale: 0.96 }] }, error: { color: '#fff', textAlign: 'center', padding: spacing.sm }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.3)' }, modal: { padding: spacing.lg, borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: spacing.sm }, modalTitle: { fontSize: 20, fontWeight: '700' }, modalCopy: { marginBottom: spacing.sm }, option: { minHeight: 50, flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth }, optionText: { fontSize: 16, flex: 1 }, optionArrow: { fontSize: 25 },
});
