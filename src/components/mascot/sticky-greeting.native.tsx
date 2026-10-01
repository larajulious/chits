import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { OnboardingMascot } from '@/features/onboarding/components/onboarding-mascot';
import { useMascotGreeting } from '@/hooks/use-mascot-greeting';

/** Transient companion on Notes, clear of the floating navigation. */
export function StickyGreeting({ bottom }: { bottom: number }) {
  const { greeting, visible, dismissGreeting } = useMascotGreeting();
  const { tokens: theme } = useTheme();
  const { width } = useWindowDimensions();
  const [mascotOpacity] = useState(() => new Animated.Value(0));
  const [mascotLift] = useState(() => new Animated.Value(14));
  const [mascotScale] = useState(() => new Animated.Value(0.94));
  const [bubbleOpacity] = useState(() => new Animated.Value(0));
  const [bubbleLift] = useState(() => new Animated.Value(5));

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduceMotion) => {
      if (!active) return;
      [mascotOpacity, mascotLift, mascotScale, bubbleOpacity, bubbleLift].forEach((value) => value.stopAnimation());
      if (visible) {
        mascotLift.setValue(reduceMotion ? 0 : 14);
        mascotScale.setValue(reduceMotion ? 1 : 0.94);
        mascotOpacity.setValue(0);
        bubbleOpacity.setValue(0);
        bubbleLift.setValue(reduceMotion ? 0 : 5);
        Animated.parallel([
          Animated.timing(mascotOpacity, { toValue: 1, duration: reduceMotion ? 180 : 320, useNativeDriver: true }),
          Animated.timing(mascotLift, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.timing(mascotScale, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(bubbleOpacity, { toValue: 1, delay: reduceMotion ? 0 : 150, duration: 220, useNativeDriver: true }),
          Animated.timing(bubbleLift, { toValue: 0, delay: reduceMotion ? 0 : 150, duration: 220, useNativeDriver: true }),
        ]).start();
      } else {
        Animated.parallel([
          Animated.timing(bubbleOpacity, { toValue: 0, duration: 190, useNativeDriver: true }),
          Animated.timing(bubbleLift, { toValue: reduceMotion ? 0 : 5, duration: 190, useNativeDriver: true }),
          Animated.timing(mascotOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
          Animated.timing(mascotLift, { toValue: reduceMotion ? 0 : 8, duration: 220, useNativeDriver: true }),
        ]).start();
      }
    });
    return () => { active = false; };
  }, [bubbleLift, bubbleOpacity, mascotLift, mascotOpacity, mascotScale, visible]);

  if (!greeting) return null;
  const openChat = () => {
    dismissGreeting();
    router.navigate({ pathname: '/chat', params: { focusInput: '1' } });
  };

  return <View pointerEvents="box-none" style={[styles.anchor, { bottom, maxWidth: width - spacing.md * 2 }]}>
    <Animated.View style={[styles.bubble, { backgroundColor: theme.surface, borderColor: theme.borderSubtle, maxWidth: Math.min(width - spacing.md * 2, 272), opacity: bubbleOpacity, transform: [{ translateY: bubbleLift }] }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Sticky says: ${greeting.text}. Open Chat.`} onPress={openChat} style={styles.bubbleMessage}>
        <Text style={[styles.message, { color: theme.textPrimary }]}>{greeting.text}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss Sticky greeting" onPress={dismissGreeting} hitSlop={4} style={styles.close}>
        <Ionicons accessible={false} name="close" size={17} color={theme.textSecondary} />
      </Pressable>
    </Animated.View>
    <Animated.View style={{ opacity: mascotOpacity, transform: [{ translateY: mascotLift }, { scale: mascotScale }] }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Sticky, Chits mascot. Open Chat to write a thought." onPress={openChat} style={styles.mascotButton}>
        <OnboardingMascot size={68} accessible={false} />
      </Pressable>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: spacing.md, alignItems: 'flex-end', zIndex: 12 },
  bubble: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, marginRight: 28, marginBottom: 2, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  bubbleMessage: { flexShrink: 1, minHeight: 44, justifyContent: 'center', paddingLeft: 14, paddingVertical: 8 },
  message: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  mascotButton: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
});
