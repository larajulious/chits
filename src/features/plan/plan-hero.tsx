import { useState, type ReactNode } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

import { COMPACT_EDGE_INSET, compactHeroLayout } from '@/components/boards/compact-hero-layout';
import { useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { ChitsPeekMascot } from '@/features/onboarding/welcome/chits-peek-mascot';
import { DeskScenery } from '@/features/onboarding/welcome/desk-scenery';
import { SpeechBubble } from '@/features/onboarding/welcome/speech-bubble';
import type { MascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { PLAN_LINES } from './plan-lines';

const release = () => undefined;
/** Paper below the hero's cut, so Chits' hand rests on it whole instead of being cropped. */
const HAND_ROOM = 22;
/** The evening light over the desk. */
export const PLAN_DUSK = '#4A4A8C';

type Props = { rig: MascotRig; title: string; body: string; paper: string; evening: boolean; onTap: () => void; children?: ReactNode };

/** The compact Chits hero, as on Notes, with evening light that fades in behind Chits. */
export function PlanHero({ rig, title, body, paper, evening, onTap, children }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { width } = useWindowDimensions();
  const { scheme } = useTheme();
  const { isRTL } = useDirection();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const reduced = useReducedMotion();
  const [copyHeight, setCopyHeight] = useState(0);
  const hero = compactHeroLayout(width, copyHeight);
  const heroHeight = hero.height;
  const sheetTop = useDerivedValue(() => heroHeight - 12);
  const zoom = useDerivedValue(() => 1);
  const dusk = useSharedValue(evening ? 1 : 0);
  useEffect(() => { dusk.set(reduced ? (evening ? 1 : 0) : withTiming(evening ? 1 : 0, { duration: 700 })); }, [dusk, evening, reduced]);
  const duskStyle = useAnimatedStyle(() => ({ opacity: dusk.get() * (scheme === 'dark' ? 0.3 : 0.2) }));
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };

  return <View style={[styles.hero, { height: heroHeight + HAND_ROOM, backgroundColor: desk.desk }]}>
    <DeskScenery width={width} height={hero.height} dark={scheme === 'dark'} objects={false} />
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dusk, duskStyle]} />
    <ChitsPeekMascot
      values={rig.values} unit={hero.unit} screenWidth={width} edgeInset={COMPACT_EDGE_INSET}
      sheetTop={sheetTop} zoom={zoom} shadowColor={desk.shadow}
      label={tr('onboarding.mascot.label')} hint={tr('plan.mascotHint')}
      onPress={onTap} onLongPress={onTap} onPressOut={release}
    >
      <View pointerEvents="none" style={[styles.paperEdge, { top: heroHeight - 6, backgroundColor: paper, boxShadow: `0px -2px 6px ${desk.shadow}` }]} />
    </ChitsPeekMascot>
    <View pointerEvents="box-none" onLayout={({ nativeEvent }) => setCopyHeight(nativeEvent.layout.height)} style={[styles.copy, isRTL ? { right: hero.copyLeft } : { left: hero.copyLeft }, { width: hero.copyWidth }]}>
      <AppText accessibilityRole="header" family={fonts.display} style={[styles.title, align, { color: desk.ink }]}>{title}</AppText>
      <AppText family={fonts.text} style={[styles.body, align, { color: desk.inkMuted }]}>{body}</AppText>
      {children}
    </View>
    {rig.state === 'reacting' && rig.speech >= 0 ? <SpeechBubble compact side="right" text={tr(PLAN_LINES[rig.speech])} top={6} maxWidth={Math.max(130, Math.min(180, width - hero.copyLeft - hero.copyWidth - 14))} /> : null}
  </View>;
}

const styles = StyleSheet.create({
  hero: { overflow: 'hidden' },
  dusk: { backgroundColor: PLAN_DUSK },
  copy: { position: 'absolute', top: 12, gap: 5 },
  title: { fontSize: 23, lineHeight: 27 },
  body: { fontSize: 14, lineHeight: 19 },
  paperEdge: { position: 'absolute', bottom: -12, left: -24, right: -24, transform: [{ rotate: '-0.7deg' }] },
});
