import { memo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

import { LabelTape } from '@/components/spaces/label-tape';
import { MagnetButton } from '@/components/spaces/magnet-button';
import { useSpaceFonts } from '@/components/spaces/space-fonts';
import { SpaceSurface } from '@/components/spaces/space-surface';
import { StickyPaper } from '@/components/spaces/sticky-note';
import { Toast } from '@/components/ui/primitives';
import { DEFAULT_SPACE_ID, SPACE_LIST, STICKY_COLORS, type SpaceDefinition, type SpaceId } from '@/constants/spaces';
import { SPACE_UI } from '@/constants/spaces-theme';
import { layout } from '@/constants/theme';
import { createSpaceRepository } from '@/db/repositories';

const CARD_HEIGHT = 112;
// Two small overlapping notes on every card, so the four spaces compare like for like.
const SAMPLES = [
  { title: null, text: 'Oat milk\nEggs', hidden: false, color: STICKY_COLORS[0].hex, rotation: -6 },
  { title: null, text: 'Big idea!', hidden: false, color: STICKY_COLORS[2].hex, rotation: 5 },
];

const SpaceCard = memo(function SpaceCard({ space, selected, onPress }: { space: SpaceDefinition; selected: boolean; onPress: () => void }) {
  const [width, setWidth] = useState(0);
  return <Pressable
    accessibilityRole="radio"
    accessibilityLabel={space.name}
    accessibilityState={{ selected }}
    onPress={onPress}
    onLayout={({ nativeEvent }) => setWidth((current) => (current === nativeEvent.layout.width ? current : nativeEvent.layout.width))}
    style={({ pressed }) => [styles.card, { borderColor: selected ? SPACE_UI.paper : 'transparent' }, pressed && styles.pressed]}
  >
    {width ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cardClip]}>
      {/* The surface at phone scale, cropped to the card. */}
      <SpaceSurface spaceId={space.id} width={Math.max(width, 390) * 0.62} height={CARD_HEIGHT} />
      <View style={[styles.sample, { right: 74, top: 20 }]}><StickyPaper note={SAMPLES[0]} space={space.id} seed={1} unit={0.5} /></View>
      <View style={[styles.sample, { right: 22, top: 34 }]}><StickyPaper note={SAMPLES[1]} space={space.id} seed={2} unit={0.5} /></View>
    </View> : null}
    <LabelTape text={space.name} variant="dark" size="md" rotation={-2} decorative style={styles.cardLabel} />
    {selected ? <MagnetButton size={30} icon="checkmark" style={styles.check} /> : null}
  </Pressable>;
});

/**
 * Pick a Space — shown the first time someone opens Spaces. The choice is
 * saved (selected_space_id) and Spaces opens straight on the board from then
 * on; the dock switches spaces any time after.
 */
export default function PickSpaceScreen() {
  const database = useSQLiteContext();
  const repository = createSpaceRepository(database);
  const insets = useSafeAreaInsets();
  const fonts = useSpaceFonts();
  const [selected, setSelected] = useState<SpaceId>(() => repository.getSelectedSpaceSync() ?? DEFAULT_SPACE_ID);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const space = SPACE_LIST.find((item) => item.id === selected) ?? SPACE_LIST[0];

  const choose = async () => {
    setSaving(true);
    try {
      await repository.setSelectedSpace(selected);
      router.replace('/spaces');
    } catch {
      setSaving(false);
      setToast('That space couldn’t be saved. Please try again.');
    }
  };

  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <StatusBar style="light" />
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
        <Ionicons accessible={false} name="chevron-back" size={24} color={SPACE_UI.paper} style={{ marginLeft: -2 }} />
      </Pressable>
      <LabelTape text="New · Spaces" variant="red" size="sm" rotation={-2} decorative />
      <Text accessibilityRole="header" style={[fonts.uiHeavy, styles.title]}>Pick a spot for your notes.</Text>
      <Text style={[fonts.ui, styles.intro]}>Stick notes on it and move them around, like the real thing.</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Spaces" style={styles.cards}>
        {SPACE_LIST.map((item) => <SpaceCard key={item.id} space={item} selected={item.id === selected} onPress={() => { if (item.id !== selected) { void Haptics.selectionAsync(); setSelected(item.id); } }} />)}
      </View>
    </ScrollView>
    <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void choose()} style={({ pressed }) => [styles.primary, (pressed || saving) && styles.pressed]}>
        <Text style={[fonts.uiSemi, styles.primaryText]}>Stick them on the {space.name}</Text>
      </Pressable>
      <Text style={[fonts.ui, styles.helper]}>You can switch spaces any time from the dock.</Text>
    </View>
    <Toast message={toast} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_UI.ink },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, alignSelf: 'center', width: '100%', maxWidth: layout.maxContentWidth },
  back: { width: 44, height: 44, borderRadius: 22, marginLeft: -6, marginBottom: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: SPACE_UI.inkRaised },
  title: { marginTop: 14, fontSize: 36, lineHeight: 38, letterSpacing: -0.72, color: SPACE_UI.paper },
  intro: { marginTop: 10, marginBottom: 22, fontSize: 15, lineHeight: 21, color: SPACE_UI.textMuted },
  cards: { gap: 10 },
  card: { height: CARD_HEIGHT, borderRadius: 18, borderWidth: 3, backgroundColor: SPACE_UI.inkRaised },
  cardClip: { borderRadius: 15, overflow: 'hidden' },
  sample: { position: 'absolute' },
  cardLabel: { position: 'absolute', left: 12, top: 12 },
  check: { position: 'absolute', right: -8, top: -8 },
  footer: { paddingHorizontal: 20, paddingTop: 12, alignSelf: 'center', width: '100%', maxWidth: layout.maxContentWidth, gap: 10 },
  primary: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: SPACE_UI.accent },
  primaryText: { fontSize: 17, color: SPACE_UI.accentText },
  helper: { fontSize: 13, textAlign: 'center', color: SPACE_UI.textMuted },
  pressed: { opacity: 0.8 },
});
