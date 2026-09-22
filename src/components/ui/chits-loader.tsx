import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useOptionalTheme } from '@/components/theme-provider';
import { spacing, tokens as staticTokens } from '@/constants/theme';

// The one recognizable Chits loading animation — every screen-level/blocking
// loading state in the app should render through this component rather than a
// bespoke ActivityIndicator or spinner, per the design system rule that this WEBP
// is the primary loader. Do not duplicate this require() elsewhere.
const CHITS_LOADER_ASSET = require('@/assets/images/wired-gradient-212-four-arrows-rotate-hover-pinch.webp');

const SIZES = { small: 28, medium: 44, large: 64 } as const;
export type ChitsLoaderSize = keyof typeof SIZES;

function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);
  return reduceMotion;
}

export function ChitsLoader({ size = 'medium', label, fullscreen = false }: { size?: ChitsLoaderSize; label?: string; fullscreen?: boolean }) {
  // Can render before ThemeProvider mounts (it's the root Suspense fallback) —
  // fall back to the static default tokens rather than crashing on a missing
  // context, same as primitives.tsx's LoadingState did before it used this.
  const theme = useOptionalTheme()?.tokens ?? staticTokens;
  const reduceMotion = useReduceMotion();
  const dimension = SIZES[size];
  // A label means this is a meaningful, named wait (e.g. "Restoring backup…") worth
  // announcing once; a bare animation (fast everyday loading, per the "only label
  // when genuinely useful" rule) stays purely decorative to the screen reader.
  useEffect(() => { if (label) void AccessibilityInfo.announceForAccessibility(label); }, [label]);
  const content = (
    <View accessibilityRole="progressbar" accessibilityLabel={label ?? 'Loading'} style={styles.wrap}>
      {reduceMotion ? (
        // Reduce Motion: a static, non-spinning mark stands in for the animation
        // rather than forcing continuous motion — the artwork itself isn't recolored
        // or altered, it's simply not shown while motion is off.
        <View accessible={false} style={[styles.staticMark, { width: dimension, height: dimension, borderRadius: dimension / 2, backgroundColor: theme.surfaceElevated }]}>
          <Ionicons accessible={false} name="sync-outline" size={Math.round(dimension * 0.5)} color={theme.textMuted} />
        </View>
      ) : (
        <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" source={CHITS_LOADER_ASSET} style={{ width: dimension, height: dimension }} contentFit="contain" autoplay />
      )}
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
  staticMark: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
});
