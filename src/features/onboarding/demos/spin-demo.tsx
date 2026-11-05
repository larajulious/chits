import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated as RNAnimated, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion, ZoomIn } from 'react-native-reanimated';

import { PAPER_INK, PaperButton, PaperNote, PAPERS, useHandwriting } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/constants/theme';
import { WHEEL_TOP_ROOM } from '@/features/spin/spin-layout';
import { SpinWheel, spinTo } from '@/features/spin/spin-wheel';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { spinLanding } from '@/services/spin-engine';
import { ot } from '../strings';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import type { DemoProps } from './demo-kit';

const WHEEL_PAPERS = [PAPERS[0], PAPERS[1], PAPERS[2]];
const ACTION_HEIGHT = 50;
const SMALLEST_WHEEL = 140;
const LARGEST_WHEEL = 250;
/** Three big slices have room for type that still reads on a small wheel. */
const LABEL_SIZE = 25;

/** The real wheel with three sample choices. Each spin picks at random and lands there. */
export function SpinDemo({ active, mascot }: Omit<DemoProps, 'surfaces'>) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { styleTokens } = useTheme();
  const { isRTL } = useDirection();
  const { handBold } = useHandwriting();
  const fonts = useWelcomeFonts();
  const reduced = useReducedMotion();
  const [rotation] = useState(() => new RNAnimated.Value(0));
  const angle = useRef(0);
  const animation = useRef<RNAnimated.CompositeAnimation | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [landed, setLanded] = useState(-1);
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null);
  const labels = [ot('tour.spin.read'), ot('tour.spin.draw'), ot('tour.spin.break')];
  const wheel = room ? Math.round(Math.min(LARGEST_WHEEL, room.width * 0.74, Math.max(SMALLEST_WHEEL, room.height - WHEEL_TOP_ROOM - ACTION_HEIGHT - spacing.xs))) : 0;

  const spin = useCallback(() => {
    if (animation.current) return;
    const winner = Math.floor(Math.random() * WHEEL_PAPERS.length);
    const target = spinLanding(angle.current, winner, WHEEL_PAPERS.length);
    const finish = () => {
      animation.current = null;
      angle.current = target % 360;
      rotation.setValue(angle.current);
      setSpinning(false);
      setLanded(winner);
      mascot.cheer(ot('tour.spin.say.landed'));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    };
    setLanded(-1);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    if (reduced) { finish(); return; }
    setSpinning(true);
    mascot.watch();
    animation.current = spinTo(rotation, target, WHEEL_PAPERS.length);
    animation.current.start(({ finished }) => { if (finished) finish(); });
  }, [mascot, reduced, rotation]);

  // Leaving mid-spin stops the wheel where it is, and it starts from there next time.
  useEffect(() => {
    if (active) return;
    if (!animation.current) return;
    animation.current.stop();
    animation.current = null;
    rotation.stopAnimation((value) => { angle.current = ((value % 360) + 360) % 360; });
    setSpinning(false);
  }, [active, rotation]);
  useEffect(() => () => { animation.current?.stop(); }, []);

  const result = landed >= 0 ? labels[landed] : null;
  return <View style={styles.root} onLayout={({ nativeEvent: { layout: frame } }) => setRoom((current) => (current?.width === frame.width && current.height === frame.height ? current : { width: frame.width, height: frame.height }))}>
    <View style={[styles.stage, { paddingTop: WHEEL_TOP_ROOM }]}>
      {wheel ? <SpinWheel size={wheel} rotation={rotation} labels={labels} papers={WHEEL_PAPERS} spinning={spinning} highlight={!spinning && landed >= 0 ? landed : null} onSpin={spin} spinDisabled={spinning} labelSize={LABEL_SIZE} /> : null}
      {/* A note beside the wheel, so nothing under it moves when the result arrives. */}
      {result ? <Animated.View key={landed} accessibilityLiveRegion="polite" entering={reduced ? undefined : ZoomIn.duration(240)} style={[styles.result, isRTL ? styles.resultRight : styles.resultLeft]}>
        <PaperNote paper={WHEEL_PAPERS[landed]} tilt={-4} tape style={styles.resultNote}>
          <AppText style={[handBold, styles.resultText]}>{result}</AppText>
        </PaperNote>
      </Animated.View> : null}
    </View>
    {/* A sticky of its own, so it reads as part of the wheel and not as the tour's Next. */}
    <PaperButton paper={PAPERS[4]} tilt={-1.2} tape accessibilityRole="button" accessibilityState={{ disabled: spinning, busy: spinning }} disabled={spinning} onPress={spin} containerStyle={styles.actionFrame} style={[styles.action, { borderRadius: styleTokens.button.radius }]}>
      <Animated.View key={result ? 'again' : 'spin'} entering={reduced ? undefined : FadeIn.duration(180)}>
        <AppText numberOfLines={1} adjustsFontSizeToFit weight="700" family={fonts.display} style={styles.actionLabel}>{tr(result ? 'spin.again' : 'spin.hub')}</AppText>
      </Animated.View>
    </PaperButton>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 222, gap: spacing.xs },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  result: { position: 'absolute', bottom: spacing.xxs, maxWidth: '46%' },
  resultLeft: { left: 0 },
  resultRight: { right: 0 },
  resultNote: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 },
  resultText: { color: PAPER_INK, fontSize: 19, lineHeight: 24 },
  actionFrame: { alignSelf: 'center', width: '64%', maxWidth: 280 },
  action: { minHeight: ACTION_HEIGHT, paddingHorizontal: spacing.md },
  actionLabel: { color: PAPER_INK, fontSize: 18, lineHeight: 23 },
});
