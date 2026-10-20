import '@/localization/bootstrap';
import { AnywhereCoordinator } from '@/features/anywhere/coordinator';
import { useDirection, LanguageProvider } from '@/localization/provider';
import { Suspense, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { LocaleProvider, router, Stack, usePathname } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoadingState } from '@/components/ui/primitives';
import { AppDrawerProvider } from '@/components/navigation/app-drawer';
import { AppDialogProvider, useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
import { ChatBackgroundProvider } from '@/components/chat/chat-background-provider';
// eslint-disable-next-line import/no-unresolved -- Expo resolves platform file suffixes at runtime.
import { DatabaseProvider } from '@/db/provider';
import { consumeResetNotice, subscribeToAppReset } from '@/services/app-reset';
import { observeReminderNotifications, registerReminderDatabase, requestReminderSync } from '@/services/reminders';
import { OnboardingLayer } from '@/features/onboarding/onboarding-layer';
import { updateMascotAppState } from '@/services/mascot-session';
import { FocusCoordinator } from '@/features/focus/focus-coordinator';

// Shows the message a reset asked for (e.g. "Restore complete") once the fresh
// tree — with its reopened database — has mounted.
function ResetNotice() {
  const { alert } = useAppDialog();
  useEffect(() => {
    const notice = consumeResetNotice();
    if (notice) alert({ type: notice.type, icon: notice.type === 'success' ? 'checkmark-circle-outline' : 'alert-circle-outline', title: notice.title, message: notice.message });
  }, [alert]);
  return null;
}

// Keeps reminders in step with the device (launch, return to foreground)
// and opens the original card or Chat note when a notification is tapped — whether
// Chits was open, in the background, or launched from a killed state.
function ReminderCoordinator() {
  const database = useSQLiteContext();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  useEffect(() => {
    registerReminderDatabase(database);
    void requestReminderSync();
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') void requestReminderSync(); });
    const stopObserving = observeReminderNotifications((cardId) => {
      // Let the navigator finish mounting on a cold start, and never stack a
      // second copy of the card that's already on screen.
      requestAnimationFrame(() => {
        if (pathnameRef.current === `/card/${cardId}`) return;
        router.push({ pathname: '/card/[id]', params: { id: cardId } });
      });
    }, (messageId) => {
      requestAnimationFrame(() => router.push({ pathname: '/chat', params: { messageId } }));
    });
    return () => { appState.remove(); stopObserving(); registerReminderDatabase(null); };
  }, [database]);
  return null;
}

function ThemedApp() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const { direction } = useDirection();
  const { scheme, tokens, topBar, customHeader, headerPhotoFailed } = useTheme();
  const pathname = usePathname();
  useEffect(() => {
    const subscription = AppState.addEventListener('change', updateMascotAppState);
    return () => subscription.remove();
  }, []);
  // Chat's status area and header share a fade in the page's light/dark palette.
  const statusBarStyle = customHeader && !headerPhotoFailed && pathname !== '/chat' ? 'light' : topBar && pathname !== '/chat' ? (topBar.dark ? 'light' : 'dark') : scheme === 'dark' ? 'light' : 'dark';
  return (
    <LocaleProvider direction={direction}><AppDialogProvider>
      <View style={{ flex: 1, direction: 'ltr', backgroundColor: tokens.background }}>
        <ResetNotice />
        <ReminderCoordinator />
        <AnywhereCoordinator />
        <FocusCoordinator />
        <AppDrawerProvider><StatusBar style={statusBarStyle} />
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: tokens.background } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="appearance-theme" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="backup" />
            <Stack.Screen name="unorganized" />
            <Stack.Screen name="board/[id]" />
            <Stack.Screen name="card/[id]" getId={({ params }) => typeof params?.id === 'string' ? params.id : undefined} />
            <Stack.Screen name="card/edit-content" getId={({ params }) => typeof params?.messageId === 'string' ? params.messageId : undefined} />
            <Stack.Screen name="focus" options={{ animation: 'fade', gestureEnabled: false }} />
            <Stack.Screen name="spin" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="focus-history" />
            <Stack.Screen name="focus-settings" />
            <Stack.Screen name="templates" options={{ animation: 'slide_from_right', gestureEnabled: false }} />
            <Stack.Screen name="share-note" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="spaces/pick" />
            <Stack.Screen name="spaces/share" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
            <Stack.Screen name="pinned" />
          </Stack>
          <OnboardingLayer />
        </AppDrawerProvider>
      </View>
    </AppDialogProvider></LocaleProvider>
  );
}

export default function RootLayout() {
  // Bumped after a restore replaces chits.db/attachments on disk. Changing this
  // key forces React to unmount and remount everything below it — including
  // DatabaseProvider, which reopens a fresh SQLite connection against the
  // restored file — rather than trying to hot-patch every screen's local state
  // and the one shared database connection in place.
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => subscribeToAppReset(() => setResetKey((key) => key + 1)), []);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Suspense fallback={<LoadingState />} key={resetKey}>
        <DatabaseProvider>
          <LanguageProvider><ThemeProvider><ChatBackgroundProvider><ThemedApp /></ChatBackgroundProvider></ThemeProvider></LanguageProvider>
        </DatabaseProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}
