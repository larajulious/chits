import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';

import { useVideoThumbnail } from '@/components/chat/message-row';
import { PAPER_INK, SPACE_UI } from '@/constants/spaces-theme';
import type { SpaceNoteMedia } from '@/db/types';
import { resolveAttachmentUri } from '@/services/attachment-storage';
import { useSpaceFonts } from './space-fonts';

type Props = {
  media: SpaceNoteMedia;
  /** A card's title, else the words sent with the photo; written on the print's bottom edge. */
  caption: string | null;
  width: number;
  height: number;
  rotation: number;
  lifted?: boolean;
  /** Share → "Hide note text": a blank print, the picture gone as well as the words. */
  obscured?: boolean;
  unit?: number;
};

const SHADOW = (u: number, lifted: boolean) => (lifted ? `0px ${22 * u}px ${18 * u}px rgba(0,0,0,0.30)` : `0px ${9 * u}px ${9 * u}px rgba(0,0,0,0.22)`);

/**
 * A photo or video note on a space: an instant print with a white border and
 * a wider bottom edge for a handwritten caption, in the same footprint as a
 * sticky so it drags, stacks and pins exactly like one.
 */
export const SpacePhoto = memo(function SpacePhoto({ media, caption, width, height, rotation, lifted = false, obscured = false, unit = 1 }: Props) {
  const fonts = useSpaceFonts();
  const u = unit;
  const { attachment } = media;
  return <View style={[styles.print, { width, height, padding: 7 * u, paddingBottom: 0, borderRadius: 2 * u, boxShadow: SHADOW(u, lifted), transform: [{ rotate: `${rotation}deg` }] }]}>
    <View style={styles.picture}>
      {obscured
        ? <View style={[StyleSheet.absoluteFill, styles.blank]}><Ionicons accessible={false} name={attachment.type === 'video' ? 'videocam-outline' : 'image-outline'} size={22 * u} color={PAPER_INK} style={styles.blankIcon} /></View>
        : attachment.type === 'video'
          ? <VideoFrame storagePath={attachment.storagePath} unit={u} />
          : <Image source={resolveAttachmentUri(attachment.storagePath)} contentFit="cover" allowDownscaling style={StyleSheet.absoluteFill} />}
    </View>
    <View style={[styles.captionStrip, { height: 22 * u, paddingHorizontal: 2 * u }]}>
      {caption && !obscured ? <Text numberOfLines={1} style={[fonts.note, { fontSize: 14 * u, lineHeight: 18 * u, color: PAPER_INK, includeFontPadding: false }]}>{caption}</Text> : null}
    </View>
  </View>;
});

/** A video's first frame, with a play mark so it never passes for a still. */
function VideoFrame({ storagePath, unit }: { storagePath: string; unit: number }) {
  const thumbnail = useVideoThumbnail(storagePath);
  const badge = 26 * unit;
  return <>
    {thumbnail ? <Image source={thumbnail} contentFit="cover" style={StyleSheet.absoluteFill} /> : null}
    <View style={[StyleSheet.absoluteFill, styles.center]}>
      <View style={[styles.play, { width: badge, height: badge, borderRadius: badge / 2 }]}>
        <Ionicons accessible={false} name="play" size={13 * unit} color="#FFFFFF" style={{ marginLeft: 2 * unit }} />
      </View>
    </View>
  </>;
}

const styles = StyleSheet.create({
  print: { backgroundColor: SPACE_UI.paperWhite },
  picture: { flex: 1, overflow: 'hidden', backgroundColor: '#2A2622' },
  blank: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#DAD6CD' },
  blankIcon: { opacity: 0.35 },
  captionStrip: { justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  play: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' },
});
