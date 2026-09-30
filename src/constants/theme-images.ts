import type { ThemeImageId } from './chits-themes';

// The bundled pictures a theme can wear in its header band (see
// ChitsLook.bandImage). Kept apart from chits-themes.ts so that file stays
// plain data the tests can load without Metro.
export const THEME_IMAGES: Record<ThemeImageId, number> = {
  'game-changer': require('@/assets/images/game_changer.webp'),
};
