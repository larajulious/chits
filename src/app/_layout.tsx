import { Suspense } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LoadingState } from '@/components/ui/primitives';
import { AppDrawerProvider } from '@/components/navigation/app-drawer';
import { ThemeProvider, useTheme } from '@/components/theme-provider';
// eslint-disable-next-line import/no-unresolved -- Expo resolves platform file suffixes at runtime.
import { DatabaseProvider } from '@/db/provider';

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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Suspense fallback={<LoadingState />}>
        <DatabaseProvider>
          <ThemeProvider><ThemedApp /></ThemeProvider>
        </DatabaseProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}
