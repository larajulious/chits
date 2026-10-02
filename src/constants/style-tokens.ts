import type { AppPalette } from './chits-themes';

// Style is the second appearance axis, independent of the theme/accent
// palette: it decides shape, depth, type and a few decorations, never color.
// Classic is the look Chits has always had (every value below matches what
// the screens drew before this file existed); Sticky is the outlined,
// sticky-note look that matches the mascot. Colors a style needs that the
// palette doesn't have (a card's tint, the outline ink) are derived from the
// active palette in styleColors(), so every theme works in both styles.
//
// Pure data, no React Native, so tests can check every palette's contrast.

export const APP_STYLES = ['classic', 'sticky'] as const;
export type AppStyle = typeof APP_STYLES[number];
export const DEFAULT_APP_STYLE: AppStyle = 'classic';
export const STYLE_SETTING_KEY = 'app_style';
export const APP_STYLE_NAMES: Record<AppStyle, string> = { classic: 'Classic', sticky: 'Sticky' };

export function resolveAppStyle(value: string | null | undefined): AppStyle {
  return APP_STYLES.find((style) => style === value) ?? DEFAULT_APP_STYLE;
}

export type FontWeight = '400' | '500' | '600' | '700' | '800';
/** A bundled family per weight; null means the platform face at that fontWeight. */
export type FontFaces = Record<FontWeight, string> | null;
export type Corners = { topLeft: number; topRight: number; bottomRight: number; bottomLeft: number };
export type SoftShadow = { opacity: number; radius: number; offsetY: number; elevation: number };

export type StyleTokens = {
  id: AppStyle;
  /** display = screen titles and headings; body = UI text; paragraph = longer prose. */
  font: { display: FontFaces; body: FontFaces; paragraph: FontFaces };
  radius: { card: Corners; control: number; pill: number; nav: number };
  /** 0 = no outline (Classic's hairlines stay as they were). */
  outline: { width: number };
  elevation: 'soft' | 'edge';
  /** The default depth of a solid 'edge' under a surface. */
  edgeDepth: number;
  /** Line weight for drawn icons; 0 keeps the icon font. */
  iconStroke: number;
  press: 'ripple' | 'sink';
  card: { tape: boolean; fold: boolean; tinted: boolean; tilt: number };
  chatButton: 'circle' | 'bubble';
  mascotEmptyStates: boolean;
  /** Classic's soft shadows, by how high the surface floats. */
  shadow: { card: SoftShadow; bubble: SoftShadow; nav: SoftShadow; chat: SoftShadow };

  header: { minHeight: number; align: 'center' | 'left'; titleSize: number; titleLineHeight?: number; countSize: number; countBeside: boolean; iconButton: { size: number; radius: number; filled: boolean; edge: number } };
  segmented: { height: number; radius: number; padding: number; optionRadius: number; labelSize: number; edge: number };
  chip: { height: number; radius: number; paddingHorizontal: number; labelSize: number; countSize: number; activeEdge: number };
  noteCard: { radius: Corners; padding: { top: number; horizontal: number; bottom: number }; edge: number; columnGap: number; rowGap: number; pillOutline: number; pillRadius: number; pillSize: number };
  tape: { width: number; height: number; radius: number; edge: number; overhang: number; maxAngle: number };
  fold: number;
  nav: { height: number; radius: number; edge: number; marginHorizontal: number; marginBottom: number; labelSize: number; activePill: { width: number; height: number } | null };
  chat: { width: number; height: number; radius: Corners; outline: number; edge: number; raise: number; iconSize: number };
  tip: { radius: number; edge: number; textSize: number; textLineHeight: number; mascotSize: number; mascotTilt: number };
  emptyState: { titleSize: number; bodySize: number; bodyLineHeight: number; maxWidth: number | null; mascotWidth: number; button: { height: number; radius: number; edge: number } };
  button: { radius: number; edge: number };
};

const corners = (topLeft: number, topRight = topLeft, bottomRight = topLeft, bottomLeft = topLeft): Corners => ({ topLeft, topRight, bottomRight, bottomLeft });
const faces = (regular: string, medium: string, semibold: string, bold: string, heavy: string): Record<FontWeight, string> => ({ 400: regular, 500: medium, 600: semibold, 700: bold, 800: heavy });

/** Every bundled face Sticky draws with (see use-style-fonts.ts). */
export const STICKY_FONT_FAMILIES = ['Fredoka_500Medium', 'Fredoka_600SemiBold', 'Nunito_600SemiBold', 'Nunito_700Bold', 'Nunito_800ExtraBold'] as const;

export const STYLE_PRESETS: Record<AppStyle, StyleTokens> = {
  classic: {
    id: 'classic',
    font: { display: null, body: null, paragraph: null },
    radius: { card: corners(18), control: 12, pill: 999, nav: 28 },
    outline: { width: 0 },
    elevation: 'soft',
    edgeDepth: 0,
    iconStroke: 0,
    press: 'ripple',
    card: { tape: false, fold: false, tinted: false, tilt: 0 },
    chatButton: 'circle',
    mascotEmptyStates: false,
    shadow: {
      card: { opacity: 0.04, radius: 7, offsetY: 2, elevation: 1 },
      bubble: { opacity: 0.1, radius: 12, offsetY: 4, elevation: 4 },
      nav: { opacity: 0.1, radius: 16, offsetY: 6, elevation: 8 },
      chat: { opacity: 0.22, radius: 12, offsetY: 6, elevation: 10 },
    },
    header: { minHeight: 52, align: 'center', titleSize: 17, countSize: 11, countBeside: false, iconButton: { size: 44, radius: 22, filled: false, edge: 0 } },
    segmented: { height: 32, radius: 12, padding: 3, optionRadius: 10, labelSize: 13, edge: 0 },
    chip: { height: 30, radius: 999, paddingHorizontal: 10, labelSize: 12, countSize: 11, activeEdge: 0 },
    noteCard: { radius: corners(18), padding: { top: 13, horizontal: 13, bottom: 8 }, edge: 0, columnGap: 12, rowGap: 12, pillOutline: 0, pillRadius: 0, pillSize: 12 },
    tape: { width: 0, height: 0, radius: 0, edge: 0, overhang: 0, maxAngle: 0 },
    fold: 0,
    nav: { height: 64, radius: 28, edge: 0, marginHorizontal: 16, marginBottom: 0, labelSize: 11, activePill: null },
    chat: { width: 58, height: 58, radius: corners(29), outline: 0, edge: 0, raise: 22, iconSize: 23 },
    tip: { radius: 18, edge: 0, textSize: 14, textLineHeight: 19, mascotSize: 68, mascotTilt: 0 },
    emptyState: { titleSize: 20, bodySize: 15, bodyLineHeight: 22, maxWidth: null, mascotWidth: 0, button: { height: 44, radius: 12, edge: 0 } },
    button: { radius: 12, edge: 0 },
  },
  sticky: {
    id: 'sticky',
    font: {
      display: faces('Fredoka_600SemiBold', 'Fredoka_500Medium', 'Fredoka_600SemiBold', 'Fredoka_600SemiBold', 'Fredoka_600SemiBold'),
      body: faces('Nunito_700Bold', 'Nunito_700Bold', 'Nunito_700Bold', 'Nunito_700Bold', 'Nunito_800ExtraBold'),
      paragraph: faces('Nunito_600SemiBold', 'Nunito_600SemiBold', 'Nunito_700Bold', 'Nunito_700Bold', 'Nunito_800ExtraBold'),
    },
    radius: { card: corners(16, 16, 6, 16), control: 14, pill: 17, nav: 26 },
    outline: { width: 2 },
    elevation: 'edge',
    edgeDepth: 3,
    iconStroke: 2.5,
    press: 'sink',
    card: { tape: true, fold: true, tinted: true, tilt: 2 },
    chatButton: 'bubble',
    mascotEmptyStates: true,
    shadow: {
      card: { opacity: 0, radius: 0, offsetY: 0, elevation: 0 },
      bubble: { opacity: 0, radius: 0, offsetY: 0, elevation: 0 },
      nav: { opacity: 0, radius: 0, offsetY: 0, elevation: 0 },
      chat: { opacity: 0, radius: 0, offsetY: 0, elevation: 0 },
    },
    header: { minHeight: 64, align: 'left', titleSize: 30, titleLineHeight: 36, countSize: 14, countBeside: true, iconButton: { size: 44, radius: 14, filled: true, edge: 3 } },
    segmented: { height: 38, radius: 18, padding: 5, optionRadius: 13, labelSize: 14, edge: 3 },
    chip: { height: 34, radius: 17, paddingHorizontal: 13, labelSize: 13, countSize: 12, activeEdge: 2 },
    noteCard: { radius: corners(16, 16, 6, 16), padding: { top: 20, horizontal: 14, bottom: 12 }, edge: 4, columnGap: 12, rowGap: 18, pillOutline: 1.5, pillRadius: 10, pillSize: 11 },
    tape: { width: 42, height: 15, radius: 4, edge: 2, overhang: 7, maxAngle: 3 },
    fold: 18,
    nav: { height: 72, radius: 26, edge: 4, marginHorizontal: 16, marginBottom: 18, labelSize: 12, activePill: { width: 52, height: 30 } },
    chat: { width: 68, height: 58, radius: corners(24, 24, 24, 8), outline: 2.5, edge: 5, raise: 34, iconSize: 23 },
    tip: { radius: 18, edge: 3, textSize: 16, textLineHeight: 21, mascotSize: 68, mascotTilt: 6 },
    emptyState: { titleSize: 25, bodySize: 16, bodyLineHeight: 23, maxWidth: 290, mascotWidth: 150, button: { height: 52, radius: 16, edge: 4 } },
    button: { radius: 14, edge: 3 },
  },
};

// ── Derived colors ───────────────────────────────────────────────────────────

/** The outline/ink every Sticky control is drawn with on a light page. */
export const STICKY_INK = '#1C1C22';
/** Sticky's secondary text on a light page. */
export const STICKY_SECONDARY = '#5A5650';

const channels = (hex: string) => [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
const toHex = (values: number[]) => `#${values.map((value) => Math.round(Math.min(255, Math.max(0, value))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** `amount` of `to` mixed into `from` (0 = from, 1 = to), in sRGB. */
export function mix(from: string, to: string, amount: number): string {
  const a = channels(from); const b = channels(to);
  return toHex(a.map((value, index) => value + (b[index] - value) * amount));
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => value / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** `preferred` when it reads at `minimum` on `background`, else `fallback`. */
const readable = (preferred: string, fallback: string, background: string, minimum = 4.5) => contrast(preferred, background) >= minimum ? preferred : fallback;

export type StyleColors = {
  /** Outline and edge ink for controls on the page. */
  outline: string;
  /** Fill for "white" controls: icon buttons, nav, inactive chips, tip bubble. */
  controlFill: string;
  /** Secondary text on the page and on controlFill. */
  textSecondary: string;
  /** Accent-filled controls, and the labels/icons on them (always 4.5:1). */
  accentFill: string; onAccent: string;
  /** A note's paper, its bottom edge and its tape's edge. */
  cardTint: string; cardEdge: string; tapeEdge: string;
  /** Text on a tinted card, and quieter text on it. */
  cardInk: string; cardInkMuted: string;
};

// The accent as-is with its own label color when that reads; else ink on it;
// else (a few mid-tone dark accents) the accent darkened just until its label does.
function accentPair(palette: AppPalette): { accentFill: string; onAccent: string } {
  if (contrast(palette.accentText, palette.accent) >= 4.5) return { accentFill: palette.accent, onAccent: palette.accentText };
  if (contrast(STICKY_INK, palette.accent) >= 4.5) return { accentFill: palette.accent, onAccent: STICKY_INK };
  const label = luminance(palette.accentText) > 0.5 ? palette.accentText : '#FFFFFF';
  let amount = 0;
  while (amount < 1 && contrast(label, mix(palette.accent, '#000000', amount)) < 4.5) amount += 0.02;
  return { accentFill: mix(palette.accent, '#000000', amount), onAccent: label };
}

/**
 * Colors Sticky needs, from the active palette — never per palette. A page is
 * "light" by its own luminance, not the appearance setting, so a theme with a
 * dark page in light mode still gets a light outline.
 */
export function styleColors(palette: AppPalette): StyleColors {
  const lightPage = luminance(palette.background) > 0.4;
  // Dark pages: a near-text outline (a quarter of the way to the page) keeps
  // 2px strokes clearly visible without the glare of pure text color.
  const outline = lightPage ? STICKY_INK : mix(palette.textPrimary, palette.background, 0.25);
  const controlFill = lightPage ? '#FFFFFF' : palette.surface;
  const cardTint = mix(palette.accent, '#FFFFFF', 0.6);
  const cardInk = STICKY_INK;
  return {
    outline,
    controlFill,
    textSecondary: lightPage ? readable(STICKY_SECONDARY, palette.textSecondary, controlFill) : palette.textSecondary,
    ...accentPair(palette),
    cardTint, cardEdge: palette.accent, tapeEdge: mix(palette.accent, '#000000', 0.2),
    cardInk, cardInkMuted: readable(STICKY_SECONDARY, cardInk, cardTint),
  };
}

/** A small stable angle for a note, from its id, in [-max, max] degrees. */
export function stableTilt(id: string, max: number): number {
  if (!max) return 0;
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) { hash ^= id.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return Math.round((((hash >>> 0) % 1000) / 999 * 2 - 1) * max * 10) / 10;
}
