import type { ShareNoteFontMetrics } from '../services/share-note';

// Chits themes: one identity ("Calm", "Boss"…) powers both the app's look and
// the matching Share Note design, so the two always feel related. A theme only
// changes the app's visual personality — colors, surfaces, the chat backdrop,
// a card's lift, heading weight — never layout, navigation or behavior.
//
// This file is pure data (no React Native) so tests can check every palette's
// contrast in both light and dark. theme.ts turns a palette into the tokens
// every component reads through useTheme().

export const CHITS_THEME_IDS = [
  'default', 'faith', 'casual', 'corporate', 'love', 'friends', 'boss', 'stranger', 'motivation', 'calm', 'creative', 'cute', 'christmas', 'spooky', 'new-year', 'midnight',
  'boomers', 'gen-x', 'millennials', 'gen-z', 'gen-alpha',
  'game-changer',
] as const;
export type ChitsThemeIdentity = typeof CHITS_THEME_IDS[number];
export const DEFAULT_THEME_IDENTITY: ChitsThemeIdentity = 'default';

/**
 * How the pickers group themes. Generations are design eras — told apart by
 * type, palette, texture and spacing, never by jokes or stereotypes.
 */
export const THEME_COLLECTIONS = [
  { id: 'personalities', name: 'Personalities' },
  { id: 'generations', name: 'Generations' },
  { id: 'limited-edition', name: 'Limited Edition' },
] as const;
export type ThemeCollectionId = typeof THEME_COLLECTIONS[number]['id'];

/**
 * Collections kept out of both theme pickers for now. Their themes still
 * exist, so anyone already wearing one keeps it (and a backup restores it);
 * take an id out of here to offer the section again.
 */
export const HIDDEN_THEME_COLLECTIONS: ReadonlySet<ThemeCollectionId> = new Set(['limited-edition']);

/** The one stored setting: just the identity, never the palette. */
export const THEME_SETTING_KEY = 'app_theme';

/** Anything unknown (an older backup, a removed theme) falls back to Default. */
export function resolveThemeIdentity(value: string | null | undefined): ChitsThemeIdentity {
  const current = value ? RENAMED_THEMES[value] ?? value : value;
  return CHITS_THEME_IDS.find((id) => id === current) ?? DEFAULT_THEME_IDENTITY;
}

// Stored ids from before a theme was renamed keep their theme.
const RENAMED_THEMES: Record<string, ChitsThemeIdentity> = { christian: 'faith' };

// ── App ──────────────────────────────────────────────────────────────────────

/** Every color token a screen can ask for. All opaque hex, so contrast is testable. */
export type AppPalette = {
  background: string; surface: string; surfaceElevated: string;
  textPrimary: string; textSecondary: string; textMuted: string;
  borderSubtle: string;
  accent: string; accentSoft: string; accentStrong: string; accentText: string; accentBorder: string;
  danger: string; success: string;
  /** Your thoughts in Chat. */
  bubble: string; bubbleText: string;
  /** Chat's backdrop when no custom photo is set. */
  chatBackground: string;
  /** A note in the Cards grid that isn't tinted by a board, and the base a board tint mixes into. */
  cardPaper: string; cardBase: string;
};

export type ChatPattern = 'none' | 'dots' | 'soft-shapes' | 'confetti' | 'cross' | 'grain' | 'geometric';
/**
 * A picture a theme can wear in its header band. Only the id lives here (this
 * file stays free of React Native); theme-images.ts maps it to the bundled file.
 */
export type ThemeImageId = 'game-changer';
/** The face screen titles are set in; 'system' is the platform default. */
export type HeadingFont = 'system' | 'serif' | 'mono' | 'rounded';

/** The non-color part of a personality — kept small on purpose. */
export type ChitsLook = {
  headingWeight: '600' | '700' | '800';
  /** Screen titles' typeface; omitted means 'system'. */
  headingFont?: HeadingFont;
  /** Lift under paper-like cards (0 = flat). */
  cardShadowOpacity: number;
  /** A very quiet decoration behind Chat when there's no custom photo. */
  chatPattern: ChatPattern;
  /** Colors for the confetti/geometric chat patterns; omitted means the accent family. */
  patternColors?: string[];
  /** A picture behind every screen header in place of the band's pattern; see TopBarStyle. */
  bandImage?: ThemeImageId;
};

export type ChitsTheme = {
  id: ChitsThemeIdentity;
  category: ThemeCollectionId;
  name: string;
  description: string;
  /** null for Default: its palette uses the logo colors, tinted by the user's accent choice. */
  palette: { light: AppPalette; dark: AppPalette } | null;
  look: ChitsLook;
  shareNote: ShareNoteTheme;
};

// ── Share Note ───────────────────────────────────────────────────────────────

export type ShareNoteFontStyle = 'formal' | 'casual' | 'playful' | 'elegant' | 'bold' | 'expressive' | 'classic' | 'mono';
// Background treatments, drawn behind the card: 'ruled' is stationery with a
// margin, 'cassette' a stack of retro stripes, 'dot-grid' a planner page and
// 'geometric' a few floating rings and tiles.
export type ShareNoteDecoration = 'none' | 'soft-shapes' | 'lines' | 'stickers' | 'dots' | 'confetti' | 'cross' | 'ruled' | 'cassette' | 'dot-grid' | 'geometric';
// The small flourish that opens a text note, or sits on the card's edge.
export type ShareNoteMark = 'none' | 'quote' | 'bar' | 'tape' | 'cross';

/**
 * A Share Note design — colors, a type voice, a background treatment and an
 * accent mark. ShareNoteTemplate draws every one with the same layout.
 */
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
  /** Extra colors for the 'confetti', 'cassette' and 'geometric' decorations. */
  confetti?: string[];
};

// How wide each voice sets, so text fitting can estimate wrapping before drawing.
// Generous on purpose: an estimate that errs wide leaves air, never overflow.
export const SHARE_NOTE_FONT_METRICS: Record<ShareNoteFontStyle, ShareNoteFontMetrics> = {
  formal: { averageCharWidth: 0.53, lineHeight: 1.32 },
  casual: { averageCharWidth: 0.55, lineHeight: 1.34 },
  playful: { averageCharWidth: 0.57, lineHeight: 1.32 },
  elegant: { averageCharWidth: 0.52, lineHeight: 1.36 },
  bold: { averageCharWidth: 0.6, lineHeight: 1.18 },
  expressive: { averageCharWidth: 0.56, lineHeight: 1.26 },
  classic: { averageCharWidth: 0.54, lineHeight: 1.38 },
  // Every glyph is ~0.6em in a monospace face.
  mono: { averageCharWidth: 0.63, lineHeight: 1.34 },
};

// ── The themes ───────────────────────────────────────────────────────────────

const BASE_LOOK: ChitsLook = { headingWeight: '600', cardShadowOpacity: 0.07, chatPattern: 'none' };

export const CHITS_THEMES: Record<ChitsThemeIdentity, ChitsTheme> = {
  default: {
    id: 'default', category: 'personalities', name: 'Default', description: 'Off-white paper and Chits yellow', palette: null, look: BASE_LOOK,
    shareNote: {
      id: 'default', name: 'Chits', mood: 'Classic sticky note', backgroundType: 'solid',
      colors: { background: '#F7F8F6', backgroundEnd: '#F7F8F6', surface: '#FFFDF6', textPrimary: '#24231F', textSecondary: '#5F5C52', accent: '#7A5C00', decoration: '#FBE47E' },
      fontStyle: 'casual', decorationStyle: 'none', mark: 'tape', align: 'left',
    },
  },
  casual: {
    id: 'casual', category: 'personalities', name: 'Casual', description: 'Relaxed, warm and paper-like',
    palette: {
      light: {
        background: '#FAF7F0', surface: '#F3EEE3', surfaceElevated: '#EAE3D5', textPrimary: '#2A241C', textSecondary: '#5A5144', textMuted: '#6A6152', borderSubtle: '#E2DACB',
        accent: '#56704A', accentSoft: '#E6EDDC', accentStrong: '#435A38', accentText: '#FFFFFF', accentBorder: '#A9BD9A', danger: '#A93A2A', success: '#3C744A',
        bubble: '#E6EDDC', bubbleText: '#2A241C', chatBackground: '#F7F2E7', cardPaper: '#FFFCF5', cardBase: '#FFFDF8',
      },
      dark: {
        background: '#1A1814', surface: '#23201B', surfaceElevated: '#2E2A23', textPrimary: '#F1ECE1', textSecondary: '#CBC3B3', textMuted: '#A0978A', borderSubtle: '#3A352D',
        accent: '#56704A', accentSoft: '#27301F', accentStrong: '#A7C493', accentText: '#FFFFFF', accentBorder: '#566B48', danger: '#EE8B82', success: '#79B38A',
        bubble: '#2C3824', bubbleText: '#F1ECE1', chatBackground: '#1A1814', cardPaper: '#23201B', cardBase: '#23201B',
      },
    },
    look: { headingWeight: '600', cardShadowOpacity: 0.05, chatPattern: 'none' },
    shareNote: {
      id: 'casual', name: 'Casual', mood: 'Relaxed and everyday', backgroundType: 'gradient',
      colors: { background: '#FFF1DE', backgroundEnd: '#FFD9B8', surface: '#FFFCF7', textPrimary: '#2E2219', textSecondary: '#72604F', accent: '#D0701F', decoration: '#FFC999' },
      fontStyle: 'casual', decorationStyle: 'soft-shapes', mark: 'quote', align: 'left',
    },
  },
  corporate: {
    id: 'corporate', category: 'personalities', name: 'Corporate', description: 'Clean, structured and professional',
    palette: {
      light: {
        background: '#F7F8FA', surface: '#FFFFFF', surfaceElevated: '#EEF1F5', textPrimary: '#111827', textSecondary: '#4B5563', textMuted: '#636B78', borderSubtle: '#E1E5EB',
        accent: '#2F5BEA', accentSoft: '#E8EEFD', accentStrong: '#1F46C7', accentText: '#FFFFFF', accentBorder: '#A9BCF5', danger: '#B42318', success: '#1E7A4C',
        bubble: '#E8EEFD', bubbleText: '#111827', chatBackground: '#F4F6F9', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#0F1218', surface: '#171B23', surfaceElevated: '#20252F', textPrimary: '#EEF1F6', textSecondary: '#B9C0CC', textMuted: '#8C94A3', borderSubtle: '#2A303B',
        accent: '#3B63E0', accentSoft: '#1A2440', accentStrong: '#8FA9FF', accentText: '#FFFFFF', accentBorder: '#3A4E86', danger: '#F28B82', success: '#6CC49A',
        bubble: '#1F2C52', bubbleText: '#EEF1F6', chatBackground: '#0F1218', cardPaper: '#171B23', cardBase: '#171B23',
      },
    },
    look: { headingWeight: '700', cardShadowOpacity: 0.03, chatPattern: 'none' },
    shareNote: {
      id: 'corporate', name: 'Corporate', mood: 'Clean, formal, minimal', backgroundType: 'pattern',
      colors: { background: '#EDF0F4', backgroundEnd: '#EDF0F4', surface: '#FFFFFF', textPrimary: '#111827', textSecondary: '#566070', accent: '#2F5BEA', decoration: '#DCE1E9' },
      fontStyle: 'formal', decorationStyle: 'lines', mark: 'bar', align: 'left',
    },
  },
  love: {
    id: 'love', category: 'personalities', name: 'Love', description: 'Warm, personal and gentle',
    palette: {
      light: {
        background: '#FCF7F6', surface: '#F9EEEE', surfaceElevated: '#F3E2E3', textPrimary: '#2E1A20', textSecondary: '#62454D', textMuted: '#74565E', borderSubtle: '#EDDCDE',
        accent: '#AE3F63', accentSoft: '#F8E3EA', accentStrong: '#8E3350', accentText: '#FFFFFF', accentBorder: '#E3A6B9', danger: '#A8321F', success: '#3E7B58',
        bubble: '#F8E3EA', bubbleText: '#2E1A20', chatBackground: '#FBF3F2', cardPaper: '#FFF9F9', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#1B1316', surface: '#241A1E', surfaceElevated: '#302328', textPrimary: '#F6ECEF', textSecondary: '#D3BDC4', textMuted: '#A88F97', borderSubtle: '#3B2C32',
        accent: '#AE3F63', accentSoft: '#3A2029', accentStrong: '#F2A3BC', accentText: '#FFFFFF', accentBorder: '#7E3B52', danger: '#F28B82', success: '#79B38A',
        bubble: '#44232F', bubbleText: '#F6ECEF', chatBackground: '#1B1316', cardPaper: '#241A1E', cardBase: '#241A1E',
      },
    },
    look: { headingWeight: '600', cardShadowOpacity: 0.06, chatPattern: 'soft-shapes' },
    shareNote: {
      id: 'love', name: 'Love', mood: 'Warm and heartfelt', backgroundType: 'gradient',
      colors: { background: '#FFD7E1', backgroundEnd: '#FFA9C0', surface: '#FFF6F8', textPrimary: '#5A1D33', textSecondary: '#8E4E63', accent: '#D93F76', decoration: '#FFFFFF' },
      fontStyle: 'elegant', decorationStyle: 'stickers', mark: 'quote', align: 'center', stickers: ['heart', 'heart-outline', 'heart', 'sparkles'],
    },
  },
  friends: {
    id: 'friends', category: 'personalities', name: 'Friends', description: 'Social, bright and relaxed',
    palette: {
      light: {
        background: '#F7FAF9', surface: '#EEF6F3', surfaceElevated: '#E2EEEA', textPrimary: '#16211F', textSecondary: '#445652', textMuted: '#566864', borderSubtle: '#DAE7E3',
        accent: '#0F7C74', accentSoft: '#FFF0C2', accentStrong: '#0B5E58', accentText: '#FFFFFF', accentBorder: '#E9C95E', danger: '#B3261E', success: '#2E7D4F',
        bubble: '#D6F1EB', bubbleText: '#16211F', chatBackground: '#F3F9F7', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#0F1716', surface: '#16211F', surfaceElevated: '#1F2D2A', textPrimary: '#EAF4F1', textSecondary: '#B7CCC6', textMuted: '#8AA19B', borderSubtle: '#29403B',
        accent: '#0F7C74', accentSoft: '#3A3218', accentStrong: '#FFD66B', accentText: '#FFFFFF', accentBorder: '#8A7430', danger: '#F28B82', success: '#79C39A',
        bubble: '#1B3F3A', bubbleText: '#EAF4F1', chatBackground: '#0F1716', cardPaper: '#16211F', cardBase: '#16211F',
      },
    },
    look: { headingWeight: '700', cardShadowOpacity: 0.07, chatPattern: 'dots' },
    shareNote: {
      id: 'friends', name: 'Friends', mood: 'Playful and cheerful', backgroundType: 'gradient',
      colors: { background: '#C4F1E4', backgroundEnd: '#FFE89E', surface: '#FFFFFF', textPrimary: '#1D292D', textSecondary: '#4F6166', accent: '#F2545B', decoration: '#FFFFFF' },
      fontStyle: 'playful', decorationStyle: 'stickers', mark: 'tape', align: 'left', stickers: ['happy', 'sparkles', 'star', 'musical-notes'],
    },
  },
  boss: {
    id: 'boss', category: 'personalities', name: 'Boss', description: 'Confident, premium and focused',
    palette: {
      light: {
        background: '#F5F4F1', surface: '#FFFFFF', surfaceElevated: '#ECEAE5', textPrimary: '#16171A', textSecondary: '#46464B', textMuted: '#5E5E63', borderSubtle: '#DFDCD5',
        accent: '#1E2127', accentSoft: '#F1E9D6', accentStrong: '#6F531A', accentText: '#EBD9B0', accentBorder: '#C9A55C', danger: '#A8321F', success: '#2F6F4A',
        bubble: '#1F2228', bubbleText: '#F6F1E7', chatBackground: '#F2F1EE', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#0F1012', surface: '#17191C', surfaceElevated: '#212428', textPrimary: '#F4F0E8', textSecondary: '#C4BCAE', textMuted: '#958D80', borderSubtle: '#2A2C30',
        accent: '#C9A55C', accentSoft: '#2B2518', accentStrong: '#E3C27E', accentText: '#16171A', accentBorder: '#7D6534', danger: '#F28B82', success: '#79B38A',
        bubble: '#2A2519', bubbleText: '#F4F0E8', chatBackground: '#0F1012', cardPaper: '#17191C', cardBase: '#17191C',
      },
    },
    look: { headingWeight: '700', cardShadowOpacity: 0.09, chatPattern: 'none' },
    shareNote: {
      id: 'boss', name: 'Boss', mood: 'Confident and polished', backgroundType: 'pattern',
      colors: { background: '#15171B', backgroundEnd: '#15171B', surface: '#1F2228', textPrimary: '#F6F1E7', textSecondary: '#B5AC99', accent: '#C9A55C', decoration: '#2A2D33' },
      fontStyle: 'formal', decorationStyle: 'lines', mark: 'bar', align: 'left',
    },
  },
  stranger: {
    id: 'stranger', category: 'personalities', name: 'Stranger', description: 'Neutral and universally calm',
    palette: {
      light: {
        background: '#FAFAF8', surface: '#F3F3F0', surfaceElevated: '#EAEAE6', textPrimary: '#1A1A1A', textSecondary: '#525252', textMuted: '#666666', borderSubtle: '#E2E2DE',
        accent: '#4F555C', accentSoft: '#ECEDEE', accentStrong: '#3B4046', accentText: '#FFFFFF', accentBorder: '#B5BAC0', danger: '#A8321F', success: '#36785B',
        bubble: '#ECEDEE', bubbleText: '#1A1A1A', chatBackground: '#F7F7F5', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#131313', surface: '#1B1B1B', surfaceElevated: '#252525', textPrimary: '#EFEFEC', textSecondary: '#C2C2BE', textMuted: '#979793', borderSubtle: '#333331',
        accent: '#5F666E', accentSoft: '#262A2E', accentStrong: '#B9C0C8', accentText: '#FFFFFF', accentBorder: '#50565D', danger: '#EE8B82', success: '#68A982',
        bubble: '#2A2D31', bubbleText: '#EFEFEC', chatBackground: '#131313', cardPaper: '#1B1B1B', cardBase: '#1B1B1B',
      },
    },
    look: { headingWeight: '600', cardShadowOpacity: 0.04, chatPattern: 'none' },
    shareNote: {
      id: 'stranger', name: 'Stranger', mood: 'Neutral and respectful', backgroundType: 'solid',
      colors: { background: '#F3F3F1', backgroundEnd: '#F3F3F1', surface: '#FFFFFF', textPrimary: '#1C1C1C', textSecondary: '#666666', accent: '#80868F', decoration: '#E6E6E3' },
      fontStyle: 'formal', decorationStyle: 'none', mark: 'none', align: 'left',
    },
  },
  motivation: {
    id: 'motivation', category: 'personalities', name: 'Motivation', description: 'Energetic, bold and purposeful',
    palette: {
      light: {
        background: '#FFFFFF', surface: '#FAF7F5', surfaceElevated: '#F2EDE9', textPrimary: '#141416', textSecondary: '#4E4E55', textMuted: '#63636A', borderSubtle: '#ECE6E1',
        accent: '#C63D0E', accentSoft: '#FFE9DF', accentStrong: '#A13208', accentText: '#FFFFFF', accentBorder: '#F4A98A', danger: '#A3192E', success: '#2E7D4F',
        bubble: '#1C1C21', bubbleText: '#FFFFFF', chatBackground: '#FFFFFF', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#111113', surface: '#19191C', surfaceElevated: '#232327', textPrimary: '#F5F5F7', textSecondary: '#C5C5CC', textMuted: '#9A9AA2', borderSubtle: '#2D2D32',
        accent: '#FF8A4C', accentSoft: '#3A2318', accentStrong: '#FFA474', accentText: '#141416', accentBorder: '#8A4A2C', danger: '#F28B82', success: '#79C39A',
        bubble: '#3A2318', bubbleText: '#F5F5F7', chatBackground: '#111113', cardPaper: '#19191C', cardBase: '#19191C',
      },
    },
    look: { headingWeight: '800', cardShadowOpacity: 0.08, chatPattern: 'none' },
    shareNote: {
      id: 'motivation', name: 'Motivation', mood: 'Bold and uplifting', backgroundType: 'gradient',
      colors: { background: '#FF5A3D', backgroundEnd: '#FFB337', surface: '#131316', textPrimary: '#FFFFFF', textSecondary: '#C4C4CC', accent: '#FFB337', decoration: '#FFD27A' },
      fontStyle: 'bold', decorationStyle: 'soft-shapes', mark: 'bar', align: 'center',
    },
  },
  calm: {
    id: 'calm', category: 'personalities', name: 'Calm', description: 'Peaceful, soft and spacious',
    palette: {
      light: {
        background: '#F6F8F7', surface: '#EEF3F2', surfaceElevated: '#E3EBEA', textPrimary: '#22302F', textSecondary: '#4A5C5A', textMuted: '#5B6C6A', borderSubtle: '#DCE5E3',
        accent: '#487570', accentSoft: '#E1EEEC', accentStrong: '#375E59', accentText: '#FFFFFF', accentBorder: '#A5C4C0', danger: '#A8321F', success: '#36785B',
        bubble: '#E1EEEC', bubbleText: '#22302F', chatBackground: '#F2F6F5', cardPaper: '#FBFDFC', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#111716', surface: '#18201F', surfaceElevated: '#212B2A', textPrimary: '#E6EFEE', textSecondary: '#B3C3C1', textMuted: '#879896', borderSubtle: '#2B3634',
        accent: '#487570', accentSoft: '#1C2E2C', accentStrong: '#8FC3BC', accentText: '#FFFFFF', accentBorder: '#3F6661', danger: '#EE8B82', success: '#68A982',
        bubble: '#1F3533', bubbleText: '#E6EFEE', chatBackground: '#111716', cardPaper: '#18201F', cardBase: '#18201F',
      },
    },
    look: { headingWeight: '600', cardShadowOpacity: 0.04, chatPattern: 'none' },
    shareNote: {
      id: 'calm', name: 'Calm', mood: 'Soft and peaceful', backgroundType: 'gradient',
      colors: { background: '#E6F0F1', backgroundEnd: '#CADDE0', surface: '#F8FBFB', textPrimary: '#233F3E', textSecondary: '#557472', accent: '#5A8983', decoration: '#DCEAEA' },
      fontStyle: 'elegant', decorationStyle: 'soft-shapes', mark: 'none', align: 'center',
    },
  },
  creative: {
    id: 'creative', category: 'personalities', name: 'Creative', description: 'Expressive and editorial',
    palette: {
      light: {
        background: '#FBF9F4', surface: '#F4F0E7', surfaceElevated: '#EAE4D8', textPrimary: '#1E1A2B', textSecondary: '#4F4860', textMuted: '#625A74', borderSubtle: '#E3DCCF',
        accent: '#6A3FE0', accentSoft: '#EDE6FD', accentStrong: '#5230B8', accentText: '#FFFFFF', accentBorder: '#B9A3F3', danger: '#A8321F', success: '#2E7D4F',
        bubble: '#EDE6FD', bubbleText: '#1E1A2B', chatBackground: '#F8F5EE', cardPaper: '#FFFDF7', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#16131F', surface: '#1E1A2A', surfaceElevated: '#282336', textPrimary: '#F1EDFA', textSecondary: '#C6BEDA', textMuted: '#9A92AF', borderSubtle: '#332D44',
        accent: '#7650E8', accentSoft: '#2A2145', accentStrong: '#B9A2FF', accentText: '#FFFFFF', accentBorder: '#5A45A0', danger: '#F28B82', success: '#79C39A',
        bubble: '#2F2550', bubbleText: '#F1EDFA', chatBackground: '#16131F', cardPaper: '#1E1A2A', cardBase: '#1E1A2A',
      },
    },
    look: { headingWeight: '700', cardShadowOpacity: 0.08, chatPattern: 'confetti' },
    shareNote: {
      id: 'creative', name: 'Creative', mood: 'Artsy and expressive', backgroundType: 'pattern',
      colors: { background: '#2B1B5E', backgroundEnd: '#2B1B5E', surface: '#FFF9EE', textPrimary: '#1F1A33', textSecondary: '#5E5673', accent: '#7C4DFF', decoration: '#FF7AB6' },
      fontStyle: 'expressive', decorationStyle: 'confetti', mark: 'quote', align: 'left', confetti: ['#FF7AB6', '#FFD166', '#06D6A0', '#7C9BFF'],
    },
  },
  cute: {
    id: 'cute', category: 'personalities', name: 'Cute', description: 'Soft, friendly and charming',
    palette: {
      light: {
        background: '#FFF9FB', surface: '#FCF0F5', surfaceElevated: '#F7E3EC', textPrimary: '#3A2434', textSecondary: '#664A5E', textMuted: '#785A70', borderSubtle: '#F2DCE6',
        accent: '#A3479C', accentSoft: '#F8E6F6', accentStrong: '#83377D', accentText: '#FFFFFF', accentBorder: '#E0A8DA', danger: '#A8321F', success: '#36785B',
        bubble: '#F8E6F6', bubbleText: '#3A2434', chatBackground: '#FFF6F9', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#1B141A', surface: '#241B23', surfaceElevated: '#30242F', textPrimary: '#F8EDF5', textSecondary: '#D6BDD0', textMuted: '#AA90A4', borderSubtle: '#3B2D39',
        accent: '#A3479C', accentSoft: '#3A2238', accentStrong: '#F0A6E6', accentText: '#FFFFFF', accentBorder: '#7A3F74', danger: '#EE8B82', success: '#68A982',
        bubble: '#44283F', bubbleText: '#F8EDF5', chatBackground: '#1B141A', cardPaper: '#241B23', cardBase: '#241B23',
      },
    },
    look: { headingWeight: '700', cardShadowOpacity: 0.06, chatPattern: 'dots' },
    shareNote: {
      id: 'cute', name: 'Cute', mood: 'Charming and soft', backgroundType: 'pattern',
      colors: { background: '#FFE6F0', backgroundEnd: '#FFE6F0', surface: '#FFFFFF', textPrimary: '#5B3754', textSecondary: '#8D6A86', accent: '#EE5A96', decoration: '#FFC4DA' },
      fontStyle: 'playful', decorationStyle: 'dots', mark: 'tape', align: 'center', stickers: ['star', 'heart'],
    },
  },
  christmas: {
    id: 'christmas', category: 'personalities', name: 'Christmas', description: 'Festive pine, red and snow',
    palette: {
      light: {
        background: '#FBF8F3', surface: '#F4EEE4', surfaceElevated: '#EAE2D4', textPrimary: '#1F2A24', textSecondary: '#4E5A52', textMuted: '#5A655D', borderSubtle: '#E4DBCC',
        accent: '#1E6B47', accentSoft: '#E0EFE6', accentStrong: '#17553A', accentText: '#FFFFFF', accentBorder: '#9CC7AE', danger: '#B42318', success: '#2E7D4F',
        bubble: '#A8231C', bubbleText: '#FFFFFF', chatBackground: '#F8F3EA', cardPaper: '#FFFDF8', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#0F1A15', surface: '#16231C', surfaceElevated: '#1F2F26', textPrimary: '#F2EFE8', textSecondary: '#C5CCC6', textMuted: '#95A098', borderSubtle: '#2A3A31',
        accent: '#26804F', accentSoft: '#1B3A2B', accentStrong: '#8FD1AE', accentText: '#FFFFFF', accentBorder: '#3F7A5C', danger: '#F28B82', success: '#79C39A',
        bubble: '#8E1F18', bubbleText: '#FFFFFF', chatBackground: '#0F1A15', cardPaper: '#16231C', cardBase: '#16231C',
      },
    },
    look: { headingWeight: '700', cardShadowOpacity: 0.07, chatPattern: 'dots' },
    shareNote: {
      id: 'christmas', name: 'Christmas', mood: 'Festive and cosy', backgroundType: 'gradient',
      colors: { background: '#1F5A40', backgroundEnd: '#123A2A', surface: '#FFF9EF', textPrimary: '#1F2A24', textSecondary: '#5E5A4E', accent: '#B3261E', decoration: '#FFFFFF' },
      fontStyle: 'elegant', decorationStyle: 'stickers', mark: 'quote', align: 'center', stickers: ['snow', 'gift', 'snow-outline', 'star'],
    },
  },
  spooky: {
    id: 'spooky', category: 'personalities', name: 'Spooky', description: 'Moonlit purple and pumpkin',
    palette: {
      light: {
        background: '#FBF7F2', surface: '#F3ECE4', surfaceElevated: '#E9E0D5', textPrimary: '#231A2B', textSecondary: '#554A5E', textMuted: '#675C70', borderSubtle: '#E4DACE',
        accent: '#6B3FA0', accentSoft: '#FDE8D7', accentStrong: '#8A3A00', accentText: '#FFFFFF', accentBorder: '#F2A766', danger: '#B42318', success: '#2E7D4F',
        bubble: '#2A1F33', bubbleText: '#FFE9D6', chatBackground: '#F8F2EA', cardPaper: '#FFFCF7', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#120D18', surface: '#1B1423', surfaceElevated: '#261C30', textPrimary: '#F4EDE4', textSecondary: '#C9BFD3', textMuted: '#9C90A8', borderSubtle: '#33283F',
        accent: '#FF8A3D', accentSoft: '#3A2414', accentStrong: '#FFA05C', accentText: '#1A1016', accentBorder: '#8A4A1F', danger: '#F28B82', success: '#79C39A',
        bubble: '#2E1F3D', bubbleText: '#F4EDE4', chatBackground: '#120D18', cardPaper: '#1B1423', cardBase: '#1B1423',
      },
    },
    look: { headingWeight: '700', cardShadowOpacity: 0.09, chatPattern: 'dots' },
    shareNote: {
      id: 'spooky', name: 'Spooky', mood: 'Moonlit and mischievous', backgroundType: 'gradient',
      colors: { background: '#1A1026', backgroundEnd: '#3B1C4A', surface: '#1C1622', textPrimary: '#F6EEE3', textSecondary: '#BDB1C8', accent: '#FF8A3D', decoration: '#6E4D8E' },
      fontStyle: 'expressive', decorationStyle: 'stickers', mark: 'quote', align: 'center', stickers: ['moon', 'skull', 'flame', 'cloudy-night'],
    },
  },
  'new-year': {
    id: 'new-year', category: 'personalities', name: 'New Year', description: 'Midnight blue and champagne gold',
    palette: {
      light: {
        background: '#FAF8F3', surface: '#F2EEE4', surfaceElevated: '#E8E2D5', textPrimary: '#161427', textSecondary: '#4A4760', textMuted: '#5C5973', borderSubtle: '#E2DCCD',
        accent: '#2A2466', accentSoft: '#F6EBCB', accentStrong: '#6B4F00', accentText: '#F6D77A', accentBorder: '#D9B64A', danger: '#B42318', success: '#2E7D4F',
        bubble: '#2A2466', bubbleText: '#FFFFFF', chatBackground: '#F8F5EE', cardPaper: '#FFFDF7', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#0B0E1F', surface: '#141830', surfaceElevated: '#1E2340', textPrimary: '#F3F1FA', textSecondary: '#C3C1D8', textMuted: '#9795B0', borderSubtle: '#2A2F4F',
        accent: '#E3B53D', accentSoft: '#2E2814', accentStrong: '#F2CF6B', accentText: '#161427', accentBorder: '#8A7430', danger: '#F28B82', success: '#79C39A',
        bubble: '#262B52', bubbleText: '#F3F1FA', chatBackground: '#0B0E1F', cardPaper: '#141830', cardBase: '#141830',
      },
    },
    look: { headingWeight: '800', cardShadowOpacity: 0.08, chatPattern: 'confetti' },
    shareNote: {
      id: 'new-year', name: 'New Year', mood: 'Sparkling and hopeful', backgroundType: 'gradient',
      colors: { background: '#0B1026', backgroundEnd: '#2A1B4F', surface: '#FFFBF0', textPrimary: '#161427', textSecondary: '#4E4A63', accent: '#8A6A12', decoration: '#F5C542' },
      fontStyle: 'bold', decorationStyle: 'confetti', mark: 'bar', align: 'center', confetti: ['#F5C542', '#E8E8F0', '#D4AF37', '#FF8FB1'],
    },
  },
  faith: {
    id: 'faith', category: 'personalities', name: 'Faith', description: 'The cross of Jesus Christ, in warm light',
    palette: {
      light: {
        background: '#FCFAF5', surface: '#F5F0E6', surfaceElevated: '#ECE5D7', textPrimary: '#2B2418', textSecondary: '#5A4F3D', textMuted: '#6B604D', borderSubtle: '#E6DECF',
        accent: '#7A5C1E', accentSoft: '#F4EAD2', accentStrong: '#634A16', accentText: '#FFFFFF', accentBorder: '#D2B77A', danger: '#A8321F', success: '#36785B',
        bubble: '#F4EAD2', bubbleText: '#2B2418', chatBackground: '#FAF6EE', cardPaper: '#FFFDF8', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#15120D', surface: '#1E1A13', surfaceElevated: '#29241A', textPrimary: '#F4EFE4', textSecondary: '#CFC5B2', textMuted: '#A0967F', borderSubtle: '#352E22',
        accent: '#7A5C1E', accentSoft: '#2E2616', accentStrong: '#E3C68A', accentText: '#FFFFFF', accentBorder: '#6E5626', danger: '#EE8B82', success: '#68A982',
        bubble: '#3A301C', bubbleText: '#F4EFE4', chatBackground: '#15120D', cardPaper: '#1E1A13', cardBase: '#1E1A13',
      },
    },
    look: { headingWeight: '600', cardShadowOpacity: 0.05, chatPattern: 'cross' },
    shareNote: {
      id: 'faith', name: 'Faith', mood: 'The cross of Jesus Christ, in warm light', backgroundType: 'gradient',
      colors: { background: '#FFF4DF', backgroundEnd: '#EFD9AE', surface: '#FFFDF8', textPrimary: '#2B2418', textSecondary: '#6B5D45', accent: '#8C6A22', decoration: '#FFFFFF' },
      fontStyle: 'elegant', decorationStyle: 'cross', mark: 'cross', align: 'center',
    },
  },
  midnight: {
    id: 'midnight', category: 'personalities', name: 'Midnight', description: 'Quiet, starry and late-night',
    palette: {
      light: {
        background: '#F6F7FB', surface: '#EEF0F8', surfaceElevated: '#E3E6F2', textPrimary: '#141A33', textSecondary: '#454C6B', textMuted: '#585F7E', borderSubtle: '#DDE1EE',
        accent: '#3B45A8', accentSoft: '#E4E7FA', accentStrong: '#2E368A', accentText: '#FFFFFF', accentBorder: '#A7AEE6', danger: '#B42318', success: '#2E7D4F',
        bubble: '#E4E7FA', bubbleText: '#141A33', chatBackground: '#F3F4FA', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#0B1024', surface: '#121832', surfaceElevated: '#1B2244', textPrimary: '#ECEEFA', textSecondary: '#B8BEDD', textMuted: '#8F96BA', borderSubtle: '#262E55',
        accent: '#5563D6', accentSoft: '#1E2550', accentStrong: '#A9B4FF', accentText: '#FFFFFF', accentBorder: '#4A55A8', danger: '#F28B82', success: '#79C39A',
        bubble: '#262F66', bubbleText: '#ECEEFA', chatBackground: '#0B1024', cardPaper: '#121832', cardBase: '#121832',
      },
    },
    look: { headingWeight: '600', cardShadowOpacity: 0.06, chatPattern: 'dots' },
    shareNote: {
      id: 'midnight', name: 'Midnight', mood: 'Quiet and late-night', backgroundType: 'gradient',
      colors: { background: '#0E1530', backgroundEnd: '#322B7A', surface: '#161C38', textPrimary: '#ECEEFA', textSecondary: '#A5ACD0', accent: '#93A2FF', decoration: '#5D63B8' },
      fontStyle: 'elegant', decorationStyle: 'dots', mark: 'quote', align: 'center',
    },
  },
  // ── Generations ──
  // Each era speaks through type, palette, texture and spacing only. The
  // brief's colors are kept wherever they meet the contrast rules; where one
  // didn't (a button fill under white text, say), the hue stays and only the
  // shade moves.
  boomers: {
    id: 'boomers', category: 'generations', name: 'Boomers', description: 'Warm, classic and trustworthy',
    palette: {
      light: {
        background: '#F6F0E4', surface: '#FFFDF8', surfaceElevated: '#EFE7D8', textPrimary: '#292521', textSecondary: '#554D44', textMuted: '#645C52', borderSubtle: '#D8CEBF',
        accent: '#7B2D3E', accentSoft: '#F4E4E4', accentStrong: '#6A2535', accentText: '#FFFFFF', accentBorder: '#C99AA4', danger: '#A8321F', success: '#465B45',
        bubble: '#E3EADD', bubbleText: '#292521', chatBackground: '#F3ECDF', cardPaper: '#FFFDF8', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#1A1714', surface: '#231F1B', surfaceElevated: '#2E2924', textPrimary: '#F4EEE4', textSecondary: '#D0C7B9', textMuted: '#A59C8E', borderSubtle: '#443C34',
        accent: '#A8475C', accentSoft: '#3A2228', accentStrong: '#E9A7B4', accentText: '#FFFFFF', accentBorder: '#7D3B4A', danger: '#EE8B82', success: '#8FB08C',
        bubble: '#2D3A2C', bubbleText: '#F4EEE4', chatBackground: '#1A1714', cardPaper: '#231F1B', cardBase: '#231F1B',
      },
    },
    look: { headingWeight: '700', headingFont: 'serif', cardShadowOpacity: 0.06, chatPattern: 'none' },
    shareNote: {
      id: 'boomers', name: 'Boomers', mood: 'Classic stationery, like a written letter', backgroundType: 'pattern',
      colors: { background: '#F1E8D6', backgroundEnd: '#F1E8D6', surface: '#FFFDF8', textPrimary: '#292521', textSecondary: '#645C52', accent: '#7B2D3E', decoration: '#DDD0BA' },
      fontStyle: 'classic', decorationStyle: 'ruled', mark: 'quote', align: 'left',
    },
  },
  'gen-x': {
    id: 'gen-x', category: 'generations', name: 'Gen X', description: 'Dark, understated and retro-modern',
    palette: {
      light: {
        background: '#F2F0EB', surface: '#FAF9F6', surfaceElevated: '#E6E3DC', textPrimary: '#1B1B1B', textSecondary: '#46443F', textMuted: '#5A5751', borderSubtle: '#D3CFC6',
        accent: '#7A5A14', accentSoft: '#F1E7CE', accentStrong: '#664B10', accentText: '#FFFFFF', accentBorder: '#CDB37A', danger: '#A8321F', success: '#4E6159',
        bubble: '#242424', bubbleText: '#F2EFE9', chatBackground: '#EEEBE5', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#171717', surface: '#242424', surfaceElevated: '#2E2E2E', textPrimary: '#F2EFE9', textSecondary: '#CFCAC1', textMuted: '#AAA59D', borderSubtle: '#3A3A3A',
        accent: '#D8A84E', accentSoft: '#2E2718', accentStrong: '#E6BE6E', accentText: '#171717', accentBorder: '#7A6231', danger: '#F28B82', success: '#93AA9F',
        bubble: '#313B37', bubbleText: '#F2EFE9', chatBackground: '#171717', cardPaper: '#242424', cardBase: '#242424',
      },
    },
    look: { headingWeight: '700', headingFont: 'mono', cardShadowOpacity: 0.03, chatPattern: 'grain' },
    shareNote: {
      id: 'gen-x', name: 'Gen X', mood: 'A cassette label on a dark shell', backgroundType: 'pattern',
      colors: { background: '#171717', backgroundEnd: '#171717', surface: '#F2EFE9', textPrimary: '#1B1B1B', textSecondary: '#57534C', accent: '#8A6212', decoration: '#2A2A2A' },
      fontStyle: 'mono', decorationStyle: 'cassette', mark: 'bar', align: 'left', confetti: ['#D8A84E', '#C2693E', '#6F7F78'],
    },
  },
  millennials: {
    id: 'millennials', category: 'generations', name: 'Millennials', description: 'Clean, soft and polished',
    palette: {
      light: {
        background: '#F7F4F0', surface: '#FFFFFF', surfaceElevated: '#EFEAE4', textPrimary: '#30343B', textSecondary: '#52575F', textMuted: '#61666E', borderSubtle: '#E7E0DA',
        accent: '#5E6F88', accentSoft: '#E9EDF3', accentStrong: '#4B5A71', accentText: '#FFFFFF', accentBorder: '#B3BFD0', danger: '#A8321F', success: '#4E6B49',
        bubble: '#F2E4E1', bubbleText: '#30343B', chatBackground: '#F5F1EC', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#16181C', surface: '#1E2126', surfaceElevated: '#282C32', textPrimary: '#EEEFF1', textSecondary: '#C4C7CD', textMuted: '#9A9EA6', borderSubtle: '#33373E',
        accent: '#61728C', accentSoft: '#252C37', accentStrong: '#B0BED3', accentText: '#FFFFFF', accentBorder: '#4E5B6F', danger: '#EE8B82', success: '#A3B89E',
        bubble: '#3B3032', bubbleText: '#F3ECEA', chatBackground: '#16181C', cardPaper: '#1E2126', cardBase: '#1E2126',
      },
    },
    look: { headingWeight: '600', cardShadowOpacity: 0.08, chatPattern: 'soft-shapes' },
    shareNote: {
      id: 'millennials', name: 'Millennials', mood: 'A tidy planner page in soft pastels', backgroundType: 'gradient',
      colors: { background: '#F6E9E4', backgroundEnd: '#E4EAF2', surface: '#FFFFFF', textPrimary: '#30343B', textSecondary: '#61666E', accent: '#9C6F68', decoration: '#D5C9C2' },
      fontStyle: 'casual', decorationStyle: 'dot-grid', mark: 'tape', align: 'left',
    },
  },
  'gen-z': {
    id: 'gen-z', category: 'generations', name: 'Gen Z', description: 'Bold, expressive and social',
    palette: {
      light: {
        background: '#FAFAFA', surface: '#FFFFFF', surfaceElevated: '#F0F0F2', textPrimary: '#121212', textSecondary: '#48484D', textMuted: '#5E5E65', borderSubtle: '#E2E2E6',
        // Lime can't carry text on white, so in light mode it rides on near-black buttons.
        accent: '#121212', accentSoft: '#EEFFD4', accentStrong: '#3B6300', accentText: '#B7FF3C', accentBorder: '#A6E04A', danger: '#B3261E', success: '#2E7D4F',
        bubble: '#9B7BFF', bubbleText: '#121212', chatBackground: '#F7F7F8', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#121212', surface: '#1C1C1E', surfaceElevated: '#26262A', textPrimary: '#FFFFFF', textSecondary: '#D2D2D2', textMuted: '#B5B5B5', borderSubtle: '#343434',
        accent: '#B7FF3C', accentSoft: '#26330F', accentStrong: '#C9FF6E', accentText: '#121212', accentBorder: '#6A9A20', danger: '#FF8A8A', success: '#7BE0A0',
        bubble: '#9B7BFF', bubbleText: '#121212', chatBackground: '#121212', cardPaper: '#1C1C1E', cardBase: '#1C1C1E',
      },
    },
    look: { headingWeight: '800', cardShadowOpacity: 0.08, chatPattern: 'confetti', patternColors: ['#B7FF3C', '#9B7BFF', '#FF6EC7'] },
    shareNote: {
      id: 'gen-z', name: 'Gen Z', mood: 'A bold social card with stickers', backgroundType: 'gradient',
      colors: { background: '#9B7BFF', backgroundEnd: '#FF6EC7', surface: '#1C1C1E', textPrimary: '#FFFFFF', textSecondary: '#B5B5B5', accent: '#B7FF3C', decoration: '#FFFFFF' },
      fontStyle: 'bold', decorationStyle: 'stickers', mark: 'tape', align: 'left', stickers: ['flash', 'star', 'sparkles', 'heart'],
    },
  },
  'gen-alpha': {
    id: 'gen-alpha', category: 'generations', name: 'Gen Alpha', description: 'Bright, futuristic and playful',
    palette: {
      light: {
        background: '#EEF7FF', surface: '#FFFFFF', surfaceElevated: '#E3EDFA', textPrimary: '#1C2440', textSecondary: '#434C69', textMuted: '#555D7B', borderSubtle: '#DCE6F5',
        accent: '#3F57E8', accentSoft: '#E4E9FF', accentStrong: '#3043C4', accentText: '#FFFFFF', accentBorder: '#A8B5FF', danger: '#B3261E', success: '#00796B',
        bubble: '#3F57E8', bubbleText: '#FFFFFF', chatBackground: '#EAF4FF', cardPaper: '#FFFFFF', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#0E1224', surface: '#161B33', surfaceElevated: '#1F2542', textPrimary: '#EEF2FF', textSecondary: '#BCC3E0', textMuted: '#9199BB', borderSubtle: '#2A3257',
        accent: '#4A62F2', accentSoft: '#1F2754', accentStrong: '#AAB7FF', accentText: '#FFFFFF', accentBorder: '#4A58B0', danger: '#FF8A8A', success: '#4FD1C5',
        bubble: '#2C3A8C', bubbleText: '#EEF2FF', chatBackground: '#0E1224', cardPaper: '#161B33', cardBase: '#161B33',
      },
    },
    look: { headingWeight: '700', headingFont: 'rounded', cardShadowOpacity: 0.07, chatPattern: 'geometric', patternColors: ['#536DFE', '#00C8C8', '#FFB84D', '#FF70A6'] },
    shareNote: {
      id: 'gen-alpha', name: 'Gen Alpha', mood: 'A futuristic card with floating shapes', backgroundType: 'gradient',
      colors: { background: '#DDEFFF', backgroundEnd: '#EADFFF', surface: '#FFFFFF', textPrimary: '#1C2440', textSecondary: '#555D7B', accent: '#3F57E8', decoration: '#FFFFFF' },
      fontStyle: 'playful', decorationStyle: 'geometric', mark: 'bar', align: 'left', confetti: ['#536DFE', '#00C8C8', '#FFB84D', '#FF70A6'],
    },
  },

  // ── Limited Edition ──
  // Themes with their own artwork, worn in the header band.
  'game-changer': {
    id: 'game-changer', category: 'limited-edition', name: 'Game Changer', description: 'Sunlit arches, navy and garden gold',
    palette: {
      light: {
        background: '#F8F4EC', surface: '#FFFCF6', surfaceElevated: '#EFE8DA', textPrimary: '#18203A', textSecondary: '#454C60', textMuted: '#5A6072', borderSubtle: '#E3DACA',
        accent: '#24366B', accentSoft: '#E3E8F4', accentStrong: '#1C2B57', accentText: '#FFFFFF', accentBorder: '#A7B4D6', danger: '#A8321F', success: '#3B6B2E',
        bubble: '#24366B', bubbleText: '#FFFFFF', chatBackground: '#F5F0E6', cardPaper: '#FFFCF6', cardBase: '#FFFFFF',
      },
      dark: {
        background: '#0F1422', surface: '#161C2D', surfaceElevated: '#20273B', textPrimary: '#F2EEE4', textSecondary: '#C3C7D3', textMuted: '#979DAE', borderSubtle: '#2A3148',
        accent: '#E0B43A', accentSoft: '#2E2A1A', accentStrong: '#F0CB62', accentText: '#18203A', accentBorder: '#7A6428', danger: '#F28B82', success: '#79B38A',
        bubble: '#24366B', bubbleText: '#F2EEE4', chatBackground: '#0F1422', cardPaper: '#161C2D', cardBase: '#161C2D',
      },
    },
    look: { headingWeight: '800', cardShadowOpacity: 0.07, chatPattern: 'none', bandImage: 'game-changer' },
    shareNote: {
      id: 'game-changer', name: 'Game Changer', mood: 'Bold, sunny and self-made', backgroundType: 'gradient',
      colors: { background: '#1E2A47', backgroundEnd: '#2F5A3A', surface: '#FFFCF6', textPrimary: '#18203A', textSecondary: '#5A6072', accent: '#B8861A', decoration: '#E0B43A' },
      fontStyle: 'bold', decorationStyle: 'soft-shapes', mark: 'bar', align: 'left',
    },
  },
};

export const CHITS_THEME_LIST: ChitsTheme[] = CHITS_THEME_IDS.map((id) => CHITS_THEMES[id]);

// Share Note offers every identity's design; looks that exist only for sharing
// can be added here.
const SHARE_NOTE_EXTRAS: ShareNoteTheme[] = [];

export const SHARE_NOTE_THEMES: ShareNoteTheme[] = [...CHITS_THEME_LIST.map((theme) => theme.shareNote), ...SHARE_NOTE_EXTRAS];

/** Settings → Theme, grouped: Personalities first, then Generations. */
export const CHITS_THEME_COLLECTIONS = THEME_COLLECTIONS.map((collection) => ({
  ...collection, shown: !HIDDEN_THEME_COLLECTIONS.has(collection.id), themes: CHITS_THEME_LIST.filter((theme) => theme.category === collection.id),
}));

/** Share Note → Theme, grouped the same way; sharing-only extras join Personalities. */
export const SHARE_NOTE_COLLECTIONS = CHITS_THEME_COLLECTIONS.map((collection) => ({
  id: collection.id, name: collection.name, shown: collection.shown,
  themes: [...collection.themes.map((theme) => theme.shareNote), ...(collection.id === 'personalities' ? SHARE_NOTE_EXTRAS : [])],
}));

export function getShareNoteTheme(id: string): ShareNoteTheme {
  return SHARE_NOTE_THEMES.find((theme) => theme.id === id) ?? SHARE_NOTE_THEMES[0];
}

/** Share Note opens on the design that matches the app's theme; the user can still pick any. */
export function shareNoteThemeForIdentity(identity: ChitsThemeIdentity): string {
  return CHITS_THEMES[identity].shareNote.id;
}

// ── Top bar ──────────────────────────────────────────────────────────────────

/**
 * The status-bar strip and screen header wear the theme's Share Note
 * background at full strength — the same gradient and decoration as the image.
 * `ink`/`inkMuted` are the header's text and icon colors on it (readable on
 * both gradient ends), and `dark` picks light status-bar icons.
 */
export type TopBarStyle = {
  share: ShareNoteTheme; colors: [string, string]; ink: string; inkMuted: string; dark: boolean;
  /** A picture drawn instead of the pattern, under a scrim of the first gradient stop (see TOP_BAR_IMAGE_SCRIM). */
  image: ThemeImageId | null;
};

/**
 * How strongly a band picture is tinted with the band's first color. At 0.66
 * even a pure-white patch of the picture comes out dark enough for white
 * header text (tested against the band's own navy).
 */
export const TOP_BAR_IMAGE_SCRIM = 0.66;

const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);
function luminance(hex: string) {
  const [r, g, b] = [0, 1, 2].map((index) => channel(hex, index) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); }
function mix(from: string, to: string, amount: number) {
  return `#${[0, 1, 2].map((index) => Math.round(channel(from, index) + (channel(to, index) - channel(from, index)) * amount).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}
const readableOn = (ink: string, stops: string[], min: number) => stops.every((stop) => contrast(ink, stop) >= min);

/** null for Default, which keeps its familiar plain header. */
export function topBarForIdentity(identity: ChitsThemeIdentity): TopBarStyle | null {
  if (identity === DEFAULT_THEME_IDENTITY) return null;
  const share = CHITS_THEMES[identity].shareNote;
  const stops: [string, string] = [share.colors.background, share.colors.backgroundEnd];
  const dark = (luminance(stops[0]) + luminance(stops[1])) / 2 < 0.18;
  const ink = dark ? '#FFFFFF' : readableOn(share.colors.textPrimary, stops, 4.5) ? share.colors.textPrimary : '#141414';
  // The softest step toward the background that still reads comfortably.
  let inkMuted = ink;
  for (const amount of [0.4, 0.3, 0.2, 0.1]) {
    const candidate = mix(ink, stops[0], amount);
    if (readableOn(candidate, stops, 4.5)) { inkMuted = candidate; break; }
  }
  const image = CHITS_THEMES[identity].look.bandImage ?? null;
  // Over a picture, a softened ink isn't guaranteed to read on its brightest
  // patch; subtitles there use the full ink.
  return { share, colors: stops, ink, inkMuted: image ? ink : inkMuted, dark, image };
}
