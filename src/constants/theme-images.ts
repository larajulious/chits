import type { ThemeImageId } from './chits-themes';
import type { HeaderPhoto } from '@/services/header-photo';

// The bundled pictures a theme can wear in its header band (see
// ChitsLook.bandImage). Kept apart from chits-themes.ts so that file stays
// plain data the tests can load without Metro.
export const THEME_IMAGES: Record<ThemeImageId, number> = {
  'game-changer': require('@/assets/images/game_changer.webp'),
};

// Default's header when no custom photo is chosen, drawn through the same
// photo layer. The picture is a pale sunlit wall, so light mode shows it
// unscrimmed under dark ink (11:1+ on the wall and desk; dark status bar),
// and dark mode dims it like a user photo (60%) under white ink (5.9:1+).
const DEFAULT_HEADER_PICTURE = { storagePath: '', asset: require('@/assets/images/default_header_mascot.webp'), width: 2170, height: 725, x: 0.5, y: 0.5, zoom: 1 };
export const DEFAULT_HEADER_PHOTO: Record<'light' | 'dark', HeaderPhoto> = {
  light: { ...DEFAULT_HEADER_PICTURE, overlay: 0, ink: { text: '#24231F', muted: '#5F5C52' } },
  dark: { ...DEFAULT_HEADER_PICTURE, overlay: 0.6 },
};

// The side panel's pastel sticky-note wallpaper, light mode only.
export const DRAWER_BACKGROUND: number = require('@/assets/images/drawer_background.webp');