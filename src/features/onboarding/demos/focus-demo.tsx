import * as Haptics from 'expo-haptics';
import { useEffect, useReducer, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { PAPER_INK, PAPER_WHITE, PaperButton, PaperNote, useHandwriting } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/constants/theme';
import { DialReadout, dialRingColor, FocusDial } from '@/features/focus/focus-dial';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { focusClock } from '@/services/focus-timer';
import { ot } from '../strings';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import { DemoReset, type DemoProps } from './demo-kit';
import { DEMO_FOCUS_MS, DEMO_FOCUS_START, demoFocusReducer } from './demo-state';

const SMALLEST_DIAL = 112;
const LARGEST_DIAL = 216;
/** The dial's knob stands above its face, so the whole clock is a little taller than wide. */
const DIAL_WITH_KNOB = 1.06;
/** Slow enough to breathe along with. */
const BREATH_MS = 4200;

/** The dial's soft glow, rising and falling. It's the only thing that moves on this step. */
function Breath({ size, moving, color }: { size: number; moving: boolean; color: string }) {
  const reduced = useReducedMotion();
  const breath = useSharedValue(0);
  useEffect(() => {
    if (!moving || reduced) return;
    breath.set(withRepeat(withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => { cancelAnimation(breath); breath.set(0); };
  }, [breath, moving, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: 0.1 + breath.get() * 0.14, transform: [{ scale: 1.02 + breath.get() * 0.07 }] }));
  return <Animated.View pointerEvents="none" style={[styles.breath, { width: size, height: size, borderRadius: size / 2, backgroundColor: color, marginLeft: -size / 2, marginTop: -size / 2 }, style]} />;
}

/** The real dial and its readout, on a short timer of its own. No session is ever created. */
export function FocusDemo({ surfaces, active, mascot }: DemoProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { isRTL, rowStyle } = useDirection();
  const { tokens, styleTokens } = useTheme();
  const { handBold } = useHandwriting();
  const fonts = useWelcomeFonts();
  const [timer, send] = useReducer(demoFocusReducer, DEMO_FOCUS_START);
  const [room, setRoom] = useState(0);
  const running = timer.status === 'running';
  const dial = room ? Math.round(Math.min(LARGEST_DIAL, Math.max(SMALLEST_DIAL, room / DIAL_WITH_KNOB))) : 0;
  const time = focusClock(timer.leftMs);

  useEffect(() => {
    if (!running || !active) return;
    const tick = setInterval(() => send('tick'), 1000);
    return () => clearInterval(tick);
  }, [active, running]);
  // Moving on pauses it, so it isn't still counting behind the next step.
  useEffect(() => { if (!active) send('pause'); }, [active]);
  useEffect(() => {
    if (timer.status === 'completed') mascot.say(tr('focus.say.completed'));
  }, [mascot, timer.status]);

  const toggle = () => {
    void Haptics.selectionAsync().catch(() => undefined);
    if (timer.status === 'completed') { send('reset'); return; }
    if (running) mascot.say(tr('focus.say.paused'));
    send(running ? 'pause' : 'start');
  };
  const action = running ? 'focus.pause' : timer.status === 'paused' ? 'focus.resume' : timer.status === 'completed' ? 'tour.again' : 'focus.start';
  const status = timer.status === 'ready' ? tr('focus.ready') : tr(`focus.state.${timer.status}`);

  return <View style={styles.root}>
    <PaperNote paper={PAPER_WHITE} tilt={-0.6} style={styles.task}>
      <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[handBold, styles.taskText]}>{ot('tour.focus.task')}</AppText>
    </PaperNote>
    {/* Measured here, not on the page: this slot takes what's left, so the dial can't push the controls away by growing. */}
    <View style={styles.dial} onLayout={({ nativeEvent: { layout: frame } }) => setRoom(frame.height)}>
      {dial ? <>
        <Breath size={dial} moving={active} color={dialRingColor(tokens.accent)} />
        <FocusDial size={dial} finished={timer.status === 'completed' ? 1 : 0}>
          <DialReadout size={dial} time={time} status={status} label={tr('focus.timeLeft', { time })} fraction={1 - timer.leftMs / DEMO_FOCUS_MS} />
        </FocusDial>
      </> : null}
    </View>
    <View style={[styles.controls, rowStyle]}>
      <PaperButton paper={surfaces.control} accessibilityRole="button" onPress={toggle} containerStyle={styles.flex} style={[styles.action, { borderRadius: styleTokens.button.radius }]}>
        <AppText numberOfLines={1} adjustsFontSizeToFit weight="700" family={fonts.display} style={[styles.actionLabel, { color: surfaces.ink }]}>{action === 'tour.again' ? ot('tour.tryAgain') : tr(action)}</AppText>
      </PaperButton>
      {timer.status !== 'ready' && timer.status !== 'completed' ? <DemoReset label={ot('tour.focus.reset')} surfaces={surfaces} onPress={() => send('reset')} /> : null}
    </View>
    <AppText family={fonts.text} style={[styles.features, { color: surfaces.inkMuted, textAlign: isRTL ? 'right' : 'center' }]}>{ot('tour.focus.features')}</AppText>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 262, gap: spacing.xs },
  flex: { flex: 1 },
  task: { alignSelf: 'center', maxWidth: '92%', paddingHorizontal: spacing.md, paddingVertical: 6 },
  taskText: { color: PAPER_INK, fontSize: 18, lineHeight: 24, textAlign: 'center' },
  dial: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  breath: { position: 'absolute', left: '50%', top: '50%' },
  controls: { alignItems: 'center', gap: spacing.xs },
  action: { minHeight: 46, paddingHorizontal: spacing.md },
  actionLabel: { fontSize: 17, lineHeight: 22 },
  features: { fontSize: 13, lineHeight: 18 },
});
