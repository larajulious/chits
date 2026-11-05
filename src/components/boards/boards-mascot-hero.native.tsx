import { memo, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';

import { useDesk } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/app-text';
import { ChitsPeekMascot } from '@/features/onboarding/welcome/chits-peek-mascot';
import { DeskScenery } from '@/features/onboarding/welcome/desk-scenery';
import { Reveal } from '@/features/onboarding/welcome/reveal';
import { SpeechBubble } from '@/features/onboarding/welcome/speech-bubble';
import { useMascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useTheme } from '@/components/theme-provider';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { COMPACT_EDGE_INSET, compactHeroLayout, heroScroll } from './compact-hero-layout';
import { SleepingZs } from './sleeping-zs';

const BOARD_LINES = ['boardsHero.say.0', 'boardsHero.say.1', 'boardsHero.say.2', 'boardsHero.say.3'];
const NOTE_LINES = ['onboarding.mascot.say.room', 'onboarding.mascot.say.listening', 'onboarding.mascot.say.both', 'onboarding.mascot.say.corner'];
const greetedThisLaunch = new Set<'boards' | 'notes'>();
const release = () => {};
/** The lip of paper showing at rest: once it has scrolled past, the moving paper takes over. */
const PAPER_LIP = 6;
/** How long the list has to stay still before Chits nods off. */
const DOZE_MS = 600_000;
/** Scrolled distance between stirs, which keeps the hop to JS rare. */
const STIR_STEP = 40;

/** Animation and speech state stay here, isolated from the virtualized board list. */
export const BoardsMascotHero = memo(function BoardsMascotHero({ width, paper, scrollY, activity, action, title, body, variant = 'boards' }: { width: number; paper: string; scrollY: SharedValue<number>; /** What keeps Chits awake when nothing scrolls, as a distance moved. */ activity?: SharedValue<number>; action?: ReactNode; title?: string; body?: string; variant?: 'boards' | 'notes' }) {
  useLocale();
  const desk = useDesk();
  const { scheme } = useTheme();
  const fonts = useWelcomeFonts();
  const [entrance] = useState(() => !greetedThisLaunch.has(variant));
  useEffect(() => { greetedThisLaunch.add(variant); }, [variant]);
  const lines = variant === 'notes' ? NOTE_LINES : BOARD_LINES;
  const rig = useMascotRig(lines.length, {
    // Greet on each listing mount; copy still reveals only once per launch.
    entrance: true, compact: true, personality: variant,
    restGaze: variant === 'notes' ? -24 : -5,
    restTilt: variant === 'notes' ? -6 : 1,
    dozeAfter: DOZE_MS,
  });
  const { stir } = rig;
  useAnimatedReaction(() => Math.round((activity ?? scrollY).get() / STIR_STEP), (step, previous) => {
    if (previous !== null && step !== previous) runOnJS(stir)();
  });
  const [copyHeight, setCopyHeight] = useState(0);
  const hero = compactHeroLayout(width, copyHeight);
  const heroHeight = hero.height;
  const reduced = useReducedMotion();
  // The hero stays in the list so its controls keep working, and cancels the
  // scroll to hold still. The list's rows draw after it, so they slide over it.
  const held = useDerivedValue(() => reduced ? 0 : heroScroll(scrollY.get(), heroHeight));
  const sheetTop = useDerivedValue(() => heroHeight - 12);
  const zoom = useDerivedValue(() => 1);
  const pinned = useAnimatedStyle(() => ({ transform: [{ translateY: held.get() }] }));
  const paperFront = useAnimatedStyle(() => ({ opacity: Math.min(1, held.get() / PAPER_LIP) }));
  const tap = () => { rig.tap(); };

  return <View testID={`${variant}-mascot-hero`} style={{ height: hero.height }}>
   <Animated.View style={[styles.hero, { height: hero.height, backgroundColor: desk.desk }, pinned]}>
    <DeskScenery width={width} height={hero.height} dark={scheme === 'dark'} objects={false} />
    <ChitsPeekMascot
      values={rig.values} unit={hero.unit} screenWidth={width} edgeInset={COMPACT_EDGE_INSET} compact
      sheetTop={sheetTop} zoom={zoom} shadowColor={desk.shadow}
      label={tr('onboarding.mascot.label')} hint={tr('boardsHero.hint')}
      onPress={tap} onLongPress={tap} onPressOut={release}
    >
      <View pointerEvents="none" style={[styles.paperEdge, { backgroundColor: paper, boxShadow: `0px -2px 6px ${desk.shadow}` }]} />
    </ChitsPeekMascot>
    <Reveal visible animate={entrance} delay={100} style={[styles.copy, { left: hero.copyLeft, width: hero.copyWidth }]}>
      <View onLayout={({ nativeEvent }) => setCopyHeight(nativeEvent.layout.height)} style={styles.words}>
        <AppText accessibilityRole="header" family={fonts.display} style={[styles.title, { color: desk.ink }]}>{title ?? tr(variant === 'notes' ? 'chat.whatSOnYourMind' : 'boardsHero.title')}</AppText>
        <AppText family={fonts.text} style={[styles.description, { color: desk.inkMuted }]}>{body ?? tr(variant === 'notes' ? 'chat.sendYourselfAnythingYouCanOrganizeItLater' : 'boardsHero.body')}</AppText>
        {action ? <View style={styles.action}>{action}</View> : null}
      </View>
    </Reveal>
    {rig.state === 'reacting' && rig.speech >= 0 ? <SpeechBubble compact side="right" text={tr(lines[rig.speech])} top={8} maxWidth={Math.min(180, width - hero.copyLeft - hero.copyWidth - 20)} /> : null}
    {rig.state === 'sleeping' ? <SleepingZs left={hero.copyLeft + hero.copyWidth + 6} top={58} color={desk.inkMuted} family={fonts.display} /> : null}
   </Animated.View>
   {/* The paper that moves with the list. It only has to reach as far as the held hero does. */}
   <View pointerEvents="none" style={[styles.cover, { top: hero.height, height: hero.height, backgroundColor: paper }]} />
   {/* Chits' arm rests over the paper edge, so the moving edge fades in above it. */}
   <Animated.View pointerEvents="none" style={[styles.paperEdge, { backgroundColor: paper, boxShadow: `0px -2px 6px ${desk.shadow}` }, paperFront]} />
  </View>;
});

const styles = StyleSheet.create({
  hero: { overflow: 'hidden' },
  cover: { position: 'absolute', left: 0, right: 0 },
  copy: { position: 'absolute', top: 12 },
  words: { gap: 5 },
  title: { fontSize: 23, lineHeight: 26 },
  description: { fontSize: 14, lineHeight: 19 },
  action: { paddingTop: 7, alignSelf: 'flex-start', maxWidth: '100%' },
  paperEdge: { position: 'absolute', bottom: -12, left: -24, right: -24, height: 18, transform: [{ rotate: '-0.7deg' }] },
});
