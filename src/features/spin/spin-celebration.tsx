import { useEffect, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import { PAPER_CONFETTI } from '@/components/desk/paper-desk';

// Mounted for each successful landing/completion, never when restoring a result.
// One native-driver timeline keeps the burst independent of list/data refreshes.
export function SpinCelebration() {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const animation = Animated.timing(progress, { toValue: 1, duration: 1500, easing: Easing.linear, useNativeDriver: true });
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') { animation.stop(); progress.setValue(1); }
    });
    animation.start();
    return () => { animation.stop(); subscription.remove(); };
  }, [progress]);
  const colors = PAPER_CONFETTI;
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.overlay}>
    {Array.from({ length: 20 }, (_, index) => {
      const direction = index % 2 ? 1 : -1;
      const spread = direction * (30 + (index % 10) * 15);
      const lift = 35 + (index % 5) * 16;
      return <Animated.View key={index} style={[styles.piece, {
        backgroundColor: colors[index % colors.length],
        width: index % 3 === 0 ? 7 : 5,
        height: index % 3 === 0 ? 7 : 11,
        borderRadius: index % 3 === 0 ? 4 : 1,
        opacity: progress.interpolate({ inputRange: [0, 0.05, 0.65, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, spread * 0.7, spread] }) },
          { translateY: progress.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, -lift, 180 + (index % 4) * 20] }) },
          { rotate: progress.interpolate({ inputRange: [0, 1], outputRange: [`${index * 31}deg`, `${index * 31 + direction * 300}deg`] }) },
          { scale: progress.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0.4, 1, 1, 0.5] }) },
        ],
      }]} />;
    })}
  </View>;
}
const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, overflow: 'hidden', zIndex: 10 },
  piece: { position: 'absolute', top: 95, left: '50%' },
});
