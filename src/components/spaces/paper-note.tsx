import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { PAPER_INK, paperColor, SPACE_UI } from '@/constants/spaces-theme';
import { useSpaceFonts } from './space-fonts';

export type PaperKind = 'sticky' | 'receipt' | 'index';

type Props = {
  kind?: PaperKind;
  /** A stored sticky color id (see spaces-theme `paperColor`). */
  color: string;
  title?: string | null;
  body: string;
  width: number;
  height: number;
  rotation: number;
  /** Lifted off the surface: a deeper shadow (the drag adds the scale). */
  lifted?: boolean;
  /** A note hidden in Chat: covered, never its words. */
  hidden?: boolean;
  /** Share → "Hide note text": soft lines where the words were. */
  obscured?: boolean;
  /** Scales type and details with the note (previews, exports). */
  unit?: number;
};

const SHADOW = (u: number, lifted: boolean) => (lifted ? `0px ${22 * u}px ${18 * u}px rgba(0,0,0,0.30)` : `0px ${9 * u}px ${9 * u}px rgba(0,0,0,0.22)`);
const TEETH = 8; // receipt's torn edge: a tooth every 8pt, 7pt deep
const TOOTH_DEPTH = 7;

/**
 * A piece of paper on a surface: a sticky note (curling to a darker shade at
 * the bottom), a till receipt with a torn edge, or a ruled index card. Only
 * the paper and writing — the pin, drag and lift live around it.
 */
export const PaperNote = memo(function PaperNote({ kind = 'sticky', color, title, body, width, height, rotation, lifted = false, hidden = false, obscured = false, unit = 1 }: Props) {
  const fonts = useSpaceFonts();
  const u = unit;
  const writing = hidden
    ? <View style={styles.hidden}>
      <Ionicons accessible={false} name="eye-off-outline" size={18 * u} color={PAPER_INK} style={{ opacity: 0.55 }} />
      <Text style={[fonts.note, { marginTop: 2 * u, fontSize: 15 * u, lineHeight: 19 * u, color: PAPER_INK, opacity: 0.65 }]}>Hidden Chit</Text>
    </View>
    : obscured
      // Bars shaped like lines of writing: the words are gone from the picture, not blurred.
      ? <View style={{ gap: 10 * u, paddingTop: 6 * u }}>{[0.9, 0.74, 0.5].slice(0, Math.max(1, Math.min(3, body.split('\n').length + (body.length > 16 ? 1 : 0)))).map((part, index) => <View key={index} style={{ width: `${part * 100}%`, height: 11 * u, borderRadius: 6 * u, backgroundColor: PAPER_INK, opacity: 0.15 }} />)}</View>
      : null;

  if (kind === 'receipt') {
    const teeth = Math.ceil(width / (TEETH * u));
    return <View style={{ width, height, transform: [{ rotate: `${rotation}deg` }] }}>
      <View style={{ flex: 1, backgroundColor: SPACE_UI.paperWhite, boxShadow: SHADOW(u, lifted), paddingHorizontal: 12 * u, paddingTop: 16 * u, overflow: 'hidden' }}>
        {title ? <View style={{ borderBottomWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(42,38,34,0.4)', paddingBottom: 5 * u, marginBottom: 6 * u }}>
          <Text numberOfLines={1} style={[fonts.label, { fontSize: 11 * u, lineHeight: 14 * u, letterSpacing: 1.2 * u, color: PAPER_INK }]}>{title.toUpperCase()}</Text>
        </View> : null}
        {writing ?? <Text numberOfLines={title ? 2 : 3} style={[fonts.note, { fontSize: 18 * u, lineHeight: 23 * u, color: PAPER_INK }]}>{body}</Text>}
      </View>
      {/* The torn edge: a row of paper teeth below the receipt. */}
      <View style={[styles.teeth, { height: TOOTH_DEPTH * u }]}>
        {Array.from({ length: teeth }, (_, index) => <View key={index} style={{ width: 0, height: 0, borderLeftWidth: (TEETH / 2) * u, borderRightWidth: (TEETH / 2) * u, borderTopWidth: TOOTH_DEPTH * u, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderTopColor: SPACE_UI.paperWhite }} />)}
      </View>
    </View>;
  }

  if (kind === 'index') {
    const rules = Math.floor(height / (22 * u));
    return <View style={{ width, height, transform: [{ rotate: `${rotation}deg` }], backgroundColor: '#FFFFFF', boxShadow: SHADOW(u, lifted), overflow: 'hidden' }}>
      {Array.from({ length: rules }, (_, index) => <View key={index} style={[styles.rule, { top: (index + 1) * 22 * u, height: Math.max(1, u) }]} />)}
      <View style={[styles.margin, { left: 24 * u, width: Math.max(1, u) }]} />
      <View style={{ paddingLeft: 30 * u, paddingRight: 10 * u, paddingTop: 5 * u }}>
        {writing ?? <Text numberOfLines={Math.max(1, rules - 1)} style={[fonts.note, { fontSize: 18 * u, lineHeight: 22 * u, color: PAPER_INK }]}>{title ? `${title}\n${body}` : body}</Text>}
      </View>
    </View>;
  }

  const paper = paperColor(color);
  return <View style={{
    width, height, transform: [{ rotate: `${rotation}deg` }], borderRadius: 2 * u, backgroundColor: paper.base, overflow: 'hidden',
    experimental_backgroundImage: `linear-gradient(172deg, ${paper.base} 0%, ${paper.base} 70%, ${paper.curl} 100%)`,
    boxShadow: SHADOW(u, lifted), paddingHorizontal: 13 * u, paddingTop: 18 * u, paddingBottom: 8 * u,
  }}>
    {writing ?? <Text numberOfLines={3} ellipsizeMode="tail" style={[fonts.note, { fontSize: 21 * u, lineHeight: 24 * u, color: PAPER_INK, includeFontPadding: false }]}>{title ? `${title}\n${body}` : body}</Text>}
  </View>;
});

const styles = StyleSheet.create({
  hidden: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  teeth: { flexDirection: 'row', overflow: 'hidden' },
  rule: { position: 'absolute', left: 0, right: 0, backgroundColor: '#BCD2EA' },
  margin: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#E9A3A3' },
});
