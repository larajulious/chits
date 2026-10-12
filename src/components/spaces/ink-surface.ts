import { useMemo } from 'react';

import { useTheme } from '@/components/theme-provider';
import { useStickySheet, useStickySurface, type SurfaceOptions } from '@/components/ui/surface';
import { SPACE_UI } from '@/constants/spaces-theme';

export type SpaceUI = { [Key in keyof typeof SPACE_UI]: string };

/** Theme-aware interface colors; physical paper and pin colors remain independent. */
export function useSpaceUI(): SpaceUI {
  const { tokens, styleTokens, styleColors } = useTheme();
  const sticky = styleTokens.elevation === 'edge';
  return useMemo(() => ({
    ink: sticky ? styleColors.controlFill : tokens.surface,
    inkRaised: tokens.surfaceElevated,
    inkBorder: sticky ? styleColors.outline : tokens.borderSubtle,
    paper: tokens.textPrimary,
    paperWhite: SPACE_UI.paperWhite,
    textMuted: sticky ? styleColors.textSecondary : tokens.textSecondary,
    accent: styleColors.accentFill,
    accentText: styleColors.onAccent,
    magnetRed: SPACE_UI.magnetRed,
    dangerBorder: tokens.danger,
    dangerText: tokens.danger,
    dockIcon: sticky ? styleColors.textSecondary : tokens.textSecondary,
    switchOff: tokens.borderSubtle,
  }), [sticky, tokens, styleColors]);
}

const styleCache = new WeakMap<object, WeakMap<SpaceUI, unknown>>();
/** A Spaces StyleSheet built from the interface colors, made once per palette. */
export function useSpaceStyles<T>(create: (ui: SpaceUI) => T): T {
  const ui = useSpaceUI();
  let byUi = styleCache.get(create);
  if (!byUi) { byUi = new WeakMap(); styleCache.set(create, byUi); }
  if (!byUi.has(ui)) byUi.set(ui, create(ui));
  return byUi.get(ui) as T;
}

/**
 * Sticky for Spaces' floating controls: the same outline and solid edge as
 * the rest of the app. Null under Classic.
 */
export function useInkSurface() {
  const sticky = useStickySurface();
  return (options: SurfaceOptions, sunk = false) => sticky(options, sunk);
}

/**
 * Sticky's surfaces for Spaces' sheets and screens (outlined sheets, tiles and
 * rows; edged buttons). Every entry is null under Classic.
 */
export function useSpaceShapes() {
  const { styleTokens: t, styleColors } = useTheme();
  const sticky = useStickySurface();
  const sheet = useStickySheet();
  const on = t.elevation === 'edge';
  return {
    sheet: sheet(styleColors.controlFill),
    control: sticky({ radius: t.radius.control, edge: false }),
    button: sticky({ radius: t.emptyState.button.radius, edge: t.emptyState.button.edge }),
    round: sticky({ fill: styleColors.controlFill, radius: t.header.iconButton.radius, edge: t.header.iconButton.edge }),
    card: sticky({ radius: t.radius.panel, edge: false }),
    cardClip: on ? { borderRadius: t.radius.panel - t.outline.width - 1 } : null,
  };
}
