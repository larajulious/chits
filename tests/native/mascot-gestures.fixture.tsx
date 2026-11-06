// Temporarily export at /mascot-gestures-qa. No app records or preferences are
// changed; these controls exercise the production rig, renderer and admission gate.
import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ChitsMascot, type MascotInteractionHandle } from '@/components/mascot/chits-mascot';
import { GESTURE_WEIGHTS, gestureDuration, type MascotReaction } from '@/components/mascot/mascot-gestures';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, AppText, Screen } from '@/components/ui/primitives';

export default function MascotGesturesQA() {
  const { run } = useLocalSearchParams<{ run?: string }>();
  const { tokens } = useTheme();
  const controls = useRef<MascotInteractionHandle>(null);
  const [last, setLast] = useState('none');
  const [done, setDone] = useState(0);
  const [idle, setIdle] = useState(false);
  const [compact, setCompact] = useState(false);
  const complete = useCallback((gesture: MascotReaction) => { setLast(gesture); setDone(count => count + 1); console.info('[mascot-qa]', gesture); }, []);
  useEffect(() => {
    if (run !== 'all' && run !== 'rapid') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let delay = 1000;
    if (run === 'all') {
      for (const gesture of [...Object.keys(GESTURE_WEIGHTS), 'easteregg'] as MascotReaction[]) {
        timers.push(setTimeout(() => controls.current?.play(gesture), delay));
        delay += gestureDuration(gesture) + 500;
      }
    } else {
      for (let count = 0; count < 5; count++) timers.push(setTimeout(() => controls.current?.tap(), delay + count * 180));
    }
    return () => timers.forEach(clearTimeout);
  }, [run]);
  return <Screen edges={['top', 'bottom', 'left', 'right']}>
    <AppHeader title="Mascot gestures QA" />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.art}><ChitsMascot key={compact ? 'compact' : 'full'} size={compact ? 76 : 180} variant="chits-ong" interactive context="settings" enableIdleAnimation={idle} controlRef={controls} onGestureComplete={complete} /></View>
      <AppText accessibilityLabel={`Done ${done} ${last}`} style={{ color: tokens.textPrimary }}>Done {done}: {last}</AppText>
      <View style={styles.grid}>{[...Object.keys(GESTURE_WEIGHTS), 'easteregg'].map(gesture => <Pressable key={gesture} accessibilityRole="button" accessibilityLabel={`Play ${gesture}`} onPress={() => controls.current?.play(gesture as MascotReaction)} style={[styles.button, { backgroundColor: tokens.surfaceElevated }]}><AppText style={{ color: tokens.textPrimary }}>{gesture}</AppText></Pressable>)}</View>
      <View style={styles.grid}>
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle idle" onPress={() => setIdle(value => !value)} style={styles.button}><AppText style={{ color: tokens.textPrimary }}>Idle {idle ? 'on' : 'off'}</AppText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Toggle compact" onPress={() => setCompact(value => !value)} style={styles.button}><AppText style={{ color: tokens.textPrimary }}>Size {compact ? 'compact' : 'full'}</AppText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Tap mascot" onPress={() => controls.current?.tap()} style={styles.button}><AppText style={{ color: tokens.textPrimary }}>Random tap</AppText></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Leave QA" onPress={() => router.push('/settings')} style={styles.button}><AppText style={{ color: tokens.textPrimary }}>Navigate away</AppText></Pressable>
      </View>
    </ScrollView>
  </Screen>;
}
const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 }, art: { height: 190, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { width: '47%', minHeight: 44, padding: 10, borderRadius: 8, justifyContent: 'center' },
});
