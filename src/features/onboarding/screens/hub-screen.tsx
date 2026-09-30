import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { BackHeader, Screen } from '@/components/ui/primitives';
import { headingFontFamily, layout, radii, spacing } from '@/constants/theme';
import { GettingStartedCard } from '../components/checklist-card';
import { ot } from '../strings';
import { endTour, startTour } from '../tour';

export default function OnboardingHubScreen() {
  const database = useSQLiteContext();
  const router = useRouter();
  const { tokens: theme, look } = useTheme();
  const opening = useRef(false);
  const [error, setError] = useState(false);
  const replay = async () => {
    if (opening.current) return;
    opening.current = true;
    setError(false);
    try { await endTour(database); await startTour(database, 'replay'); router.push('/onboarding/welcome'); }
    catch { setError(true); }
    finally { opening.current = false; }
  };
  return <Screen>
    <BackHeader title={ot('hub.title')} onBack={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.sectionTitle, { color: theme.textPrimary, fontWeight: look.headingWeight, fontFamily: headingFontFamily(look.headingFont) }]}>{ot('hub.tour.title')}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={ot('hub.replay')} accessibilityHint={ot('hub.tour.description')} onPress={() => void replay()} style={({ pressed }) => [styles.tour, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, pressed && styles.pressed]}>
          <View style={[styles.tourIcon, { backgroundColor: theme.accentSoft }]}><Ionicons accessible={false} name="play-outline" size={23} color={theme.accentStrong} /></View>
          <View style={styles.copy}>
            <Text style={[styles.actionTitle, { color: theme.textPrimary }]}>{ot('hub.replay')}</Text>
            <Text style={[styles.description, { color: theme.textSecondary }]}>{ot('hub.tour.description')}</Text>
          </View>
          <Ionicons accessible={false} name="chevron-forward" size={18} color={theme.textMuted} />
        </Pressable>
        {error ? <Text accessibilityRole="alert" style={[styles.description, { color: theme.danger }]}>{ot('hub.tour.error')}</Text> : null}
      </View>
      <GettingStartedCard />
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.xl },
  section: { gap: spacing.sm }, sectionTitle: { fontSize: 18, fontWeight: '600' },
  tour: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.compactCard, minHeight: 88 },
  tourIcon: { width: 44, height: 44, borderRadius: radii.control, justifyContent: 'center', alignItems: 'center' },
  copy: { flex: 1, minWidth: 0 }, actionTitle: { fontSize: 16, fontWeight: '600' }, description: { fontSize: 13, lineHeight: 19, marginTop: spacing.xxs },
  pressed: { opacity: 0.65 },
});
