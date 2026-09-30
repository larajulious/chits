import { memo } from 'react';
import { View } from 'react-native';

import { STICKY_SIZE, type SpaceId } from '@/constants/spaces';
import { magnetColor } from '@/constants/spaces-theme';
import type { PinnedNote } from '@/db/types';
import { PaperNote } from './paper-note';
import { PinDecoration } from './pin-decoration';

/** What a sticky says: a card's own title on the first line, then the note — unless the note only repeats it. */
export function stickyText(note: Pick<PinnedNote, 'title' | 'text'>): string {
  const title = note.title?.trim();
  const text = note.text?.trim();
  if (!title) return text ?? '';
  if (!text || text === title || text.startsWith(`${title}\n`)) return text || title;
  return `${title}\n${text}`;
}

/** "Pinned note: <first line>" for screen readers; a hidden note never reads out its words. */
export function stickyAccessibilityLabel(note: Pick<PinnedNote, 'title' | 'text' | 'hidden'>): string {
  if (note.hidden) return 'Pinned note: Hidden Chit';
  return `Pinned note: ${stickyText(note).split('\n')[0]?.trim() || 'Empty note'}`;
}

export type StickyPaperProps = {
  note: Pick<PinnedNote, 'title' | 'text' | 'hidden' | 'color' | 'rotation'>;
  space: SpaceId;
  /** Picks the magnet/pin/washi color and the tape's tilt. */
  seed?: number;
  /** Scales everything: 1 on the board, smaller in previews, larger in a 1080px export. */
  unit?: number;
  obscured?: boolean;
  lifted?: boolean;
};

/** A note on a space: its paper and writing, and the space's pin over the top edge. */
export const StickyPaper = memo(function StickyPaper({ note, space, seed = 0, unit = 1, obscured = false, lifted = false }: StickyPaperProps) {
  const width = STICKY_SIZE.width * unit;
  const height = STICKY_SIZE.height * unit;
  return <View style={{ width, height }}>
    <PaperNote kind="sticky" color={note.color} body={stickyText(note)} width={width} height={height} rotation={note.rotation} hidden={note.hidden} obscured={obscured} lifted={lifted} unit={unit} />
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, transform: [{ rotate: `${note.rotation}deg` }] }}>
      <PinDecoration space={space} color={magnetColor(seed)} noteWidth={width} unit={unit} seed={seed} />
    </View>
  </View>;
});
