import { memo, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/components/theme-provider';
import { AppHeader, IconButton, Screen, Toast, HeaderIcon } from '@/components/ui/primitives';
import { CHITS_THEME_LIST, type ChitsTheme } from '@/constants/chits-themes';
import { getThemeTokens, radii, spacing } from '@/constants/theme';

const COLUMNS = 2;

/** A thumbnail of Chits in this theme: a header, a card, your thought and a button — same layout for every theme. */
const ThemePreviewCard = memo(function ThemePreviewCard({ theme, selected, width, onPress }: { theme: ChitsTheme; selected: boolean; width: number; onPress: () => void }) {
  const { tokens: current, themeKey, scheme } = useTheme();
  const t = getThemeTokens(theme.id, themeKey, scheme);
  return <Pressable
    accessibilityRole="radio"
    accessibilityLabel={`${theme.name} theme. ${theme.description}`}
    accessibilityState={{ selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.card, { width, borderColor: selected ? current.accent : current.borderSubtle, borderWidth: selected ? 2 : StyleSheet.hairlineWidth, backgroundColor: current.surface }, pressed && styles.pressed]}
  >
    <View style={[styles.mock, { backgroundColor: t.chatBackground }]}>
      <View style={styles.mockHeader}>
        <View style={[styles.mockLine, { width: '38%', backgroundColor: t.textPrimary, opacity: 0.85, height: 5 }]} />
        {theme.shareNote.mark === 'cross'
          ? <View style={styles.mockCross}><View style={[styles.mockCrossBeam, { backgroundColor: t.accent }]} /><View style={[styles.mockCrossArm, { backgroundColor: t.accent }]} /></View>
          : <View style={[styles.mockDot, { backgroundColor: t.accent }]} />}
      </View>
      <View style={[styles.mockCard, { backgroundColor: t.cardPaper, borderColor: t.borderSubtle }]}>
        <View style={[styles.mockLine, { width: '72%', backgroundColor: t.textPrimary }]} />
        <View style={[styles.mockLine, { width: '48%', backgroundColor: t.textMuted, marginTop: 4 }]} />
      </View>
      <View style={[styles.mockBubble, { backgroundColor: t.bubble }]}>
        <View style={[styles.mockLine, { width: 44, backgroundColor: t.bubbleText, opacity: 0.8 }]} />
      </View>
      <View style={styles.mockFooter}>
        <View style={[styles.mockChip, { backgroundColor: t.accentSoft }]}><View style={[styles.mockLine, { width: 18, backgroundColor: t.accentStrong }]} /></View>
        <View style={[styles.mockButton, { backgroundColor: t.accent }]}><View style={[styles.mockLine, { width: 20, backgroundColor: t.accentText }]} /></View>
      </View>
    </View>
    <View style={styles.cardCopy}>
      <View style={styles.cardTitleRow}>
        <Text numberOfLines={1} style={[styles.cardTitle, { color: current.textPrimary }]}>{theme.name}</Text>
        {selected ? <View style={[styles.check, { backgroundColor: current.accent }]}><Ionicons accessible={false} name="checkmark" size={13} color={current.accentText} /></View> : null}
      </View>
      <Text numberOfLines={2} style={[styles.cardDescription, { color: current.textMuted }]}>{theme.description}</Text>
    </View>
  </Pressable>;
});

/**
 * Settings → Appearance → Theme. Tapping a theme applies it immediately (like
 * every other Chits setting — no Save button), so this screen itself becomes
 * the live preview.
 */
export default function AppearanceThemeScreen() {
  const { tokens, identity, setIdentity } = useTheme();
  const { width } = useWindowDimensions();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), 2200); return () => clearTimeout(timer); }, [toast]);
  const cardWidth = Math.floor((Math.min(width, 720) - spacing.lg * 2 - spacing.sm * (COLUMNS - 1)) / COLUMNS);
  const choose = (theme: ChitsTheme) => {
    if (theme.id === identity) return;
    void Haptics.selectionAsync();
    void setIdentity(theme.id).catch(() => setToast('That theme couldn’t be saved. Please try again.'));
  };
  return <Screen edges={['top', 'left', 'right']}>
    <AppHeader title="Theme" leading={<IconButton label="Go back" onPress={() => router.back()}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: tokens.textSecondary }]}>Choose the personality Chits wears. Your notes, boards and layout stay exactly the same.</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Theme" style={styles.grid}>
        {CHITS_THEME_LIST.map((theme) => <ThemePreviewCard key={theme.id} theme={theme} selected={theme.id === identity} width={cardWidth} onPress={() => choose(theme)} />)}
      </View>
      <Text style={[styles.footnote, { color: tokens.textMuted }]}>Light and dark follow App appearance. A Chat background photo stays in place whichever theme you choose.</Text>
    </ScrollView>
    <Toast message={toast} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, alignSelf: 'center', width: '100%', maxWidth: 720 },
  intro: { fontSize: 14, lineHeight: 20, marginBottom: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { overflow: 'hidden', borderRadius: radii.compactCard },
  pressed: { opacity: 0.75 },
  mock: { height: 132, padding: 10, gap: 7 },
  mockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 1 },
  mockLine: { height: 4, borderRadius: 2 },
  mockDot: { width: 9, height: 9, borderRadius: 4.5 },
  mockCross: { width: 9, height: 13 },
  mockCrossBeam: { position: 'absolute', left: 3.5, top: 0, width: 2, height: 13, borderRadius: 1 },
  mockCrossArm: { position: 'absolute', left: 0, top: 3.5, width: 9, height: 2, borderRadius: 1 },
  mockCard: { padding: 8, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth },
  mockBubble: { alignSelf: 'flex-end', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 11, borderBottomRightRadius: 3 },
  mockFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' },
  mockChip: { paddingHorizontal: 7, paddingVertical: 5, borderRadius: radii.pill },
  mockButton: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 7 },
  cardCopy: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  check: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardDescription: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  footnote: { fontSize: 12, lineHeight: 17, marginTop: spacing.lg, textAlign: 'center' },
});
