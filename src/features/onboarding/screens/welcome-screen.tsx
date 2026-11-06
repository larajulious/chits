import { useDirection, useLocale } from '@/localization/provider';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View, type ScrollView } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useDerivedValue, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW, PaperButton, PaperRound, preloadHandwriting, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { layout, spacing } from '@/constants/theme';
import { PLAN_DUSK } from '@/features/plan/plan-hero';
import { tr } from '@/localization/runtime';
import { BoardsDemo } from '../demos/boards-demo';
import type { TourMascot } from '../demos/demo-kit';
import { FocusDemo } from '../demos/focus-demo';
import { PlanDemo } from '../demos/plan-demo';
import { SpinDemo } from '../demos/spin-demo';
import { ot, type OnboardingStringKey } from '../strings';
import { ONBOARDING_KEYS } from '../storage';
import { endTour, parseTour, readTour, saveTourStep, startTour, updateTour, type TourMode } from '../tour';
import { ChitsPeekMascot } from '../welcome/chits-peek-mascot';
import { DeskScenery } from '../welcome/desk-scenery';
import { SPEECH_MS } from '../welcome/mascot-machine';
import { Reveal } from '../welcome/reveal';
import { SpacePreview } from '../welcome/space-preview';
import { SpeechBubble } from '../welcome/speech-bubble';
import { PAPER_TILT, stageLayout } from '../welcome/stage-layout';
import { StepBody, StepHeading } from '../welcome/step-copy';
import { StepPanel } from '../welcome/step-panel';
import { TourProgress } from '../welcome/tour-progress';
import { clampTourStep, sheetMoves, TOUR_STEP, TOUR_STEP_COUNT, tourPose } from '../welcome/tour-steps';
import { useMascotRig } from '../welcome/use-mascot-rig';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import { welcomeSurfaces, type WelcomeSurfaces } from '../welcome/welcome-surfaces';

const SPEECH: OnboardingStringKey[] = ['mascot.say.room', 'mascot.say.listening', 'mascot.say.both', 'mascot.say.corner'];
const { meet: MEET, spaces: SPACES, boards: BOARDS, spin: SPIN, focus: FOCUS, plan: PLAN, finish: FINISH } = TOUR_STEP;
const STEPS = Array.from({ length: TOUR_STEP_COUNT }, (_, step) => step);
/** What Chits says on arriving at a step, and when tapped there. */
const STEP_LINES: Partial<Record<number, string>> = {
  [SPACES]: 'onboarding.tour.spaces.say', [BOARDS]: 'onboarding.tour.boards.say.hello', [SPIN]: 'onboarding.tour.spin.say.hello',
  [FOCUS]: 'focus.say.ready.0', [PLAN]: 'plan.say.morning', [FINISH]: 'onboarding.tour.finish.say',
};
const STEP_MS = 440;
/** After the step has slid in. Chits needs longer when they ducked out for the sheet to move. */
const ARRIVAL_MS = 420;
const RETURN_MS = 900;
/** How far the desk's dots fade on Focus, as they do during a real session. */
const QUIET_DESK = 0.7;
/** The evening light over the desk, as in the planner. */
const DUSK = { light: 0.2, dark: 0.3 };
/** The desk's texture runs on under the paper's tilted edge, so no bare strip shows. */
const SCENERY_OVERLAP = 24;

// Every step lives on one route, so one Chits stays on screen and moves with the
// sheet between them instead of being replaced by a copy on the next screen.
// The demos work like the real features but keep everything in their own state:
// the only thing this screen saves is which step someone has reached.
export default function OnboardingWelcomeScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const router = useRouter();
  const navigation = useNavigation();
  const { scheme, styleTokens } = useTheme();
  const { isRTL, rowStyle } = useDirection();
  const fonts = useWelcomeFonts();
  const desk = useDesk();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const window = useWindowDimensions();
  const [screen, setScreen] = useState({ width: window.width, height: window.height });
  const stage = stageLayout(screen.width, screen.height, insets);
  // Where an interrupted tour left off. Read synchronously, so the first frame is already right.
  const [resumeAt] = useState(() => {
    try { return clampTourStep(parseTour(database.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', ONBOARDING_KEYS.tour)?.value ?? null)?.welcomeStep ?? MEET); }
    catch { return MEET; }
  });
  const [step, setStep] = useState(resumeAt);
  const [furthest, setFurthest] = useState(resumeAt);
  const [mode, setMode] = useState<TourMode | null>(null);
  const [evening, setEvening] = useState(false);
  const rig = useMascotRig(SPEECH.length, { ...tourPose(step, evening), context: 'welcome' });
  const { watch, rest, celebrate } = rig;
  const boardsScroll = useRef<ScrollView>(null);
  // The entrance can finish only once, and the copy stays up from then on.
  const [revealed, setRevealed] = useState(false);
  if (!revealed && (rig.state === 'idle' || rig.state === 'exiting')) setRevealed(true);

  const progress = useSharedValue<number>(resumeAt);
  const { sheetTops, zooms } = stage;
  const sheetTop = useDerivedValue(() => interpolate(progress.get(), STEPS, sheetTops as number[]));
  const zoom = useDerivedValue(() => interpolate(progress.get(), STEPS, zooms as number[]));
  const sheet = useAnimatedStyle(() => ({ transform: [{ translateY: sheetTop.get() }] }));

  // The desk changes with the step: quiet for Focus, dusk for the end of the day.
  const quiet = useSharedValue(0);
  const dusk = useSharedValue(0);
  const duskOpacity = scheme === 'dark' ? DUSK.dark : DUSK.light;
  useEffect(() => {
    const [toQuiet, toDusk] = [step === FOCUS ? 1 : 0, step === PLAN && evening ? 1 : 0];
    quiet.set(reduced ? toQuiet : withTiming(toQuiet, { duration: 600, easing: Easing.inOut(Easing.sin) }));
    dusk.set(reduced ? toDusk : withTiming(toDusk, { duration: 620, easing: Easing.inOut(Easing.cubic) }));
  }, [dusk, evening, quiet, reduced, step]);
  const deskDetail = useAnimatedStyle(() => ({ opacity: 1 - QUIET_DESK * quiet.get() }));
  const duskLight = useAnimatedStyle(() => ({ opacity: dusk.get() * duskOpacity }));

  // A line on a note. It belongs to its moment, and goes when the step changes.
  const [cue, setCue] = useState<string | null>(null);
  const cueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speak = useCallback((line: string | null) => {
    if (cueTimer.current) clearTimeout(cueTimer.current);
    setCue(line);
    if (line) cueTimer.current = setTimeout(() => setCue(null), SPEECH_MS);
  }, []);
  useEffect(() => () => { if (cueTimer.current) clearTimeout(cueTimer.current); }, []);
  const mascot = useMemo<TourMascot>(() => ({ watch, rest, say: speak, cheer: (line) => { celebrate(); speak(line); } }), [celebrate, rest, speak, watch]);

  // Chits greets each step the first time it comes up, not on the way back.
  const greeted = useRef(new Set<number>([MEET]));
  useEffect(() => {
    if (greeted.current.has(step)) return;
    greeted.current.add(step);
    const line = STEP_LINES[step];
    const timer = setTimeout(() => {
      if (line) speak(tr(line));
      if (step === FINISH) celebrate();
    }, step === SPACES || step === FINISH ? RETURN_MS : ARRIVAL_MS);
    return () => clearTimeout(timer);
  }, [celebrate, speak, step]);

  // Set once the person picks an action. Leaving any other way (back gesture,
  // hardware back) counts as Skip, so an unanswered tour never lingers.
  const chose = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { void readTour(database).then((tour) => setMode(tour?.mode ?? null)).catch(() => undefined); }, [database]);
  useEffect(() => { preloadHandwriting(); }, []);
  useFocusEffect(useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    chose.current = false;
    return () => { if (!chose.current) leaveTimer.current = setTimeout(() => { void endTour(database).catch(() => undefined); }, 0); };
  }, [database]));

  const goTo = useCallback((next: number) => {
    rest();
    if (sheetMoves(step, next)) rig.leave(true);
    speak(null);
    setStep(next);
    setFurthest((current) => Math.max(current, next));
    progress.set(reduced ? next : withTiming(next, { duration: STEP_MS, easing: Easing.inOut(Easing.cubic) }));
    void saveTourStep(database, next).catch(() => undefined);
  }, [database, progress, reduced, rest, rig, speak, step]);

  // Back moves between steps. From the first step it leaves, which counts as Skip.
  useEffect(() => { navigation.setOptions({ gestureEnabled: step === MEET }); }, [navigation, step]);
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step === MEET) return false;
      goTo(step - 1);
      return true;
    });
    return () => subscription.remove();
  }, [goTo, step]));

  // The tour's last step hands over to the first note, on the real Chat.
  const startUsing = async () => {
    if (chose.current) return;
    chose.current = true;
    rig.leave(false);
    try {
      // Opened with no tour running (e.g. from a link): it can only be a replay.
      if (!(await readTour(database))) await startTour(database, 'replay');
      await updateTour(database, { stage: 'first-note' });
    } catch { /* The chat still opens; the tour just doesn't follow. */ }
    // Remove Welcome (and the replay hub above the tabs) from Back history, and
    // open Chat without focusing the composer until the user taps it.
    router.dismissTo('/chat');
  };
  const skip = async () => {
    if (chose.current) return;
    chose.current = true;
    rig.leave(false);
    await endTour(database).catch(() => undefined);
    router.dismissTo('/chat');
  };
  // The existing Backup & Restore screen, unchanged. Coming back without
  // restoring returns here; a restore remounts the app with the restored data.
  const restore = () => { if (chose.current) return; chose.current = true; router.push('/backup'); };

  const tick = () => { void Haptics.selectionAsync().catch(() => undefined); };
  const tapMascot = () => {
    const key = step === PLAN && evening ? 'plan.say.evening' : STEP_LINES[step];
    // On Focus, Chits answers without the bounce.
    if (step === FOCUS) speak(tr('focus.say.ready.1'));
    else if (!rig.tap()) return;
    else if (key) speak(tr(key));
    void Haptics.selectionAsync().catch(() => undefined);
  };
  const pickSpace = () => { if (rig.tap()) speak(ot('tour.spaces.sayPick')); };
  const holdMascot = () => { rig.hold(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); };

  const panelHeight = (index: number) => screen.height - stage.sheetTops[index];
  const speech = cue ?? (rig.state === 'reacting' && rig.speech >= 0 ? ot(SPEECH[rig.speech]) : null);
  const demoFooter = (next: number) => <View style={[styles.demoFooter, rowStyle]}>
    <TextAction label={ot('welcome.skip')} accessibilityLabel={ot('welcome.skipLabel')} color={surfaces.inkMuted} onPress={() => void skip()} />
    <View style={styles.demoNext}><MainAction label={ot('firstNote.next')} surfaces={surfaces} radius={styleTokens.button.radius} onPress={() => { tick(); goTo(next); }} /></View>
  </View>;
  return <View style={[styles.root, { backgroundColor: desk.desk }]}>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, deskDetail]}>
      <DeskScenery width={screen.width} height={stage.sheetTops[MEET] + SCENERY_OVERLAP} top={insets.top} dark={scheme === 'dark'} />
    </Animated.View>
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: PLAN_DUSK }, duskLight]} />
    <View
      style={styles.root}
      onLayout={({ nativeEvent: { layout: frame } }) => setScreen((current) => (current.width === frame.width && current.height === frame.height ? current : { width: frame.width, height: frame.height }))}
    >
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <ChitsPeekMascot
        values={rig.values}
        unit={stage.unit}
        screenWidth={screen.width}
        sheetTop={sheetTop}
        zoom={zoom}
        shadowColor={desk.shadow}
        label={ot('mascot.label')}
        hint={ot('mascot.hint')}
        onPress={tapMascot}
        onLongPress={holdMascot}
        onPressOut={rig.release}
      >
        <Animated.View style={[styles.sheet, { height: screen.height }, sheet]}>
          {/* Only the paper tilts. The words on it stay level. */}
          <View pointerEvents="none" style={[styles.paper, { backgroundColor: surfaces.paper, boxShadow: `0px -2px 10px ${desk.shadow}` }]} />
          <View pointerEvents="none" style={styles.progressBand}><View style={styles.progressFrame}><TourProgress progress={progress} step={step} surfaces={surfaces} /></View></View>
          <StepPanel
            index={MEET}
            progress={progress}
            active={step === MEET}
            height={panelHeight(MEET)}
            footer={<>
              <Reveal visible={revealed} delay={360}><MainAction label={ot('meet.start')} surfaces={surfaces} radius={styleTokens.button.radius} onPress={() => { tick(); goTo(SPACES); }} /></Reveal>
              <Reveal visible={revealed} delay={460}><AppText family={fonts.text} style={[styles.footnote, { color: surfaces.inkMuted, textAlign: isRTL ? 'right' : 'left' }]}>{ot('meet.footnote')}</AppText></Reveal>
            </>}
          >
            <Reveal visible={revealed}><StepHeading surfaces={surfaces}>{ot('meet.title')}</StepHeading></Reveal>
            <Reveal visible={revealed} delay={180}><StepBody surfaces={surfaces}>{ot('meet.body')}</StepBody></Reveal>
          </StepPanel>
          {furthest >= SPACES ? <StepPanel dense index={SPACES} progress={progress} active={step === SPACES} height={panelHeight(SPACES)} footer={demoFooter(BOARDS)}>
            <StepHeading compact surfaces={surfaces}>{ot('spaces.title')}</StepHeading>
            <StepBody compact surfaces={surfaces}>{ot('spaces.body')}</StepBody>
            <SpacePreview surfaces={surfaces} onPick={pickSpace} />
          </StepPanel> : null}
          {furthest >= BOARDS ? <StepPanel dense index={BOARDS} progress={progress} active={step === BOARDS} height={panelHeight(BOARDS)} footer={demoFooter(SPIN)} scrollRef={boardsScroll}>
            <StepHeading compact surfaces={surfaces}>{ot('tour.boards.title')}</StepHeading>
            <StepBody compact surfaces={surfaces}>{ot('tour.boards.body')}</StepBody>
            <BoardsDemo surfaces={surfaces} active={step === BOARDS} mascot={mascot} scrollRef={boardsScroll} />
          </StepPanel> : null}
          {furthest >= SPIN ? <StepPanel dense index={SPIN} progress={progress} active={step === SPIN} height={panelHeight(SPIN)} footer={demoFooter(FOCUS)}>
            <StepHeading compact surfaces={surfaces}>{ot('tour.spin.title')}</StepHeading>
            <StepBody compact surfaces={surfaces}>{ot('tour.spin.body')}</StepBody>
            <SpinDemo active={step === SPIN} mascot={mascot} />
          </StepPanel> : null}
          {furthest >= FOCUS ? <StepPanel dense index={FOCUS} progress={progress} active={step === FOCUS} height={panelHeight(FOCUS)} footer={demoFooter(PLAN)}>
            <StepHeading compact surfaces={surfaces}>{ot('tour.focus.title')}</StepHeading>
            <StepBody compact surfaces={surfaces}>{ot('tour.focus.body')}</StepBody>
            <FocusDemo surfaces={surfaces} active={step === FOCUS} mascot={mascot} />
          </StepPanel> : null}
          {furthest >= PLAN ? <StepPanel dense index={PLAN} progress={progress} active={step === PLAN} height={panelHeight(PLAN)} footer={demoFooter(FINISH)}>
            <StepHeading compact surfaces={surfaces}>{ot('tour.plan.title')}</StepHeading>
            <StepBody compact surfaces={surfaces}>{ot('tour.plan.body')}</StepBody>
            <PlanDemo surfaces={surfaces} active={step === PLAN} mascot={mascot} evening={evening} onEveningChange={setEvening} />
          </StepPanel> : null}
          {furthest >= FINISH ? <StepPanel
            index={FINISH}
            progress={progress}
            active={step === FINISH}
            height={panelHeight(FINISH)}
            footer={<>
              <MainAction label={ot('tour.finish.start')} surfaces={surfaces} radius={styleTokens.button.radius} onPress={() => { tick(); void startUsing(); }} />
              {mode !== 'replay' ? <TextAction label={ot('welcome.restore')} color={surfaces.ink} onPress={restore} /> : null}
            </>}
          >
            <StepHeading surfaces={surfaces}>{ot('tour.finish.title')}</StepHeading>
            <StepBody surfaces={surfaces}>{ot('tour.finish.body')}</StepBody>
          </StepPanel> : null}
        </Animated.View>
      </ChitsPeekMascot>
      {speech ? <SpeechBubble key={speech} text={speech} top={insets.top + (step === MEET ? spacing.sm : layout.minimumTouchTarget + spacing.md)} maxWidth={Math.min(250, screen.width * (step === MEET ? 0.62 : 0.5))} /> : null}
      {step !== MEET ? <View style={[styles.back, { top: insets.top + spacing.xxs }]}><PaperRound icon="chevron-back" size={layout.minimumTouchTarget} accessibilityLabel={ot('hub.back')} onPress={() => goTo(step - 1)} /></View> : null}
    </View>
  </View>;
}

/** The one thing to do next, on the desk kit's press spring, in the app's button shape. */
function MainAction({ label, surfaces, radius, onPress }: { label: string; surfaces: WelcomeSurfaces; radius: number; onPress: () => void }) {
  const fonts = useWelcomeFonts();
  return <PaperButton paper={surfaces.action} accessibilityRole="button" onPress={onPress} style={[styles.mainAction, { borderRadius: radius }]}>
    <AppText weight="700" family={fonts.display} style={[styles.mainActionLabel, { color: surfaces.onAction }]}>{label}</AppText>
  </PaperButton>;
}

function TextAction({ label, accessibilityLabel, color, onPress }: { label: string; accessibilityLabel?: string; color: string; onPress: () => void }) {
  const fonts = useWelcomeFonts();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} onPress={onPress} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}>
    <AppText weight="700" family={fonts.textBold} style={[styles.textActionLabel, { color }]}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  sheet: { position: 'absolute', top: 0, left: 0, right: 0 },
  // Wider and taller than the screen, so the tilt never shows a corner.
  paper: { position: 'absolute', top: 0, left: -48, right: -48, bottom: -80, borderRadius: 3, transformOrigin: ['50%', 0, 0], transform: [{ rotate: `${PAPER_TILT}deg` }] },
  mainAction: { minHeight: 54, paddingHorizontal: spacing.md },
  mainActionLabel: { fontSize: 17, lineHeight: 22 },
  footnote: { fontSize: 14, lineHeight: 20, paddingTop: spacing.xxs },
  // In the gap above the words, so the steps can slide under it.
  progressBand: { position: 'absolute', top: spacing.sm, left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  progressFrame: { width: '100%', maxWidth: 520 },
  demoFooter: { alignItems: 'center', gap: spacing.sm },
  demoNext: { flex: 1 },
  back: { position: 'absolute', left: spacing.sm },
  textAction: { minHeight: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xs },
  textActionLabel: { fontSize: 15 },
  pressed: { opacity: 0.6 },
});
