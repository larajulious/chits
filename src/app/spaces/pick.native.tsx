import { memo, useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
import { createMessageRepository, createSpaceRepository } from '@/db/repositories';
import { OnboardingMascot } from '@/features/onboarding/components/onboarding-mascot';
import { markOrganizationAccepted } from '@/services/chits-organization';

// Cards share whatever height the screen has left, up to this tall, and never
// below the minimum (where the tapes and a sample note still fit).
const CARD_MAX_HEIGHT = 112;
const CARD_MIN_HEIGHT = 56;
// Two small overlapping notes on every card, so the four spaces compare like for like.
const SAMPLES = [
  { title: null, text: 'Oat milk\nEggs', hidden: false, color: STICKY_COLORS[0].hex, rotation: -6 },
  { title: null, text: 'Big idea!', hidden: false, color: STICKY_COLORS[2].hex, rotation: 5 },
];

const SpaceCard = memo(function SpaceCard({ space, selected, count, onPress }: { space: SpaceDefinition; selected: boolean; count: number; onPress: () => void }) {
  const fonts = useSpaceFonts();
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  // The sample notes scale down with a short card, so they're never cut off.
  const unit = size ? Math.min(0.5, (size.height - 14) / 150) : 0.5;
  const nudge = unit / 0.5;
  const shortCard = size !== null && size.height < 72;
  return <Pressable
    accessibilityRole="radio"
    accessibilityLabel={`${space.name}. ${space.description}.${count ? ` ${count} ${count === 1 ? 'note' : 'notes'}.` : ''}`}
    accessibilityState={{ selected }}
    onPress={onPress}
    onLayout={({ nativeEvent: { layout } }) => setSize((current) => (current && current.width === layout.width && current.height === layout.height ? current : { width: layout.width, height: layout.height }))}
    style={({ pressed }) => [styles.card, { borderColor: selected ? SPACE_UI.paper : 'transparent' }, pressed && styles.pressed]}
  >
    {size ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.cardClip]}>
      {/* The surface at phone scale, cropped to the card. */}
      <SpaceSurface spaceId={space.id} width={Math.max(size.width, 390) * 0.62} height={size.height} />
      <View style={[styles.sample, { right: 74 * nudge, top: 20 * nudge }]}><StickyPaper note={SAMPLES[0]} space={space.id} seed={1} unit={unit} /></View>
      <View style={[styles.sample, { right: 22 * nudge, top: 34 * nudge }]}><StickyPaper note={SAMPLES[1]} space={space.id} seed={2} unit={unit} /></View>
    </View> : null}
    <LabelTape text={space.name} variant="dark" size={shortCard ? 'sm' : 'md'} rotation={-2} decorative style={[styles.cardLabel, shortCard && styles.cardLabelShort]} />
    <View pointerEvents="none" style={styles.cardDescription}>
      <Text numberOfLines={1} style={[fonts.uiSemi, styles.cardDescriptionText]}>{space.description}</Text>
    </View>
    {count ? <LabelTape text={`${count} ${count === 1 ? 'note' : 'notes'}`} variant="red" size="sm" rotation={2} decorative style={styles.cardCount} /> : null}
    {selected ? <MagnetButton size={30} icon="checkmark" style={styles.check} /> : null}
  </Pressable>;
});

/**
 * Pick a Space — where the side panel's Spaces always lands, and where a
 * chits://spaces link lands the first time. The choice is saved
 * (selected_space_id) and opens that space; the dock switches any time after.
 */
export default function PickSpaceScreen() {
  const database = useSQLiteContext();
  const { messageId, chitsGuided } = useLocalSearchParams<{ messageId?: string; chitsGuided?: string }>();
  const [guidedPending, setGuidedPending] = useState(chitsGuided === '1');
  const repository = createSpaceRepository(database);
  const insets = useSafeAreaInsets();
  const fonts = useSpaceFonts();
  // Everything fits on one screen, with no scrolling: the cards take the
  // height that's left, and a short phone gets a tighter heading.
  const compact = useWindowDimensions().height < 760;
  const [saved, setSaved] = useState(() => repository.getSelectedSpaceSync());
  const [selected, setSelected] = useState<SpaceId>(() => saved ?? DEFAULT_SPACE_ID);
  // Someone who's been here before sees what's already on each space. Read
  // each time this shows, since coming back from a space may have changed it.
  const [counts, setCounts] = useState<Partial<Record<SpaceId, number>>>({});
  useFocusEffect(useCallback(() => {
    let active = true;
    const spaces = createSpaceRepository(database);
    setSaved(spaces.getSelectedSpaceSync());
    void spaces.counts().then((next) => { if (active) setCounts(next); }, () => undefined);
    return () => { active = false; };
  }, [database]));
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const space = SPACE_LIST.find((item) => item.id === selected) ?? SPACE_LIST[0];

  const choose = async () => {
    setSaving(true);
    try {
      await repository.setSelectedSpace(selected);
      if (guidedPending && messageId) {
        const message = await createMessageRepository(database).getActiveById(messageId);
        if (!message) throw new Error('That note is no longer available.');
        const result = await repository.stick('thought', messageId, selected);
        if (result.status === 'full') { setToast('This space is full. Choose another space.'); setSaving(false); return; }
        const first = await markOrganizationAccepted(database, 'space').catch(() => false);
        setGuidedPending(false);
        router.push({ pathname: '/spaces', params: { spaceId: selected, noteId: messageId, chitsGuided: '1', chitsRelationship: first ? '1' : undefined } });
        setSaving(false);
        return;
      }
      // On top of this screen, so going back from the space returns here.
      router.push('/spaces');
      setSaving(false);
    } catch {
      setSaving(false);
      setToast('That space couldn’t be saved. Please try again.');
    }
  };

  return <View style={[styles.root, { paddingTop: insets.top }]}>
    <StatusBar style="light" />
    <View style={styles.content}>
      <View style={[styles.topRow, compact && styles.topRowCompact]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Ionicons accessible={false} name="chevron-back" size={24} color={SPACE_UI.paper} style={{ marginLeft: -2 }} />
        </Pressable>
        <OnboardingMascot size={compact ? 60 : 76} />
      </View>
      <LabelTape text={saved ? 'Spaces' : 'New · Spaces'} variant="red" size="sm" rotation={-2} decorative />
      <Text accessibilityRole="header" style={[fonts.uiHeavy, styles.title, compact && styles.titleCompact]}>{saved ? 'Where to?' : 'Pick a spot for your notes.'}</Text>
      <Text style={[fonts.ui, styles.intro, compact && styles.introCompact]}>Stick notes on it and move them around, like the real thing.</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Spaces" style={styles.cards}>
        {SPACE_LIST.map((item) => <SpaceCard key={item.id} space={item} selected={item.id === selected} count={counts[item.id] ?? 0} onPress={() => { if (item.id !== selected) { void Haptics.selectionAsync(); setSelected(item.id); } }} />)}
      </View>
    </View>
    <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void choose()} style={({ pressed }) => [styles.primary, (pressed || saving) && styles.pressed]}>
        <Text style={[fonts.uiSemi, styles.primaryText]}>{saved ? `Go to your ${space.name}` : `Stick them on the ${space.name}`}</Text>
      </Pressable>
      <Text style={[fonts.ui, styles.helper]}>You can switch spaces any time from the dock.</Text>
    </View>
    <Toast message={toast} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SPACE_UI.ink },
  content: { flex: 1, minHeight: 0, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, alignSelf: 'center', width: '100%', maxWidth: layout.maxContentWidth },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  topRowCompact: { marginBottom: 4 },
  back: { width: 44, height: 44, borderRadius: 22, marginLeft: -6, alignItems: 'center', justifyContent: 'center', backgroundColor: SPACE_UI.inkRaised },
  title: { marginTop: 14, fontSize: 36, lineHeight: 38, letterSpacing: -0.72, color: SPACE_UI.paper },
  titleCompact: { marginTop: 8, fontSize: 28, lineHeight: 31, letterSpacing: -0.56 },
  intro: { marginTop: 10, marginBottom: 22, fontSize: 15, lineHeight: 21, color: SPACE_UI.textMuted },
  introCompact: { marginTop: 6, marginBottom: 14 },
  cards: { flex: 1, minHeight: 0, gap: 10 },
  card: { flex: 1, minHeight: CARD_MIN_HEIGHT, maxHeight: CARD_MAX_HEIGHT, borderRadius: 18, borderWidth: 3, backgroundColor: SPACE_UI.inkRaised },
  cardClip: { borderRadius: 15, overflow: 'hidden' },
  sample: { position: 'absolute' },
  cardLabel: { position: 'absolute', left: 12, top: 12 },
  cardLabelShort: { top: 6 },
  cardDescription: { position: 'absolute', left: 12, bottom: 8, maxWidth: '62%', borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: 'rgba(18,19,21,0.78)' },
  cardDescriptionText: { color: SPACE_UI.paper, fontSize: 11, lineHeight: 14 },
  cardCount: { position: 'absolute', right: 12, bottom: 8 },
  check: { position: 'absolute', right: -8, top: -8 },
  footer: { paddingHorizontal: 20, paddingTop: 12, alignSelf: 'center', width: '100%', maxWidth: layout.maxContentWidth, gap: 10 },
  primary: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: SPACE_UI.accent },
  primaryText: { fontSize: 17, color: SPACE_UI.accentText },
  helper: { fontSize: 13, textAlign: 'center', color: SPACE_UI.textMuted },
  pressed: { opacity: 0.8 },
});
