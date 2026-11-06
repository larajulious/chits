import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChitsMascot, useMascotReducedMotion, type MascotInteractionHandle } from '@/components/mascot/chits-mascot';
import { useMascotPreference } from '@/components/mascot/mascot-provider';
import { MASCOT_VARIANTS } from '@/components/mascot/mascot-variants';
import { PaperDesk, useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { useSettingsSurfaces } from '@/components/settings/settings-rows';
import { AppHeader, AppText, HeaderIcon, Icon, IconButton, Screen } from '@/components/ui/primitives';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

function MascotCard({ mascot, selected, disabled, wide, onSelect }: {
  mascot: typeof MASCOT_VARIANTS[number]; selected: boolean; disabled: boolean; wide: boolean; onSelect: () => void;
}) {
  'use no memo';
  useLocale();
  const { tokens, styleTokens } = useTheme();
  const surfaces = useSettingsSurfaces();
  const fonts = useWelcomeFonts();
  const { rowStyle } = useDirection();
  const reduced = useMascotReducedMotion();
  const mascotRef = useRef<MascotInteractionHandle>(null);
  const tap = () => {
    mascotRef.current?.tap();
    if (!reduced) void Haptics.selectionAsync().catch(() => undefined);
    onSelect();
  };
  return <Pressable accessibilityRole="radio" accessibilityLabel={`${mascot.name}. ${tr(mascot.descriptionKey)}${mascot.limited ? `. ${tr('mascot.limited')}` : ''}. ${tr('mascot.free')}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={tap}
    style={({ pressed }) => [styles.card, wide && styles.wideCard, { backgroundColor: pressed ? surfaces.pressed : surfaces.surface, borderRadius: styleTokens.button.radius, borderColor: selected ? tokens.textPrimary : surfaces.border }]}>
    <View style={[styles.cardTop, rowStyle]}>
      {mascot.limited ? <View style={[styles.badge, { backgroundColor: tokens.accentSoft }]}><AppText family={fonts.text} weight="700" style={[styles.badgeText, { color: tokens.textPrimary }]}>{tr('mascot.limited')}</AppText></View> : <AppText family={fonts.text} style={[styles.free, { color: tokens.textSecondary }]}>{tr('mascot.free')}</AppText>}
      <View style={[styles.check, { backgroundColor: selected ? tokens.textPrimary : 'transparent', borderColor: selected ? tokens.textPrimary : surfaces.border }]}>{selected ? <Icon name="checkmark" size={14} color={surfaces.surface} /> : null}</View>
    </View>
    <View style={styles.art}><ChitsMascot size={156} variant={mascot.id} accessible={false} interactive={false} controlRef={mascotRef} context="settings" /></View>
    <AppText family={fonts.display} weight="600" style={[styles.name, { color: tokens.textPrimary }]}>{mascot.name}</AppText>
    <AppText family={fonts.text} style={[styles.description, { color: tokens.textSecondary }]}>{tr(mascot.descriptionKey)}</AppText>
    <AppText family={fonts.text} weight="600" style={[styles.status, { color: tokens.textPrimary }]}>{selected ? tr('mascot.selected') : tr('mascot.choose')}</AppText>
  </Pressable>;
}

export default function MascotScreen() {
  'use no memo';
  useLocale();
  const { variant, saving, select } = useMascotPreference();
  const desk = useDesk();
  const { tokens } = useTheme();
  const fonts = useWelcomeFonts();
  const { rowStyle } = useDirection();
  const { width, fontScale } = useWindowDimensions();
  const wide = width >= 560 && fontScale < 1.5;
  const [error, setError] = useState<string | null>(null);
  const choose = (mascot: typeof MASCOT_VARIANTS[number]) => {
    setError(null);
    void select?.(mascot.id).catch(() => setError(tr('settings.thatSettingCouldNotBeSavedPleaseTry')));
  };
  const name = MASCOT_VARIANTS.find((item) => item.id === variant)!.name;
  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader title={tr('mascot.title')} leading={<IconButton label={tr('search.goBack')} onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')}><HeaderIcon name="chevron-back" size={24} /></IconButton>} />
    <PaperDesk faint>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText family={fonts.text} style={[styles.intro, { color: desk.inkMuted }]}>{tr('mascot.description')}</AppText>
        <View accessibilityRole="radiogroup" accessibilityLabel={tr('mascot.title')} style={[styles.cards, wide && rowStyle]}>
          {MASCOT_VARIANTS.map((mascot) => <MascotCard key={mascot.id} mascot={mascot} selected={mascot.id === variant} disabled={saving} wide={wide} onSelect={() => choose(mascot)} />)}
        </View>
        <AppText accessibilityLiveRegion="polite" family={fonts.text} style={[styles.saved, { color: desk.inkMuted }]}>{saving ? tr('settings.savingSetting') : tr('mascot.current', { name })}</AppText>
        {error ? <AppText accessibilityRole="alert" family={fonts.text} style={{ color: tokens.danger }}>{error}</AppText> : null}
        <AppText family={fonts.text} style={[styles.footnote, { color: desk.inkMuted }]}>{tr('mascot.freeRelease')}</AppText>
      </ScrollView>
    </PaperDesk>
  </Screen>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 20, paddingBottom: 40, gap: 16 },
  intro: { fontSize: 14, lineHeight: 21 }, cards: { gap: 16 },
  card: { borderWidth: 2, padding: 18, minHeight: 44 }, wideCard: { flex: 1, minWidth: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 5, flexShrink: 1 }, badgeText: { fontSize: 10, lineHeight: 15, letterSpacing: 0.6 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  free: { fontSize: 12, lineHeight: 18 }, art: { alignSelf: 'center', marginVertical: 4 },
  name: { fontSize: 22, lineHeight: 29 }, description: { fontSize: 14, lineHeight: 21, marginTop: 4 },
  status: { fontSize: 13, lineHeight: 20, marginTop: 14 }, saved: { fontSize: 13, lineHeight: 20 },
  footnote: { fontSize: 12, lineHeight: 18 },
});
