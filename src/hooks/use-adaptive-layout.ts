import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useWindowDimensions, type LayoutChangeEvent, type ScaledSize } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Layout decisions follow the space Chits is given, never the device model, so
// a folded or unfolded iPhone Duo, Split View, a rotated phone and an Android
// foldable all take the same path.
//
//   compact   < 600pt  — every phone, the Duo's outer display (466pt), narrow Split View
//   medium    600–839  — the Duo's inner display upright (669pt), small tablets
//   expanded  ≥ 840    — the inner display on its side (951pt), wide windows
export type WindowClass = 'compact' | 'medium' | 'expanded';

export const MEDIUM_MIN_WIDTH = 600;
export const EXPANDED_MIN_WIDTH = 840;

export function windowClassFor(width: number): WindowClass {
  if (width >= EXPANDED_MIN_WIDTH) return 'expanded';
  if (width >= MEDIUM_MIN_WIDTH) return 'medium';
  return 'compact';
}

/**
 * The part of the window the current screen draws in. It is the window itself
 * unless the side panel is docked beside it, in which case the panel's width
 * is taken off. Only width changes; the panel runs the full window height.
 */
export const ContentFrameContext = createContext<{ inset: number } | null>(null);

/**
 * Drop-in for `useWindowDimensions` in anything drawn inside a screen. Things
 * shown in a `Modal` cover the whole window and keep `useWindowDimensions`.
 */
export function useContentDimensions(): ScaledSize {
  const window = useWindowDimensions();
  const frame = useContext(ContentFrameContext);
  const inset = frame?.inset ?? 0;
  return useMemo(() => (inset ? { ...window, width: Math.max(0, window.width - inset) } : window), [inset, window]);
}

/** Size class of the content area, so a docked side panel counts against it. */
export function useContentClass(): WindowClass {
  return windowClassFor(useContentDimensions().width);
}

/**
 * Content width inside the side safe areas — what a screen laid out with
 * left/right safe edges actually gets. Phones upright have no side insets, but
 * the Duo keeps its sensor bar down one side of both displays, and a phone on
 * its side has the notch there.
 */
export function useSafeContentWidth(): number {
  const { width } = useContentDimensions();
  const insets = useSafeAreaInsets();
  return Math.max(0, width - insets.left - insets.right);
}

/**
 * The width a stretching view really has, for drawings placed against its far
 * edge (the mascot heroes, where Chits peeks in from the side). Starts from the
 * safe content width so the first frame is already right, then follows the
 * view's own layout through folds, rotation and resizing.
 */
export function useMeasuredWidth(): { width: number; onLayout: (event: LayoutChangeEvent) => void } {
  const estimate = useSafeContentWidth();
  const [measured, setMeasured] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured((current) => (current === next ? current : next));
  }, []);
  return { width: measured || estimate, onLayout };
}
