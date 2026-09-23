import { Tabs } from 'expo-router/tabs';

import { BottomNav } from '@/components/navigation/bottom-nav';
import { ChatTransitionProvider } from '@/components/navigation/chat-transition';

// Boards, Chat, and Attachments are the app's 3 persistent destinations (see
// PHASE: REDESIGN CHITS BOTTOM NAVIGATION, PHASE: GLOBAL ATTACHMENTS SCREEN) —
// a real Tabs navigator, not a Stack, so each keeps its own mounted state when
// switching between them instead of remounting. Archive and Search both stay
// normal screens in this group (still reachable via router.navigate, Archive
// now from the side drawer) but aren't among the 3 buttons BottomNav renders.
// ChatTransitionProvider wraps the navigator (not just BottomNav) so it can own
// navigation into/out of Chat itself and paint its balloon-expansion overlay
// above every screen — see PHASE: REFINE CHAT NAVIGATION TRANSITION and
// chat-transition.tsx.
export default function TabLayout() {
  return (
    <ChatTransitionProvider>
      <Tabs tabBar={(props) => <BottomNav {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="attachments" />
        <Tabs.Screen name="archive" />
        <Tabs.Screen name="search" />
      </Tabs>
    </ChatTransitionProvider>
  );
}
