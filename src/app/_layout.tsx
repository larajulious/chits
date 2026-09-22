import { Suspense, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoadingState } from '@/components/ui/primitives';
import { AppDrawerProvider } from '@/components/navigation/app-drawer';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
// eslint-disable-next-line import/no-unresolved -- Expo resolves platform file suffixes at runtime.
import { DatabaseProvider } from '@/db/provider';
import { subscribeToAppReset } from '@/services/app-reset';

function ThemedApp() {
  const { scheme, tokens } = useTheme();
  return (
    <AppDrawerProvider><StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: tokens.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="archive" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="unorganized" />
        <Stack.Screen name="board/[id]" />
        <Stack.Screen name="card/[id]" />
      </Stack>
    </AppDrawerProvider>
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
          <ThemeProvider><ThemedApp /></ThemeProvider>
        </DatabaseProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}
