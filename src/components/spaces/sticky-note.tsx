import { memo } from 'react';
import { View } from 'react-native';

import { STICKY_SIZE, type SpaceId } from '@/constants/spaces';
import { magnetColor } from '@/constants/spaces-theme';
import type { PinnedNote } from '@/db/types';
import { PaperNote } from './paper-note';
import { PinDecoration } from './pin-decoration';
import { CASSETTE_RATIO, SpaceCassette } from './space-cassette';
import { SpacePhoto } from './space-photo';

/** What a sticky says: a card's own title on the first line, then the note — unless the note only repeats it. */
export function stickyText(note: Pick<PinnedNote, 'title' | 'text'>): string {
  const title = note.title?.trim();
  const text = note.text?.trim();
  if (!title) return text ?? '';
  if (!text || text === title || text.startsWith(`${title}\n`)) return text || title;
  return `${title}\n${text}`;
}

/** What's written on a print or a tape's label: the card's title, else the words sent with it. */
export function photoCaption(note: Pick<PinnedNote, 'title' | 'media'>): string | null {
  return note.title?.trim() || note.media?.caption || null;
}

/** "Pinned note: <first line>" for screen readers; a hidden note never reads out its words. */
export function stickyAccessibilityLabel(note: Pick<PinnedNote, 'title' | 'text' | 'hidden'> & Partial<Pick<PinnedNote, 'media'>>): string {
  if (note.hidden) return 'Pinned note: Hidden Chit';
  if (note.media) {
    const kind = { photo: 'photo', video: 'video', audio: 'voice note' }[note.media.attachment.type];
    const caption = photoCaption({ title: note.title, media: note.media });
    return caption ? `Pinned ${kind}: ${caption}` : `Pinned ${kind}`;
  }
  return `Pinned note: ${stickyText(note).split('\n')[0]?.trim() || 'Empty note'}`;
}

/**
 * The part of a note's footprint it actually covers, at unit 1: all of it for
 * paper and prints, the top of it for a cassette (which is wider than tall).
 * The drag's lift shadow and touch area follow this, not the footprint.
 */
export function stickyShape(note: Pick<PinnedNote, 'hidden'> & Partial<Pick<PinnedNote, 'media'>>): { height: number; borderRadius: number } {
  if (note.media?.attachment.type === 'audio' && !note.hidden) return { height: Math.round(STICKY_SIZE.width * CASSETTE_RATIO), borderRadius: 7 };
  return { height: STICKY_SIZE.height, borderRadius: 2 };
}

export type StickyPaperProps = {
  note: Pick<PinnedNote, 'title' | 'text' | 'hidden' | 'color' | 'rotation'> & Partial<Pick<PinnedNote, 'media'>>;
  space: SpaceId;
  /** Picks the magnet/pin/washi color and the tape's tilt. */
  seed?: number;
  /** Scales everything: 1 on the board, smaller in previews, larger in a 1080px export. */
  unit?: number;
  obscured?: boolean;
  lifted?: boolean;
};

/** A note on a space: its paper and writing (or its photo, as a print), and the space's pin over the top edge. */
export const StickyPaper = memo(function StickyPaper({ note, space, seed = 0, unit = 1, obscured = false, lifted = false }: StickyPaperProps) {
  const width = STICKY_SIZE.width * unit;
  const height = STICKY_SIZE.height * unit;
  return <View style={{ width, height }}>
    {note.media && !note.hidden && note.media.attachment.type === 'audio'
      ? <SpaceCassette color={note.color} caption={photoCaption({ title: note.title, media: note.media })} duration={note.media.attachment.duration} width={width} height={height} rotation={note.rotation} obscured={obscured} lifted={lifted} />
      : note.media && !note.hidden
      ? <SpacePhoto media={note.media} caption={photoCaption({ title: note.title, media: note.media })} width={width} height={height} rotation={note.rotation} obscured={obscured} lifted={lifted} unit={unit} />
      : <PaperNote kind="sticky" color={note.color} body={stickyText(note)} width={width} height={height} rotation={note.rotation} hidden={note.hidden} obscured={obscured} lifted={lifted} unit={unit} />}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, transform: [{ rotate: `${note.rotation}deg` }] }}>
      <PinDecoration space={space} color={magnetColor(seed)} noteWidth={width} unit={unit} seed={seed} />
    </View>
  </View>;
});
