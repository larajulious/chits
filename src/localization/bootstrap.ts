import { I18nManager } from 'react-native';
import { getCalendars, getLocales } from 'expo-localization';
import { i18n, resolveLanguage, setFormattingPreferences } from './runtime';

// Spatial canvases keep physical coordinates; evaluated UI rows opt into direction.
I18nManager.swapLeftAndRightInRTL(false);

// Before SQLite is available, loading/recovery UI follows the device. The
// provider reads the saved override synchronously before the first app screen.
try {
  const tags = getLocales().map(locale => locale.languageTag);
  const language = resolveLanguage('system', tags);
  const calendar = getCalendars()[0];
  setFormattingPreferences(language, calendar?.uses24hourClock, calendar?.timeZone);
  if (i18n.resolvedLanguage !== language) void i18n.changeLanguage(language);
} catch { /* The bundled English runtime is already initialized. */ }
