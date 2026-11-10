import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/ui/app-text';
import { PAPER_INK, PAPER_WHITE } from '@/components/desk/paper-desk';
import { useLocale } from '@/localization/provider';

const COPIES = 3;
const MIDDLE = Math.floor(COPIES / 2);
const modulo = (value: number, count: number) => { 'worklet'; return ((value % count) + count) % count; };
export type TimeWheelHandle = { capture: () => number };
type Props = {
  initialValue: number; first: number; count: number; rowHeight: number;
  label: string; family?: string; reduced: boolean; disabled: boolean;
  outerGesture: ReturnType<typeof Gesture.Native>; onSettle: () => void;
};

/** Bounded native wheels: three small cycles, with no nested VirtualizedList. */
export const ReminderTimeWheel = forwardRef<TimeWheelHandle, Props>(function ReminderTimeWheel({ initialValue, first, count, rowHeight, label, family, reduced, disabled, outerGesture, onSettle }, handle) {
  const locale = useLocale();
  const formatter = useMemo(() => new Intl.NumberFormat(locale, { minimumIntegerDigits: 2, useGrouping: false }), [locale]);
  const [initialIndex] = useState(() => MIDDLE * count + initialValue - first);
  const [initialOffset] = useState(() => ({ x: 0, y: initialIndex * rowHeight }));
  const [spoken, setSpoken] = useState(initialValue);
  const position = useSharedValue(initialIndex * rowHeight);
  const interacting = useSharedValue(false);
  const lastTick = useSharedValue(0);
  const list = useRef<ScrollView>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captured = useRef(false);
  const data = useMemo(() => Array.from({ length: count * COPIES }, (_, index) => index), [count]);
  const native = useMemo(() => Gesture.Native().disallowInterruption(true).blocksExternalGesture(outerGesture), [outerGesture]);
  const cancelPending = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; }, []);
  useEffect(() => cancelPending, [cancelPending]);
  const tick = useCallback(() => { void Haptics.selectionAsync().catch(() => undefined); }, []);
  const settle = useCallback((offset: number) => {
    cancelPending();
    if (captured.current) return;
    interacting.set(false);
    const index = Math.round(offset / rowHeight);
    const normalized = modulo(index, count);
    setSpoken(first + normalized);
    // Each cycle has identical neighbors. Recenter after leaving the middle
    // cycle; all rows are already mounted, so there is no windowing jump.
    if (index < count || index >= count * 2) {
      const centered = (MIDDLE * count + normalized) * rowHeight;
      position.set(centered);
      list.current?.scrollTo({ y: centered, animated: false });
    }
    onSettle();
  }, [cancelPending, count, first, interacting, onSettle, position, rowHeight]);
  const settleWithoutMomentum = useCallback(() => {
    cancelPending();
    timer.current = setTimeout(() => settle(position.get()), 120);
  }, [cancelPending, position, settle]);
  const scroll = useAnimatedScrollHandler({
    onBeginDrag: () => { interacting.set(true); runOnJS(cancelPending)(); },
    onScroll: event => position.set(event.contentOffset.y),
    onEndDrag: () => { runOnJS(settleWithoutMomentum)(); },
    onMomentumBegin: () => { interacting.set(true); runOnJS(cancelPending)(); },
    onMomentumEnd: event => { interacting.set(false); runOnJS(settle)(event.contentOffset.y); },
  });
  useAnimatedReaction(() => Math.round(position.get() / rowHeight), (index, previous) => {
    if (previous === null || index === previous || !interacting.get() || reduced) return;
    const now = Date.now();
    if (now - lastTick.get() >= 45) { lastTick.set(now); runOnJS(tick)(); }
  });
  // A font-size/orientation change preserves the current selection.
  const previousRow = useRef(rowHeight);
  useEffect(() => {
    if (previousRow.current === rowHeight) return;
    const index = Math.round(position.get() / previousRow.current);
    previousRow.current = rowHeight;
    const offset = (MIDDLE * count + modulo(index, count)) * rowHeight;
    position.set(offset);
    list.current?.scrollTo({ y: offset, animated: false });
  }, [count, position, rowHeight]);
  useImperativeHandle(handle, () => ({ capture: () => {
    cancelPending(); captured.current = true; interacting.set(false);
    const index = Math.round(position.get() / rowHeight);
    list.current?.scrollTo({ y: index * rowHeight, animated: false });
    return first + modulo(index, count);
  } }), [cancelPending, count, first, interacting, position, rowHeight]);
  const adjust = (delta: number) => {
    if (disabled) return;
    cancelPending();
    const next = Math.round(position.get() / rowHeight) + delta;
    const index = next < count || next >= count * 2 ? MIDDLE * count + modulo(next, count) : next;
    const offset = index * rowHeight;
    position.set(offset); list.current?.scrollTo({ y: offset, animated: !reduced && index === next });
    setSpoken(first + modulo(index, count));
    if (!reduced) tick();
    onSettle();
  };
  return <View accessible accessibilityRole="adjustable" accessibilityLabel={label}
    accessibilityState={{ disabled }} accessibilityValue={{ min: first, max: first + count - 1, now: spoken, text: formatter.format(spoken) }}
    accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
    onAccessibilityAction={event => adjust(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
    style={[styles.column, { height: rowHeight * 3 }]}>
    <View pointerEvents="none" style={[styles.highlight, { top: rowHeight + 4, height: rowHeight - 8 }]} />
    <GestureDetector gesture={native}>
      <Animated.ScrollView ref={list} contentOffset={initialOffset} style={{ height: rowHeight * 3 }}
        contentContainerStyle={{ paddingVertical: rowHeight }} onScroll={scroll} scrollEventThrottle={16}
        snapToInterval={rowHeight} decelerationRate="fast" bounces={false} overScrollMode="never"
        nestedScrollEnabled scrollEnabled={!disabled} showsVerticalScrollIndicator={false}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      >
        {data.map(index => <WheelNumber key={index} index={index} rowHeight={rowHeight} position={position} family={family} reduced={reduced} text={formatter.format(first + modulo(index, count))} />)}
      </Animated.ScrollView>
    </GestureDetector>
  </View>;
});

const WheelNumber = memo(function WheelNumber({ index, rowHeight, position, family, reduced, text }: { index: number; rowHeight: number; position: SharedValue<number>; family?: string; reduced: boolean; text: string }) {
  const focus = useAnimatedStyle(() => {
    const distance = Math.min(2, Math.abs(position.get() / rowHeight - index));
    return { opacity: Math.max(0.08, 1 - distance * 0.65), transform: [{ scale: reduced ? 1 : 1 - Math.min(1, distance) * 0.22 }] };
  });
  return <Animated.View accessible={false} style={[styles.number, { height: rowHeight }, focus]}>
    <AppText accessible={false} family={family} maxFontSizeMultiplier={1.4} style={styles.digits}>{text}</AppText>
  </Animated.View>;
});
const styles = StyleSheet.create({
  column: { flex: 1, minWidth: 0, backgroundColor: PAPER_WHITE, borderRadius: 25, overflow: 'hidden' },
  highlight: { position: 'absolute', left: 7, right: 7, borderRadius: 22, backgroundColor: '#FFEBA4' },
  number: { alignItems: 'center', justifyContent: 'center' },
  digits: { color: PAPER_INK, fontSize: 42, lineHeight: 48, fontVariant: ['tabular-nums'], textAlign: 'center' },
});
