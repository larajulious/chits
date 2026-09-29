import type { ShareNoteFontMetrics } from '../services/share-note';

// The looks a Share Note can take. A theme is data only — colors, a type voice,
// a background treatment and an accent mark — and ShareNoteTemplate draws every
// theme with the same layout, so a new theme is one entry here, nothing else.
// Colors are opaque hex so text contrast is checked by tests/share-note.test.mjs.

export type ShareNoteFontStyle = 'formal' | 'casual' | 'playful' | 'elegant' | 'bold' | 'expressive';
// Background treatments, drawn behind the card.
export type ShareNoteDecoration = 'none' | 'soft-shapes' | 'lines' | 'stickers' | 'dots' | 'confetti';
// The small flourish that opens a text note, or sits on the card's edge.
export type ShareNoteMark = 'none' | 'quote' | 'bar' | 'tape';

export type ShareNoteTheme = {
  id: string;
  name: string;
  /** One line for the picker's accessibility label. */
  mood: string;
  backgroundType: 'solid' | 'gradient' | 'pattern';
  colors: {
    background: string;
    /** Gradient end color; the same as `background` for solid/pattern themes. */
    backgroundEnd: string;
    surface: string;
    textPrimary: string;
    textSecondary: string;
    accent: string;
    /** Decoration ink on the background — deliberately quiet. */
    decoration: string;
  };
  fontStyle: ShareNoteFontStyle;
  decorationStyle: ShareNoteDecoration;
  mark: ShareNoteMark;
  align: 'left' | 'center';
  /** Ionicons glyphs for the 'stickers' decoration. */
  stickers?: string[];
  /** Extra colors for the 'confetti' decoration. */
  confetti?: string[];
};

export const SHARE_NOTE_THEMES: ShareNoteTheme[] = [
  {
    id: 'chits', name: 'Chits', mood: 'Classic sticky note', backgroundType: 'solid',
    colors: { background: '#E3EEE7', backgroundEnd: '#E3EEE7', surface: '#FFFDF6', textPrimary: '#1D2B24', textSecondary: '#5C6B63', accent: '#3D6E5C', decoration: '#C9DDD0' },
    fontStyle: 'casual', decorationStyle: 'none', mark: 'tape', align: 'left',
  },
  {
    id: 'corporate', name: 'Corporate', mood: 'Clean, formal, minimal', backgroundType: 'pattern',
    colors: { background: '#EDF0F4', backgroundEnd: '#EDF0F4', surface: '#FFFFFF', textPrimary: '#111827', textSecondary: '#566070', accent: '#2F5BEA', decoration: '#DCE1E9' },
    fontStyle: 'formal', decorationStyle: 'lines', mark: 'bar', align: 'left',
  },
  {
    id: 'casual', name: 'Casual', mood: 'Relaxed and everyday', backgroundType: 'gradient',
    colors: { background: '#FFF1DE', backgroundEnd: '#FFD9B8', surface: '#FFFCF7', textPrimary: '#2E2219', textSecondary: '#72604F', accent: '#D0701F', decoration: '#FFC999' },
    fontStyle: 'casual', decorationStyle: 'soft-shapes', mark: 'quote', align: 'left',
  },
  {
    id: 'love', name: 'Love', mood: 'Warm and heartfelt', backgroundType: 'gradient',
    colors: { background: '#FFD7E1', backgroundEnd: '#FFA9C0', surface: '#FFF6F8', textPrimary: '#5A1D33', textSecondary: '#8E4E63', accent: '#D93F76', decoration: '#FFFFFF' },
    fontStyle: 'elegant', decorationStyle: 'stickers', mark: 'quote', align: 'center', stickers: ['heart', 'heart-outline', 'heart', 'sparkles'],
  },
  {
    id: 'friends', name: 'Friends', mood: 'Playful and cheerful', backgroundType: 'gradient',
    colors: { background: '#C4F1E4', backgroundEnd: '#FFE89E', surface: '#FFFFFF', textPrimary: '#1D292D', textSecondary: '#4F6166', accent: '#F2545B', decoration: '#FFFFFF' },
    fontStyle: 'playful', decorationStyle: 'stickers', mark: 'tape', align: 'left', stickers: ['happy', 'sparkles', 'star', 'musical-notes'],
  },
  {
    id: 'boss', name: 'Boss', mood: 'Confident and polished', backgroundType: 'pattern',
    colors: { background: '#15171B', backgroundEnd: '#15171B', surface: '#1F2228', textPrimary: '#F6F1E7', textSecondary: '#B5AC99', accent: '#C9A55C', decoration: '#2A2D33' },
    fontStyle: 'formal', decorationStyle: 'lines', mark: 'bar', align: 'left',
  },
  {
    id: 'stranger', name: 'Stranger', mood: 'Neutral and respectful', backgroundType: 'solid',
    colors: { background: '#F3F3F1', backgroundEnd: '#F3F3F1', surface: '#FFFFFF', textPrimary: '#1C1C1C', textSecondary: '#666666', accent: '#80868F', decoration: '#E6E6E3' },
    fontStyle: 'formal', decorationStyle: 'none', mark: 'none', align: 'left',
  },
  {
    id: 'motivation', name: 'Motivation', mood: 'Bold and uplifting', backgroundType: 'gradient',
    colors: { background: '#FF5A3D', backgroundEnd: '#FFB337', surface: '#131316', textPrimary: '#FFFFFF', textSecondary: '#C4C4CC', accent: '#FFB337', decoration: '#FFD27A' },
    fontStyle: 'bold', decorationStyle: 'soft-shapes', mark: 'bar', align: 'center',
  },
  {
    id: 'calm', name: 'Calm', mood: 'Soft and peaceful', backgroundType: 'gradient',
    colors: { background: '#E6F0F1', backgroundEnd: '#CADDE0', surface: '#F8FBFB', textPrimary: '#233F3E', textSecondary: '#557472', accent: '#5A8983', decoration: '#DCEAEA' },
    fontStyle: 'elegant', decorationStyle: 'soft-shapes', mark: 'none', align: 'center',
  },
  {
    id: 'creative', name: 'Creative', mood: 'Artsy and expressive', backgroundType: 'pattern',
    colors: { background: '#2B1B5E', backgroundEnd: '#2B1B5E', surface: '#FFF9EE', textPrimary: '#1F1A33', textSecondary: '#5E5673', accent: '#7C4DFF', decoration: '#FF7AB6' },
    fontStyle: 'expressive', decorationStyle: 'confetti', mark: 'quote', align: 'left', confetti: ['#FF7AB6', '#FFD166', '#06D6A0', '#7C9BFF'],
  },
  {
    id: 'cute', name: 'Cute', mood: 'Charming and soft', backgroundType: 'pattern',
    colors: { background: '#FFE6F0', backgroundEnd: '#FFE6F0', surface: '#FFFFFF', textPrimary: '#5B3754', textSecondary: '#8D6A86', accent: '#EE5A96', decoration: '#FFC4DA' },
    fontStyle: 'playful', decorationStyle: 'dots', mark: 'tape', align: 'center', stickers: ['star', 'heart'],
  },
  {
    id: 'midnight', name: 'Midnight', mood: 'Quiet and late-night', backgroundType: 'gradient',
    colors: { background: '#0E1530', backgroundEnd: '#322B7A', surface: '#161C38', textPrimary: '#ECEEFA', textSecondary: '#A5ACD0', accent: '#93A2FF', decoration: '#5D63B8' },
    fontStyle: 'elegant', decorationStyle: 'dots', mark: 'quote', align: 'center',
  },
];

export const DEFAULT_SHARE_NOTE_THEME_ID = 'chits';

export function getShareNoteTheme(id: string): ShareNoteTheme {
  return SHARE_NOTE_THEMES.find((theme) => theme.id === id) ?? SHARE_NOTE_THEMES[0];
}

// How wide each voice sets, so text fitting can estimate wrapping before drawing.
// Generous on purpose: an estimate that errs wide leaves air, never overflow.
export const SHARE_NOTE_FONT_METRICS: Record<ShareNoteFontStyle, ShareNoteFontMetrics> = {
  formal: { averageCharWidth: 0.53, lineHeight: 1.32 },
  casual: { averageCharWidth: 0.55, lineHeight: 1.34 },
  playful: { averageCharWidth: 0.57, lineHeight: 1.32 },
  elegant: { averageCharWidth: 0.52, lineHeight: 1.36 },
  bold: { averageCharWidth: 0.6, lineHeight: 1.18 },
  expressive: { averageCharWidth: 0.56, lineHeight: 1.26 },
};
