import { useEffect, useState, type ComponentProps } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACE_CAPACITY, SPACE_LIST, SPACES, STICKY_COLORS, type SpaceId } from '@/constants/spaces';
import { paperColor, SPACE_UI } from '@/constants/spaces-theme';
import type { PinnedNote } from '@/db/types';
import { useSpaceFonts } from './space-fonts';
import { stickyText } from './sticky-note';

type Props = {
  note: PinnedNote;
  counts: Record<SpaceId, number>;
  onDismiss: () => void;
  onColor: (color: string) => void;
  onOpen: () => void;
  onBringToFront: () => void;
  onMove: (spaceId: SpaceId) => void;
  onRemove: () => void;
};

type IconName = ComponentProps<typeof Ionicons>['name'];
// Each swatch sits at its own slight angle, like squares of paper laid out.
const SWATCH_TILTS = [-4, 3, -2, 4, -3];

function Tile({ icon, label, onPress, danger = false }: { icon: IconName; label: string; onPress: () => void; danger?: boolean }) {
  const fonts = useSpaceFonts();
  const color = danger ? SPACE_UI.dangerText : SPACE_UI.paper;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tile, danger ? styles.tileDanger : styles.tileRaised, pressed && styles.pressed]}>
    <Ionicons accessible={false} name={icon} size={22} color={color} />
    <Text numberOfLines={2} style={[fonts.uiSemi, styles.tileLabel, { color }]}>{label}</Text>
  </Pressable>;
}

/**
 * A sticky's options (long-press, or the screen reader's "Options" action):
 * its paper color, then Open, Bring to front, Move to another space and
 * Remove — which are also the non-drag way to arrange the board. Drawn over
 * the dimmed surface by the screen, which lifts the note itself above the dim.
 */
export function StickyOptionsSheet({ note, counts, onDismiss, onColor, onOpen, onBringToFront, onMove, onRemove }: Props) {
  const insets = useSafeAreaInsets();
  const fonts = useSpaceFonts();
  const [moving, setMoving] = useState(false);
  const space = SPACES[note.spaceId];
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (moving) setMoving(false); else onDismiss(); return true; });
    return () => subscription.remove();
  }, [moving, onDismiss]);
  const title = note.hidden ? 'Hidden Chit' : stickyText(note).split('\n')[0] || 'Note';
  return <Animated.View entering={SlideInDown.duration(220)} exiting={SlideOutDown.duration(180)} accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
    <View style={styles.grabber} />
    <Text accessibilityRole="header" numberOfLines={1} style={[fonts.uiHeavy, styles.title]}>{title}</Text>
    <Text style={[fonts.ui, styles.subtitle]}>On your {space.name}</Text>
    {moving ? <View style={styles.moveList}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back to options" onPress={() => setMoving(false)} style={({ pressed }) => [styles.moveRow, pressed && styles.pressed]}>
        <Ionicons accessible={false} name="chevron-back" size={20} color={SPACE_UI.paper} />
        <Text style={[fonts.uiSemi, styles.moveLabel]}>Move to…</Text>
      </Pressable>
      {SPACE_LIST.filter((item) => item.id !== note.spaceId).map((item) => {
        const full = counts[item.id] >= SPACE_CAPACITY;
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}, ${full ? 'full' : `${counts[item.id]} of ${SPACE_CAPACITY}`}`} accessibilityState={{ disabled: full }} disabled={full} onPress={() => onMove(item.id)} style={({ pressed }) => [styles.moveRow, styles.moveTarget, full && styles.disabled, pressed && styles.pressed]}>
          <Text style={[fonts.uiSemi, styles.moveLabel]}>{item.name}</Text>
          <Text style={[fonts.label, styles.moveCount]}>{full ? 'FULL' : `${counts[item.id]} / ${SPACE_CAPACITY}`}</Text>
        </Pressable>;
      })}
    </View> : <>
      <Text style={[fonts.label, styles.section]}>PAPER COLOR</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Paper color" style={styles.swatches}>
        {STICKY_COLORS.map((color, index) => {
          const selected = color.hex === note.color;
          const paper = paperColor(color.hex);
          return <Pressable key={color.hex} accessibilityRole="radio" accessibilityLabel={color.name} accessibilityState={{ selected }} onPress={() => { if (!selected) onColor(color.hex); }} style={({ pressed }) => [styles.swatchTarget, pressed && styles.pressed]}>
            <View style={[styles.ring, selected && styles.ringSelected, { transform: [{ rotate: `${SWATCH_TILTS[index % SWATCH_TILTS.length]}deg` }] }]}>
              <View style={[styles.swatch, { backgroundColor: paper.base, experimental_backgroundImage: `linear-gradient(172deg, ${paper.base} 0%, ${paper.base} 70%, ${paper.curl} 100%)` }]} />
            </View>
          </Pressable>;
        })}
      </View>
      <View style={styles.grid}>
        <View style={styles.gridRow}>
          <Tile icon="open-outline" label="Open note" onPress={onOpen} />
          <Tile icon="layers-outline" label="Bring to front" onPress={onBringToFront} />
        </View>
        <View style={styles.gridRow}>
          <Tile icon="swap-horizontal-outline" label="Move to another space" onPress={() => setMoving(true)} />
          <Tile icon="close-circle-outline" label={`Remove from ${space.name}`} onPress={onRemove} danger />
        </View>
      </View>
    </>}
  </Animated.View>;
}

/** The dim over the surface behind the sheet; tapping it closes the sheet. */
export function SheetDim({ onPress }: { onPress: () => void }) {
  return <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.dim]}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close options" onPress={onPress} style={StyleSheet.absoluteFill} />
  </Animated.View>;
}

const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: SPACE_UI.ink, boxShadow: '0px -8px 30px rgba(0,0,0,0.35)' },
  // Ink at 55%.
  dim: { backgroundColor: 'rgba(23,24,28,0.55)' },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginTop: 10, marginBottom: 16, backgroundColor: SPACE_UI.inkBorder },
  title: { fontSize: 22, lineHeight: 27, color: SPACE_UI.paper },
  subtitle: { marginTop: 2, fontSize: 14, color: SPACE_UI.textMuted },
  section: { marginTop: 20, fontSize: 11, letterSpacing: 1.6, color: SPACE_UI.textMuted },
  swatches: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 18 },
  swatchTarget: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  // Selected: a 3pt ink gap inside a 2pt paper ring.
  ring: { padding: 3, borderRadius: 7, borderWidth: 2, borderColor: 'transparent' },
  ringSelected: { borderColor: SPACE_UI.paper },
  swatch: { width: 44, height: 44, borderRadius: 2, boxShadow: '0px 2px 3px rgba(0,0,0,0.3)' },
  grid: { gap: 10 },
  gridRow: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, height: 78, borderRadius: 16, padding: 12, justifyContent: 'space-between' },
  tileRaised: { backgroundColor: SPACE_UI.inkRaised },
  tileDanger: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: SPACE_UI.dangerBorder },
  tileLabel: { fontSize: 14, lineHeight: 17 },
  moveList: { marginTop: 14, gap: 8 },
  moveRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 14 },
  moveTarget: { justifyContent: 'space-between', backgroundColor: SPACE_UI.inkRaised },
  moveLabel: { fontSize: 16, color: SPACE_UI.paper },
  moveCount: { fontSize: 11, letterSpacing: 1.2, color: SPACE_UI.textMuted },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.4 },
});
