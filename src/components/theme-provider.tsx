import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { chatThemes, getThemeTokens, type ChatThemeKey, type ThemeTokens } from '@/constants/theme';

export type AppAppearance = 'system' | 'light' | 'dark';
type ThemeContextValue = { appearance: AppAppearance; setAppearance: (value: AppAppearance) => Promise<void>; scheme: 'light' | 'dark'; themeKey: ChatThemeKey; setThemeKey: (key: ChatThemeKey) => Promise<void>; tokens: ThemeTokens; themes: typeof chatThemes };
const ThemeContext = createContext<ThemeContextValue | null>(null);
const isThemeKey = (value: string | null): value is ChatThemeKey => Boolean(value && value in chatThemes);
export function ThemeProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext(); const [themeKey, setTheme] = useState<ChatThemeKey>('light');
  const [appearance, updateAppearance] = useState<AppAppearance>('light');
  const systemScheme = useColorScheme();
  const scheme = appearance === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : appearance;
  useEffect(() => { Appearance.setColorScheme(appearance === 'system' ? 'unspecified' : appearance); }, [appearance]);
  useEffect(() => { let active = true; void database.getAllAsync<{ key: string; value: string }>("SELECT key, value FROM app_settings WHERE key IN ('chat_color_theme', 'app_appearance')").then((rows) => { if (!active) return; for (const row of rows) { if (row.key === 'chat_color_theme' && isThemeKey(row.value)) setTheme(row.value); if (row.key === 'app_appearance' && ['system', 'light', 'dark'].includes(row.value)) updateAppearance(row.value as AppAppearance); } }).catch(() => undefined); return () => { active = false; }; }, [database]);
  const setThemeKey = useCallback(async (key: ChatThemeKey) => { await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'chat_color_theme', key, Date.now()); setTheme(key); }, [database]);
  const setAppearance = useCallback(async (next: AppAppearance) => { await database.runAsync('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', 'app_appearance', next, Date.now()); updateAppearance(next); }, [database]);
  const value = useMemo(() => ({ appearance, setAppearance, scheme, themeKey, setThemeKey, tokens: getThemeTokens(themeKey, scheme), themes: chatThemes }), [appearance, setAppearance, scheme, setThemeKey, themeKey]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error('useTheme must be used within ThemeProvider.'); return value; }
// For the rare component that can render before ThemeProvider mounts (e.g. the
// root Suspense fallback while DatabaseProvider/ThemeProvider are still
// suspended) — returns null instead of throwing, so callers fall back to the
// static default tokens rather than crashing.
export function useOptionalTheme() { return useContext(ThemeContext); }
