import { useMemo } from 'react';

import { useTheme } from '@/components/theme-provider';
import { useStickySheet, useStickySurface, type SurfaceOptions } from '@/components/ui/surface';
import { SPACE_UI } from '@/constants/spaces-theme';

export type SpaceUI = { [Key in keyof typeof SPACE_UI]: string };

/**
 * Spaces' interface colors. Classic: its own dark ink-and-paper palette.
 * Sticky: the same roles in the app's Sticky colors — the ink background
 * becomes paper, paper text becomes the theme's text, buttons the accent —
 * so Spaces' sheets and screens match the rest of the app. (The surfaces and
 * notes are objects, drawn the same either way.)
 */
export function useSpaceUI(): SpaceUI {
  const { tokens, styleTokens, styleColors } = useTheme();
  const sticky = styleTokens.elevation === 'edge';
  return useMemo(() => sticky ? {
    ink: styleColors.controlFill, inkRaised: tokens.surfaceElevated, inkBorder: styleColors.outline,
    paper: tokens.textPrimary, paperWhite: styleColors.controlFill, textMuted: styleColors.textSecondary,
    accent: styleColors.accentFill, accentText: styleColors.onAccent,
    magnetRed: SPACE_UI.magnetRed, dangerBorder: tokens.danger, dangerText: tokens.danger,
    dockIcon: styleColors.textSecondary, switchOff: tokens.borderSubtle,
  } : SPACE_UI, [sticky, tokens, styleColors]);
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
