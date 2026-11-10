import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';

import { DeskDots, useDesk } from '@/components/desk/desk-surface';
import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW } from '@/components/desk/paper-desk';
import { useMascotReducedMotion } from '@/components/mascot/use-mascot-accessibility';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { parseReminderClock } from '@/services/reminder-time';
import { ReminderTimeArt } from './reminder-time-art';
import { ReminderTimeWheel, type TimeWheelHandle } from './reminder-time-wheel';

type Props = { value: Date; prompt?: string; onConfirm: (hours: number, minutes: number) => void; onDismiss: () => void };
const SPRING = { damping: 19, stiffness: 210, mass: 0.9 };

/** A local clock draft. The reminder sheet still owns validation, saving and scheduling. */
export function ReminderTimePicker({ value, prompt, onConfirm, onDismiss }: Props) {
  useLocale();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const reduced = useMascotReducedMotion();
  const { height, fontScale } = useWindowDimensions();
  const compact = height < 740;
  const rowHeight = Math.max(compact ? 52 : 62, Math.ceil(48 * Math.min(fontScale, 1.4)));
  const [initial] = useState(() => ({ hour: value.getHours() % 12 || 12, minute: value.getMinutes(), period: value.getHours() >= 12 ? 'PM' as const : 'AM' as const }));
  const [period, setPeriod] = useState<'AM' | 'PM'>(initial.period);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const alive = useRef(true);
  const hour = useRef<TimeWheelHandle>(null);
  const minute = useRef<TimeWheelHandle>(null);
  const entrance = useSharedValue(0);
  const reaction = useSharedValue(0);
  const periodPosition = useSharedValue(initial.period === 'PM' ? 1 : 0);
  const periodWidth = useSharedValue(0);
  const outerGesture = useMemo(() => Gesture.Native(), []);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancelAnimation(entrance); cancelAnimation(reaction); cancelAnimation(periodPosition); };
  }, [entrance, periodPosition, reaction]);
  useEffect(() => {
    entrance.set(reduced ? 1 : withSpring(1, SPRING));
  }, [entrance, reduced]);
  const respond = useCallback(() => {
    if (!submitting.current && !reduced) reaction.set(withSequence(withTiming(1, { duration: 110 }), withSpring(0, SPRING)));
  }, [reaction, reduced]);
  const close = () => { if (!submitting.current) onDismiss(); };
  const choosePeriod = (next: 'AM' | 'PM') => {
    if (submitting.current || next === period) return;
    setPeriod(next);
    periodPosition.set(reduced ? (next === 'PM' ? 1 : 0) : withSpring(next === 'PM' ? 1 : 0, SPRING));
    if (!reduced) void Haptics.selectionAsync().catch(() => undefined);
    respond();
  };
  const deliver = useCallback((hours: number, minutes: number) => {
    if (alive.current) onConfirm(hours, minutes);
  }, [onConfirm]);
  const confirm = () => {
    if (submitting.current) return;
    const selectedHour = hour.current?.capture() ?? initial.hour;
    const selectedMinute = minute.current?.capture() ?? initial.minute;
    // Same existing helper, including 12 AM -> 00 and 12 PM -> 12.
    const time = parseReminderClock(String(selectedHour), String(selectedMinute), period);
    if (!time) return;
    submitting.current = true; setSaving(true);
    if (reduced) { deliver(time.hours, time.minutes); return; }
    void Haptics.selectionAsync().catch(() => undefined);
    reaction.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 110 }, done => {
      if (done) runOnJS(deliver)(time.hours, time.minutes);
    })));
  };
  const arrive = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, entrance.get())), transform: [{ translateY: reduced ? 0 : (1 - entrance.get()) * 16 }] }));
  const selectedPeriod = useAnimatedStyle(() => ({ width: periodWidth.get() / 2, transform: [{ translateX: periodPosition.get() * periodWidth.get() / 2 }, { scale: reduced ? 1 : 1 + Math.sin(Math.max(0, Math.min(1, periodPosition.get())) * Math.PI) * 0.035 }] }));
  return <Modal visible presentationStyle="fullScreen" animationType={reduced ? 'none' : 'fade'} statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    {/* A Modal is its own native window, so it needs its own provider to read the status bar inset. */}
    <SafeAreaProvider>
    <GestureHandlerRootView style={[styles.root, { backgroundColor: desk.desk }]}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}><DeskDots faint /></View>
      <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
        <GestureDetector gesture={outerGesture}>
          <ScrollView bounces={false} nestedScrollEnabled contentContainerStyle={styles.scrollContent}>
            <Animated.View style={[styles.content, arrive]} accessibilityViewIsModal>
              <View style={styles.header}>
                <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel={tr('androidremindertimepicker.cancelTimeSelection')} onPress={close} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
                  <Icon name="chevron-back" size={23} color={PAPER_INK} />
                </Pressable>
                <View style={styles.headingPaper}><AppText family={fonts.display} accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.heading}>{tr('reminderTimePicker.title')}</AppText></View>
              </View>
              <AppText family={fonts.text} style={[styles.subtitle, { color: desk.inkMuted }]}>{prompt ?? tr('reminderTimePicker.prompt')}</AppText>
              <Svg pointerEvents="none" width={92} height={9} viewBox="0 0 92 9" style={[styles.underline]}><Path d="M3 6 Q45 0 88 5" fill="none" stroke={PAPER_YELLOW} strokeWidth={4} strokeLinecap="round" /></Svg>
              <View style={{ marginTop: compact ? 12 : 22 }}>
                <ReminderTimeArt entrance={entrance} reaction={reaction} reduced={reduced} compact={compact} />
                <View style={[styles.panel, { boxShadow: `0px 5px 18px ${desk.shadow}` }]}>
                  <View style={styles.wheelLabels}>
                    <AppText family={fonts.text} style={styles.wheelLabel}>{tr('androidremindertimepicker.hour')}</AppText>
                    <View style={styles.colonSpace} />
                    <AppText family={fonts.text} style={styles.wheelLabel}>{tr('androidremindertimepicker.minute')}</AppText>
                  </View>
                  <View style={styles.wheels}>
                    <ReminderTimeWheel ref={hour} initialValue={initial.hour} first={1} count={12} rowHeight={rowHeight} label={tr('clock.hour12')} family={fonts.textBold} reduced={reduced} disabled={saving} outerGesture={outerGesture} onSettle={respond} />
                    <AppText accessible={false} family={fonts.textBold} style={styles.colon}>:</AppText>
                    <ReminderTimeWheel ref={minute} initialValue={initial.minute} first={0} count={60} rowHeight={rowHeight} label={tr('androidremindertimepicker.minute0To59')} family={fonts.textBold} reduced={reduced} disabled={saving} outerGesture={outerGesture} onSettle={respond} />
                  </View>
                  <View accessibilityRole="radiogroup" accessibilityLabel={tr('clock.period')} onLayout={event => periodWidth.set(event.nativeEvent.layout.width)} style={styles.periods}>
                    <Animated.View pointerEvents="none" style={[styles.selectedPeriod, selectedPeriod]} />
                    {(['AM', 'PM'] as const).map(item => <Pressable key={item} disabled={saving} accessibilityRole="radio" accessibilityState={{ selected: item === period, disabled: saving }} onPress={() => choosePeriod(item)} style={({ pressed }) => [styles.period, pressed && styles.pressed]}>
                      <AppText family={fonts.textBold} style={styles.periodText}>{item}</AppText>
                    </Pressable>)}
                  </View>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel={tr('androidremindertimepicker.confirmReminderTime')} accessibilityState={{ disabled: saving, busy: saving }} onPress={confirm} style={({ pressed }) => [styles.done, pressed && !saving && styles.pressed, saving && styles.disabled]}>
                  <Icon name="checkmark" size={23} color={PAPER_WHITE} /><AppText family={fonts.textBold} style={styles.doneText}>{tr('androidremindertimepicker.done')}</AppText>
                </Pressable>
                <Pressable disabled={saving} accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><AppText family={fonts.text} style={[styles.cancelText, { color: desk.inkMuted }]}>{tr('chat.cancel')}</AppText></Pressable>
              </View>
            </Animated.View>
          </ScrollView>
        </GestureDetector>
      </SafeAreaView>
    </GestureHandlerRootView>
    </SafeAreaProvider>
  </Modal>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 12 },
  content: { flexGrow: 1, width: '100%', maxWidth: 400, alignSelf: 'center' },
  header: { minHeight: 62, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 50 },
  back: { position: 'absolute', left: 0, top: 8, width: 46, height: 46, borderRadius: 23, backgroundColor: PAPER_WHITE, alignItems: 'center', justifyContent: 'center' },
  headingPaper: { backgroundColor: PAPER_YELLOW, paddingHorizontal: 19, paddingVertical: 9, borderRadius: 7, transform: [{ rotate: '-3deg' }], boxShadow: '0px 3px 0px #E1B64D' },
  heading: { color: PAPER_INK, fontSize: 30, lineHeight: 36, textAlign: 'center' },
  subtitle: { textAlign: 'center', fontSize: 16, lineHeight: 23, marginTop: 18, paddingHorizontal: 8 },
  underline: { alignSelf: 'center', marginTop: 5 },
  panel: { padding: 17, borderRadius: 30, backgroundColor: '#FFF8E9' },
  wheelLabels: { flexDirection: 'row', direction: 'ltr', paddingBottom: 7 },
  wheelLabel: { flex: 1, color: '#766A58', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  colonSpace: { width: 32 },
  wheels: { flexDirection: 'row', direction: 'ltr', alignItems: 'center' },
  colon: { width: 32, textAlign: 'center', color: PAPER_INK, fontSize: 37, lineHeight: 48 },
  periods: { marginTop: 16, flexDirection: 'row', borderRadius: 18, backgroundColor: '#F3EADA', direction: 'ltr' },
  selectedPeriod: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: '#FFEBA4', borderRadius: 18 },
  period: { flex: 1, minHeight: 49, alignItems: 'center', justifyContent: 'center' },
  periodText: { color: PAPER_INK, fontSize: 17 },
  actions: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 23 },
  done: { minHeight: 56, borderRadius: 21, backgroundColor: PAPER_INK, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  doneText: { color: PAPER_WHITE, fontSize: 18, lineHeight: 24 },
  cancel: { minHeight: 47, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, lineHeight: 21 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.65 },
});
