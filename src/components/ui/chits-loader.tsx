import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, Extrapolation, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { useOptionalTheme } from '@/components/theme-provider';
import { PAPER_INK } from '@/constants/paper';
import { spacing, tokens as staticTokens } from '@/constants/theme';

// The one recognizable Chits loading animation: a strip of tape being stuck
// onto a note. Every screen-level/blocking loading state in the app renders
// through this component rather than a bespoke ActivityIndicator or spinner.

const SIZES = { small: 28, medium: 44, large: 64 } as const;
export type ChitsLoaderSize = keyof typeof SIZES;

// Chits' own paper and tape, so the loader is cut from the same stock. The rim
// keeps the note visible on the light desk, where its yellow nearly vanishes.
const NOTE = '#FBE482';
const NOTE_RIM = '#F5C048';
// See-through, so the note shows under it as it does under real tape.
const TAPE = 'rgba(251,201,78,0.82)';
const TAPE_EDGE = '#EDB23A';

const LOOP_MS = 1500;
// Where each beat ends, as a share of the loop. It opens on the tape already
// moving: most waits are shorter than one loop, so the first moment has to show it.
const UNROLLED = 0.34;
const PRESSED = 0.42;
const SETTLED = 0.54;
const HELD = 0.82;
const CLAMP = { extrapolateLeft: Extrapolation.CLAMP, extrapolateRight: Extrapolation.CLAMP };

/**
 * The note and its tape. Transforms and opacity only, driven on the UI thread,
 * so it keeps moving while a heavy screen holds up JavaScript. Reduce Motion
 * shows it stuck down and still.
 */
function TapeNote({ size }: { size: number }) {
  const reduced = useReducedMotion();
  const progress = useSharedValue(reduced ? SETTLED : 0);
  useEffect(() => {
    if (reduced) return;
    progress.set(withRepeat(withTiming(1, { duration: LOOP_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(progress);
  }, [progress, reduced]);

  // Thin, and longer than the note is wide, so it reads as tape holding the note up.
  const tapeWidth = Math.round(size * 0.96);
  const tapeHeight = Math.max(4, Math.round(size * 0.16));
  // Pressed flat: the whole note gives a little under the thumb, and straightens.
  const mark = useAnimatedStyle(() => {
    const t = progress.get();
    return { transform: [
      { rotate: `${interpolate(t, [UNROLLED, SETTLED, HELD, 1], [-5, -2, -2, -5], CLAMP)}deg` },
      { scale: interpolate(t, [UNROLLED, PRESSED, SETTLED], [1, 0.93, 1], CLAMP) },
    ] };
  });
  // It lifts away at the end of the loop, leaving the note clear for the next strip.
  const strip = useAnimatedStyle(() => {
    const t = progress.get();
    const pulled = Math.min(1, t / UNROLLED);
    const eased = 1 - (1 - pulled) * (1 - pulled);
    return {
      opacity: interpolate(t, [HELD, 0.96], [1, 0], CLAMP),
      transform: [
        { translateX: (eased - 1) * tapeWidth },
        { translateY: interpolate(t, [HELD, 1], [0, -tapeHeight * 0.7], CLAMP) },
      ],
    };
  });
  // The tape's free end, showing until it's pressed down.
  const freeEnd = useAnimatedStyle(() => ({ opacity: interpolate(progress.get(), [UNROLLED, PRESSED], [1, 0], CLAMP) }));

  return <Animated.View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[{ width: size, height: size }, mark]}>
    <View style={[styles.note, { left: size * 0.17, top: size * 0.26, width: size * 0.66, height: size * 0.66, paddingTop: size * 0.2, paddingHorizontal: size * 0.1, gap: size * 0.08, boxShadow: `0px ${size * 0.05}px ${size * 0.12}px rgba(60,40,10,0.24)` }]}>
      <View style={[styles.line, { height: Math.max(1, size * 0.04) }]} />
      <View style={[styles.line, { height: Math.max(1, size * 0.04), width: '64%' }]} />
    </View>
    <View style={[styles.tapeSlot, { left: (size - tapeWidth) / 2, top: size * 0.18, width: tapeWidth, height: tapeHeight }]}>
      <Animated.View style={[styles.tape, strip]}>
        <Animated.View style={[styles.tapeEnd, { width: Math.max(1.5, size * 0.05) }, freeEnd]} />
      </Animated.View>
    </View>
  </Animated.View>;
}

export function ChitsLoader({ size = 'medium', label, fullscreen = false }: { size?: ChitsLoaderSize; label?: string; fullscreen?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  // Can render before ThemeProvider mounts (it's the root Suspense fallback) —
  // fall back to the static default tokens rather than crashing on a missing
  // context, same as primitives.tsx's LoadingState did before it used this.
  const theme = useOptionalTheme()?.tokens ?? staticTokens;
  const dimension = SIZES[size];
  // A label means this is a meaningful, named wait (e.g. "Restoring backup…") worth
  // announcing once; a bare animation (fast everyday loading, per the "only label
  // when genuinely useful" rule) stays purely decorative to the screen reader.
  useEffect(() => { if (label) void AccessibilityInfo.announceForAccessibility(label); }, [label]);
  const content = (
    <View accessibilityRole="progressbar" accessibilityLabel={label ?? tr("messagerow.loading")} style={styles.wrap}>
      <TapeNote size={dimension} />
      {label ? <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text> : null}
    </View>
  );
  if (!fullscreen) return content;
  return <SafeAreaView style={[styles.fullscreen, { backgroundColor: theme.background }]}>{content}</SafeAreaView>;
}

// A blocking, dismiss-proof overlay for destructive/blocking operations (e.g.
// Restore) — the current screen stays visible underneath a light semantic scrim so
// the user can't accidentally interact with data mid-operation.
export function ChitsLoaderOverlay({ label }: { label?: string }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const theme = useOptionalTheme()?.tokens ?? staticTokens;
  return <View pointerEvents="auto" style={[styles.overlay, { backgroundColor: `${theme.background}CC` }]}>
    <ChitsLoader size="large" label={label} />
  </View>;
}

// Prevents loader flash on fast operations (nothing shown for `delay` ms) while
// guaranteeing a stable minimum visible duration once it does appear (no
// one-frame flicker), matching the app's existing debounce-style patterns rather
// than pulling in an animation/timing library for this.
export function useChitsLoading(isLoading: boolean, options?: { delay?: number; minDuration?: number }) {
  const delay = options?.delay ?? 200;
  const minDuration = options?.minDuration ?? 300;
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => { shownAtRef.current = Date.now(); setVisible(true); }, delay);
      return () => clearTimeout(timer);
    }
    if (shownAtRef.current === null) { setVisible(false); return; }
    const elapsed = Date.now() - shownAtRef.current;
    const timer = setTimeout(() => { shownAtRef.current = null; setVisible(false); }, Math.max(0, minDuration - elapsed));
    return () => clearTimeout(timer);
  }, [isLoading, delay, minDuration]);
  return visible;
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  fullscreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center', zIndex: 100, elevation: 20 },
  note: { position: 'absolute', borderRadius: 2, borderWidth: 1, borderColor: NOTE_RIM, backgroundColor: NOTE },
  line: { borderRadius: 1, backgroundColor: PAPER_INK, opacity: 0.2 },
  // Clips the strip, so it appears to come off the roll rather than slide in.
  tapeSlot: { position: 'absolute', overflow: 'hidden', transform: [{ rotate: '-4deg' }] },
  tape: { flex: 1, borderRadius: 1, backgroundColor: TAPE },
  tapeEnd: { position: 'absolute', top: 0, right: 0, bottom: 0, backgroundColor: TAPE_EDGE },
  label: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
