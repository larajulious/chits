import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { ART, ArmPart, BlushPart, BodyPart, EyePart, FarArmPart, SmilePart, TapePart, type ArtBox } from '@/features/onboarding/welcome/mascot-art';
import { BandanaPart, BANDANA_BOX } from '@/components/mascot/mascot-still';
import { useMascotPreference } from '@/components/mascot/mascot-provider';
import { PAPER_INK, PAPER_YELLOW } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/app-text';

/** The tear-off page the date picker shows instead of the clock. */
export type ArtCalendar = { day: string; month: string; family?: string };

/** Existing SVG parts, cropped behind the panel; Chits holds a clock, or a calendar page when one is given. */
export function ReminderTimeArt({ entrance, reaction, reduced, compact, calendar }: { entrance: SharedValue<number>; reaction: SharedValue<number>; reduced: boolean; compact: boolean; calendar?: ArtCalendar }) {
  const { variant } = useMascotPreference();
  const blink = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    const timer = setInterval(() => blink.set(withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 140 }))), 4700);
    return () => { clearInterval(timer); cancelAnimation(blink); blink.set(0); };
  }, [blink, reduced]);
  const size = compact ? 150 : 174;
  const unit = size / 1250;
  const character = useAnimatedStyle(() => ({ transform: [{ translateY: reduced ? 0 : (1 - entrance.get()) * 52 - reaction.get() * 4 }] }));
  const eyes = useAnimatedStyle(() => ({ transform: [{ scaleY: 1 - blink.get() * 0.92 }] }));
  const clock = useAnimatedStyle(() => ({ transform: [{ rotate: `${-8 + (reduced ? 0 : reaction.get() * 6 + (1 - entrance.get()) * 12)}deg` }, { translateY: reduced ? 0 : -reaction.get() * 3 }] }));
  const place = (box: ArtBox) => ({ position: 'absolute' as const, left: box.x * unit, top: box.y * unit, width: box.w * unit, height: box.h * unit });
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.stage, { height: compact ? 106 : 126 }]}>
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, character]}>
      <View style={place(ART.farArm)}><FarArmPart unit={unit} /></View>
      <View style={place(ART.body)}><BodyPart unit={unit} /></View>
      {variant === 'chits-ong' ? <View style={place(BANDANA_BOX)}><BandanaPart unit={unit} /></View> : null}
      <View style={place(ART.tape)}><TapePart unit={unit} /></View>
      <View style={place(ART.blush)}><BlushPart unit={unit} /></View>
      <Animated.View style={[place(ART.eyeLeft), eyes]}><EyePart unit={unit} side="left" /></Animated.View>
      <Animated.View style={[place(ART.eyeRight), eyes]}><EyePart unit={unit} side="right" /></Animated.View>
      <View style={place(ART.mouth)}><SmilePart unit={unit} /></View>
      <View style={place(ART.arm)}><ArmPart unit={unit} /></View>
    </Animated.View>
    <Animated.View style={[styles.clock, { left: size * 0.73, top: compact ? 26 : 34 }, clock]}>
      {calendar ? <CalendarPage {...calendar} /> : <Svg width={94} height={94} viewBox="0 0 100 100">
        <G fill="none" stroke={PAPER_INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M27 77 L20 87 M72 77 L79 87 M47 17 L47 12 L54 12" />
          <Path d="M20 30 Q6 21 18 12 Q27 6 34 20 M66 20 Q73 6 82 12 Q94 21 80 30" fill={PAPER_YELLOW} />
          <Circle cx={50} cy={51} r={31} fill="#FFF9E9" />
          <Circle cx={50} cy={51} r={25} stroke="#DDC9A4" strokeWidth={1} />
          <Path d="M50 31 L50 51 L65 58" />
          <Circle cx={50} cy={51} r={2} fill={PAPER_INK} />
          <Line x1={50} y1={27} x2={50} y2={30} /><Line x1={50} y1={72} x2={50} y2={75} />
          <Line x1={26} y1={51} x2={29} y2={51} /><Line x1={71} y1={51} x2={74} y2={51} />
        </G>
        <Path d="M5 41 L1 36 M92 39 L98 34 M89 87 L95 89" stroke={PAPER_YELLOW} strokeWidth={4} strokeLinecap="round" />
      </Svg>}
    </Animated.View>
  </View>;
}

function CalendarPage({ day, month, family }: ArtCalendar) {
  return <>
    <Svg width={94} height={94} viewBox="0 0 100 100">
      <G fill="none" stroke={PAPER_INK} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M24 22 H76 Q84 22 84 30 V78 Q84 86 76 86 H24 Q16 86 16 78 V30 Q16 22 24 22 Z" fill="#FFF9E9" />
        <Path d="M24 22 H76 Q84 22 84 30 V42 H16 V30 Q16 22 24 22 Z" fill={PAPER_YELLOW} />
        <Path d="M34 13 V28 M66 13 V28" strokeWidth={5} />
      </G>
      <Path d="M5 41 L1 36 M92 39 L98 34 M89 87 L95 89" stroke={PAPER_YELLOW} strokeWidth={4} strokeLinecap="round" />
    </Svg>
    <View style={styles.pageMonth}><AppText family={family} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1} style={styles.pageMonthText}>{month.toLocaleUpperCase()}</AppText></View>
    <View style={styles.pageDay}><AppText family={family} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1} style={styles.pageDayText}>{day}</AppText></View>
  </>;
}
const styles = StyleSheet.create({
  stage: { width: 246, alignSelf: 'center', overflow: 'hidden', marginBottom: -9 },
  clock: { position: 'absolute', width: 94, height: 94 },
  // Text sits over the SVG page: the yellow band, then the body below it (viewBox scaled to 94).
  pageMonth: { position: 'absolute', left: 22, right: 22, top: 27, height: 13, justifyContent: 'center' },
  pageMonthText: { color: PAPER_INK, fontSize: 10, lineHeight: 13, textAlign: 'center', letterSpacing: 0.6 },
  pageDay: { position: 'absolute', left: 19, right: 19, top: 41, height: 38, justifyContent: 'center' },
  pageDayText: { color: PAPER_INK, fontSize: 30, lineHeight: 36, textAlign: 'center' },
});
