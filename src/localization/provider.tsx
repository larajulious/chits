import { languageDirection } from './text-layout';
import { readLanguagePreference, saveLanguagePreference } from './preferences';
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { getCalendars, getLocales } from 'expo-localization';
import { useSQLiteContext } from 'expo-sqlite';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { getFormattingLocale, matchSupportedLanguage, i18n, resolveLanguage, setFormattingPreferences, type Language, type LanguagePreference } from './runtime';

type LanguageState = { preference: LanguagePreference; language: Language; locale: string; setLanguage: (next: LanguagePreference) => Promise<void> };
const LanguageContext = createContext<LanguageState | null>(null);
function apply(preference: LanguagePreference) {
  let tags = ['en'];
  let uses24: boolean | null = null;
  let timeZone: string | null = null;
  try { tags = getLocales().map((locale) => locale.languageTag); const calendar = getCalendars()[0]; uses24 = calendar?.uses24hourClock; timeZone = calendar?.timeZone; } catch { /* Offline English fallback also supports previews. */ }
  const language = resolveLanguage(preference, tags);
  // System keeps the supported device locale's region (e.g. es-MX / en-GB).
  const regional = preference === 'system' ? tags.find((tag) => matchSupportedLanguage(tag) === language) : undefined;
  setFormattingPreferences(regional?.replace(/^tl(?=-|$)/i, 'fil') ?? language, uses24, timeZone);
  if (i18n.resolvedLanguage !== language) void i18n.changeLanguage(language);
  return { language, locale: getFormattingLocale(), clock24: uses24, timeZone };
}
export function LanguageProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const [state, update] = useState<(ReturnType<typeof apply> & { preference: LanguagePreference }) | null>(null);
  // Publish the saved locale before painting the main tree, outside render:
  // loading UI may already be subscribed to the shared i18next instance.
  useLayoutEffect(() => {
    const preference = readLanguagePreference(database);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Synchronize the external i18next store before the first main-screen paint.
    update({ preference, ...apply(preference) });
  }, [database]);
  const setLanguage = useCallback(async (preference: LanguagePreference) => {
    // Commit only this preference before publishing; a failed write keeps the current language.
    await saveLanguagePreference(database, preference);
    update({ preference, ...apply(preference) });
  }, [database]);
  useEffect(() => {
    if (!state) return;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      const resolved = apply(state.preference);
      update(current => !current ? current : current.language === resolved.language && current.locale === resolved.locale && current.clock24 === resolved.clock24 && current.timeZone === resolved.timeZone ? current : { ...current, ...resolved });
    });
    return () => subscription.remove();
  }, [state]);
  const value = useMemo(() => (state ? { ...state, setLanguage } : null), [state, setLanguage]);
  if (!value) return null;
  return <I18nextProvider i18n={i18n}><LanguageContext.Provider value={value}>{children}</LanguageContext.Provider></I18nextProvider>;
}
export function useLanguage() {
  const state = useContext(LanguageContext);
  if (!state) throw new Error('useLanguage requires LanguageProvider');
  return state;
}
/** Subscribe without changing component identity, editor state, or navigation keys. */
export function useLocale() {
  useTranslation(undefined, { i18n });
  return useContext(LanguageContext)?.locale ?? getFormattingLocale();
}

/** Direction applies to evaluated UI surfaces, not physical board/canvas geometry. */
export function useDirection() {
  const locale = useLocale();
  const direction = languageDirection(locale);
  return { direction, isRTL: direction === 'rtl', rowStyle: { flexDirection: direction === 'rtl' ? 'row-reverse' as const : 'row' as const } };
}
