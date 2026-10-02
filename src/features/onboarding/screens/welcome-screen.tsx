import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { PrimaryButton, Screen, SegmentedControl } from '@/components/ui/primitives';
import { APP_STYLES, APP_STYLE_NAMES, type AppStyle } from '@/constants/style-tokens';
import { headingFontFamily, layout, spacing } from '@/constants/theme';
import { ChatToCardIllustration } from '../components/chat-to-card-illustration';
import { OnboardingMascot } from '../components/onboarding-mascot';
import { ot, type OnboardingStringKey } from '../strings';
import { endTour, readTour, startTour, updateTour, type TourMode } from '../tour';

// Only what is true of Chits today: no accounts, no network code, a local database.
const TRUST_LINES: { icon: ComponentProps<typeof Ionicons>['name']; key: OnboardingStringKey }[] = [
  { icon: 'person-circle-outline', key: 'welcome.trust.account' },
  { icon: 'cloud-offline-outline', key: 'welcome.trust.offline' },
  { icon: 'phone-portrait-outline', key: 'welcome.trust.device' },
];
const STYLE_OPTIONS = APP_STYLES.map((key: AppStyle) => ({
  key,
  label: APP_STYLE_NAMES[key],
  accessibilityLabel: `${APP_STYLE_NAMES[key]} style`,
}));

// Step 1 — one screen, not a carousel.
export default function OnboardingWelcomeScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const { tokens: theme, look, style, setStyle } = useTheme();
  const [mode, setMode] = useState<TourMode | null>(null);
  const [styleError, setStyleError] = useState(false);
  // Set once the person picks an action. Leaving any other way (back gesture,
  // hardware back) counts as Skip, so an unanswered tour never lingers.
  const chose = useRef(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { void readTour(database).then((tour) => setMode(tour?.mode ?? null)).catch(() => undefined); }, [database]);
  useFocusEffect(useCallback(() => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    chose.current = false;
    return () => { if (!chose.current) leaveTimer.current = setTimeout(() => { void endTour(database).catch(() => undefined); }, 0); };
  }, [database]));

  const start = async () => {
    if (chose.current) return;
    chose.current = true;
    try {
      // Opened with no tour running (e.g. from a link): it can only be a replay.
      if (!(await readTour(database))) await startTour(database, 'replay');
      await updateTour(database, { stage: 'first-note' });
    } catch { /* The chat still opens; the tour just doesn't follow. */ }
    // Remove Welcome (and the replay hub above the tabs) from Back history.
    router.dismissTo('/chat');
  };
  const skip = async () => {
    if (chose.current) return;
    chose.current = true;
    await endTour(database).catch(() => undefined);
    router.dismissTo('/chat');
  };
  // The existing Backup & Restore screen, unchanged. Coming back without
  // restoring returns here; a restore remounts the app with the restored data.
  const restore = () => { if (chose.current) return; chose.current = true; router.push('/backup'); };
  const chooseStyle = async (next: AppStyle) => {
    if (next === style) return;
    setStyleError(false);
    try { await setStyle(next); } catch { setStyleError(true); }
  };

  return (
    <Screen style={{ backgroundColor: theme.background }}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel={ot('welcome.skipLabel')} hitSlop={8} onPress={() => void skip()} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}>
          <Text style={[styles.skipText, { color: theme.textSecondary }]}>{ot('welcome.skip')}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.inner}>
          <OnboardingMascot size={160} />
          <ChatToCardIllustration />
          <View style={styles.copy}>
            <Text accessibilityRole="header" style={[styles.headline, { color: theme.textPrimary, fontWeight: look.headingWeight, fontFamily: headingFontFamily(look.headingFont) }]}>{ot('welcome.headline')}</Text>
            <Text style={[styles.body, { color: theme.textSecondary }]}>{ot('welcome.body')}</Text>
          </View>
          <View style={styles.styleChoice}>
            <Text style={[styles.styleTitle, { color: theme.textPrimary }]}>{ot('welcome.style.title')}</Text>
            <Text style={[styles.styleDescription, { color: theme.textSecondary }]}>{ot('welcome.style.description')}</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel={ot('welcome.style.title')}>
              <SegmentedControl options={STYLE_OPTIONS} value={style} onChange={(next) => { void chooseStyle(next); }} />
            </View>
            {styleError ? <Text accessibilityRole="alert" style={[styles.styleError, { color: theme.danger }]}>{ot('welcome.style.error')}</Text> : null}
          </View>
          <View style={styles.trust}>
            {TRUST_LINES.map((line) => (
              <View key={line.key} style={styles.trustLine}>
                <Ionicons accessible={false} name={line.icon} size={20} color={theme.accentStrong} />
                <Text style={[styles.trustText, { color: theme.textPrimary }]}>{ot(line.key)}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={styles.actions}>
        <PrimaryButton label={ot('welcome.start')} onPress={() => void start()} />
        {mode !== 'replay' ? (
          <Pressable accessibilityRole="button" onPress={restore} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
            <Text style={[styles.linkText, { color: theme.accentStrong }]}>{ot('welcome.restore')}</Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { minHeight: 52, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: spacing.md },
  skip: { minWidth: layout.minimumTouchTarget, minHeight: layout.minimumTouchTarget, alignItems: 'flex-end', justifyContent: 'center' },
  skipText: { fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.6 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center', alignItems: 'center', gap: spacing.lg },
  copy: { gap: spacing.xs },
  headline: { fontSize: 26, lineHeight: 32, textAlign: 'center' },
  body: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  styleChoice: { alignSelf: 'stretch', gap: spacing.xs },
  styleTitle: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  styleDescription: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: spacing.xs },
  styleError: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  trust: { alignSelf: 'stretch', gap: spacing.sm },
  trustLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  trustText: { flex: 1, fontSize: 15, lineHeight: 20 },
  actions: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.xxs },
  link: { minHeight: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 15, fontWeight: '600' },
});
