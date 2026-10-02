import { Tabs } from 'expo-router/tabs';

import { BottomNav } from '@/components/navigation/bottom-nav';
import { ChatTransitionProvider } from '@/components/navigation/chat-transition';
import { useTheme } from '@/components/theme-provider';

// Notes, Calendar, Chat, Attachments, and Spaces are the app's persistent destinations —
// a real Tabs navigator, not a Stack, so each keeps its own mounted state when
// switching between them instead of remounting. Archive and Search stay
// normal screens in this group but aren't among the BottomNav buttons.
// ChatTransitionProvider wraps the navigator (not just BottomNav) so it can own
// navigation into/out of Chat itself and paint its balloon-expansion overlay
// above every screen — see PHASE: REFINE CHAT NAVIGATION TRANSITION and
// chat-transition.tsx.
export default function TabLayout() {
  const { tokens } = useTheme();
  return (
    <ChatTransitionProvider>
      <Tabs backBehavior="history" tabBar={(props) => <BottomNav {...props} />} screenOptions={{ headerShown: false, animation: 'none', sceneStyle: { backgroundColor: tokens.background } }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="calendar" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="attachments" />
        <Tabs.Screen name="spaces" />
        <Tabs.Screen name="archive" />
        <Tabs.Screen name="search" />
      </Tabs>
    </ChatTransitionProvider>
  );
}
