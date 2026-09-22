import { Stack } from 'expo-router';

// Boards owns the group's index route ("/"), so it's simply what a cold launch
// resolves to — no initialRouteName trick needed (that only affects back-stack
// behavior for deep links, not which route a plain app open resolves to). Chat
// lives at "/chat" and gets its own push/slide transition (rather than the group's
// default fade) so leaving/returning feels like a natural stack push.
export default function TabLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Screen name="chat" options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
