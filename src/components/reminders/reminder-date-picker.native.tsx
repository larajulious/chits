import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { getCalendars } from 'expo-localization';

import { DeskDots, useDesk } from '@/components/desk/desk-surface';
import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW } from '@/components/desk/paper-desk';
import { useMascotReducedMotion } from '@/components/mascot/use-mascot-accessibility';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { addLocalDays, monthFromIndex, monthGrid, monthIndex, startOfLocalDay, weekStartFromLocale } from '@/features/calendar/calendar-schedule';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { dateFormat } from '@/services/reminder-time';
import { ReminderTimeArt } from './reminder-time-art';

type Props = {
  value: Date;
  /** Days before this one can't be chosen. */
  minimumDate?: Date;
  prompt?: string;
  onConfirm: (year: number, month: number, day: number) => void;
  onDismiss: () => void;
};
const SPRING = { damping: 19, stiffness: 210, mass: 0.9 };

/** A local day draft, dressed like the Set Time picker. The caller keeps the time of day and all validation. */
export function ReminderDatePicker({ value, minimumDate, prompt, onConfirm, onDismiss }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle, isRTL } = useDirection();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const reduced = useMascotReducedMotion();
  const { height, fontScale } = useWindowDimensions();
  // A month grid is taller than the time wheels, so this screen tightens up sooner.
  const compact = height < 860;
  const cell = Math.max(compact ? 40 : 44, Math.ceil(34 * Math.min(fontScale, 1.4)));
  const [initial] = useState(() => {
    const today = startOfLocalDay(new Date());
    const min = minimumDate ? startOfLocalDay(minimumDate) : null;
    const day = startOfLocalDay(value);
    const selected = min && day < min ? min : day;
    return { today, min, selected, weekStart: weekStartFromLocale(getCalendars()[0]?.firstWeekday) };
  });
  const { today, min, weekStart } = initial;
  const [selected, setSelected] = useState(initial.selected);
  const [month, setMonth] = useState(() => monthIndex(initial.selected));
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const alive = useRef(true);
  const entrance = useSharedValue(0);
  const reaction = useSharedValue(0);
  const slide = useSharedValue(0);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; cancelAnimation(entrance); cancelAnimation(reaction); cancelAnimation(slide); };
  }, [entrance, reaction, slide]);
  useEffect(() => {
    entrance.set(reduced ? 1 : withSpring(1, SPRING));
  }, [entrance, reduced]);

  const minMonth = min ? monthIndex(min) : -Infinity;
  const { year, month: monthOfYear } = monthFromIndex(month);
  const grid = monthGrid(year, monthOfYear, weekStart);
  const weeks = Array.from({ length: grid.weeks }, (_, week) => Array.from({ length: 7 }, (_, day) => addLocalDays(grid.start, week * 7 + day)));
  const monthLabel = dateFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, monthOfYear, 1));
  const tomorrow = addLocalDays(today, 1);

  const respond = useCallback(() => {
    if (!submitting.current && !reduced) reaction.set(withSequence(withTiming(1, { duration: 110 }), withSpring(0, SPRING)));
  }, [reaction, reduced]);
  const close = () => { if (!submitting.current) onDismiss(); };
  const showMonth = (next: number) => {
    if (next === month || next < minMonth) return;
    const delta = next > month ? 1 : -1;
    setMonth(next);
    if (!reduced) slide.set(withSequence(withTiming(delta, { duration: 0 }), withSpring(0, SPRING)));
    const { year: nextYear, month: nextMonth } = monthFromIndex(next);
    AccessibilityInfo.announceForAccessibility(dateFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(nextYear, nextMonth, 1)));
  };
  const step = (delta: number) => { if (!saving) showMonth(month + delta); };
  // Sideways swipes turn the page; a mostly vertical drag is left to the scroll view.
  // Rebuilt each render so it always steps from the month on screen (it only renders on a pick or a page turn).
  const swipe = Gesture.Pan().runOnJS(true).activeOffsetX([-24, 24]).failOffsetY([-14, 14]).onEnd(event => {
    if (Math.abs(event.translationX) < 48 && Math.abs(event.velocityX) < 450) return;
    step((event.translationX < 0 ? 1 : -1) * (isRTL ? -1 : 1));
  });
  const choose = (date: Date) => {
    if (submitting.current || (min && date < min)) return;
    setSelected(date);
    showMonth(monthIndex(date));
    if (!reduced) void Haptics.selectionAsync().catch(() => undefined);
    respond();
  };
  const deliver = useCallback((nextYear: number, nextMonth: number, nextDay: number) => {
    if (alive.current) onConfirm(nextYear, nextMonth, nextDay);
  }, [onConfirm]);
  const confirm = () => {
    if (submitting.current) return;
    const [y, m, d] = [selected.getFullYear(), selected.getMonth(), selected.getDate()];
    submitting.current = true; setSaving(true);
    if (reduced) { deliver(y, m, d); return; }
    void Haptics.selectionAsync().catch(() => undefined);
    reaction.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 110 }, done => {
      if (done) runOnJS(deliver)(y, m, d);
    })));
  };

  const arrive = useAnimatedStyle(() => ({ opacity: Math.max(0, Math.min(1, entrance.get())), transform: [{ translateY: reduced ? 0 : (1 - entrance.get()) * 16 }] }));
  const turn = useAnimatedStyle(() => ({ opacity: 1 - Math.min(1, Math.abs(slide.get())) * 0.7, transform: [{ translateX: slide.get() * 30 * (isRTL ? -1 : 1) }] }));
  const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
  const quick = [{ date: today, label: tr('dates.today') }, { date: tomorrow, label: tr('remindertime.tomorrow') }];
  const monthUnit = tr('calendar.month');

  return <Modal visible presentationStyle="fullScreen" animationType={reduced ? 'none' : 'fade'} statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
    {/* A Modal is its own native window, so it needs its own provider to read the status bar inset. */}
    <SafeAreaProvider>
      <GestureHandlerRootView style={[styles.root, { backgroundColor: desk.desk }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}><DeskDots faint /></View>
        <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
          <ScrollView bounces={false} contentContainerStyle={styles.scrollContent}>
            <Animated.View style={[styles.content, arrive]} accessibilityViewIsModal>
              <View style={styles.header}>
                <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel={tr('reminderDatePicker.cancel')} onPress={close} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
                  <Icon name="chevron-back" size={23} color={PAPER_INK} />
                </Pressable>
                <View style={styles.headingPaper}><AppText family={fonts.display} accessibilityRole="header" maxFontSizeMultiplier={1.2} style={styles.heading}>{tr('reminderDatePicker.title')}</AppText></View>
              </View>
              <AppText family={fonts.text} style={[styles.subtitle, { color: desk.inkMuted }]}>{prompt ?? tr('reminderDatePicker.prompt')}</AppText>
              <Svg pointerEvents="none" width={92} height={9} viewBox="0 0 92 9" style={[styles.underline]}><Path d="M3 6 Q45 0 88 5" fill="none" stroke={PAPER_YELLOW} strokeWidth={4} strokeLinecap="round" /></Svg>
              <View style={{ marginTop: compact ? 12 : 22 }}>
                <ReminderTimeArt entrance={entrance} reaction={reaction} reduced={reduced} compact={compact}
                  calendar={{ day: dateFormat(undefined, { day: 'numeric' }).format(selected), month: dateFormat(undefined, { month: 'short' }).format(selected), family: fonts.display }} />
                <View style={[styles.panel, { boxShadow: `0px 5px 18px ${desk.shadow}` }]}>
                  <View style={[styles.monthBar, rowStyle]}>
                    <Pressable disabled={saving || month <= minMonth} accessibilityRole="button" accessibilityLabel={tr('calendar.previousValue', { value1: monthUnit })} accessibilityState={{ disabled: saving || month <= minMonth }} onPress={() => step(-1)} hitSlop={4} style={({ pressed }) => [styles.monthStep, month <= minMonth && styles.unavailable, pressed && styles.pressed]}>
                      <Icon name={isRTL ? 'chevron-forward' : 'chevron-back'} size={20} color={PAPER_INK} />
                    </Pressable>
                    <AppText family={fonts.textBold} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.3} style={styles.monthLabel}>{monthLabel}</AppText>
                    <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel={tr('calendar.nextValue', { value1: monthUnit })} accessibilityState={{ disabled: saving }} onPress={() => step(1)} hitSlop={4} style={({ pressed }) => [styles.monthStep, pressed && styles.pressed]}>
                      <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={PAPER_INK} />
                    </Pressable>
                  </View>
                  <GestureDetector gesture={swipe}>
                    <View style={styles.sheet}>
                      <View style={[styles.week, rowStyle]}>
                        {weeks[0].map(date => <AppText key={date.getDay()} accessible={false} family={fonts.text} numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.weekday}>{dateFormat(undefined, { weekday: 'short' }).format(date)}</AppText>)}
                      </View>
                      <Animated.View style={turn}>
                        {weeks.map(days => <View key={days[0].getTime()} style={[styles.week, rowStyle]}>
                          {days.map(date => {
                            if (date.getMonth() !== monthOfYear) return <View key={date.getTime()} style={[styles.day, { height: cell }]} />;
                            const isSelected = sameDay(date, selected);
                            const isToday = sameDay(date, today);
                            const unavailable = !!min && date < min;
                            return <Pressable key={date.getTime()} disabled={saving || unavailable} onPress={() => choose(date)}
                              accessibilityRole="button" accessibilityLabel={dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(date)}
                              accessibilityState={{ selected: isSelected, disabled: saving || unavailable }}
                              style={({ pressed }) => [styles.day, { height: cell }, pressed && !isSelected && styles.pressed]}>
                              <View style={[styles.dayMark, { width: cell - 4, height: cell - 4 }]}>
                                {/* Mounted only when chosen: toggling the shadow on a live view drops its rounding on Android. */}
                                {isSelected ? <View style={[styles.daySelected, { borderRadius: (cell - 4) / 2 }]} /> : null}
                                <AppText family={isSelected || isToday ? fonts.textBold : fonts.text} maxFontSizeMultiplier={1.3} style={[styles.dayText, unavailable && styles.unavailable]}>{dateFormat(undefined, { day: 'numeric' }).format(date)}</AppText>
                                {isToday && !isSelected ? <View style={styles.todayDot} /> : null}
                              </View>
                            </Pressable>;
                          })}
                        </View>)}
                      </Animated.View>
                    </View>
                  </GestureDetector>
                  <View style={[styles.quick, rowStyle]}>
                    {quick.map(item => {
                      const unavailable = !!min && item.date < min;
                      const isSelected = sameDay(item.date, selected);
                      return <Pressable key={item.date.getTime()} disabled={saving || unavailable} accessibilityRole="button" accessibilityState={{ selected: isSelected, disabled: saving || unavailable }} onPress={() => choose(item.date)}
                        style={({ pressed }) => [styles.quickItem, isSelected && styles.quickSelected, unavailable && styles.unavailable, pressed && styles.pressed]}>
                        <AppText family={fonts.textBold} style={styles.quickText}>{item.label}</AppText>
                      </Pressable>;
                    })}
                  </View>
                </View>
              </View>
              <View style={styles.actions}>
                <Pressable disabled={saving} accessibilityRole="button" accessibilityLabel={tr('reminderDatePicker.confirm')} accessibilityState={{ disabled: saving, busy: saving }} onPress={confirm} style={({ pressed }) => [styles.done, pressed && !saving && styles.pressed, saving && styles.disabled]}>
                  <Icon name="checkmark" size={23} color={PAPER_WHITE} /><AppText family={fonts.textBold} style={styles.doneText}>{tr('androidremindertimepicker.done')}</AppText>
                </Pressable>
                <Pressable disabled={saving} accessibilityRole="button" onPress={close} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><AppText family={fonts.text} style={[styles.cancelText, { color: desk.inkMuted }]}>{tr('chat.cancel')}</AppText></Pressable>
              </View>
            </Animated.View>
          </ScrollView>
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
  monthBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  monthStep: { width: 40, height: 40, borderRadius: 20, backgroundColor: PAPER_WHITE, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { flex: 1, color: PAPER_INK, fontSize: 18, lineHeight: 24, textAlign: 'center' },
  sheet: { backgroundColor: PAPER_WHITE, borderRadius: 25, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 6, overflow: 'hidden' },
  week: { flexDirection: 'row' },
  weekday: { flex: 1, color: '#766A58', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingBottom: 4 },
  day: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  dayMark: { maxWidth: '100%', alignItems: 'center', justifyContent: 'center' },
  daySelected: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: '#FFEBA4', boxShadow: '0px 2px 0px #E8C35E' },
  dayText: { color: PAPER_INK, fontSize: 16, lineHeight: 21, fontVariant: ['tabular-nums'], textAlign: 'center' },
  todayDot: { position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: 2.5, backgroundColor: PAPER_INK },
  quick: { marginTop: 14, flexDirection: 'row', borderRadius: 18, backgroundColor: '#F3EADA' },
  quickItem: { flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 18, paddingHorizontal: 8 },
  quickSelected: { backgroundColor: '#FFEBA4' },
  quickText: { color: PAPER_INK, fontSize: 16, lineHeight: 21 },
  unavailable: { opacity: 0.3 },
  actions: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 23 },
  done: { minHeight: 56, borderRadius: 21, backgroundColor: PAPER_INK, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  doneText: { color: PAPER_WHITE, fontSize: 18, lineHeight: 24 },
  cancel: { minHeight: 47, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, lineHeight: 21 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.65 },
});
