import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { PAPER_INK, paperColor, SPACE_UI } from '@/constants/spaces-theme';
import { useSpaceFonts } from './space-fonts';

/** A cassette is about this much wider than it is tall. */
export const CASSETTE_RATIO = 0.64;

const SHELL = '#2B2C31';
const SHELL_DARK = '#1E1F23';
const SHELL_LIGHT = '#3B3C42';
const TAPE = '#5A3B2A';
const SHADOW = (u: number, lifted: boolean) => (lifted ? `0px ${22 * u}px ${18 * u}px rgba(0,0,0,0.34)` : `0px ${9 * u}px ${9 * u}px rgba(0,0,0,0.26)`);

type CassetteProps = {
  width: number;
  /** A stored sticky color id: the label is that paper. */
  color: string;
  caption: string | null;
  /** In milliseconds, as stored on the attachment. */
  duration: number | null;
  lifted?: boolean;
  /** Share → "Hide note text": a blank label. */
  obscured?: boolean;
  /** The reels turn while the recording plays. */
  spinning?: boolean;
};

export function formatTapeTime(milliseconds: number | null) {
  const seconds = Math.max(0, Math.round((milliseconds ?? 0) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * A voice note as a cassette tape: dark shell with corner screws, a paper
 * label in the note's color with its caption handwritten and its length
 * stamped, the reel window, and the head opening along the bottom. Drawn
 * from `width` alone so the board and the sheet share it at any size.
 */
export function Cassette({ width, color, caption, duration, lifted = false, obscured = false, spinning = false }: CassetteProps) {
  const fonts = useSpaceFonts();
  const s = width / 132;
  const height = width * CASSETTE_RATIO;
  const paper = paperColor(color);
  const screw = 4 * s;
  const reel = 17 * s;
  return <View style={[styles.shell, { width, height, borderRadius: 7 * s, boxShadow: SHADOW(s, lifted) }]}>
    {[[5, 5], [5, null], [null, 5], [null, null]].map(([left, top], index) => <View key={index} style={[styles.screw, { width: screw, height: screw, borderRadius: screw / 2, left: left === null ? undefined : left * s, right: left === null ? 5 * s : undefined, top: top === null ? undefined : top * s, bottom: top === null ? 5 * s : undefined }]} />)}

    <View style={[styles.label, { left: 10 * s, right: 10 * s, top: 7 * s, height: height * 0.66, borderRadius: 3 * s, backgroundColor: paper.base, experimental_backgroundImage: `linear-gradient(180deg, ${paper.base} 0%, ${paper.base} 75%, ${paper.curl} 100%)` }]}>
      <View style={[styles.labelTop, { paddingHorizontal: 5 * s, paddingTop: 3 * s, gap: 4 * s }]}>
        <Text numberOfLines={1} style={[fonts.note, styles.caption, { fontSize: 12.5 * s, lineHeight: 16 * s }]}>{obscured ? '' : caption ?? 'Voice note'}</Text>
        <Text style={[fonts.label, styles.time, { fontSize: 7.5 * s, lineHeight: 12 * s, letterSpacing: 0.4 * s }]}>{formatTapeTime(duration)}</Text>
      </View>
      {/* A ruled stripe across the label, like the printed band on a real tape. */}
      <View style={[styles.stripe, { height: 2 * s, marginHorizontal: 5 * s }]} />
      <View style={[styles.window, { height: reel + 5 * s, marginHorizontal: 17 * s, marginTop: 4 * s, borderRadius: (reel + 5 * s) / 2, paddingHorizontal: 2.5 * s }]}>
        <Reel size={reel} spinning={spinning} />
        <View style={[styles.tape, { height: reel * 0.62, marginHorizontal: -reel * 0.18 }]} />
        <Reel size={reel} spinning={spinning} />
      </View>
    </View>

    <View style={[styles.head, { width: width * 0.56, height: 13 * s, borderTopLeftRadius: 4 * s, borderTopRightRadius: 4 * s, gap: 20 * s }]}>
      <View style={[styles.hole, { width: 5 * s, height: 5 * s, borderRadius: 2.5 * s }]} />
      <View style={[styles.hole, { width: 5 * s, height: 5 * s, borderRadius: 2.5 * s }]} />
    </View>
  </View>;
}

function Reel({ size, spinning }: { size: number; spinning: boolean }) {
  const reduceMotion = useReducedMotion();
  const turn = useSharedValue(0);
  useEffect(() => {
    if (spinning && !reduceMotion) turn.set(withRepeat(withTiming(turn.get() + 360, { duration: 2200, easing: Easing.linear }), -1, false));
    else cancelAnimation(turn);
  }, [reduceMotion, spinning, turn]);
  const rotation = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.get()}deg` }] }));
  const spoke = { width: size * 0.12, height: size * 0.5, borderRadius: size * 0.06 };
  return <Animated.View style={[styles.reel, { width: size, height: size, borderRadius: size / 2 }, rotation]}>
    {[0, 60, 120].map((angle) => <View key={angle} style={[styles.spoke, spoke, { transform: [{ rotate: `${angle}deg` }] }]} />)}
  </Animated.View>;
}

type SpaceCassetteProps = {
  color: string;
  caption: string | null;
  duration: number | null;
  /** The sticky footprint it sits in; the tape hangs from the top, where the pin is. */
  width: number;
  height: number;
  rotation: number;
  lifted?: boolean;
  obscured?: boolean;
};

/** A voice note on a space, in a sticky's footprint so it drags, stacks and pins like one. */
export const SpaceCassette = memo(function SpaceCassette({ color, caption, duration, width, height, rotation, lifted = false, obscured = false }: SpaceCassetteProps) {
  // Turned about the whole footprint's center, like the pin drawn over it, so the pin stays on the tape's top edge.
  return <View style={{ width, height, transform: [{ rotate: `${rotation}deg` }] }}>
    <Cassette width={width} color={color} caption={caption} duration={duration} lifted={lifted} obscured={obscured} />
  </View>;
});

const styles = StyleSheet.create({
  shell: { backgroundColor: SHELL, experimental_backgroundImage: `linear-gradient(180deg, ${SHELL_LIGHT} 0%, ${SHELL} 30%, ${SHELL_DARK} 100%)` },
  screw: { position: 'absolute', backgroundColor: SHELL_LIGHT, borderWidth: StyleSheet.hairlineWidth, borderColor: SHELL_DARK },
  label: { position: 'absolute', overflow: 'hidden' },
  labelTop: { flexDirection: 'row', alignItems: 'center' },
  caption: { flex: 1, color: PAPER_INK, includeFontPadding: false },
  time: { color: PAPER_INK, opacity: 0.7 },
  stripe: { backgroundColor: SPACE_UI.magnetRed, opacity: 0.75 },
  window: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: SHELL_DARK },
  tape: { flex: 1, backgroundColor: TAPE, borderRadius: 2 },
  reel: { alignItems: 'center', justifyContent: 'center', backgroundColor: SPACE_UI.paperWhite, zIndex: 1 },
  spoke: { position: 'absolute', backgroundColor: SHELL },
  head: { position: 'absolute', bottom: 0, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: SHELL_LIGHT },
  hole: { backgroundColor: SHELL_DARK },
});
