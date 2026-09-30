import { memo, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/components/theme-provider';
import { AppHeader, IconButton, Screen, Toast, HeaderIcon } from '@/components/ui/primitives';
import { CHITS_THEME_COLLECTIONS, TOP_BAR_IMAGE_SCRIM, topBarForIdentity, type ChitsTheme } from '@/constants/chits-themes';
import { THEME_IMAGES } from '@/constants/theme-images';
import { getThemeTokens, headingFontFamily, radii, spacing } from '@/constants/theme';

const COLUMNS = 2;

/**
 * A thumbnail of Chits in this theme: its header band and title face, a card,
 * your thought, an accent chip and a button — same layout for every theme.
 */
const ThemePreviewCard = memo(function ThemePreviewCard({ theme, selected, width, onPress }: { theme: ChitsTheme; selected: boolean; width: number; onPress: () => void }) {
  const { tokens: current, themeKey, scheme } = useTheme();
  const t = getThemeTokens(theme.id, themeKey, scheme);
  const bar = topBarForIdentity(theme.id);
  const markColor = bar ? bar.share.colors.accent : t.accent;
  return <Pressable
    accessibilityRole="radio"
    accessibilityLabel={`${theme.name} theme. ${theme.description}`}
    accessibilityState={{ selected }}
    onPress={onPress}
    style={({ pressed }) => [styles.card, { width, borderColor: selected ? current.accent : current.borderSubtle, borderWidth: selected ? 2 : StyleSheet.hairlineWidth, backgroundColor: current.surface }, pressed && styles.pressed]}
  >
    <View style={[styles.mock, { backgroundColor: t.chatBackground }]}>
      <View style={[styles.mockHeader, bar ? { backgroundColor: bar.colors[0] } : { borderBottomColor: t.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        {bar?.image ? <>
          <Image source={THEME_IMAGES[bar.image]} contentFit="cover" contentPosition="top" style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: bar.colors[0], opacity: TOP_BAR_IMAGE_SCRIM }]} />
        </> : bar?.share.backgroundType === 'gradient' ? <LinearGradient colors={bar.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} /> : null}
        <Text numberOfLines={1} style={[styles.mockTitle, { color: bar ? bar.ink : t.textPrimary, fontWeight: theme.look.headingWeight, fontFamily: headingFontFamily(theme.look.headingFont) }]}>Chits</Text>
        {theme.shareNote.mark === 'cross'
          ? <View style={styles.mockCross}><View style={[styles.mockCrossBeam, { backgroundColor: markColor }]} /><View style={[styles.mockCrossArm, { backgroundColor: markColor }]} /></View>
          : <View style={[styles.mockDot, { backgroundColor: markColor }]} />}
      </View>
      <View style={styles.mockBody}>
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
      {CHITS_THEME_COLLECTIONS.filter((collection) => collection.shown).map((collection) => <View key={collection.id} style={styles.collection}>
        <Text accessibilityRole="header" style={[styles.collectionTitle, { color: tokens.textPrimary }]}>{collection.name}</Text>
        {collection.id === 'generations' ? <Text style={[styles.collectionDetail, { color: tokens.textMuted }]}>Five design eras, told through type, color and texture.</Text> : null}
        {collection.id === 'limited-edition' ? <Text style={[styles.collectionDetail, { color: tokens.textMuted }]}>Special themes with their own artwork across the top of every screen.</Text> : null}
        <View accessibilityRole="radiogroup" accessibilityLabel={`${collection.name} themes`} style={styles.grid}>
          {collection.themes.map((theme) => <ThemePreviewCard key={theme.id} theme={theme} selected={theme.id === identity} width={cardWidth} onPress={() => choose(theme)} />)}
        </View>
      </View>)}
      <Text style={[styles.footnote, { color: tokens.textMuted }]}>Light and dark follow App appearance. A Chat background photo stays in place whichever theme you choose.</Text>
    </ScrollView>
    <Toast message={toast} />
  </Screen>;
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.xl, alignSelf: 'center', width: '100%', maxWidth: 720 },
  intro: { fontSize: 14, lineHeight: 20 },
  collection: { marginTop: spacing.lg },
  collectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: spacing.xs },
  collectionDetail: { fontSize: 12, lineHeight: 17, marginTop: -2, marginBottom: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  card: { overflow: 'hidden', borderRadius: radii.compactCard },
  pressed: { opacity: 0.75 },
  mock: { height: 150 },
  mockHeader: { height: 26, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  mockTitle: { fontSize: 11, lineHeight: 14, includeFontPadding: false },
  mockBody: { flex: 1, padding: 10, paddingTop: 9, gap: 7 },
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
