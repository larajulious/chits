import { useState, type ReactNode, type Ref } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useDerivedValue, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeskDots, PAPER_INK, PAPER_WHITE, PAPER_YELLOW, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { ChitsPeekMascot } from '@/features/onboarding/welcome/chits-peek-mascot';
import { DeskScenery } from '@/features/onboarding/welcome/desk-scenery';
import { Reveal } from '@/features/onboarding/welcome/reveal';
import { SpeechBubble } from '@/features/onboarding/welcome/speech-bubble';
import { PAPER_TILT } from '@/features/onboarding/welcome/stage-layout';
import type { MascotRig } from '@/features/onboarding/welcome/use-mascot-rig';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { welcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { HERO_CONTENT_WIDTH, HERO_EDGE_INSET, heroStageLayout } from './hero-stage-layout';

const SPEECH_TOP = 6;
/** How long the footer waits after a moment worth noticing, so it arrives last. */
const FOOTER_DELAY = 620;

/** The height a page has under its header, known before the first frame. */
export function useStageViewport() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { styleTokens } = useTheme();
  return height - insets.top - insets.bottom - styleTokens.header.minHeight;
}

type Props = {
  rig: MascotRig;
  title: string;
  body: string;
  /** False leaves a plain page: no Chits, no words. */
  mascot?: boolean;
  hint: string;
  onTap: () => void;
  line: { text: string; announce: boolean } | null;
  /** The page's actions, held at the bottom of the screen. */
  footer?: ReactNode;
  /** They arrive last, after something just happened. */
  footerFresh?: boolean;
  /** 0 to 1: quiets the page's decoration, for concentration. */
  calm?: SharedValue<number>;
  scrollRef?: Ref<ScrollView>;
  children: ReactNode;
};

/**
 * A page in Chits' world: the desk with Chits peeking in, flowing into a sheet
 * of dotted paper that holds the page. Whoever owns the rig renders this, so a
 * blink or a reaction re-renders only that owner, and `children` stay untouched.
 */
export function MascotStage({ rig, title, body, mascot = true, hint, onTap, line, footer, footerFresh = false, calm, scrollRef, children }: Props) {
  'use no memo'; // Global i18next copy must refresh when the locale subscription fires.
  useLocale();
  const desk = useDesk();
  const { scheme } = useTheme();
  const { isRTL } = useDirection();
  const fonts = useWelcomeFonts();
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  // The tallest copy seen, so a shorter line doesn't move what's under it.
  const [copy, setCopy] = useState({ width, height: 0 });
  const hero = heroStageLayout(width, height, copy.width === width ? copy.height : 0);
  const heroHeight = mascot ? hero.height : 0;
  // The footer lies over the page, which keeps its size: nothing under it jumps.
  const [footerHeight, setFooterHeight] = useState(0);
  const sheetTop = useDerivedValue(() => heroHeight);
  const zoom = useDerivedValue(() => 1);
  const dots = useAnimatedStyle(() => ({ opacity: 1 - 0.7 * (calm?.get() ?? 0) }));
  const words = useAnimatedStyle(() => ({ opacity: 1 - 0.18 * (calm?.get() ?? 0) }));
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const fade = reduced ? undefined : FadeIn.duration(240);

  const sheet = <View pointerEvents="box-none" style={[styles.sheet, { paddingTop: heroHeight }]}>
    <View pointerEvents="none" style={[styles.paper, { top: heroHeight, backgroundColor: surfaces.control, boxShadow: `0px -2px 10px ${desk.shadow}` }]}><Animated.View style={[StyleSheet.absoluteFill, dots]}><DeskDots faint /></Animated.View></View>
    <View style={[styles.content, { paddingBottom: (footer ? footerHeight : Math.max(insets.bottom, 12)) + 16 }]}>{children}</View>
  </View>;

  return <View style={[styles.flex, { backgroundColor: desk.desk }]}>
    <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View pointerEvents="box-none" style={styles.stage}>
        {mascot ? <>
          <DeskScenery width={width} height={heroHeight + 24} dark={scheme === 'dark'} objects={false} />
          <ChitsPeekMascot
            values={rig.values} unit={hero.unit} screenWidth={width} edgeInset={HERO_EDGE_INSET}
            sheetTop={sheetTop} zoom={zoom} shadowColor={desk.shadow}
            label={tr('onboarding.mascot.label')} hint={hint}
            onPress={onTap} onLongPress={onTap} onPressOut={noop}
          >{sheet}</ChitsPeekMascot>
          <Animated.View pointerEvents="none" style={[styles.copy, { left: hero.copyLeft, width: hero.copyWidth }, words]} onLayout={({ nativeEvent }) => { const next = Math.ceil(nativeEvent.layout.height); setCopy(old => old.width === width && old.height >= next ? old : { width, height: next }); }}>
            <Animated.View key={title} entering={fade}><AppText accessibilityRole="header" family={fonts.display} style={[styles.title, align, { color: desk.ink }]}>{title}</AppText></Animated.View>
            <Animated.View key={body} entering={fade}><AppText family={fonts.text} style={[styles.body, align, { color: desk.inkMuted }]}>{body}</AppText></Animated.View>
          </Animated.View>
          {line ? <SpeechBubble key={line.text} compact side="right" text={line.text} top={SPEECH_TOP} maxWidth={hero.speechWidth} announce={line.announce} /> : null}
        </> : sheet}
      </View>
    </ScrollView>
    {footer ? <Animated.View exiting={reduced ? undefined : FadeOut.duration(160)} style={styles.footerAnchor} onLayout={({ nativeEvent }) => setFooterHeight(Math.ceil(nativeEvent.layout.height))}>
      <Reveal visible animate={footerFresh && !reduced} delay={FOOTER_DELAY} style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12), backgroundColor: surfaces.control, boxShadow: `0px -3px 8px ${desk.shadow}` }]}><View style={styles.footerContent}>{footer}</View></Reveal>
    </Animated.View> : null}
  </View>;
}
const noop = () => undefined;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  stage: { flexGrow: 1 },
  sheet: { flexGrow: 1 },
  // Far taller than the page, so scrolling past the end never shows its edge.
  paper: { position: 'absolute', left: -48, right: -48, bottom: -600, borderRadius: 3, overflow: 'hidden', transformOrigin: ['50%', 0, 0], transform: [{ rotate: `${PAPER_TILT}deg` }] },
  // The top padding clears the hand resting over the paper's edge.
  content: { width: '100%', maxWidth: HERO_CONTENT_WIDTH, alignSelf: 'center', paddingTop: 14, paddingHorizontal: 16, gap: 10 },
  copy: { position: 'absolute', top: 12, gap: 5 },
  title: { fontSize: 23, lineHeight: 26 },
  body: { fontSize: 14, lineHeight: 19 },
  footerAnchor: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  footer: { paddingTop: 14, paddingHorizontal: 16 },
  footerContent: { width: '100%', maxWidth: HERO_CONTENT_WIDTH, alignSelf: 'center' },
});
