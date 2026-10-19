import './plurals';
import { createInstance } from 'i18next';
import en from './locales/en.json';
import fil from './locales/fil.json';
import ptBR from './locales/pt-BR.json';
import es from './locales/es.json';

import id from './locales/id.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';
import it from './locales/it.json';
import vi from './locales/vi.json';
import hi from './locales/hi.json';
import turkish from './locales/tr.json';
import ar from './locales/ar.json';
import languages from './languages.json';
import { isolateDisplayValues } from './text-layout';

export const LANGUAGE_KEY = 'app_language';
export const LANGUAGES = ['en', 'fil', 'pt-BR', 'es', 'id', 'fr', 'de', 'ja', 'ko', 'it', 'vi', 'hi', 'tr', 'ar'] as const;
export type Language = typeof LANGUAGES[number];
export type LanguagePreference = Language | 'system';
export const LANGUAGE_NAMES = Object.fromEntries(languages.map(item => [item.id, item.name])) as Record<Language, string>;
export const i18n = createInstance();
// Resources are bundled; no backend, detector, network request, or deferred loading.
void i18n.init({
  resources: { en: { translation: en }, fil: { translation: fil }, 'pt-BR': { translation: ptBR }, es: { translation: es }, id: { translation: id }, fr: { translation: fr }, de: { translation: de }, ja: { translation: ja }, ko: { translation: ko }, it: { translation: it }, vi: { translation: vi }, hi: { translation: hi }, tr: { translation: turkish }, ar: { translation: ar } },
  lng: 'en', fallbackLng: 'en', supportedLngs: [...LANGUAGES], load: 'currentOnly',
  initAsync: false, keySeparator: false, interpolation: { escapeValue: false }, returnNull: false,
});

export function matchSupportedLanguage(tag: string): Language | null {
  const base = tag.trim().replace(/_/g, '-').toLowerCase().split('-')[0];
  if (base === 'pt') return 'pt-BR';
  if (base === 'tl') return 'fil';
  return LANGUAGES.includes(base as Language) ? base as Language : null;
}
export function resolveLanguage(preference: string | null | undefined, deviceTags: readonly string[]): Language {
  if (LANGUAGES.includes(preference as Language)) return preference as Language;
  for (const tag of deviceTags) {
    const language = matchSupportedLanguage(tag);
    if (language) return language;
  }
  return 'en';
}
export function normalizePreference(value: string | null | undefined): LanguagePreference {
  return LANGUAGES.includes(value as Language) ? value as Language : 'system';
}
export function tr(key: string, values?: Record<string, unknown>): string {
  return String(i18n.t(key, isolateDisplayValues(values, i18n.resolvedLanguage ?? 'en') ?? {}));
}
let regionalLocale = 'en';
let clock24: boolean | undefined;
let formattingTimeZone: string | undefined;
export function setFormattingPreferences(locale: string, uses24hourClock?: boolean | null, timeZone?: string | null) {
  regionalLocale = locale;
  clock24 = uses24hourClock ?? undefined;
  formattingTimeZone = timeZone ?? undefined;
}
export function getFormattingLocale() { return regionalLocale; }
export function getFormattingTimeZone() { return formattingTimeZone; }
export function getClockPreference() { return clock24; }
export function localizedDate(value: number | Date, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(regionalLocale, { timeZone: formattingTimeZone, ...options }).format(value);
}
export function localizedNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(regionalLocale, options).format(value);
}

/** Count is part of a complete translated phrase; never append an English suffix. */
export function countLabel(noun: string, count: number) {
  const names: Record<string, string> = { 'chat item': 'chatItem', 'unorganized thought': 'unorganizedThought' };
  return tr(`counts.${names[noun] ?? noun}`, { count });
}
