import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

import { fromUnit, SPACE_LIST, STICKY_SIZE, stickyBounds, type SpaceId, type SpacePinStyle } from '@/constants/spaces';
import type { PinnedNote } from '@/db/types';
import { StickyPaper, stickyAccessibilityLabel } from './sticky-note';

// Quick, settled lift — no wobble.
const LIFT = { damping: 20, stiffness: 320, mass: 0.6 };
/** The space a pin style belongs to (each space has its own). */
const spaceFor = (pinStyle: SpacePinStyle): SpaceId => SPACE_LIST.find((space) => space.pinStyle === pinStyle)?.id ?? 'fridge';
const DEEP_SHADOW = '0px 22px 18px rgba(0,0,0,0.30)';

type Props = {
  note: PinnedNote;
  /** Its place in the stack (0 = back); the sticky being dragged is always on top. */
  order: number;
  seed: number;
  board: { width: number; height: number };
  pinStyle: SpacePinStyle;
  /** Unused since the redesign (notes are always set in Kalam); kept so callers needn't change. */
  fontFamily?: string;
  onLift: (id: string) => void;
  /** Where it was dropped, in board points. */
  onDrop: (id: string, x: number, y: number) => void;
  onOpen: (id: string) => void;
  onOptions: (id: string) => void;
};

/**
 * A sticky on the board. Dragging runs entirely on the UI thread (Gesture
 * Handler + Reanimated shared values), so it follows the finger at full frame
 * rate; JavaScript only hears about the lift and the drop, and the position is
 * saved once, on drop. Tap opens the note; long-press opens its options.
 */
export const DraggableSticky = memo(function DraggableSticky({ note, order, seed, board, pinStyle, onLift, onDrop, onOpen, onOptions }: Props) {
  // Reduce Motion: no lift scale; the deeper shadow alone says "lifted".
  const reduceMotion = useReducedMotion();
  const origin = fromUnit(note, board);
  const x = useSharedValue(origin.x);
  const y = useSharedValue(origin.y);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const lift = useSharedValue(0);
  const dragging = useSharedValue(false);
  // A saved or re-laid-out position (another device size, a reload) moves it —
  // but never mid-drag.
  useEffect(() => {
    if (dragging.get()) return;
    x.set(origin.x);
    y.set(origin.y);
  }, [origin.x, origin.y, x, y, dragging]);

  const { minX, minY, maxX, maxY } = stickyBounds(board);
  const gesture = useMemo(() => {
    const pan = Gesture.Pan().minDistance(4)
      .onStart(() => {
        dragging.set(true);
        startX.set(x.get());
        startY.set(y.get());
        lift.set(withSpring(1, LIFT));
        runOnJS(onLift)(note.id);
      })
      .onUpdate((event) => {
        x.set(Math.min(maxX, Math.max(minX, startX.get() + event.translationX)));
        y.set(Math.min(maxY, Math.max(minY, startY.get() + event.translationY)));
      })
      .onEnd(() => { runOnJS(onDrop)(note.id, x.get(), y.get()); })
      .onFinalize(() => {
        dragging.set(false);
        lift.set(withSpring(0, LIFT));
      });
    const longPress = Gesture.LongPress().minDuration(420).onStart(() => { runOnJS(onOptions)(note.id); });
    const tap = Gesture.Tap().maxDuration(350).onEnd((_, success) => { if (success) runOnJS(onOpen)(note.id); });
    // Moving wins as a drag, holding still as options; a quick touch is a tap.
    return Gesture.Exclusive(Gesture.Race(pan, longPress), tap);
  }, [note.id, minX, minY, maxX, maxY, onLift, onDrop, onOpen, onOptions, x, y, startX, startY, lift, dragging]);

  const position = useAnimatedStyle(() => ({
    zIndex: dragging.get() ? 1000 : order,
    transform: [{ translateX: x.get() }, { translateY: y.get() }, { scale: 1 + lift.get() * (reduceMotion ? 0 : 0.05) }],
  }));
  // The deeper lifted shadow fades in over the resting one as the note comes up.
  const liftShadow = useAnimatedStyle(() => ({ opacity: lift.get(), transform: [{ rotate: `${note.rotation}deg` }] }));

  return <GestureDetector gesture={gesture}>
    <Animated.View
      accessible
      accessibilityRole="button"
      accessibilityLabel={stickyAccessibilityLabel(note)}
      accessibilityHint="Opens the note. Options are in the actions menu."
      accessibilityActions={[{ name: 'activate' }, { name: 'longpress', label: 'Options' }]}
      onAccessibilityAction={({ nativeEvent }) => (nativeEvent.actionName === 'longpress' ? onOptions(note.id) : onOpen(note.id))}
      style={[styles.sticky, position]}
    >
      <Animated.View pointerEvents="none" style={[styles.shadow, liftShadow]} />
      <StickyPaper note={note} space={spaceFor(pinStyle)} seed={seed} />
    </Animated.View>
  </GestureDetector>;
});

/** A still copy of a sticky, lifted above the dimmed board while its options are open. */
export function RaisedSticky({ note, seed, board, pinStyle }: Pick<Props, 'note' | 'seed' | 'board' | 'pinStyle' | 'fontFamily'>) {
  const reduceMotion = useReducedMotion();
  const { x, y } = fromUnit(note, board);
  return <View pointerEvents="none" style={[styles.sticky, { transform: [{ translateX: x }, { translateY: y }, { scale: reduceMotion ? 1 : 1.08 }] }]}>
    <StickyPaper note={note} space={spaceFor(pinStyle)} seed={seed} lifted />
  </View>;
}

const styles = StyleSheet.create({
  sticky: { position: 'absolute', left: 0, top: 0, width: STICKY_SIZE.width, height: STICKY_SIZE.height },
  shadow: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 2, boxShadow: DEEP_SHADOW },
});
