import type { ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { useStickySurface, type SurfaceOptions } from '@/components/ui/surface';
import { DEFAULT_STICKY_COLOR } from '@/constants/spaces';
import { paperColor, SPACE_UI } from '@/constants/spaces-theme';

/**
 * Sticky for Spaces' floating controls: the same outline and solid edge as
 * the rest of the app, drawn in Spaces' own ink (its fixed, physical palette
 * rather than the app theme's). Null under Classic.
 */
export function useInkSurface() {
  const sticky = useStickySurface();
  return (options: SurfaceOptions, sunk = false) => sticky({ outlineColor: SPACE_UI.ink, edgeColor: SPACE_UI.ink, ...options }, sunk);
}

/** The selected space in Sticky's dock: a yellow sticky-note pill. */
export const STICKY_PILL = paperColor(DEFAULT_STICKY_COLOR).base;

/**
 * Sticky's corners for Spaces' dark sheets and screens (an ink outline would
 * vanish on ink, so these change shape only). Every entry is null under
 * Classic.
 */
export function useSpaceShapes() {
  const { styleTokens: t } = useTheme();
  const on = t.elevation === 'edge';
  const r = (value: ViewStyle) => (on ? value : null);
  return {
    sheet: r({ borderTopLeftRadius: t.radius.sheet, borderTopRightRadius: t.radius.sheet }),
    control: r({ borderRadius: t.radius.control }),
    button: r({ borderRadius: t.emptyState.button.radius }),
    round: r({ borderRadius: t.header.iconButton.radius }),
    card: r({ borderRadius: t.radius.panel }),
    cardClip: r({ borderRadius: t.radius.panel - t.outline.width - 1 }),
  };
}
