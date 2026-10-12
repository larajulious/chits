import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { NoteImage } from '@/components/notes/note-image';
import { spacing } from '@/constants/theme';
import type { AttachmentLike } from '@/db/types';
import { imageRows, noteListMarkers, type NoteRenderBlock } from '@/services/note-content';

type Segment = { key: string; type: 'text'; text: string; marker?: string | null } | { key: string; type: 'images'; images: { key: string; attachment: AttachmentLike }[] };

function segmentsOf(blocks: NoteRenderBlock[]): Segment[] {
  const segments: Segment[] = [];
  const markers = noteListMarkers(blocks);
  for (const [index, block] of blocks.entries()) {
    const previous = segments[segments.length - 1];
    if (block.type === 'text') segments.push({ key: block.key, type: 'text', text: block.text, marker: markers[index] });
    else if (previous?.type === 'images') previous.images.push({ key: block.key, attachment: block.attachment });
    else segments.push({ key: block.key, type: 'images', images: [{ key: block.key, attachment: block.attachment }] });
  }
  return segments;
}

type Props = {
  blocks: NoteRenderBlock[];
  // Each surface keeps its own typography (chat bubble, card paper, sticky
  // handwriting…): it draws the words, this lays them out with the images.
  renderText: (text: string, key: string) => ReactNode;
  maxImageHeight?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  onImageLongPress?: (attachment: AttachmentLike) => void;
};

/**
 * The one renderer for a note's inline content, used wherever a whole note is
 * shown — Chat, Card Details, a Space's note sheet. Text and images keep the
 * order they were written in; consecutive images share rows of two (each at its
 * own proportions), within the width the note is given.
 */
export function NoteContentView({ blocks, renderText, maxImageHeight = 360, gap = spacing.sm, style, onImageLongPress }: Props) {
  const [width, setWidth] = useState(0);
  const segments = segmentsOf(blocks);
  const imageNumbers = new Map(blocks.filter((block) => block.type === 'image').map((block, index) => [block.key, index + 1]));
  const imageCount = imageNumbers.size;
  return <View style={[{ gap }, style]} onLayout={({ nativeEvent }) => { const next = Math.floor(nativeEvent.layout.width); setWidth((current) => current === next ? current : next); }}>
    {segments.map((segment) => {
      if (segment.type === 'text') return segment.marker
        ? <View key={segment.key} style={styles.listRow}><View style={styles.listMarker}>{renderText(segment.marker, `${segment.key}:marker`)}</View><View style={styles.listBody}>{renderText(segment.text, segment.key)}</View></View>
        : <View key={segment.key}>{renderText(segment.text, segment.key)}</View>;
      // Until the width is known, hold roughly the space the images will take.
      if (!width) return <View key={segment.key} style={{ height: Math.min(maxImageHeight, 160) }} />;
      return <View key={segment.key} style={styles.run}>
        {imageRows(segment.images.map((image) => image.attachment), width, IMAGE_GAP, maxImageHeight).map((row) => <View key={row.indexes.join('-')} style={styles.row}>
          {row.indexes.map((index, position) => {
            const { key, attachment } = segment.images[index];
            return <NoteImage key={key} image={attachment} attachment={attachment} width={row.widths[position]} height={row.height} accessibilityLabel={imageCount > 1 ? `Image ${imageNumbers.get(key)} of ${imageCount}` : 'Image'} onLongPress={onImageLongPress ? () => onImageLongPress(attachment) : undefined} />;
          })}
        </View>)}
      </View>;
    })}
  </View>;
}

const IMAGE_GAP = 4;

const styles = StyleSheet.create({
  listRow: { flexDirection: 'row', gap: 8 },
  listMarker: { minWidth: 26, alignItems: 'flex-end' },
  listBody: { flex: 1 },
  run: { gap: IMAGE_GAP },
  row: { flexDirection: 'row', gap: IMAGE_GAP },
});
