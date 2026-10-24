import type { ThemeImageId } from './chits-themes';
import type { HeaderPhoto } from '@/services/header-photo';
import { HEADER_SCENE_DARK_INK, type HeaderSceneId, type HeaderSceneInk } from './header-scenes';
import { HEADER_SCENE_SIZE } from './header-scenes.generated';

// The bundled pictures a theme can wear in its header band (see
// ChitsLook.bandImage). Kept apart from chits-themes.ts so that file stays
// plain data the tests can load without Metro.
export const THEME_IMAGES: Record<ThemeImageId, number> = {
  'game-changer': require('@/assets/images/game_changer.webp'),
};

// Default's header when no custom photo is chosen: the time-of-day scene
// (header-scene-layer.tsx), framed through the same photo math and a little
// right of center so the window stays in view on taller headers. Its ink
// follows the hour, so the header and status bar read dark by day and white
// by night (see header-scenes.ts).
export const HEADER_SCENE_IMAGES: Record<HeaderSceneId, number> = {
  dawn: require('@/assets/images/header-scenes/dawn.webp'),
  morning: require('@/assets/images/header-scenes/morning.webp'),
  afternoon: require('@/assets/images/header-scenes/afternoon.webp'),
  golden: require('@/assets/images/header-scenes/golden.webp'),
  evening: require('@/assets/images/header-scenes/evening.webp'),
  night: require('@/assets/images/header-scenes/night.webp'),
};
const SCENE_PHOTO: HeaderPhoto = { storagePath: '', width: HEADER_SCENE_SIZE.width, height: HEADER_SCENE_SIZE.height, x: 0.6, y: 0.5, zoom: 1, overlay: 0, scene: true };
export const HEADER_SCENE_PHOTO: Record<HeaderSceneInk, HeaderPhoto> = {
  dark: { ...SCENE_PHOTO, ink: HEADER_SCENE_DARK_INK },
  light: SCENE_PHOTO,
};

// The side panel's pastel sticky-note wallpaper, light mode only.
export const DRAWER_BACKGROUND: number = require('@/assets/images/drawer_background.webp');