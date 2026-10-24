import { memo, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/components/theme-provider';
import { HEADER_SCENE_IDS, sceneLook, sceneMixAt, sceneSky, sceneTone } from '@/constants/header-scenes';
import { HEADER_SCENE_PANES, HEADER_SCENE_SIZE } from '@/constants/header-scenes.generated';
import { HEADER_SCENE_IMAGES } from '@/constants/theme-images';
import { useSceneMinute } from '@/hooks/use-scene-clock';
import { headerPhotoFrame, type HeaderPhoto } from '@/services/header-photo';

// Default's header: the room at this minute of the day. The two scenes either
// side of now crossfade (the lower one opaque, the upper at its weight), the
// window's sky drifts and twinkles, and a veil from sceneLook keeps the ink
// readable. Everything holds still under Reduce Motion.

type Frame = { width: number; height: number; left: number; top: number };

// All in picture pixels. Clouds sit in the upper panes; their x runs across
// the glass and wraps, their y is from the picture's top.
const GLASS_LEFT = HEADER_SCENE_PANES[0].x;
const GLASS_WIDTH = HEADER_SCENE_PANES[1].x + HEADER_SCENE_PANES[1].w - GLASS_LEFT;
const CLOUDS = [{ x: 18, y: 112, w: 116 }, { x: 196, y: 186, w: 84 }, { x: 292, y: 120, w: 132 }, { x: 120, y: 232, w: 70 }];
const STARS: [number, number][] = [
  [1226, 108], [1288, 146], [1352, 104], [1384, 196], [1246, 226], [1322, 256], [1442, 124], [1498, 182],
  [1596, 104], [1468, 250], [1600, 226], [1520, 112], [1262, 318], [1356, 340], [1440, 322], [1230, 170],
];
const MOON = { x: 1566, y: 148, r: 20 };
// Dust in the sunbeams across the wall.
const MOTES: [number, number][] = [[290, 190], [410, 330], [540, 140], [640, 420], [760, 250], [870, 380], [960, 180], [480, 460]];
const CLOUD_CROSSING_MS = 120_000;
const PULSE_MS = 12_000;

export const HeaderSceneLayer = memo(function HeaderSceneLayer({ photo }: { photo: HeaderPhoto }) {
  const { scheme } = useTheme();
  const minute = useSceneMinute();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const mix = sceneMixAt(minute);
  const look = sceneLook(mix, scheme);
  const frame = size.width > 0 ? headerPhotoFrame(photo, size.width, size.height) : null;
  const shown = HEADER_SCENE_IDS.filter((id) => mix[id]);
  return <View
    accessible={false}
    pointerEvents="none"
    style={[StyleSheet.absoluteFill, { overflow: 'hidden', backgroundColor: sceneTone(mix) }]}
    onLayout={({ nativeEvent: { layout } }) => setSize((old) => old.width === layout.width && old.height === layout.height ? old : { width: layout.width, height: layout.height })}
  >
    {/* The pictures need no measuring: cover-fit at the photo's focal point
        draws them in the header's very first frame, and the memory cache keeps
        them decoded for the next screen. Only the sky waits for the size. */}
    {shown.map((id, index) => <Image key={id} source={HEADER_SCENE_IMAGES[id]} contentFit="cover" contentPosition={{ left: `${photo.x * 100}%`, top: `${photo.y * 100}%` }} cachePolicy="memory" style={[StyleSheet.absoluteFill, { opacity: index ? mix[id] : 1 }]} />)}
    {frame ? <SceneSky frame={frame} sky={sceneSky(mix)} /> : null}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: look.veil.color, opacity: look.veil.opacity }]} />
  </View>;
});

function SceneSky({ frame, sky }: { frame: Frame; sky: ReturnType<typeof sceneSky> }) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);
  const pulse = useSharedValue(0);
  const clouds = sky.clouds > 0.01;
  const stars = sky.stars > 0.01;
  const motes = sky.motes > 0.01;
  useEffect(() => {
    if (!clouds || reduceMotion) return;
    drift.set(withRepeat(withTiming(1, { duration: CLOUD_CROSSING_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(drift);
  }, [clouds, reduceMotion, drift]);
  useEffect(() => {
    if (!(stars || motes) || reduceMotion) return;
    pulse.set(withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(pulse);
  }, [stars, motes, reduceMotion, pulse]);
  const scale = frame.width / HEADER_SCENE_SIZE.width;
  const at = (x: number, y: number, size: number) => ({ position: 'absolute' as const, left: frame.left + x * scale - size / 2, top: frame.top + y * scale - size / 2, width: size, height: size, borderRadius: size / 2 });
  const starSize = Math.max(2, 8 * scale);
  const moteSize = Math.max(1.5, 6 * scale);
  return <>
    {clouds ? <View needsOffscreenAlphaCompositing style={[StyleSheet.absoluteFill, { opacity: sky.clouds }]}>
      {HEADER_SCENE_PANES.slice(0, 2).map((pane) => <CloudPane key={pane.x} pane={pane} frame={frame} scale={scale} drift={drift} color={sky.cloudColor} />)}
    </View> : null}
    {stars ? <View style={[StyleSheet.absoluteFill, { opacity: sky.stars }]}>
      <View style={[at(MOON.x, MOON.y, MOON.r * 4 * scale), styles.moonHalo]} />
      <View style={[at(MOON.x, MOON.y, MOON.r * 2 * scale), styles.moon]} />
      {[0, 1, 2].map((group) => <Twinkle key={group} phase={group / 3} pulse={pulse}>
        {STARS.filter((_, index) => index % 3 === group).map(([x, y]) => <View key={`${x}-${y}`} style={[at(x, y, starSize), styles.star]} />)}
      </Twinkle>)}
    </View> : null}
    {motes ? <View style={[StyleSheet.absoluteFill, { opacity: sky.motes }]}>
      {MOTES.map(([x, y], index) => <Mote key={`${x}-${y}`} style={at(x, y, moteSize)} phase={(index * 3 % MOTES.length) / MOTES.length} pulse={pulse} scale={scale} />)}
    </View> : null}
  </>;
}

/** One upper pane of sky: a strip of clouds, three copies wide so it wraps seamlessly. */
function CloudPane({ pane, frame, scale, drift, color }: { pane: typeof HEADER_SCENE_PANES[number]; frame: Frame; scale: number; drift: SharedValue<number>; color: string }) {
  const strip = useAnimatedStyle(() => ({ transform: [{ translateX: -drift.get() * GLASS_WIDTH * scale }] }));
  return <View style={{ position: 'absolute', overflow: 'hidden', left: frame.left + pane.x * scale, top: frame.top + pane.y * scale, width: pane.w * scale, height: pane.h * scale }}>
    <Animated.View style={[{ position: 'absolute', left: (GLASS_LEFT - pane.x) * scale, top: -pane.y * scale }, strip]}>
      {[-1, 0, 1].flatMap((copy) => CLOUDS.map((cloud, index) => <Cloud key={`${copy}-${index}`} x={(cloud.x + copy * GLASS_WIDTH) * scale} y={cloud.y * scale} size={cloud.w * scale} color={color} />))}
    </Animated.View>
  </View>;
}

function Cloud({ x, y, size, color }: { x: number; y: number; size: number; color: string }) {
  const puff = (left: number, diameter: number) => ({ position: 'absolute' as const, left: size * left, top: size * (0.42 - diameter), width: size * diameter, height: size * diameter, borderRadius: size * diameter / 2, backgroundColor: color });
  return <View style={{ position: 'absolute', left: x, top: y, width: size, height: size * 0.42 }}>
    <View style={puff(0.12, 0.36)} />
    <View style={puff(0.36, 0.42)} />
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: size * 0.2, borderRadius: size * 0.1, backgroundColor: color }} />
  </View>;
}

function Twinkle({ phase, pulse, children }: { phase: number; pulse: SharedValue<number>; children: ReactNode }) {
  const twinkle = useAnimatedStyle(() => ({ opacity: 0.55 + 0.45 * Math.sin((pulse.get() * 3 + phase) * 2 * Math.PI) }));
  return <Animated.View style={[StyleSheet.absoluteFill, twinkle]}>{children}</Animated.View>;
}

/** A speck of dust that rises and sways through the light, fading in and out. */
function Mote({ style, phase, pulse, scale }: { style: object; phase: number; pulse: SharedValue<number>; scale: number }) {
  const float = useAnimatedStyle(() => {
    const p = (pulse.get() + phase) % 1;
    return { opacity: 0.8 * Math.sin(p * Math.PI), transform: [{ translateY: -p * 46 * scale }, { translateX: Math.sin(p * 2 * Math.PI) * 8 * scale }] };
  });
  return <Animated.View style={[style, styles.mote, float]} />;
}

const styles = StyleSheet.create({
  moon: { backgroundColor: '#FFF6DC' },
  moonHalo: { backgroundColor: '#FFF6DC', opacity: 0.18 },
  star: { backgroundColor: '#FFFBEA' },
  mote: { backgroundColor: '#FFFDF2' },
});
