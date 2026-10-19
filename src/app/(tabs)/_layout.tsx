import { Tabs } from 'expo-router/tabs';
import { Platform } from 'react-native';

import { BottomNav } from '@/components/navigation/bottom-nav';
import { ChatTransitionProvider, useChatTransition } from '@/components/navigation/chat-transition';
import { useTheme } from '@/components/theme-provider';

// Notes, Attachments, Chat, Calendar, and Spaces are the app's persistent destinations —
// a real Tabs navigator, not a Stack, so each keeps its own mounted state when
// switching between them instead of remounting. Archive and Search stay
// normal screens in this group but aren't among the BottomNav buttons.
// ChatTransitionProvider wraps the navigator (not just BottomNav) so it can own
// navigation into/out of Chat and paint the lifting button above every screen.
export default function TabLayout() {
  return <ChatTransitionProvider><TabNavigator /></ChatTransitionProvider>;
}

function TabNavigator() {
  const { tokens } = useTheme();
  const { reduceMotion } = useChatTransition();
  return (
    <Tabs
      backBehavior="history"
      // iOS Fabric should switch persistent scenes without removing/reinserting
      // their native view controllers during an interrupted tab transition.
      detachInactiveScreens={Platform.OS !== 'ios'}
      screenListeners={({ route }) => ({
        focus: () => { if (__DEV__) console.debug('[Chat navigation]', 'Tab focused', route.name); },
        blur: () => { if (__DEV__) console.debug('[Chat navigation]', 'Tab blurred', route.name); },
        transitionStart: () => { if (__DEV__) console.debug('[Chat navigation]', 'Tab transition started', route.name); },
        transitionEnd: () => { if (__DEV__) console.debug('[Chat navigation]', 'Tab transition finished', route.name); },
      })}
      tabBar={(props) => <BottomNav {...props} />}
      screenOptions={{
        headerShown: false,
        // Keep iOS scene visibility independent of native-driver fade progress.
        // The floating Chat icon still animates in ChatTransitionProvider.
        animation: Platform.OS === 'ios' || reduceMotion ? 'none' : 'fade',
        transitionSpec: { animation: 'timing', config: { duration: Platform.OS === 'ios' || reduceMotion ? 0 : 210 } },
        sceneStyle: { backgroundColor: tokens.background },
      }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="attachments" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="calendar" />
        <Tabs.Screen name="spaces" />
        <Tabs.Screen name="archive" />
        <Tabs.Screen name="search" />
    </Tabs>
  );
}
