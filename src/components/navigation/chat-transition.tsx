import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { Easing, Extrapolation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';

export type ChatOrigin = { x: number; y: number; size: number };
type PreviousTabPath = '/' | '/attachments';

const OPEN_DURATION = 320;
// Slightly faster than opening — this isn't a perfect reverse of the open
// sequence, just a return to rest, per PHASE: REDESIGN CHAT TRANSITION —
// CONNECTED FLOATING BUTTON.
const CLOSE_DURATION = 260;
const EASING = Easing.out(Easing.cubic);
// The underlying tab switch is masked by MASK_RANGE's brief pulse — see below —
// so it should land while that pulse is near its peak opacity.
const NAV_SWITCH_AT = 0.35;

// Every piece of the Chat entrance reads its own window from the SAME shared
// `progress` value (0 closed .. 1 open), so the whole choreography lives in one
// place instead of scattered magic numbers, and every piece naturally overlaps
// rather than running as a hard sequence. Exported so chat.native.tsx (content +
// composer) and bottom-nav.tsx (nav item fade) can build their own
// useAnimatedStyle from the identical ranges described in the phase spec.
export const NAV_FADE_RANGE: [number, number] = [0.19, 0.56];
export const CONTENT_RANGE: [number, number] = [0.3, 0.85];
export const COMPOSER_RANGE: [number, number] = [0.55, 1];
const MASK_RANGE: [number, number, number] = [0.22, 0.38, 0.56];
// The traveling button clone: holds at the origin, lifts ~16px, then (from the
// halfway point) eases toward the composer while shrinking and fading — "the
// button visually hands control to the composer" rather than the screen zooming.
const LIFT_KEYFRAMES: [number, number, number] = [0, 0.15, 0.5];
const TRAVEL_START = 0.5;
const BUTTON_FADE_RANGE: [number, number, number] = [0, 0.55, 0.85];

type ChatTransitionContextValue = {
  progress: SharedValue<number>;
  reduceMotion: boolean;
  // Exposed so Chat itself can tell a real balloon-driven open (where `progress`
  // is already animating 0 -> 1 and must be left alone) apart from any other way
  // of arriving at Chat — a plain `router.push('/chat')` from elsewhere (e.g.
  // Card Details' "Open in Chat") never touches `progress` at all, which
  // otherwise leaves the whole screen at its reveal animation's rest opacity: 0.
  opening: boolean;
  openChat: (origin: ChatOrigin, fromPath: PreviousTabPath) => void;
  closeChat: () => void;
};

const ChatTransitionContext = createContext<ChatTransitionContextValue | null>(null);

// Drives the "connected floating button" transition between the Chat nav button
// and the Chat tab — see PHASE: REDESIGN CHAT TRANSITION — CONNECTED FLOATING
// BUTTON. Lives above the Tabs navigator (in (tabs)/_layout.tsx) so it can own
// navigation itself (expo-router's router works regardless of nesting) and
// render its overlay (a brief crossfade mask + the traveling button clone) above
// every screen. A single shared `progress` value is the one source of truth for
// the nav fade, Chat's content reveal, and the composer's entrance, so replaying
// the transition on every open/close never depends on Chat remounting (it
// doesn't — Tabs keeps it alive to preserve its state).
export function ChatTransitionProvider({ children }: PropsWithChildren) {
  const { tokens: theme } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const progress = useSharedValue(0);
  const [origin, setOrigin] = useState<ChatOrigin | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [opening, setOpening] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const previousPath = useRef<PreviousTabPath>('/');

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  const openChat = useCallback((nextOrigin: ChatOrigin, fromPath: PreviousTabPath) => {
    previousPath.current = fromPath;
    setOrigin(nextOrigin);
    progress.set(0);
    if (reduceMotion) {
      router.navigate('/chat');
      progress.set(withTiming(1, { duration: 140, easing: Easing.linear }));
      return;
    }
    setOpening(true);
    setOverlayVisible(true);
    setTimeout(() => router.navigate('/chat'), OPEN_DURATION * NAV_SWITCH_AT);
    progress.set(withTiming(1, { duration: OPEN_DURATION, easing: EASING }, (finished) => {
      if (finished) { runOnJS(setOverlayVisible)(false); runOnJS(setOpening)(false); }
    }));
  }, [progress, reduceMotion, router]);

  const closeChat = useCallback(() => {
    const finish = () => {
      router.navigate(previousPath.current);
      setOverlayVisible(false);
    };
    setOpening(false);
    if (reduceMotion) {
      progress.set(withTiming(0, { duration: 140, easing: Easing.linear }, (finished) => { if (finished) runOnJS(finish)(); }));
      return;
    }
    setOverlayVisible(true);
    progress.set(withTiming(0, { duration: CLOSE_DURATION, easing: EASING }, (finished) => {
      if (finished) runOnJS(finish)();
    }));
  }, [progress, reduceMotion, router]);

  // Approximate composer center — the message composer itself doesn't exist to
  // measure until Chat has mounted, and doesn't need to be exact: the button
  // only needs to travel *toward* it to read as "handing off," not land on its
  // precise pixel (see the phase spec's "use coordinated position/scale/opacity
  // to create the illusion").
  const targetX = screenWidth / 2;
  const targetY = screenHeight - insets.bottom - 64;

  const maskStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), MASK_RANGE, [0, 1, 0], Extrapolation.CLAMP),
  }));

  const buttonStyle = useAnimatedStyle(() => {
    if (!origin) return { opacity: 0 };
    const p = progress.get();
    const travel = interpolate(p, [TRAVEL_START, 1], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(p, [...LIFT_KEYFRAMES, 1], [0, -16, -16, targetY - origin.y], Extrapolation.CLAMP);
    const translateX = (targetX - origin.x) * travel;
    const scale = 1 - travel * 0.55;
    const opacity = interpolate(p, BUTTON_FADE_RANGE, [1, 1, 0], Extrapolation.CLAMP);
    return { opacity, transform: [{ translateX }, { translateY }, { scale }] };
  });

  const value = useMemo<ChatTransitionContextValue>(() => ({ progress, reduceMotion, opening, openChat, closeChat }), [progress, reduceMotion, opening, openChat, closeChat]);

  return (
    <ChatTransitionContext.Provider value={value}>
      {children}
      {overlayVisible ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }, maskStyle]} />
          {opening && origin ? (
            <Animated.View
              style={[
                styles.travelButton,
                { left: origin.x - origin.size / 2, top: origin.y - origin.size / 2, width: origin.size, height: origin.size, borderRadius: origin.size / 2, backgroundColor: theme.accent },
                buttonStyle,
              ]}
            >
              <Ionicons accessible={false} name="chatbox" size={23} color="#FFFFFF" />
            </Animated.View>
          ) : null}
        </View>
      ) : null}
    </ChatTransitionContext.Provider>
  );
}

export function useChatTransition() {
  const context = useContext(ChatTransitionContext);
  if (!context) throw new Error('useChatTransition must be used within ChatTransitionProvider');
  return context;
}

const styles = StyleSheet.create({
  travelButton: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
});
