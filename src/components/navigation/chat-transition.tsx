import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { cancelAnimation, Easing, Extrapolation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { ChatButtonFace } from './chat-button-face';
import { createChatTransitionLifecycle, type ChatReturnPath } from '@/services/chat-transition-lifecycle';

export type ChatOrigin = { x: number; y: number; size: number };
const OPEN_DURATION = 320;
const EASING = Easing.out(Easing.cubic);
const NAV_SWITCH_AT = 0.35;

// One reveal window for the complete Chat, including its background.
export const NAV_FADE_RANGE: [number, number] = [0.19, 0.56];
export const CONTENT_RANGE: [number, number] = [0.3, 0.85];
const MASK_RANGE: [number, number, number] = [0.22, 0.38, 0.56];
const LIFT_KEYFRAMES: [number, number, number] = [0, 0.15, 0.5];
const TRAVEL_START = 0.5;
const BUTTON_FADE_RANGE: [number, number, number] = [0, 0.55, 0.85];

type ChatTransitionContextValue = {
  progress: SharedValue<number>;
  openingToken: SharedValue<number>;
  reduceMotion: boolean;
  openChat: (origin: ChatOrigin, fromPath: ChatReturnPath) => void;
  closeChat: () => void;
  onChatFocus: () => void;
  onChatBlur: () => void;
};
const ChatTransitionContext = createContext<ChatTransitionContextValue | null>(null);

// Keeps the balloon entrance above the persistent Tabs navigator. Back changes
// scenes immediately, with the entire Chat still rendered; there is no separate
// content/composer fade and no reverse mask pulse before navigation.
export function ChatTransitionProvider({ children }: PropsWithChildren) {
  const { tokens: theme, styleTokens } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const progress = useSharedValue(0);
  const openingToken = useSharedValue(0);
  const [lifecycle] = useState(createChatTransitionLifecycle);
  const [origin, setOrigin] = useState<ChatOrigin | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  const navigateToChat = useCallback((token: number) => {
    if (lifecycle.navigateOpen(token)) router.navigate('/chat');
  }, [lifecycle, router]);
  const finishOpening = useCallback((token: number) => {
    // Even if JS was busy at the crossover, a completed entrance navigates once.
    navigateToChat(token);
    if (!lifecycle.finishOpen(token)) return;
    openingToken.set(0);
    setOverlayVisible(false);
  }, [lifecycle, navigateToChat, openingToken]);

  // Navigate at the actual animation crossover, rather than an elapsed timer.
  useAnimatedReaction(
    () => progress.get() >= NAV_SWITCH_AT ? openingToken.get() : 0,
    (token, previous) => { if (token > 0 && token !== previous) runOnJS(navigateToChat)(token); },
  );

  const openChat = useCallback((nextOrigin: ChatOrigin, fromPath: ChatReturnPath) => {
    const token = lifecycle.beginOpen(fromPath);
    if (token === null) return;
    setOrigin(nextOrigin);
    if (reduceMotion) {
      progress.set(1);
      navigateToChat(token);
      finishOpening(token);
      return;
    }
    progress.set(0);
    openingToken.set(token);
    setOverlayVisible(true);
    progress.set(withTiming(1, { duration: OPEN_DURATION, easing: EASING }, (finished) => {
      if (finished) runOnJS(finishOpening)(token);
    }));
  }, [lifecycle, progress, openingToken, reduceMotion, navigateToChat, finishOpening]);

  const closeChat = useCallback(() => {
    const destination = lifecycle.close();
    if (!destination) return;
    // Stop an unfinished entrance, retaining its complete visual tree until blur.
    cancelAnimation(progress);
    if (!destination.balloonVisit && router.canGoBack()) router.back();
    else router.navigate(destination.returnPath);
  }, [lifecycle, progress, router]);

  const onChatFocus = useCallback(() => {
    if (lifecycle.focus()) return;
    // Direct links/history returns show the complete screen immediately.
    openingToken.set(0);
    progress.set(1);
  }, [lifecycle, openingToken, progress]);
  const onChatBlur = useCallback(() => {
    lifecycle.blur();
    cancelAnimation(progress);
    openingToken.set(0);
    setOverlayVisible(false);
    // Leave progress intact. A native stack can still be drawing this scene
    // after blur; only the next entrance resets it, while Chat is inactive.
  }, [lifecycle, progress, openingToken]);

  useEffect(() => () => {
    lifecycle.blur();
    cancelAnimation(progress);
  }, [lifecycle, progress]);

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
  const value = useMemo<ChatTransitionContextValue>(() => ({ progress, openingToken, reduceMotion, openChat, closeChat, onChatFocus, onChatBlur }), [progress, openingToken, reduceMotion, openChat, closeChat, onChatFocus, onChatBlur]);

  return <ChatTransitionContext.Provider value={value}>
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {children}
      {overlayVisible ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.chatBackground }, maskStyle]} />
        {origin ? <Animated.View style={[styles.travelButton, { left: origin.x - styleTokens.chat.width / 2, top: origin.y - styleTokens.chat.height / 2, width: styleTokens.chat.width, height: styleTokens.chat.height }, buttonStyle]}>
          <ChatButtonFace travelling />
        </Animated.View> : null}
      </View> : null}
    </View>
  </ChatTransitionContext.Provider>;
}
export function useChatTransition() {
  const context = useContext(ChatTransitionContext);
  if (!context) throw new Error('useChatTransition must be used within ChatTransitionProvider');
  return context;
}
const styles = StyleSheet.create({ screen: { flex: 1 }, travelButton: { position: 'absolute' } });
