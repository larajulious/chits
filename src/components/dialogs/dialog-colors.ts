import { tintWithAccent } from '@/constants/board-appearance';
import type { ThemeTokens } from '@/constants/theme';

export type DialogType = 'default' | 'destructive' | 'warning' | 'success' | 'info';

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

// Perceptual luminance — picks the higher-contrast of near-black/white text for a
// solid fill whose lightness can flip between light and dark mode (e.g. `danger`
// goes from a dark red to a light salmon), rather than hardcoding one color.
export function readableTextColor(bgHex: string): string {
  const [r, g, b] = hexToRgb(bgHex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#171717' : '#FFFFFF';
}

// No semantic "warning" token exists on ThemeTokens yet — kept local to the dialog
// system rather than added app-wide, since nothing else currently needs it.
const WARNING = { light: '#9A6B2A', dark: '#E0A868' } as const;

export type DialogPalette = { iconColor: string; iconBg: string; ctaBg: string; ctaText: string };

// Icon/CTA colors only — the modal surface itself always stays theme.surface,
// neutral, regardless of type (see AppDialog): "neutral modal -> subtle accent
// icon treatment -> accent CTA", never a fully tinted dialog.
export function resolveDialogPalette(type: DialogType, theme: ThemeTokens, scheme: 'light' | 'dark', accentColor?: string | null): DialogPalette {
  if (type === 'destructive') {
    const solid = theme.danger;
    return { iconColor: solid, iconBg: tintWithAccent(theme.surface, solid, 0.14), ctaBg: solid, ctaText: readableTextColor(solid) };
  }
  if (type === 'warning') {
    const solid = WARNING[scheme];
    return { iconColor: solid, iconBg: tintWithAccent(theme.surface, solid, 0.14), ctaBg: solid, ctaText: readableTextColor(solid) };
  }
  if (type === 'success') {
    const solid = theme.success;
    return { iconColor: solid, iconBg: tintWithAccent(theme.surface, solid, 0.14), ctaBg: solid, ctaText: readableTextColor(solid) };
  }
  // 'default' | 'info' — derive from the current board/card accent when one is
  // given (so a card's own color shows through), otherwise the app theme accent.
  const solid = accentColor ?? theme.accent;
  return { iconColor: solid, iconBg: tintWithAccent(theme.surface, solid, 0.14), ctaBg: solid, ctaText: accentColor ? readableTextColor(solid) : theme.accentText };
}
