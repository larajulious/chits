import { countLabel, tr } from '@/localization/runtime';
import { useDirection, useLocale } from '@/localization/provider';
import { memo, useCallback, useMemo, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Haptics from 'expo-haptics';

import { PAPER_INK, PAPER_WHITE, PAPER_YELLOW, PaperAction, PaperButton, useDesk } from '@/components/desk/paper-desk';
import { heroStageLayout } from '@/components/mascot/hero-stage-layout';
import { useStageViewport } from '@/components/mascot/mascot-stage';
import { PICK_GAP, PICK_PAD, pickGridLayout } from '@/components/spaces/pick-layout';
import { PickStage } from '@/components/spaces/pick-stage';
import { SpaceSurface } from '@/components/spaces/space-surface';
import { StickyPaper } from '@/components/spaces/sticky-note';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { AppHeader, Icon, Screen, Toast } from '@/components/ui/primitives';
import { NavigationMenuButton } from '@/components/navigation/navigation-menu-button';
import { DEFAULT_SPACE_ID, SPACE_LIST, STICKY_COLORS, STICKY_SIZE, type SpaceDefinition, type SpaceId } from '@/constants/spaces';
import { createMessageRepository, createSpaceRepository } from '@/db/repositories';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { welcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { markOrganizationAccepted } from '@/services/chits-organization';

// Two small overlapping notes on every print, so the four spaces compare like for like.
const SAMPLES = [
  { title: null, get text() { return tr("pick.oatMilkEggs"); }, hidden: false, color: STICKY_COLORS[0].hex, rotation: -6 },
  { title: null, get text() { return tr("pick.bigIdea"); }, hidden: false, color: STICKY_COLORS[2].hex, rotation: 5 },
];
/** Each print's one fixed tilt, in reading order. */
const TILTS = [-0.7, 0.6, 0.5, -0.6];
/** The surface at about phone scale, cropped to the print. */
const SURFACE_WIDTH = 242;

type Grid = ReturnType<typeof pickGridLayout>;

/** One space as a print on the page: its surface with two notes on it, and its name written underneath. A chosen one takes the accent and lifts. */
const SpaceTile = memo(function SpaceTile({ space, tilt, selected, count, grid, paper, ink, inkMuted, onPick }: { space: SpaceDefinition; tilt: number; selected: boolean; count: number; grid: Grid; paper: string; ink: string; inkMuted: string; onPick: (id: SpaceId) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  const { previewHeight, previewWidth, stickyUnit: unit } = grid;
  const noteWidth = STICKY_SIZE.width * unit;
  const noteHeight = STICKY_SIZE.height * unit;
  const left = (previewWidth - noteWidth * 1.7) / 2;
  const top = (previewHeight - noteHeight * 1.2) / 2;
  return <PaperButton
    paper={selected ? tokens.accent : paper}
    tilt={selected ? tilt * 1.6 : tilt}
    accessibilityRole="radio"
    accessibilityLabel={`${space.name}. ${space.description}.${count ? ' ' + countLabel('note', count) + '.' : ''}`}
    accessibilityState={{ selected }}
    onPress={() => onPick(space.id)}
    containerStyle={styles.tileSlot}
    style={[styles.tile, { minHeight: grid.tileHeight }, selected && { boxShadow: `0px 9px 16px ${desk.shadow}` }]}
  >
    <View pointerEvents="none" style={[styles.preview, { height: previewHeight }]}>
      <SpaceSurface spaceId={space.id} width={SURFACE_WIDTH} height={previewHeight} />
      <View style={[styles.sample, { left, top }]}><StickyPaper note={SAMPLES[0]} space={space.id} seed={1} unit={unit} /></View>
      <View style={[styles.sample, { left: left + noteWidth * 0.7, top: top + noteHeight * 0.2 }]}><StickyPaper note={SAMPLES[1]} space={space.id} seed={2} unit={unit} /></View>
      {count ? <View style={[styles.count, { boxShadow: `0px 2px 4px ${desk.shadow}` }]}><AppText weight="700" family={fonts.text} numberOfLines={1} style={styles.countText}>{countLabel('note', count)}</AppText></View> : null}
      {selected ? <View style={[styles.check, { backgroundColor: tokens.accent, borderColor: tokens.accentText }]}><Icon name="checkmark" size={15} color={tokens.accentText} /></View> : null}
    </View>
    <View style={styles.caption}>
      <AppText weight="700" family={fonts.display} numberOfLines={1} style={[styles.name, { color: selected ? tokens.accentText : ink }]}>{space.name}</AppText>
      <AppText family={fonts.text} numberOfLines={2} style={[styles.description, { color: selected ? tokens.accentText : inkMuted }]}>{space.description}</AppText>
    </View>
  </PaperButton>;
});

/**
 * Pick a Space — where the side panel's Spaces always lands, and where a
 * chits://spaces link lands the first time. The choice is saved
 * (selected_space_id) and opens that space; the dock switches any time after.
 */
export default function PickSpaceScreen() {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const { messageId, chitsGuided } = useLocalSearchParams<{ messageId?: string; chitsGuided?: string }>();
  const [guidedPending, setGuidedPending] = useState(chitsGuided === '1');
  const repository = createSpaceRepository(database);
  const { tokens, scheme } = useTheme();
  const desk = useDesk();
  const { rowStyle } = useDirection();
  const surfaces = welcomeSurfaces(scheme, desk, { white: PAPER_WHITE, ink: PAPER_INK, yellow: PAPER_YELLOW });
  // Everything fits on one screen where it can: the prints share the height
  // the header, Chits and the action leave.
  const { width, height } = useWindowDimensions();
  const viewport = useStageViewport();
  const grid = useMemo(() => pickGridLayout(width, viewport, heroStageLayout(width, height).height), [height, viewport, width]);
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
        if (!message) throw new Error(tr("pick.thatNoteIsNoLongerAvailable"));
        const result = await repository.stick('thought', messageId, selected);
        if (result.status === 'full') { setToast(tr("pick.thisSpaceIsFullChooseAnotherSpace")); setSaving(false); return; }
        const first = await markOrganizationAccepted(database, 'space').catch(() => false);
        setGuidedPending(false);
        router.push({ pathname: '/spaces', params: { spaceId: selected, noteId: messageId, chitsGuided: '1', chitsRelationship: first ? '1' : undefined } });
        setSaving(false);
        return;
      }
      // Space details handles its back button by returning directly to Cards.
      router.push('/spaces');
      setSaving(false);
    } catch {
      setSaving(false);
      setToast(tr("pick.thatSpaceCouldnTBeSavedPleaseTry"));
    }
  };

  const pick = useCallback((id: SpaceId) => {
    if (id === selected) return;
    void Haptics.selectionAsync();
    setSelected(id);
  }, [selected]);
  const tile = (item: SpaceDefinition, index: number) => <SpaceTile key={item.id} space={item} tilt={TILTS[index]} selected={item.id === selected} count={counts[item.id] ?? 0} grid={grid} paper={surfaces.card} ink={surfaces.ink} inkMuted={surfaces.inkMuted} onPick={pick} />;

  return <Screen edges={['top', 'left', 'right']} style={{ backgroundColor: desk.desk }}>
    <AppHeader title={tr("pick.spaces")} leading={<NavigationMenuButton />} />
    <PickStage
      title={saved ? tr("pick.whereTo") : tr("pick.pickASpotForYourNotes")}
      body={tr("pick.stickNotesOnItAndMoveThemAround")}
      firstVisit={!saved}
      footer={<PaperAction primary paper={tokens.accent} ink={tokens.accentText} label={saved ? tr("pick.goToYourValue", { value1: space.name }) : tr("pick.stickThemOnTheValue", { value1: space.name })} accessibilityState={{ disabled: saving }} disabled={saving} onPress={() => void choose()} />}
    >
      <View accessibilityRole="radiogroup" accessibilityLabel={tr("pick.spaces")} style={styles.grid}>
        <View style={[styles.row, rowStyle]}>{SPACE_LIST.slice(0, 2).map((item, index) => tile(item, index))}</View>
        <View style={[styles.row, rowStyle]}>{SPACE_LIST.slice(2).map((item, index) => tile(item, index + 2))}</View>
      </View>
    </PickStage>
    <Toast message={toast} />
  </Screen>;
}

const styles = StyleSheet.create({
  grid: { gap: PICK_GAP },
  row: { gap: PICK_GAP },
  tileSlot: { flex: 1, minWidth: 0 },
  tile: { flex: 1, alignItems: 'stretch', justifyContent: 'flex-start', padding: PICK_PAD },
  preview: { borderRadius: 2, overflow: 'hidden' },
  sample: { position: 'absolute' },
  count: { position: 'absolute', left: 6, bottom: 6, maxWidth: '80%', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 2, backgroundColor: PAPER_WHITE, transform: [{ rotate: '-3deg' }] },
  countText: { color: PAPER_INK, fontSize: 11, lineHeight: 15, fontVariant: ['tabular-nums'] },
  check: { position: 'absolute', right: 6, top: 6, width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  caption: { paddingTop: 7, paddingHorizontal: 2, gap: 1 },
  name: { fontSize: 17, lineHeight: 21 },
  description: { fontSize: 13, lineHeight: 17 },
});
