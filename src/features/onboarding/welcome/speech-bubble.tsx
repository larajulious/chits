import { useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, useReducedMotion } from 'react-native-reanimated';

import { PAPER_INK, PAPER_WHITE, PaperNote, useHandwriting } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/app-text';

/** Chits' reply to a tap: a handwritten note on the desk, like Chits' lines in Spin. Disappears on its own. */
export function SpeechBubble({ text, top, maxWidth, side = 'left', compact = false, announce = true }: { text: string; top: number; maxWidth: number; side?: 'left' | 'right'; compact?: boolean; /** False when the screen is already announcing the same moment. */ announce?: boolean }) {
  const reduced = useReducedMotion();
  const { hand } = useHandwriting();
  useEffect(() => { if (announce) AccessibilityInfo.announceForAccessibility(text); }, [announce, text]);
  return <Animated.View
    pointerEvents="none"
    entering={reduced ? undefined : FadeInDown.duration(220)}
    exiting={reduced ? undefined : FadeOut.duration(180)}
    style={[styles.anchor, side === 'left' ? styles.left : styles.right, { top, maxWidth }]}
  >
    <PaperNote paper={PAPER_WHITE} tilt={-1.5} style={[styles.note, compact && styles.compactNote]}>
      <AppText style={[hand, styles.text, compact && styles.compactText]}>{text}</AppText>
      <View style={styles.tail} />
    </PaperNote>
  </Animated.View>;
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute' },
  left: { left: 16 },
  right: { right: 12 },
  note: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 7 },
  text: { color: PAPER_INK, fontSize: 18, lineHeight: 24 },
  compactNote: { paddingHorizontal: 10, paddingTop: 7, paddingBottom: 5 },
  compactText: { fontSize: 15, lineHeight: 20 },
  tail: { position: 'absolute', right: 24, bottom: -6, width: 13, height: 13, backgroundColor: PAPER_WHITE, transform: [{ rotate: '45deg' }] },
});
