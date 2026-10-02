import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/components/theme-provider';
import { OnboardingMascot } from '@/features/onboarding/components/onboarding-mascot';

type Action = { label: string; onPress: () => void };

/** Uses the same mascot art and quiet entrance as the Notes greeting. */
export function ChitsGuide({ text, actions, onClose, onShown, bottom = 0, hint }: { text: string; actions?: Action[]; onClose?: () => void; onShown?: () => void; bottom?: number; hint?: string }) {
  const { tokens } = useTheme();
  const { width } = useWindowDimensions();
  const [opacity] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => new Animated.Value(12));
  const [scale] = useState(() => new Animated.Value(0.88));
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().catch(() => false).then((reduced) => {
      if (!active) return;
      if (reduced) { lift.setValue(0); scale.setValue(1); }
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: reduced ? 100 : 280, useNativeDriver: true }),
        ...(reduced ? [] : [Animated.spring(lift, { toValue: 0, damping: 15, stiffness: 175, useNativeDriver: true }), Animated.spring(scale, { toValue: 1, damping: 13, stiffness: 190, useNativeDriver: true })]),
      ]).start();
    });
    return () => { active = false; opacity.stopAnimation(); lift.stopAnimation(); scale.stopAnimation(); };
  }, [lift, opacity, scale]);
  return <View pointerEvents="box-none" onLayout={({ nativeEvent }) => { if (nativeEvent.layout.width > 0 && nativeEvent.layout.height > 0) onShown?.(); }} style={[styles.anchor, { bottom, width: Math.min(width - 24, 330) }]}>
    <Animated.View style={[styles.animated, { opacity, transform: [{ translateY: lift }, { scale }] }]}>
      <View style={[styles.bubble, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }]}>
        <View style={styles.heading}><Text style={[styles.name, { color: tokens.accentStrong }]}>Chits</Text>{onClose ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss Chits suggestion" hitSlop={8} onPress={onClose} style={styles.close}><Ionicons accessible={false} name="close" size={17} color={tokens.textSecondary} /></Pressable> : null}</View>
        <Text style={[styles.copy, { color: tokens.textPrimary }]}>{text}</Text>
        {hint ? <Text style={[styles.hint, { color: tokens.textSecondary }]}>{hint}</Text> : null}
        {actions?.length ? <View style={styles.actions}>{actions.map((action, index) => <Pressable key={action.label} accessibilityRole="button" onPress={action.onPress} style={({ pressed }) => [styles.action, { backgroundColor: index === 0 ? tokens.accent : tokens.surfaceElevated }, pressed && styles.pressed]}><Text style={[styles.actionText, { color: index === 0 ? tokens.accentText : tokens.textPrimary }]}>{action.label}</Text></Pressable>)}</View> : null}
      </View>
      <View style={styles.mascot}><OnboardingMascot size={58} accessible={false} /></View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: 12, zIndex: 15 },
  animated: { alignItems: 'flex-end' },
  bubble: { alignSelf: 'stretch', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 11, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 },
  name: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  close: { width: 26, height: 25, alignItems: 'center', justifyContent: 'center' },
  copy: { fontSize: 14, lineHeight: 19, fontWeight: '600' },
  hint: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  action: { borderRadius: 15, paddingHorizontal: 10, minHeight: 29, justifyContent: 'center' },
  actionText: { fontSize: 11, fontWeight: '700' },
  mascot: { marginTop: -3, marginRight: -1 },
  pressed: { opacity: 0.7 },
});
