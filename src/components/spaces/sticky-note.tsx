import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';

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
  if (note.hidden) return tr("stickynote.pinnedNoteHiddenChit");
  if (note.media) {
    const kind = { photo: 'photo', video: 'video', audio: tr("stickynote.voiceNote") }[note.media.attachment.type];
    const caption = photoCaption({ title: note.title, media: note.media });
    return caption ? `Pinned ${kind}: ${caption}` : `Pinned ${kind}`;
  }
  return tr("messages.pinnedNote", { value1: stickyText(note).split('\n')[0]?.trim() || tr("stickynote.emptyNote") });
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
  note: Pick<PinnedNote, 'title' | 'text' | 'hidden' | 'color' | 'rotation'> & Partial<Pick<PinnedNote, 'media' | 'imageCount' | 'paperStyle'>>;
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
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const width = STICKY_SIZE.width * unit;
  const height = STICKY_SIZE.height * unit;
  return <View style={{ width, height }}>
    {note.media && !note.hidden && note.media.attachment.type === "audio"
      ? <SpaceCassette color={note.color} caption={photoCaption({ title: note.title, media: note.media })} duration={note.media.attachment.duration} width={width} height={height} rotation={note.rotation} obscured={obscured} lifted={lifted} />
      : note.media && !note.hidden
      ? <SpacePhoto media={note.media} caption={photoCaption({ title: note.title, media: note.media })} width={width} height={height} rotation={note.rotation} obscured={obscured} lifted={lifted} unit={unit} />
      : <PaperNote kind={note.paperStyle} color={note.color} body={stickyText(note)} width={width} height={height} rotation={note.rotation} hidden={note.hidden} obscured={obscured} lifted={lifted} unit={unit} />}
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height, transform: [{ rotate: `${note.rotation}deg` }] }}>
      <PinDecoration space={space} color={magnetColor(seed)} noteWidth={width} unit={unit} seed={seed} />
      {/* A note with pasted images says how many, in the paper's own ink. */}
      {note.imageCount && !note.hidden && !note.media ? <View accessibilityLabel={countLabel('image', note.imageCount)} style={[styles.images, { right: 8 * unit, bottom: 7 * unit, gap: 3 * unit, paddingHorizontal: 5 * unit, borderRadius: 8 * unit }]}>
        <Ionicons name="image-outline" size={11 * unit} color={IMAGE_COUNT_INK} />
        <Text style={[styles.imagesText, { fontSize: 11 * unit, lineHeight: 15 * unit }]}>{note.imageCount}</Text>
      </View> : null}
    </View>
  </View>;
});

const IMAGE_COUNT_INK = 'rgba(42,38,34,0.72)';
const styles = StyleSheet.create({
  images: { position: 'absolute', flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.45)' },
  imagesText: { color: IMAGE_COUNT_INK, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
