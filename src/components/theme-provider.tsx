import { tr } from '@/localization/runtime';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { isLoaded, loadAsync } from 'expo-font';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { chatThemes, getThemeTokens, type ChatThemeKey, type ThemeTokens } from '@/constants/theme';
import { CHITS_THEMES, resolveThemeIdentity, THEME_SETTING_KEY, topBarForIdentity, type ChitsLook, type ChitsThemeIdentity, type TopBarStyle } from '@/constants/chits-themes';
import { resolveAppStyle, STICKY_FONT_FAMILIES, STYLE_PRESETS, STYLE_SETTING_KEY, styleColors, type AppStyle, type StyleColors, type StyleTokens } from '@/constants/style-tokens';
import { attachmentExists, deleteAttachment } from '@/services/attachment-storage';
import { HEADER_PHOTO_KEY, parseHeaderPhoto, type HeaderPhoto } from '@/services/header-photo';
import { headerPhotoCanDelete, writeHeaderPhoto } from '@/db/header-photo';
import { STICKY_FONTS } from '@/constants/style-fonts';
import { HEADER_SCENE_PHOTO } from '@/constants/theme-images';
import { useSceneInk } from '@/hooks/use-scene-clock';

export type AppAppearance = 'system' | 'light' | 'dark';
type ThemeContextValue = {
  customHeader: HeaderPhoto | null; setCustomHeader: (photo: HeaderPhoto | null) => Promise<void>;
  headerPhotoFailed: boolean; failHeaderPhoto: () => void;
  /** What every screen header shows: the custom photo, else Default's time-of-day scene, else null (the theme's band). */
  headerPhoto: HeaderPhoto | null;
  appearance: AppAppearance; setAppearance: (value: AppAppearance) => Promise<void>; scheme: 'light' | 'dark';
  /** The app's personality (Settings → Appearance → Theme). */
  identity: ChitsThemeIdentity; setIdentity: (identity: ChitsThemeIdentity) => Promise<void>;
  /** Default theme's accent color (Settings → Appearance → Accent color). */
  themeKey: ChatThemeKey; setThemeKey: (key: ChatThemeKey) => Promise<void>;
  tokens: ThemeTokens; look: ChitsLook; themes: typeof chatThemes;
  /** The Share Note background the status bar and headers wear; null for Default. */
  topBar: TopBarStyle | null;
  /** Shape, depth and type (Settings → Appearance → Style), independent of the palette. */
  style: AppStyle; setStyle: (style: AppStyle) => Promise<void>;
  styleTokens: StyleTokens;
  /** Colors the style derives from the active palette (card tint, outline…). */
  styleColors: StyleColors;
};
const ThemeContext = createContext<ThemeContextValue | null>(null);
const isThemeKey = (value: string | null): value is ChatThemeKey => Boolean(value && value in chatThemes);
const isAppearance = (value: string | null): value is AppAppearance => value === 'system' || value === 'light' || value === 'dark';

type StoredTheme = { identity: ChitsThemeIdentity; themeKey: ChatThemeKey; appearance: AppAppearance; style: AppStyle };

// Read once, synchronously, before the first frame: the database is already
// open here (SQLiteProvider renders children only after init), and reading it
// later would paint one frame in Default before switching to the saved theme.
function readStoredTheme(database: SQLiteDatabase): StoredTheme {
  const stored: StoredTheme = { identity: 'default', themeKey: 'logo', appearance: 'light', style: 'classic' };
  try {
    const rows = database.getAllSync<{ key: string; value: string }>('SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?)', THEME_SETTING_KEY, 'chat_color_theme', 'app_appearance', STYLE_SETTING_KEY);
    for (const row of rows) {
      if (row.key === THEME_SETTING_KEY) stored.identity = resolveThemeIdentity(row.value);
      if (row.key === 'chat_color_theme' && isThemeKey(row.value)) stored.themeKey = row.value;
      if (row.key === 'app_appearance' && isAppearance(row.value)) stored.appearance = row.value;
      if (row.key === STYLE_SETTING_KEY) stored.style = resolveAppStyle(row.value);
    }
  } catch { /* Missing table on a brand-new install: the defaults above. */ }
  return stored;
}

const saveSetting = (database: SQLiteDatabase, key: string, value: string) =>
  database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', key, value, Date.now());

export function ThemeProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const [stored] = useState(() => readStoredTheme(database));
  const [identity, setIdentityState] = useState(stored.identity);
  const [themeKey, setTheme] = useState(stored.themeKey);
  const [appearance, updateAppearance] = useState(stored.appearance);
  const [style, setStyleState] = useState(stored.style);
  const [customHeader, setHeaderState] = useState(() => {
    try { return parseHeaderPhoto(database.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', HEADER_PHOTO_KEY)?.value); } catch { return null; }
  });
  const [headerPhotoFailed, setHeaderPhotoFailed] = useState(false);
  const failHeaderPhoto = useCallback(() => setHeaderPhotoFailed(true), []);
  useEffect(() => {
    let active = true;
    if (customHeader) void attachmentExists(customHeader.storagePath).then((exists) => { if (active && !exists) setHeaderPhotoFailed(true); }).catch(() => { if (active) setHeaderPhotoFailed(true); });
    return () => { active = false; };
  }, [customHeader]);
  const setCustomHeader = useCallback(async (next: HeaderPhoto | null) => {
    if (next && !await attachmentExists(next.storagePath)) throw new Error(tr("themeprovider.thisPhotoIsNoLongerAvailableChooseIt"));
    const previous = await writeHeaderPhoto(database, next);
    setHeaderPhotoFailed(false);
    setHeaderState(next);
    // Cleanup is best effort after the setting commits; a cleanup failure must
    // never make the editor delete the newly committed file as an unsaved draft.
    if (previous && previous.storagePath !== next?.storagePath) {
      try { if (await headerPhotoCanDelete(database, previous.storagePath)) await deleteAttachment(previous.storagePath); } catch { /* Keep the unreferenced copy. */ }
    }
  }, [database]);
  // Sticky's faces are bundled with the app; they register the first time
  // Sticky is worn, and the platform faces stand in for that frame or two.
  const [stickyFontsReady, setStickyFontsReady] = useState(() => STICKY_FONT_FAMILIES.every((family) => isLoaded(family)));
  useEffect(() => {
    if (style !== 'sticky' || stickyFontsReady) return;
    let active = true;
    void loadAsync(STICKY_FONTS).then(() => { if (active) setStickyFontsReady(true); }, () => {});
    return () => { active = false; };
  }, [style, stickyFontsReady]);
  const systemScheme = useColorScheme();
  const scheme = appearance === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : appearance;
  const showsScene = identity === 'default' && !(customHeader && !headerPhotoFailed);
  const sceneInk = useSceneInk(scheme, showsScene);
  useEffect(() => { Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance); }, [appearance]);
  // Applied first, saved second: the whole app re-themes in place (no remount,
  // no lost scroll position), and a failed write rolls it back.
  const setIdentity = useCallback(async (next: ChitsThemeIdentity) => {
    const previous = identity;
    setIdentityState(next);
    try { await saveSetting(database, THEME_SETTING_KEY, next); } catch (error) { setIdentityState(previous); throw error; }
  }, [database, identity]);
  const setThemeKey = useCallback(async (key: ChatThemeKey) => { await saveSetting(database, 'chat_color_theme', key); setTheme(key); }, [database]);
  const setAppearance = useCallback(async (next: AppAppearance) => { await saveSetting(database, 'app_appearance', next); updateAppearance(next); }, [database]);
  // Applied first, like the theme, so every screen restyles in place.
  const setStyle = useCallback(async (next: AppStyle) => {
    const previous = style;
    setStyleState(next);
    try { await saveSetting(database, STYLE_SETTING_KEY, next); } catch (error) { setStyleState(previous); throw error; }
  }, [database, style]);
  const value = useMemo(() => {
    const tokens = getThemeTokens(identity, themeKey, scheme);
    const preset = STYLE_PRESETS[style];
    const styleTokens = preset.font.display && !stickyFontsReady ? { ...preset, font: STYLE_PRESETS.classic.font } : preset;
    const headerPhoto = customHeader && !headerPhotoFailed ? customHeader : showsScene ? HEADER_SCENE_PHOTO[sceneInk] : null;
    return {
      customHeader, setCustomHeader, headerPhotoFailed, failHeaderPhoto, headerPhoto,
      appearance, setAppearance, scheme, identity, setIdentity, themeKey, setThemeKey,
      tokens, look: CHITS_THEMES[identity].look, themes: chatThemes, topBar: topBarForIdentity(identity),
      style, setStyle, styleTokens, styleColors: styleColors(tokens),
    };
  }, [customHeader, setCustomHeader, headerPhotoFailed, failHeaderPhoto, showsScene, sceneInk, appearance, setAppearance, scheme, identity, setIdentity, setThemeKey, themeKey, style, setStyle, stickyFontsReady]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() {
  const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used within ThemeProvider.'); return value; }
// For the rare component that can render before ThemeProvider mounts (e.g. the
// root Suspense fallback while DatabaseProvider/ThemeProvider are still
// suspended) — returns null instead of throwing, so callers fall back to the
// static default tokens rather than crashing.
export function useOptionalTheme() {
  return useContext(ThemeContext); }
