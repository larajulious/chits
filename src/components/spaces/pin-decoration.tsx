import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SpaceId } from '@/constants/spaces';

type Props = {
  space: SpaceId;
  /** The magnet / pushpin / washi color (tape is always clear). */
  color: string;
  noteWidth: number;
  /** Scales with the note (previews, exports). */
  unit?: number;
  /** Tape tilts one way or the other, so neighbours don't match. */
  seed?: number;
};

/**
 * How a note is held on — drawn over its top edge, never read aloud:
 * a glossy magnet (fridge), a pushpin (cork), clear tape (desk) or striped
 * washi tape (wall).
 */
export const PinDecoration = memo(function PinDecoration({ space, color, noteWidth, unit = 1, seed = 0 }: Props) {
  const u = unit;
  const center = (width: number) => noteWidth / 2 - width / 2;
  const hidden = { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, pointerEvents: 'none' as const };
  switch (space) {
    case 'fridge': {
      const size = 22 * u;
      return <View {...hidden} style={[styles.abs, {
        left: center(size), top: -10 * u, width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        experimental_backgroundImage: 'radial-gradient(circle at 30% 26%, rgba(255,255,255,0.75) 0%, rgba(255,255,255,0.15) 34%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.28) 100%)',
        boxShadow: `0px ${2 * u}px ${3 * u}px rgba(0,0,0,0.38)`,
      }]} />;
    }
    case 'cork': {
      const size = 16 * u;
      return <View {...hidden} style={[styles.abs, {
        left: center(size), top: 6 * u, width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        experimental_backgroundImage: 'radial-gradient(circle at 32% 28%, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.1) 38%, rgba(0,0,0,0.25) 100%)',
        boxShadow: `${2.5 * u}px ${3 * u}px ${3 * u}px rgba(0,0,0,0.4)`,
      }]} />;
    }
    case 'desk': {
      const width = 60 * u;
      return <View {...hidden} style={[styles.abs, {
        left: center(width), top: -10 * u, width, height: 20 * u, borderRadius: 1.5 * u,
        backgroundColor: 'rgba(250,248,240,0.62)', boxShadow: `0px ${1 * u}px ${1.5 * u}px rgba(0,0,0,0.12)`,
        transform: [{ rotate: seed % 2 ? '3deg' : '-3deg' }],
      }]} />;
    }
    case 'wall': {
      const width = 64 * u;
      return <View {...hidden} style={[styles.abs, {
        left: center(width), top: -10 * u, width, height: 20 * u, backgroundColor: color, opacity: 0.85,
        experimental_backgroundImage: 'linear-gradient(135deg, rgba(255,255,255,0.38) 25%, rgba(255,255,255,0) 25%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.38) 50%, rgba(255,255,255,0.38) 75%, rgba(255,255,255,0) 75%)',
        experimental_backgroundSize: `${10 * u}px ${10 * u}px`,
        experimental_backgroundRepeat: 'repeat',
        transform: [{ rotate: seed % 2 ? '-4deg' : '3deg' }],
      }]} />;
    }
  }
});

const styles = StyleSheet.create({ abs: { position: 'absolute' } });
