import { useDirection, useLocale } from '@/localization/provider';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { BackHeader, Screen } from '@/components/ui/primitives';
import { layout, spacing } from '@/constants/theme';
import { createBoardRepository } from '@/db/repositories';
import { createSelectedBoards } from '../board-setup';
import { useDerivedValue } from 'react-native-reanimated';
import { ChitsPeekMascot } from '../welcome/chits-peek-mascot';
import { useMascotRig } from '../welcome/use-mascot-rig';
import { ot, type OnboardingStringKey } from '../strings';
import { endTour } from '../tour';
import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { PaperButton, PaperCard, PaperDesk, PAPER_INK, PAPER_WHITE, PAPER_YELLOW, useDesk } from '@/components/desk/paper-desk';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import { welcomeSurfaces } from '../welcome/welcome-surfaces';

const CHOICES: { key: OnboardingStringKey; icon: IconName }[] = [
  { key: 'setup.board.personal', icon: 'person-outline' },
  { key: 'setup.board.work', icon: 'briefcase-outline' },
  { key: 'setup.board.study', icon: 'school-outline' },
  { key: 'setup.board.home', icon: 'home-outline' },
  { key: 'setup.board.projects', icon: 'layers-outline' },
];

export default function OnboardingSetupScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const router = useRouter();
  const { styleTokens, scheme } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const { rowStyle, isRTL } = useDirection();
  const { width } = useWindowDimensions();
  const heroWidth = Math.min(width, 560);
  const heroHeight = 148;
  const mascot = useMascotRig(0, { entrance: false, compact: true, cheerful: true, context: 'welcome' });
  const sheetTop = useDerivedValue(() => heroHeight);
  const zoom = useDerivedValue(() => 1);
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  const align = { textAlign: isRTL ? 'right' as const : 'left' as const };
  const [selected, setSelected] = useState<string[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState(false);
  useFocusEffect(useCallback(() => { void createBoardRepository(database).listActive().then((boards) => setExisting(boards.map((board) => board.name.toLowerCase()))); }, [database]));
  const finish = async () => { await endTour(database); router.dismissTo('/chat'); };
  const create = async () => {
    if (working) return;
    setWorking(true); setError(false);
    try { await createSelectedBoards(database, selected); await finish(); }
    catch { setError(true); setWorking(false); }
  };
  return <Screen edges={['top', 'bottom', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <PaperDesk faint>
      <BackHeader title="" onBack={() => { if (!working) { if (router.canGoBack()) router.back(); else void finish(); } }} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.intro, { height: heroHeight }]}>
          <ChitsPeekMascot compact values={mascot.values} unit={0.175} screenWidth={heroWidth} sheetTop={sheetTop} zoom={zoom} shadowColor={desk.shadow} label={ot('mascot.label')} hint={ot('mascot.hint')} onPress={mascot.tap} onLongPress={mascot.hold} onPressOut={mascot.release}>
            <View style={styles.heroCopy}><AppText accessibilityRole="header" family={fonts.display} style={[styles.title, align, { color: surfaces.ink }]}>{ot('setup.title')}</AppText></View>
          </ChitsPeekMascot>
        </View>
        <AppText family={fonts.text} style={[styles.body, align, { color: surfaces.inkMuted }]}>{ot('setup.body')}</AppText>
        <View style={styles.choices}>{CHOICES.map(({ key, icon }) => {
          const name = ot(key);
          const chosen = selected.includes(name);
          const already = existing.includes(name.toLowerCase());
          return <PaperCard key={key} paper={chosen ? surfaces.control : surfaces.card} accessibilityRole="checkbox" accessibilityLabel={name + (already ? '. ' + ot('setup.have') : '')} accessibilityState={{ checked: chosen, disabled: working }} disabled={working} onPress={() => setSelected((current) => chosen ? current.filter((item) => item !== name) : [...current, name])} style={[styles.choice, rowStyle, { borderRadius: styleTokens.button.radius, borderColor: chosen ? surfaces.action : surfaces.track }]}>
            <View style={[styles.tile, { backgroundColor: chosen ? surfaces.action : surfaces.control }]}><Icon name={icon} size={21} color={chosen ? surfaces.onAction : surfaces.ink} /></View>
            <View style={styles.copy}>
              <AppText family={fonts.textBold} style={[styles.choiceText, align, { color: surfaces.ink }]}>{name}</AppText>
              {already ? <AppText family={fonts.text} style={[styles.hint, align, { color: surfaces.inkMuted }]}>{ot('setup.have')}</AppText> : null}
            </View>
            <Icon name={chosen ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={chosen ? surfaces.action : surfaces.inkMuted} />
          </PaperCard>;
        })}</View>
      </ScrollView>
      <View style={styles.footer}>
        <View style={styles.actions}>
          {error ? <AppText accessibilityRole="alert" family={fonts.text} style={[styles.body, align, { color: desk.danger }]}>{ot('setup.error')}</AppText> : null}
          <PaperButton paper={surfaces.action} accessibilityRole="button" accessibilityState={{ disabled: working }} disabled={working} onPress={() => void create()} style={[styles.create, { borderRadius: styleTokens.button.radius }, working && styles.disabled]}>
            <AppText family={fonts.display} style={[styles.createText, { color: surfaces.onAction }]}>{working ? ot('setup.creating') : selected.length ? selected.length === 1 ? ot('setup.createOne') : ot('setup.create', { count: selected.length }) : ot('setup.none')}</AppText>
          </PaperButton>
          <Pressable accessibilityRole="button" accessibilityLabel={ot('setup.skipLabel')} disabled={working} onPress={() => void finish()} style={({ pressed }) => [styles.skip, (pressed || working) && styles.disabled]}><AppText family={fonts.textBold} style={[styles.skipText, { color: surfaces.inkMuted }]}>{ot('setup.skip')}</AppText></Pressable>
        </View>
      </View>
    </PaperDesk>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 560, alignSelf: 'center', flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg, gap: spacing.sm },
  intro: { overflow: 'hidden', marginHorizontal: -spacing.lg },
  heroCopy: { width: '64%', height: '100%', paddingLeft: spacing.lg, paddingRight: spacing.sm, justifyContent: 'center' },
  title: { fontSize: 28, lineHeight: 34 },
  body: { fontSize: 15, lineHeight: 22 },
  choices: { gap: 10, marginTop: spacing.xs },
  choice: { minHeight: 64, paddingHorizontal: spacing.sm, paddingVertical: 10, alignItems: 'center', gap: 12, borderWidth: 1.5 },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  choiceText: { fontSize: 16, lineHeight: 22 },
  hint: { fontSize: 12, lineHeight: 17 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  actions: { width: '100%', maxWidth: 512, alignSelf: 'center', gap: spacing.xxs },
  create: { minHeight: 54, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  createText: { fontSize: 17, lineHeight: 22, textAlign: 'center' },
  skip: { minHeight: layout.minimumTouchTarget, justifyContent: 'center', alignItems: 'center', paddingVertical: spacing.xs },
  skipText: { fontSize: 15, lineHeight: 21 },
  disabled: { opacity: 0.6 },
});
