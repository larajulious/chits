import { Suspense, useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { router, Stack, usePathname } from 'expo-router';
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

// Keeps card reminders in step with the device (launch, return to foreground)
// and opens the right card when a reminder notification is tapped — whether
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
    });
    return () => { appState.remove(); stopObserving(); registerReminderDatabase(null); };
  }, [database]);
  return null;
}

function ThemedApp() {
  const { scheme, tokens } = useTheme();
  return (
    <AppDialogProvider>
      <View style={{ flex: 1, backgroundColor: tokens.background }}>
        <ResetNotice />
        <ReminderCoordinator />
        <AppDrawerProvider><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: tokens.background } }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="backup" />
            <Stack.Screen name="unorganized" />
            <Stack.Screen name="board/[id]" />
            <Stack.Screen name="card/[id]" />
            <Stack.Screen name="card/edit-content" />
          </Stack>
        </AppDrawerProvider>
      </View>
    </AppDialogProvider>
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
          <ThemeProvider><ChatBackgroundProvider><ThemedApp /></ChatBackgroundProvider></ThemeProvider>
        </DatabaseProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}
