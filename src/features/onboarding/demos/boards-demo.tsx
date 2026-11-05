import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ScrollView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';

import { PAPER_INK, PAPERS, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/constants/theme';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { ot, type OnboardingStringKey } from '../strings';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import { DemoReset, type DemoProps } from './demo-kit';
import { DEMO_CARDS, DEMO_COLUMNS, demoCardRow, demoColumnAt, demoVisualColumn, moveDemoCard, type DemoCard, type DemoCardId } from './demo-state';

const GAP = 6;
const COLUMN_HEADER = 30;
const SMALLEST_CARD = 42;
const TALLEST_CARD = 76;
/** The line under the board, which holds Try again. */
const BELOW_BOARD = 44;
/** The board's own hold is 320ms; a little quicker here, where a first try should just work. */
const HOLD_MS = 240;
const LIFT = { damping: 20, stiffness: 320, mass: 0.6 };
const SETTLE = { damping: 22, stiffness: 240, mass: 0.7 };
const CARD_NAMES: Record<DemoCardId, OnboardingStringKey> = { trip: 'tour.boards.card.trip', paint: 'tour.boards.card.paint', dentist: 'tour.boards.card.dentist' };
const CARD_PAPERS: Record<DemoCardId, string> = { trip: PAPERS[0], paint: PAPERS[1], dentist: PAPERS[2] };

/** A gesture relation only needs the ref itself, and reads it natively when it's needed. */
function asGestureRef(ref: RefObject<unknown>): any {
  return ref;
}

const columnNames = () => [ot('tour.boards.todo'), ot('tour.boards.doing'), tr('plan.doneSection')];

/**
 * A small working board. Cards are placed by number rather than by layout, so a
 * drop can spring from the finger to its slot while the others close the gap.
 * The drag runs on the UI thread; JavaScript only hears about the lift and the drop.
 */
export function BoardsDemo({ surfaces, active, mascot, scrollRef }: DemoProps & { /** The step's scroll view, which must wait for the hold on iOS. */ scrollRef: RefObject<ScrollView | null> }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { isRTL, rowStyle } = useDirection();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const [cards, setCards] = useState<readonly DemoCard[]>(DEMO_CARDS);
  const [touched, setTouched] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const hover = useSharedValue(-1);
  const moved = cards !== DEMO_CARDS;
  const names = columnNames();
  const columnWidth = size ? (size.width - GAP * (DEMO_COLUMNS - 1)) / DEMO_COLUMNS : 0;
  // Three cards' worth of column, however tall the screen: a long empty column says nothing.
  const cardHeight = size ? Math.min(TALLEST_CARD, Math.max(SMALLEST_CARD, (size.height - BELOW_BOARD - spacing.xxs - COLUMN_HEADER - GAP * DEMO_COLUMNS) / DEMO_COLUMNS)) : 0;
  const boardHeight = COLUMN_HEADER + (cardHeight + GAP) * DEMO_COLUMNS;

  const lift = useCallback(() => {
    setTouched(true);
    mascot.watch();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [mascot]);
  const crossed = useCallback(() => { void Haptics.selectionAsync().catch(() => undefined); }, []);
  const drop = useCallback((id: DemoCardId, column: number) => {
    const next = moveDemoCard(cards, id, column);
    if (next === cards) { mascot.rest(); return; }
    setCards(next);
    mascot.cheer(ot('tour.boards.say.moved'));
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    AccessibilityInfo.announceForAccessibility(ot('tour.boards.movedTo', { column: columnNames()[column] }));
  }, [cards, mascot]);
  const reset = () => { setCards(DEMO_CARDS); setTouched(false); mascot.rest(); };

  return <View style={styles.root} onLayout={({ nativeEvent: { layout: frame } }) => setSize((current) => (current?.width === frame.width && current.height === frame.height ? current : { width: frame.width, height: frame.height }))}>
    <View style={{ height: boardHeight }}>
      {size ? names.map((name, column) => <DemoColumn
        key={column}
        column={column}
        hover={hover}
        name={name}
        left={demoVisualColumn(column, isRTL) * (columnWidth + GAP)}
        width={columnWidth}
        height={boardHeight}
        fill={surfaces.control}
        accent={surfaces.action}
        ink={surfaces.ink}
        radius={styleTokens.button.radius}
        family={fonts.textBold}
      />) : null}
      {size ? cards.map((card) => <DemoBoardCard
        key={card.id}
        id={card.id}
        column={card.column}
        columnNames={names}
        left={demoVisualColumn(card.column, isRTL) * (columnWidth + GAP)}
        top={COLUMN_HEADER + demoCardRow(cards, card.id) * (cardHeight + GAP)}
        width={columnWidth}
        height={cardHeight}
        boardHeight={boardHeight}
        columnWidth={columnWidth}
        rtl={isRTL}
        hover={hover}
        nudge={active && !touched && card.id === 'trip'}
        family={fonts.textBold}
        radius={styleTokens.button.radius}
        scrollRef={scrollRef}
        onLift={lift}
        onCross={crossed}
        onDrop={drop}
      />) : null}
    </View>
    <View style={[styles.below, rowStyle]}>
      <AppText family={fonts.text} style={[styles.hint, { color: surfaces.inkMuted, textAlign: isRTL ? 'right' : 'left' }]}>{ot(moved ? 'tour.boards.moved' : 'tour.boards.hint')}</AppText>
      {moved ? <DemoReset label={ot('tour.tryAgain')} surfaces={surfaces} onPress={reset} /> : null}
    </View>
  </View>;
}

type ColumnProps = { column: number; hover: SharedValue<number>; name: string; left: number; width: number; height: number; fill: string; accent: string; ink: string; radius: number; family: string | undefined };

/** A column, which lights up while a card is over it. */
const DemoColumn = memo(function DemoColumn({ column, hover, name, left, width, height, fill, accent, ink, radius, family }: ColumnProps) {
  const glow = useAnimatedStyle(() => ({ opacity: hover.get() === column ? 0.16 : 0 }));
  return <View style={[styles.column, { left, width, height, backgroundColor: fill, borderRadius: radius }]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: accent, borderRadius: radius }, glow]} />
    <AppText accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2} weight="700" family={family} style={[styles.columnName, { color: ink }]}>{name}</AppText>
  </View>;
});

type CardProps = {
  id: DemoCardId; column: number; columnNames: string[]; left: number; top: number; width: number; height: number;
  boardHeight: number; columnWidth: number; rtl: boolean; hover: SharedValue<number>; nudge: boolean; family: string | undefined; radius: number;
  scrollRef: RefObject<ScrollView | null>;
  onLift: () => void; onCross: () => void; onDrop: (id: DemoCardId, column: number) => void;
};

function DemoBoardCard({ id, column, columnNames: names, left, top, width, height, boardHeight, columnWidth, rtl, hover, nudge, family, radius, scrollRef, onLift, onCross, onDrop }: CardProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const reduced = useReducedMotion();
  const x = useSharedValue(left);
  const y = useSharedValue(top);
  const raised = useSharedValue(0);
  const dragging = useSharedValue(false);

  // Its slot changed: a drop, the card above it leaving, or a new screen size.
  useEffect(() => {
    x.set(reduced ? left : withSpring(left, SETTLE));
    y.set(reduced ? top : withSpring(top, SETTLE));
  }, [left, reduced, top, x, y]);

  // Once, before anyone has touched the board: this one wants to be picked up.
  useEffect(() => {
    if (!nudge || reduced) return;
    x.set(withDelay(900, withSequence(withTiming(left + 12, { duration: 260 }), withTiming(left, { duration: 300 }))));
    raised.set(withDelay(900, withSequence(withTiming(0.7, { duration: 260 }), withTiming(0, { duration: 300 }))));
    return () => { cancelAnimation(raised); raised.set(0); x.set(left); };
  }, [left, nudge, raised, reduced, x]);

  const gesture = useMemo(() => {
    const maxLeft = (columnWidth + GAP) * (DEMO_COLUMNS - 1);
    const maxTop = boardHeight - height;
    // The hold must stay still and short: see the card gesture on the board screen.
    return Gesture.Pan().activateAfterLongPress(HOLD_MS).failOffsetX([-10, 10]).failOffsetY([-10, 10]).blocksExternalGesture(asGestureRef(scrollRef))
      .onStart(() => {
        dragging.set(true);
        hover.set(column);
        raised.set(reduced ? 1 : withSpring(1, LIFT));
        runOnJS(onLift)();
      })
      .onUpdate((event) => {
        const nextX = Math.min(maxLeft, Math.max(0, left + event.translationX));
        x.set(nextX);
        y.set(Math.min(maxTop, Math.max(0, top + event.translationY)));
        const over = demoColumnAt(nextX + columnWidth / 2, columnWidth, GAP, rtl);
        if (over !== hover.get()) { hover.set(over); runOnJS(onCross)(); }
      })
      .onEnd(() => { runOnJS(onDrop)(id, hover.get()); })
      .onFinalize((_, success) => {
        // A touch that never became a drag has nothing to undo.
        if (!dragging.get()) return;
        const target = success ? hover.get() : column;
        dragging.set(false);
        hover.set(-1);
        raised.set(reduced ? 0 : withSpring(0, LIFT));
        if (!success) runOnJS(onDrop)(id, column);
        // Back to its own slot. A new column's slot arrives from the effect above.
        if (target === column) {
          x.set(reduced ? left : withSpring(left, SETTLE));
          y.set(reduced ? top : withSpring(top, SETTLE));
        }
      });
  }, [boardHeight, column, columnWidth, dragging, height, hover, id, left, onCross, onDrop, onLift, raised, reduced, rtl, scrollRef, top, x, y]);

  const place = useAnimatedStyle(() => ({
    zIndex: dragging.get() ? 10 : 1,
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: 1 + raised.get() * (reduced ? 0 : 0.06) }],
  }));
  const shadow = useAnimatedStyle(() => ({ opacity: raised.get() }));
  const others = names.map((name, index) => ({ name, index })).filter((item) => item.index !== column);

  return <GestureDetector gesture={gesture}>
    <Animated.View
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${ot(CARD_NAMES[id])}, ${names[column]}`}
      accessibilityHint={ot('tour.boards.hint')}
      accessibilityActions={others.map((item) => ({ name: `move-${item.index}`, label: ot('tour.boards.moveTo', { column: item.name }) }))}
      onAccessibilityAction={({ nativeEvent }) => {
        const target = others.find((item) => `move-${item.index}` === nativeEvent.actionName);
        if (target) onDrop(id, target.index);
      }}
      style={[styles.card, { width, height }, place]}
    >
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, boxShadow: `0px 10px 14px ${desk.shadow}` }, shadow]} />
      <View style={[styles.cardPaper, { backgroundColor: CARD_PAPERS[id], borderRadius: radius, boxShadow: `0px 1px 3px ${desk.shadow}` }]}>
        <AppText numberOfLines={2} maxFontSizeMultiplier={1.2} weight="700" family={family} style={styles.cardText}>{ot(CARD_NAMES[id])}</AppText>
      </View>
    </Animated.View>
  </GestureDetector>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 228, justifyContent: 'center', gap: spacing.xxs },
  column: { position: 'absolute', top: 0, overflow: 'hidden' },
  columnName: { fontSize: 13, lineHeight: COLUMN_HEADER, textAlign: 'center', paddingHorizontal: spacing.xxs },
  card: { position: 'absolute', left: 0, top: 0, paddingHorizontal: GAP / 2 + 1 },
  cardPaper: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xs, paddingVertical: 4 },
  cardText: { color: PAPER_INK, fontSize: 13, lineHeight: 17 },
  below: { minHeight: BELOW_BOARD, alignItems: 'center', gap: spacing.xs },
  hint: { flex: 1, fontSize: 14, lineHeight: 19 },
});
