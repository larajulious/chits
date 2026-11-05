import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { Icon } from '@/components/ui/icon';
import { mix } from '@/constants/style-tokens';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import type { CanvasRect } from '@/services/note-canvas';
import type { CanvasCameraApi } from './use-canvas-camera';

const MAP_WIDTH = 112;
const MAP_HEIGHT = 84;
const PADDING = 7;
/** The viewport box is a fixed size and only ever scaled, so moving it never costs a layout. */
const BOX = 100;
const EDGE_SLIVER = 7;

export type MiniMapNote = CanvasRect & { fill: string };

/** Note rectangles drawn once per change of notes; only the viewport box moves with the camera. */
export const NotesMiniMap = memo(function NotesMiniMap({ notes, bounds, camera, paper, onJump, onFit }: { notes: MiniMapNote[]; bounds: CanvasRect; camera: CanvasCameraApi; paper: string; onJump: (x: number, y: number) => void; onFit: () => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const desk = useDesk();
  const { styleTokens } = useTheme();
  const map = useMemo(() => {
    const scale = Math.min((MAP_WIDTH - PADDING * 2) / Math.max(1, bounds.width), (MAP_HEIGHT - PADDING * 2) / Math.max(1, bounds.height));
    return { scale, left: (MAP_WIDTH - bounds.width * scale) / 2 - bounds.x * scale, top: (MAP_HEIGHT - bounds.height * scale) / 2 - bounds.y * scale };
  }, [bounds]);
  const viewport = useAnimatedStyle(() => {
    const zoom = camera.zoom.get();
    const width = camera.width.get() / zoom * map.scale;
    const height = camera.height.get() / zoom * map.scale;
    // Off past the notes, it stays on the map's edge to show which way they are.
    return { transform: [
      { translateX: Math.max(EDGE_SLIVER - width, Math.min(MAP_WIDTH - EDGE_SLIVER, -camera.x.get() / zoom * map.scale + map.left)) },
      { translateY: Math.max(EDGE_SLIVER - height, Math.min(MAP_HEIGHT - EDGE_SLIVER, -camera.y.get() / zoom * map.scale + map.top)) },
      { scaleX: width / BOX },
      { scaleY: height / BOX },
    ] };
  });
  // One path per color, not one shape per note: a native node each would make a
  // big board's first commit long enough to race the animations running beside it.
  const blocks = useMemo(() => {
    const byFill = new Map<string, string[]>();
    for (const note of notes) {
      const left = (note.x * map.scale + map.left).toFixed(1);
      const top = (note.y * map.scale + map.top).toFixed(1);
      const shape = `M${left} ${top}h${Math.max(2, note.width * map.scale).toFixed(1)}v${Math.max(2, note.height * map.scale).toFixed(1)}h-${Math.max(2, note.width * map.scale).toFixed(1)}z`;
      const group = byFill.get(note.fill);
      if (group) group.push(shape); else byFill.set(note.fill, [shape]);
    }
    return [...byFill].map(([fill, shapes]) => <Path key={fill} d={shapes.join('')} fill={mix(fill, paper, 0.25)} />);
  }, [map, notes, paper]);
  return <View style={[styles.map, { backgroundColor: paper, borderRadius: styleTokens.button.radius, boxShadow: `0px 3px 10px ${desk.shadow}` }]}>
    <Pressable accessibilityRole="adjustable" accessibilityLabel={tr('notesCanvas.map')} onPress={({ nativeEvent }) => onJump((nativeEvent.locationX - map.left) / map.scale, (nativeEvent.locationY - map.top) / map.scale)} style={StyleSheet.absoluteFill}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width={MAP_WIDTH} height={MAP_HEIGHT}>{blocks}</Svg>
        <Animated.View style={[styles.viewport, { backgroundColor: desk.ink }, viewport]} />
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={tr('notesCanvas.fitAll')} hitSlop={8} onPress={onFit} style={({ pressed }) => [styles.fit, { backgroundColor: paper }, pressed && styles.pressed]}>
      <Icon name="scan-outline" size={14} color={desk.inkMuted} />
    </Pressable>
  </View>;
});

const styles = StyleSheet.create({
  map: { position: 'absolute', top: 10, right: 12, width: MAP_WIDTH, height: MAP_HEIGHT, overflow: 'hidden' },
  viewport: { position: 'absolute', left: 0, top: 0, width: BOX, height: BOX, opacity: 0.14, transformOrigin: [0, 0, 0] },
  fit: { position: 'absolute', right: 3, bottom: 3, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.55 },
});
