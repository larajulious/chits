import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { magnetLetters } from '@/constants/letter-magnets';
import type { SpaceId } from '@/constants/spaces';
import { MAGNET_COLORS } from '@/constants/spaces-theme';
import { useSpaceFonts } from './space-fonts';

// Deterministic scatter: the same grain and speckle on every render and in the share image.
const scatter = (index: number, salt: number) => {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
};
const hidden = { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, pointerEvents: 'none' as const };

/**
 * A space's surface, edge to edge. Placeholder gradients stand in for the
 * final textures (space_fridge… at @2x/@3x, 390×844 base); the small details
 * drawn on top — the fridge's seam and handle, the cork's frame — stay code.
 * `width` scales every detail, so a preview card or a 1080px export is the
 * same surface in miniature or large.
 */
export const SpaceSurface = memo(function SpaceSurface({ spaceId, width, height }: { spaceId: SpaceId; width: number; height: number }) {
  const s = width / 390;
  switch (spaceId) {
    case 'fridge':
      return <View {...hidden} style={[StyleSheet.absoluteFill, { backgroundColor: '#EEF0ED', experimental_backgroundImage: 'linear-gradient(90deg, #D7DAD6 0%, #F8F9F7 50%, #D7DAD6 100%)', overflow: 'hidden' }]}>
        {/* A soft vertical reflection band. */}
        <View style={[styles.abs, { top: 0, bottom: 0, left: width * 0.22, width: width * 0.2, experimental_backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0) 100%)' }]} />
        {/* The freezer seam. */}
        <View style={[styles.abs, { left: 0, right: 0, top: Math.round(height * 0.1), height: Math.max(1, 2 * s), backgroundColor: 'rgba(40,44,42,0.22)', boxShadow: `0px ${1 * s}px 0px rgba(255,255,255,0.8)` }]} />
        {/* The chrome handle on the right edge. */}
        <View style={[styles.abs, { right: 10 * s, top: height * 0.17, width: 11 * s, height: height * 0.24, borderRadius: 6 * s, experimental_backgroundImage: 'linear-gradient(90deg, #8F9498 0%, #F4F5F5 45%, #B9BEC1 70%, #7F8488 100%)', boxShadow: `${-2 * s}px ${3 * s}px ${6 * s}px rgba(0,0,0,0.28)` }]} />
      </View>;
    case 'desk': {
      const lines = Math.ceil(height / (11 * s));
      return <View {...hidden} style={[StyleSheet.absoluteFill, { backgroundColor: '#9A6636', experimental_backgroundImage: 'linear-gradient(160deg, #A8723F 0%, #8A5A2E 100%)', overflow: 'hidden' }]}>
        {Array.from({ length: lines }, (_, index) => <View key={index} style={[styles.abs, { left: -20, right: -20, top: index * 11 * s + scatter(index, 1) * 5 * s, height: Math.max(1, (0.8 + scatter(index, 2) * 1.8) * s), backgroundColor: index % 4 ? '#5C3818' : '#C48A52', opacity: 0.1 + scatter(index, 3) * 0.12, transform: [{ rotate: `${(scatter(index, 4) - 0.5) * 1.4}deg` }] }]} />)}
        {/* Dark inner vignette. */}
        <View style={[StyleSheet.absoluteFill, { boxShadow: `inset 0px 0px ${90 * s}px ${10 * s}px rgba(28,14,4,0.55)` }]} />
      </View>;
    }
    case 'cork': {
      const frame = 14 * s;
      const inner = { width: width - frame * 2, height: height - frame * 2 };
      const count = Math.min(520, Math.round((inner.width * inner.height) / (240 * s * s)));
      return <View {...hidden} style={[StyleSheet.absoluteFill, { backgroundColor: '#6E4F2F', experimental_backgroundImage: 'linear-gradient(135deg, #7C5A37 0%, #5F4226 100%)', padding: frame }]}>
        <View style={{ flex: 1, backgroundColor: '#C79764', overflow: 'hidden' }}>
          {Array.from({ length: count }, (_, index) => {
            const size = (1.2 + scatter(index, 5) * 2.6) * s;
            return <View key={index} style={[styles.abs, { left: scatter(index, 6) * inner.width, top: scatter(index, 7) * inner.height, width: size, height: size, borderRadius: size / 2, backgroundColor: index % 3 ? '#8A5E33' : '#E7C08D', opacity: 0.45 }]} />;
          })}
          {/* The frame's shadow falling onto the cork. */}
          <View style={[StyleSheet.absoluteFill, { boxShadow: `inset 0px ${3 * s}px ${12 * s}px rgba(0,0,0,0.5)` }]} />
        </View>
      </View>;
    }
    case 'wall':
      return <View {...hidden} style={[StyleSheet.absoluteFill, { backgroundColor: '#8FA897', overflow: 'hidden' }]}>
        {/* A soft light falling from near the top, and a light vignette. */}
        <View style={[StyleSheet.absoluteFill, { experimental_backgroundImage: 'radial-gradient(ellipse at 50% 14%, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 58%)' }]} />
        <View style={[StyleSheet.absoluteFill, { boxShadow: `inset 0px 0px ${70 * s}px rgba(30,45,36,0.3)` }]} />
      </View>;
  }
});

/**
 * Decorative alphabet magnets on the fridge door spelling the NoteSpace name
 * (see magnetLetters for how a name is fitted). Each letter a different
 * magnet, at its own angle. Never read aloud or touchable.
 */
export const LetterMagnets = memo(function LetterMagnets({ name, maxWidth }: { name: string; maxWidth: number }) {
  const fonts = useSpaceFonts();
  const { glyphs, size } = magnetLetters(name, maxWidth);
  return <View {...hidden} style={styles.letters}>
    {glyphs.map((glyph, index) => (glyph.gap
      ? <View key={index} style={{ width: size * 0.36 }} />
      : <Text key={index} style={[fonts.letters, {
        fontSize: size, lineHeight: size * 1.1, color: MAGNET_COLORS[glyph.colorIndex % MAGNET_COLORS.length], marginRight: size * 0.06,
        textShadowColor: 'rgba(0,0,0,0.32)', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0,
        transform: [{ rotate: `${glyph.rotation}deg` }, { translateY: index % 2 ? size * 0.06 : 0 }],
      }]}>{glyph.char}</Text>))}
  </View>;
});

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  letters: { flexDirection: 'row', alignItems: 'flex-end' },
});
