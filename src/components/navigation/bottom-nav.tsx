import { floatingChatBottom } from './floating-chat-layout';
import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useContext, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { BottomTabBarHeightCallbackContext, type BottomTabBarProps } from 'expo-router/tabs';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { useChatTransition } from '@/components/navigation/chat-transition';
import { ChatButtonFace } from '@/components/navigation/chat-button-face';
import { measuredChatOrigin, type ChatOrigin } from '@/services/chat-transition-motion';
import { spacing } from '@/constants/theme';

// The tab navigator retains its screens and history. Its only floating control
// is Chat; other destinations remain reachable through the side panel.
export function BottomNav({ state, insets }: BottomTabBarProps) {
  "use no memo"; // Global i18next copy follows the locale subscription.
  useLocale();
  const { styleTokens } = useTheme();
  const chat = styleTokens.chat;
  const reportHeight = useContext(BottomTabBarHeightCallbackContext);
  const { openChat, buttonHidden } = useChatTransition();
  const chatButtonRef = useRef<View>(null);
  const measuredOrigin = useRef<ChatOrigin | null>(null);
  const pressScale = useSharedValue(1);
  const activeName = state.routes[state.index]?.name;

  const openChatBalloon = () => {
    const fromPath = activeName === 'attachments' ? '/attachments'
      : activeName === 'calendar' ? '/calendar'
      : activeName === 'archive' ? '/archive'
      : activeName === 'search' ? '/search' : '/';
    openChat(measuredOrigin.current, fromPath);
    void Haptics.selectionAsync().catch(() => {});
  };

  const measureButton = () => {
    measuredOrigin.current = null;
    chatButtonRef.current?.measureInWindow((x, y, width, height) => {
      measuredOrigin.current = measuredChatOrigin(x, y, width, height);
    });
  };

  const pressedStyle = useAnimatedStyle(() => ({ transform: [{ scale: buttonHidden.get() ? 0 : pressScale.get() }] }));

  // Chat and Spaces retain their existing composer/dock controls.
  if (activeName === 'chat' || activeName === 'spaces') return null;

  return <Animated.View
    entering={enterRise}
    pointerEvents="box-none"
    style={[styles.wrap, {
      paddingLeft: Math.max(spacing.lg, insets.left + spacing.sm),
      paddingBottom: floatingChatBottom(insets.bottom),
    }]}
    onLayout={(event) => reportHeight?.(event.nativeEvent.layout.height)}
  >
        <Pressable
          ref={chatButtonRef}
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel={tr("spaces.openChat")}
          accessibilityHint={tr("bottomnav.openChatToCaptureANewThought")}
          onLayout={measureButton}
          // Phase 1 (press): a very quick compression that springs back — done by
          // release, independent of the open sequence which only starts on tap.
          onPressIn={() => { measureButton(); pressScale.set(withTiming(0.94, { duration: 60 })); }}
          onPressOut={() => { pressScale.set(withTiming(1, { duration: 70, easing: Easing.out(Easing.quad) })); }}
          onPress={openChatBalloon}
          style={[styles.chatButtonHit, { width: chat.width, height: chat.height }]}
        >
          <Animated.View entering={enterButtonSettle} style={[styles.chatButton, pressedStyle]}>
            <ChatButtonFace />
          </Animated.View>
        </Pressable>
  </Animated.View>;
}

function enterRise() {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 10 }] },
    animations: { opacity: withTiming(1, { duration: 180 }), transform: [{ translateY: withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }) }] },
  };
}
function enterButtonSettle() {
  'worklet';
  return {
    initialValues: { transform: [{ scale: 0.85 }] },
    animations: { transform: [{ scale: withTiming(1, { duration: 200, easing: Easing.out(Easing.quad) }) }] },
  };
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, direction: 'ltr', alignItems: 'flex-start', backgroundColor: 'transparent', paddingTop: spacing.xs },
  chatButtonHit: { flexShrink: 0 },
  chatButton: { width: '100%', height: '100%' },
});
