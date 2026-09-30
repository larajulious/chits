import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fromUnit, SPACES, type SpaceId } from '@/constants/spaces';
import { noteSeed, PAPER_INK, SPACE_UI } from '@/constants/spaces-theme';
import type { PinnedNote } from '@/db/types';
import { LabelTape } from './label-tape';
import { useSpaceFonts } from './space-fonts';
import { SpaceSurface } from './space-surface';
import { StickyPaper } from './sticky-note';

// The picture is laid out on a square this many design units wide, then
// scaled to the drawn size — so the preview and the 1080px file match.
const DESIGN = 460;
// The Polaroid: a square photo, 12 of frame around it, 48 at the bottom.
const PHOTO = 344;
const FRAME = { side: 12, bottom: 48 };
// Notes are placed on a square board of this size, then scaled into the photo.
const BOARD = { width: 460, height: 460 };

type Props = {
  spaceId: SpaceId;
  notes: PinnedNote[];
  size: number;
  hideText: boolean;
  /** Unused since the redesign (notes are always set in Kalam); kept so callers needn't change. */
  fontFamily?: string;
  /** Unused since the redesign (a space looks the same in light and dark). */
  scheme?: 'light' | 'dark';
};

/**
 * A space as a square picture: a Polaroid on ink, its photo the space with
 * every note where the user put it (positions are fractions, so they carry
 * over from any screen shape), "my fridge" written in the strip and a MADE
 * WITH CHITS label. With `hideText`, the words are left out entirely —
 * replaced by soft lines, not blurred.
 */
export const SpaceShareCanvas = memo(function SpaceShareCanvas({ spaceId, notes, size, hideText }: Props) {
  const fonts = useSpaceFonts();
  const k = size / DESIGN;
  const photo = PHOTO * k;
  const noteUnit = photo / BOARD.width;
  const frameWidth = photo + FRAME.side * 2 * k;
  const frameHeight = photo + (FRAME.side + FRAME.bottom) * k;
  const space = SPACES[spaceId];
  return <View collapsable={false} style={{ width: size, height: size, backgroundColor: SPACE_UI.ink, alignItems: 'center', justifyContent: 'center' }}>
    <View style={{
      width: frameWidth, height: frameHeight, padding: FRAME.side * k, paddingBottom: 0, borderRadius: 4 * k, backgroundColor: SPACE_UI.paperWhite,
      boxShadow: `0px ${16 * k}px ${30 * k}px rgba(0,0,0,0.5)`, transform: [{ rotate: '-1.5deg' }],
    }}>
      <View style={{ width: photo, height: photo, overflow: 'hidden', borderRadius: 1.5 * k }}>
        <SpaceSurface spaceId={spaceId} width={photo} height={photo} />
        {notes.map((note) => {
          const { x, y } = fromUnit(note, BOARD);
          return <View key={note.id} style={[styles.absolute, { left: x * noteUnit, top: y * noteUnit }]}>
            <StickyPaper note={note} space={spaceId} seed={noteSeed(note.id)} unit={noteUnit} obscured={hideText} />
          </View>;
        })}
      </View>
      <View style={[styles.strip, { height: FRAME.bottom * k, paddingHorizontal: 4 * k }]}>
        <Text numberOfLines={1} style={[fonts.note, { flex: 1, fontSize: 19 * k, lineHeight: 24 * k, color: PAPER_INK }]}>my {space.name.toLowerCase()}</Text>
        <LabelTape text="Made with Chits" variant="dark" size="sm" rotation={-2} unit={k} decorative />
      </View>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  absolute: { position: 'absolute' },
  strip: { flexDirection: 'row', alignItems: 'center' },
});
