import { useLocale, useDirection } from '@/localization/provider';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { BackHeader, Screen } from '@/components/ui/primitives';
import { layout, spacing } from '@/constants/theme';
import { CHECKLIST_ITEMS } from '../checklist';
import { nextChecklistItem } from '../hub/journey';
import { ProgressJourney } from '../hub/progress-journey';
import { ReplayCard } from '../hub/replay-card';
import { TaskCard } from '../hub/task-card';
import { useChecklist } from '../hub/use-checklist';
import { JOURNEY_LINES, useJourneyMascot } from '../hub/use-journey-mascot';
import { ot } from '../strings';
import { endTour, startTour } from '../tour';
import { ChitsPeekMascot } from '../welcome/chits-peek-mascot';
import { DeskScenery } from '../welcome/desk-scenery';
import { SpeechBubble } from '../welcome/speech-bubble';
import { HERO_GUTTER, heroLayout, PAPER_TILT } from '../welcome/stage-layout';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import { welcomeSurfaces } from '../welcome/welcome-surfaces';

/** Below this much height, the page drops what it can live without to stay on one screen. */
const COMPACT_BELOW = 620;

// The Welcome composition, staying open: the room flows into Chits' desk, and a
// sheet of paper over it holds the progress, the tour and the four tasks.
export default function OnboardingHubScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const router = useRouter();
  const { rowStyle, isRTL } = useDirection();
  const { scheme } = useTheme();
  const desk = useDesk();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const fonts = useWelcomeFonts();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { done, loaded, settled, homeShown, open, showOnHome } = useChecklist();
  const { rig, tap } = useJourneyMascot(done, loaded);
  const [copyHeight, setCopyHeight] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [tourError, setTourError] = useState(false);
  const opening = useRef(false);

  // Everything fits one screen: the content takes what it needs, the hero the rest.
  const hero = heroLayout(width, copyHeight, layout.maxContentWidth, viewport && contentHeight ? viewport - contentHeight : undefined);
  const heroHeight = hero.height;
  const sheetTop = useDerivedValue(() => heroHeight);
  const zoom = useDerivedValue(() => 1);
  const complete = done.length === CHECKLIST_ITEMS.length;
  const overflows = viewport > 0 && heroHeight + contentHeight > viewport + 1;
  // Decided by the screen alone: judging by what overflows would undo itself.
  const compact = viewport > 0 && viewport < COMPACT_BELOW;
  const next = nextChecklistItem(done);

  const replay = async () => {
    if (opening.current) return;
    opening.current = true;
    setTourError(false);
    rig.leave(true);
    // Replay only starts a tour. Notes, cards and progress aren't touched.
    try { await endTour(database); await startTour(database, 'replay'); router.push('/onboarding/welcome'); }
    catch { setTourError(true); }
    finally { opening.current = false; }
  };
  const showChecklistOnNotes = async () => {
    setSaving(true); setSaveError(false);
    try { await showOnHome(); }
    catch { setSaveError(true); }
    finally { setSaving(false); }
  };
  const tapMascot = () => { if (tap()) void Haptics.selectionAsync().catch(() => undefined); };
  const holdMascot = () => { rig.hold(); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined); };
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };

  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <BackHeader title="" onBack={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <ScrollView
      style={{ backgroundColor: desk.desk }}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
      scrollEnabled={overflows}
      onLayout={({ nativeEvent }) => setViewport(nativeEvent.layout.height)}
    >
      <View pointerEvents="box-none" style={styles.stage}>
        <DeskScenery width={width} height={heroHeight + 24} dark={scheme === 'dark'} objects={false} />
        <ChitsPeekMascot
          values={rig.values}
          unit={hero.unit}
          screenWidth={width}
          sheetTop={sheetTop}
          zoom={zoom}
          shadowColor={desk.shadow}
          label={ot('mascot.label')}
          hint={ot('mascot.hint')}
          onPress={tapMascot}
          onLongPress={holdMascot}
          onPressOut={rig.release}
        >
          <View pointerEvents="box-none" style={[styles.sheet, { paddingTop: heroHeight }]}>
            <View pointerEvents="none" style={[styles.paper, { top: heroHeight, backgroundColor: surfaces.paper, boxShadow: `0px -2px 10px ${desk.shadow}` }]} />
            <View onLayout={({ nativeEvent }) => setContentHeight(nativeEvent.layout.height)} style={[styles.content, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
              <ProgressJourney done={done} animate={settled} surfaces={surfaces} />
              <ReplayCard compact={compact} onPress={() => void replay()} />
              {tourError ? <AppText accessibilityRole="alert" family={fonts.text} style={[styles.small, { color: desk.danger }]}>{ot('hub.tour.error')}</AppText> : null}
              <View style={styles.tasks}>
                {CHECKLIST_ITEMS.map((item) => <TaskCard key={item} item={item} completed={done.includes(item)} isNext={item === next} animate={settled} compact={compact} surfaces={surfaces} onPress={() => void open(item)} />)}
              </View>
              <View style={styles.footer}>
                {!compact ? <View style={[styles.reassurance, rowStyle]}>
                  <Icon name="checkmark" size={16} color={surfaces.inkMuted} />
                  <AppText family={fonts.text} style={[styles.small, styles.flex, align, { color: surfaces.inkMuted }]}>{ot('hub.saved')}</AppText>
                </View> : null}
                {homeShown === false ? <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void showChecklistOnNotes()} style={({ pressed }) => [styles.notesAction, rowStyle, pressed && styles.pressed]}>
                  <Icon name="add-circle-outline" size={19} color={surfaces.ink} />
                  <AppText weight="700" family={fonts.textBold} style={[styles.notesLabel, { color: surfaces.ink }]}>{ot('hub.checklist.showOnNotes')}</AppText>
                </Pressable> : null}
                {saveError ? <AppText accessibilityRole="alert" family={fonts.text} style={[styles.small, { color: desk.danger }]}>{ot('hub.checklist.saveError')}</AppText> : null}
              </View>
            </View>
          </View>
        </ChitsPeekMascot>
        <View pointerEvents="none" onLayout={({ nativeEvent }) => setCopyHeight(nativeEvent.layout.height)} style={[styles.heroCopy, isRTL ? { right: hero.copyLeft } : { left: hero.copyLeft }, { width: hero.copyWidth }]}>
          <AppText accessibilityRole="header" variant="title" family={fonts.display} style={[styles.heroTitle, align, { color: desk.ink }]}>{ot(complete ? 'hub.hero.complete' : 'hub.hero.title')}</AppText>
          <AppText variant="paragraph" family={fonts.text} style={[styles.heroBody, align, { color: desk.inkMuted }]}>{ot(complete ? 'checklist.allDone' : 'hub.hero.body')}</AppText>
        </View>
        {rig.state === 'reacting' && rig.speech >= 0 ? <SpeechBubble side="right" text={ot(JOURNEY_LINES[rig.speech])} top={spacing.xxs} maxWidth={hero.speechWidth} /> : null}
      </View>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1 },
  stage: { flexGrow: 1 },
  sheet: { flexGrow: 1 },
  // Far taller than the page, so scrolling past the end never shows its edge.
  paper: { position: 'absolute', left: -48, right: -48, bottom: -600, borderRadius: 3, transformOrigin: ['50%', 0, 0], transform: [{ rotate: `${PAPER_TILT}deg` }] },
  // The top padding clears the hand resting over the paper's edge.
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingTop: spacing.lg, paddingHorizontal: HERO_GUTTER, gap: spacing.sm },
  tasks: { gap: 6 },
  footer: { gap: spacing.xxs },
  heroCopy: { position: 'absolute', top: spacing.sm, gap: spacing.xxs },
  heroTitle: { fontSize: 24, lineHeight: 29 },
  heroBody: { fontSize: 15, lineHeight: 21 },
  reassurance: { alignItems: 'center', gap: spacing.xs },
  flex: { flex: 1 },
  small: { fontSize: 13, lineHeight: 18 },
  notesAction: { minHeight: layout.minimumTouchTarget, alignItems: 'center', gap: spacing.xs },
  notesLabel: { fontSize: 14, flexShrink: 1 },
  pressed: { opacity: 0.6 },
});
