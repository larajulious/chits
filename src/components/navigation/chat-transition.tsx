import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { ChatButtonFace } from './chat-button-face';
import { createChatTransitionLifecycle, type ChatReturnPath } from '@/services/chat-transition-lifecycle';

import { chatButtonFrame, localChatOrigin, type ChatOrigin } from '@/services/chat-transition-motion';
export type { ChatOrigin } from '@/services/chat-transition-motion';
const OPEN_DURATION = 280;
const EASING = Easing.out(Easing.quad);

type ChatTransitionContextValue = {
  buttonHidden: SharedValue<boolean>;
  reduceMotion: boolean;
  openChat: (origin: ChatOrigin | null, fromPath: ChatReturnPath) => void;
  closeChat: () => void;
  onChatFocus: () => void;
  onChatBlur: () => void;
};
const ChatTransitionContext = createContext<ChatTransitionContextValue | null>(null);

// The floating button lifts above Tabs; the navigator owns the screen fade.
// Screen visibility never depends on the button animation's progress.
export function ChatTransitionProvider({ children }: PropsWithChildren) {
  const { tokens: theme, styleTokens } = useTheme();
  const router = useRouter();
  const overlayRoot = useRef<View>(null);
  const overlayOffset = useRef({ x: 0, y: 0 });
  const progress = useSharedValue(0);
  const animationGeneration = useRef(0);
  const pendingNavigation = useRef<number | null>(null);
  const buttonHidden = useSharedValue(false);
  const [lifecycle] = useState(createChatTransitionLifecycle);
  const [origin, setOrigin] = useState<ChatOrigin | null>(null);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => subscription.remove();
  }, []);

  const finishAnimation = useCallback((generation: number) => {
    if (animationGeneration.current !== generation) return;
    buttonHidden.set(false);
    setOverlayVisible(false);
  }, [buttonHidden]);

  const openChat = useCallback((nextOrigin: ChatOrigin | null, fromPath: ChatReturnPath) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__) console.debug('[Chat navigation]', 'Chat press received', fromPath);
    const token = lifecycle.beginOpen(fromPath);
    if (token === null) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.debug('[Chat navigation]', 'Duplicate or already-focused request ignored');
      return;
    }
    pendingNavigation.current = token;
    // Dispatch once, in the press handler. Native geometry and animation
    // completion are optional decoration, never navigation prerequisites.
    try {
      if (lifecycle.navigateOpen(token)) {
        if (typeof __DEV__ !== 'undefined' && __DEV__) console.debug('[Chat navigation]', 'Dispatching /chat');
        router.navigate('/chat');
      }
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.debug('[Chat navigation]', 'Chat dispatch failed');
      pendingNavigation.current = null;
      lifecycle.blur();
      throw error;
    }
    if (reduceMotion || !nextOrigin) return;
    animationGeneration.current++;
    cancelAnimation(progress);
    progress.set(0);
    setOrigin(localChatOrigin(nextOrigin, overlayOffset.current));
    buttonHidden.set(true);
    setOverlayVisible(true);
  }, [lifecycle, router, progress, buttonHidden, reduceMotion]);

  // Start only the decorative clone after it commits. Cancellation releases
  // the clone too; neither completion nor cancellation can dispatch a route.
  useLayoutEffect(() => {
    if (!overlayVisible) return;
    const generation = animationGeneration.current;
    progress.set(withTiming(1, { duration: OPEN_DURATION, easing: EASING }, () => {
      runOnJS(finishAnimation)(generation);
    }));
    return () => cancelAnimation(progress);
  }, [overlayVisible, progress, finishAnimation]);

  const closeChat = useCallback(() => {
    const destination = lifecycle.close();
    if (!destination) return;
    // Stop an unfinished entrance, retaining its complete visual tree until blur.
    cancelAnimation(progress);
    if (!destination.balloonVisit && router.canGoBack()) router.back();
    else router.navigate(destination.returnPath);
  }, [lifecycle, progress, router]);

  const onChatFocus = useCallback(() => {
    lifecycle.focus();
    // Acknowledgement comes from navigation focus, not an animation callback.
    if (pendingNavigation.current !== null) {
      lifecycle.finishOpen(pendingNavigation.current);
      pendingNavigation.current = null;
    }
  }, [lifecycle]);
  const onChatBlur = useCallback(() => {
    lifecycle.blur();
    pendingNavigation.current = null;
    animationGeneration.current++;
    cancelAnimation(progress);
    buttonHidden.set(false);
    setOverlayVisible(false);
  }, [lifecycle, progress, buttonHidden]);

  useEffect(() => () => {
    lifecycle.blur();
    pendingNavigation.current = null;
    animationGeneration.current++;
    cancelAnimation(progress);
  }, [lifecycle, progress]);

  const buttonStyle = useAnimatedStyle(() => {
    if (!origin) return { opacity: 0 };
    const frame = chatButtonFrame(progress.get());
    return { opacity: frame.opacity, transform: [{ translateY: frame.translateY }, { scale: frame.scale }] };
  });
  // Animation state stays local; starting the clone must not invalidate the
  // rich-text timeline or navigator action context.
  const value = useMemo<ChatTransitionContextValue>(() => ({ buttonHidden, reduceMotion, openChat, closeChat, onChatFocus, onChatBlur }), [buttonHidden, reduceMotion, openChat, closeChat, onChatFocus, onChatBlur]);

  return <ChatTransitionContext.Provider value={value}>
    <View ref={overlayRoot} collapsable={false} onLayout={() => overlayRoot.current?.measureInWindow((x, y) => { overlayOffset.current = { x, y }; })} style={[styles.screen, { backgroundColor: theme.background }]}>
      {children}
      {overlayVisible ? <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {origin ? <Animated.View style={[styles.travelButton, { left: origin.x - styleTokens.chat.width / 2, top: origin.y - styleTokens.chat.height / 2, width: styleTokens.chat.width, height: styleTokens.chat.height }, buttonStyle]}>
          <ChatButtonFace />
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
