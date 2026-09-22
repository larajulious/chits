import type { ComponentProps } from 'react';
import type Ionicons from '@expo/vector-icons/Ionicons';

export type BoardIconName = ComponentProps<typeof Ionicons>['name'];

// Single source of truth for both Create Board and Edit Board — keeping one list
// means the two flows can never quietly drift apart on which icons/accents exist.
export const BOARD_ICONS: { name: BoardIconName; label: string }[] = [
  { name: 'folder-outline', label: 'Folder' },
  { name: 'briefcase-outline', label: 'Briefcase' },
  { name: 'bulb-outline', label: 'Lightbulb' },
  { name: 'heart-outline', label: 'Heart' },
  { name: 'home-outline', label: 'Home' },
  { name: 'book-outline', label: 'Book' },
  { name: 'paw-outline', label: 'Paw' },
  { name: 'person-outline', label: 'Person' },
  { name: 'star-outline', label: 'Star' },
  { name: 'checkbox-outline', label: 'Checklist' },
];

export const BOARD_ACCENTS: { value: string | null; label: string; color: string | null }[] = [
  { value: null, label: 'Neutral', color: null },
  { value: '#3D6E5C', label: 'Green', color: '#3D6E5C' },
  { value: '#4E639B', label: 'Blue', color: '#4E639B' },
  { value: '#9A5E33', label: 'Orange', color: '#9A5E33' },
  { value: '#765A97', label: 'Purple', color: '#765A97' },
  { value: '#A45E6E', label: 'Rose', color: '#A45E6E' },
];

export function resolveBoardIcon(icon: string | null): BoardIconName {
  return BOARD_ICONS.some((choice) => choice.name === icon) ? (icon as BoardIconName) : 'folder-outline';
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function channelToHex(channel: number) {
  return Math.round(Math.min(255, Math.max(0, channel))).toString(16).padStart(2, '0');
}

// Mixes `accent` into `base` as a solid, opaque color rather than layering `accent`
// on top with alpha transparency. A translucent fill composites with whatever sits
// behind it — the screen background in light mode, but a near-black one in dark
// mode — so the "soft tint" turns muddy/dark exactly where a raw accent is darkest
// or most saturated. Mixing toward `base` first means the result is always close to
// `base`'s own lightness, softening any accent automatically, and is a single flat
// color with no stacking artifacts against whatever's underneath.
export function tintWithAccent(base: string, accent: string, ratio = 0.08): string {
  const [br, bg, bb] = hexToRgb(base);
  const [ar, ag, ab] = hexToRgb(accent);
  return `#${channelToHex(br + (ar - br) * ratio)}${channelToHex(bg + (ag - bg) * ratio)}${channelToHex(bb + (ab - bb) * ratio)}`;
}
