import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { PressableSurface, surfaceStyle } from '@/components/ui/surface';
import { OnboardingMascot } from '@/features/onboarding/components/onboarding-mascot';

type Action = { label: string; onPress: () => void };

/** Uses the same mascot art and quiet entrance as the Notes greeting. */
export function ChitsGuide({ text, actions, onClose, onShown, bottom = 0, hint }: { text: string; actions?: Action[]; onClose?: () => void; onShown?: () => void; bottom?: number; hint?: string }) {
  const { tokens, styleTokens, styleColors } = useTheme();
  const tip = styleTokens.tip;
  const sticky = tip.tail > 0;
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
      <View style={[styles.bubble, surfaceStyle(styleTokens, styleColors, { fill: sticky ? styleColors.controlFill : tokens.surface, radius: tip.guideRadius, border: tokens.borderSubtle, shadow: 'guide', edge: tip.edge || false })]}>
        <View style={styles.heading}><AppText weight="800" style={[styles.name, { color: sticky ? tokens.textPrimary : tokens.accentStrong }]}>Chits</AppText>{onClose ? <Pressable accessibilityRole="button" accessibilityLabel="Dismiss Chits suggestion" hitSlop={8} onPress={onClose} style={styles.close}><Icon name="close" size={17} color={sticky ? styleColors.textSecondary : tokens.textSecondary} /></Pressable> : null}</View>
        <AppText variant={sticky ? 'display' : 'body'} weight={sticky ? '500' : '600'} style={[styles.copy, { color: tokens.textPrimary }]}>{text}</AppText>
        {hint ? <AppText style={[styles.hint, { color: sticky ? styleColors.textSecondary : tokens.textSecondary }]}>{hint}</AppText> : null}
        {actions?.length ? <View style={styles.actions}>{actions.map((action, index) => <PressableSurface key={action.label} accessibilityRole="button" onPress={action.onPress} fill={index === 0 ? (sticky ? styleColors.accentFill : tokens.accent) : sticky ? styleColors.controlFill : tokens.surfaceElevated} radius={tip.actionRadius} edge={styleTokens.chip.activeEdge || false} pressedStyle={styles.pressed} style={styles.action}><AppText weight={sticky ? '800' : '700'} style={[styles.actionText, { color: index === 0 ? (sticky ? styleColors.onAccent : tokens.accentText) : tokens.textPrimary }]}>{action.label}</AppText></PressableSurface>)}</View> : null}
      </View>
      <View style={[styles.mascot, { transform: [{ rotate: `${tip.mascotTilt}deg` }] }]}><OnboardingMascot size={58} accessible={false} /></View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: 12, zIndex: 15 },
  animated: { alignItems: 'flex-end' },
  bubble: { alignSelf: 'stretch', paddingHorizontal: 12, paddingTop: 9, paddingBottom: 11 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22 },
  name: { fontSize: 12, letterSpacing: 0.3 },
  close: { width: 26, height: 25, alignItems: 'center', justifyContent: 'center' },
  copy: { fontSize: 14, lineHeight: 19 },
  hint: { fontSize: 11, lineHeight: 15, marginTop: 3 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  action: { paddingHorizontal: 10, minHeight: 29, justifyContent: 'center' },
  actionText: { fontSize: 11 },
  mascot: { marginTop: -3, marginRight: -1 },
  pressed: { opacity: 0.7 },
});
