import { useCallback, useEffect, useState } from 'react';
import { getLocales } from 'expo-localization';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppState, Keyboard } from 'react-native';

import { chooseGreeting, getGreetingLanguage, getGreetingPeriod, getGreetingsForPeriod, nextRecentGreetings, type GreetingLanguage, type GreetingPeriod } from '@/constants/mascot-greetings';
import { subscribeToOnboardingChanges } from '@/features/onboarding/storage';
import { canShowMascotGreeting, claimMascotGreeting, subscribeToMascotSession } from '@/services/mascot-session';

const RECENT_KEY = 'mascot.recentGreetings';
const SHOW_DELAY_MS = 650;
const VISIBLE_MS = 10000;

type Greeting = { text: string; language: GreetingLanguage; period: GreetingPeriod };

function parseRecent(value: string | undefined): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string').slice(0, 5) : [];
  } catch { return []; }
}

function appIsForeground() {
  return AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
}

/** One greeting on the Notes landing screen per meaningful foreground session. */
export function useMascotGreeting() {
  const database = useSQLiteContext();
  const [greeting, setGreeting] = useState<Greeting | null>(null);
  const [visible, setVisible] = useState(false);

  useFocusEffect(useCallback(() => {
    let focused = true;
    let keyboardOpen = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const attempt = async () => {
      if (!canShowMascotGreeting() || !focused || keyboardOpen || !appIsForeground()) return;
      try {
        const rows = await database.getAllAsync<{ key: string; value: string }>(
          'SELECT key, value FROM app_settings WHERE key IN (?, ?, ?, ?, ?)',
          'onboarding.firstRun', 'onboarding.completedAt', 'onboarding.tour', 'app_language', RECENT_KEY,
        );
        if (!focused || keyboardOpen || !appIsForeground()) return;
        const settings = new Map(rows.map((row) => [row.key, row.value]));
        // The first-run tour owns the screen until it is finished. Its launch
        // decision also must finish before Sticky can claim this session.
        if (!settings.has('onboarding.firstRun') || settings.has('onboarding.tour')) return;
        if (settings.get('onboarding.firstRun') === 'shown' && !settings.has('onboarding.completedAt')) return;

        const now = new Date();
        let deviceLocale: string | undefined;
        try { deviceLocale = getLocales()[0]?.languageTag; } catch { /* English remains available. */ }
        const language = getGreetingLanguage(settings.get('app_language') || deviceLocale);
        const period = getGreetingPeriod(now);
        const recent = parseRecent(settings.get(RECENT_KEY));
        const text = chooseGreeting(getGreetingsForPeriod(language, period), recent);
        if (!text || !claimMascotGreeting()) return;
        setGreeting({ text, language, period });
        setVisible(true);
        void database.runAsync(
          'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
          RECENT_KEY, JSON.stringify(nextRecentGreetings(recent, text)), now.getTime(),
        ).catch(() => undefined);
      } catch { /* A greeting must never block the Notes screen. */ }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      if (canShowMascotGreeting()) timer = setTimeout(() => { void attempt(); }, SHOW_DELAY_MS);
    };
    schedule();
    const stopOnboarding = subscribeToOnboardingChanges(schedule);
    const stopSession = subscribeToMascotSession(schedule);
    const showKeyboard = Keyboard.addListener('keyboardDidShow', () => { keyboardOpen = true; setVisible(false); });
    const hideKeyboard = Keyboard.addListener('keyboardDidHide', () => { keyboardOpen = false; });
    return () => {
      focused = false;
      if (timer) clearTimeout(timer);
      stopOnboarding(); stopSession(); showKeyboard.remove(); hideKeyboard.remove();
      setVisible(false); setGreeting(null);
    };
  }, [database]));

  useEffect(() => {
    if (!visible || !greeting) return;
    const timer = setTimeout(() => setVisible(false), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [greeting, visible]);
  useEffect(() => {
    if (visible || !greeting) return;
    const timer = setTimeout(() => setGreeting(null), 260);
    return () => clearTimeout(timer);
  }, [greeting, visible]);

  return { greeting, visible, dismissGreeting: () => setVisible(false) };
}
