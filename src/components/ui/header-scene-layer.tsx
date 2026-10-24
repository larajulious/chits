import { memo, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/components/theme-provider';
import { HEADER_SCENE_IDS, HEADER_SCENE_SUN_RADIUS, sceneLook, sceneMixAt, sceneSky, sceneTone, sunAt } from '@/constants/header-scenes';
import { HEADER_SCENE_PANES, HEADER_SCENE_SIZE, HEADER_SCENE_SKY } from '@/constants/header-scenes.generated';
import { HEADER_SCENE_IMAGES } from '@/constants/theme-images';
import { useSceneMinute } from '@/hooks/use-scene-clock';
import { headerPhotoFrame, type HeaderPhoto } from '@/services/header-photo';

// Default's header: the room at this minute of the day. The two scenes either
// side of now crossfade (the lower one opaque, the upper at its weight), the
// window's sky lives (the sun crosses it with the clock, clouds drift, birds
// fly by day, stars twinkle and fall by night), and a veil from sceneLook
// keeps the ink readable. Everything holds still under Reduce Motion.

type Frame = { width: number; height: number; left: number; top: number };

// All in picture pixels. Clouds sit in the upper panes; their x runs across
// the glass and wraps, their y is from the picture's top. Each crosses `laps`
// times a drift loop, so the big near ones overtake the small far ones.
const GLASS_LEFT = HEADER_SCENE_PANES[0].x;
const GLASS_WIDTH = HEADER_SCENE_PANES[1].x + HEADER_SCENE_PANES[1].w - GLASS_LEFT;
const CLOUDS = [{ x: 18, y: 112, w: 116, laps: 5 }, { x: 196, y: 186, w: 84, laps: 4 }, { x: 292, y: 120, w: 132, laps: 6 }, { x: 120, y: 232, w: 70, laps: 3 }];
const STARS: [number, number][] = [
  [1226, 108], [1288, 146], [1352, 104], [1384, 196], [1246, 226], [1322, 256], [1442, 124], [1498, 182],
  [1596, 104], [1468, 250], [1600, 226], [1520, 112], [1262, 318], [1356, 340], [1440, 322], [1230, 170],
];
const MOON = { x: 1566, y: 148, r: 20 };
// Dust in the sunbeams across the wall.
const MOTES: [number, number][] = [[290, 190], [410, 330], [540, 140], [640, 420], [760, 250], [870, 380], [960, 180], [480, 460]];
// A small flock that crosses the upper panes now and then, each bird
// offset from the leader, and the night's shooting stars (start and fall).
const BIRDS = [{ dx: 0, dy: 0, size: 26 }, { dx: -34, dy: 16, size: 20 }, { dx: -58, dy: -10, size: 22 }];
const FLOCK_Y = 168;
const METEORS = [{ x: 1580, y: 104, at: 0 }, { x: 1360, y: 120, at: 0.55 }];
const METEOR_FALL = { x: -150, y: 75 };
/** One drift loop; a cloud crosses the window in this over its laps (40–80 s). */
const CLOUD_DRIFT_MS = 240_000;
const PULSE_MS = 12_000;
const FLIGHT_MS = 30_000;
/** The share of a flight loop the flock spends crossing; the rest the sky is empty. */
const CROSSING = 0.4;
const WINGBEATS = 70;
const METEOR_MS = 16_000;
/** The share of a meteor loop each one is lit. */
const STREAK = 0.05;
const UPPER_PANES = HEADER_SCENE_PANES.slice(0, 2);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

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
    {frame ? <SceneSky frame={frame} sky={sceneSky(mix)} sun={sunAt(minute)} /> : null}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: look.veil.color, opacity: look.veil.opacity }]} />
  </View>;
});

function SceneSky({ frame, sky, sun }: { frame: Frame; sky: ReturnType<typeof sceneSky>; sun: ReturnType<typeof sunAt> }) {
  const reduceMotion = useReducedMotion();
  const drift = useSharedValue(0);
  const pulse = useSharedValue(0);
  const flight = useSharedValue(0);
  const fall = useSharedValue(0);
  const clouds = sky.clouds > 0.01;
  const stars = sky.stars > 0.01;
  const motes = sky.motes > 0.01;
  // Birds and meteors only exist in motion, so Reduce Motion leaves them out.
  const birds = sky.birds > 0.01 && !reduceMotion;
  const meteors = sky.meteors > 0.01 && !reduceMotion;
  useEffect(() => {
    if (!clouds || reduceMotion) return;
    drift.set(withRepeat(withTiming(1, { duration: CLOUD_DRIFT_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(drift);
  }, [clouds, reduceMotion, drift]);
  useEffect(() => {
    if (!(stars || motes) || reduceMotion) return;
    pulse.set(withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(pulse);
  }, [stars, motes, reduceMotion, pulse]);
  useEffect(() => {
    if (!birds) return;
    flight.set(withRepeat(withTiming(1, { duration: FLIGHT_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(flight);
  }, [birds, flight]);
  useEffect(() => {
    if (!meteors) return;
    fall.set(withRepeat(withTiming(1, { duration: METEOR_MS, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(fall);
  }, [meteors, fall]);
  const scale = frame.width / HEADER_SCENE_SIZE.width;
  const at = (x: number, y: number, size: number) => ({ position: 'absolute' as const, left: frame.left + x * scale - size / 2, top: frame.top + y * scale - size / 2, width: size, height: size, borderRadius: size / 2 });
  const starSize = Math.max(2, 8 * scale);
  const moteSize = Math.max(1.5, 6 * scale);
  return <>
    {sun ? <Sun frame={frame} at={sun} color={sky.sunColor} pulse={pulse} /> : null}
    {clouds ? <View needsOffscreenAlphaCompositing style={[StyleSheet.absoluteFill, { opacity: sky.clouds }]}>
      {UPPER_PANES.map((pane) => <Glass key={pane.x} pane={pane} frame={frame} scale={scale}>
        {CLOUDS.map((cloud) => <Cloud key={cloud.x} {...cloud} scale={scale} drift={drift} color={sky.cloudColor} />)}
      </Glass>)}
    </View> : null}
    {birds ? <View style={[StyleSheet.absoluteFill, { opacity: sky.birds }]}>
      {UPPER_PANES.map((pane) => <Glass key={pane.x} pane={pane} frame={frame} scale={scale}>
        {BIRDS.map((bird, index) => <Bird key={index} {...bird} index={index} scale={scale} flight={flight} />)}
      </Glass>)}
    </View> : null}
    {meteors ? <View style={[StyleSheet.absoluteFill, { opacity: sky.meteors }]}>
      {UPPER_PANES.map((pane) => <Glass key={pane.x} pane={pane} frame={frame} scale={scale}>
        {METEORS.map((meteor) => <Meteor key={meteor.x} {...meteor} scale={scale} fall={fall} />)}
      </Glass>)}
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


/** One pane of glass: its children are laid out in picture pixels (times scale) and show only through the pane. */
function Glass({ pane, frame, scale, children }: { pane: typeof HEADER_SCENE_PANES[number]; frame: Frame; scale: number; children: ReactNode }) {
  return <View style={{ position: 'absolute', overflow: 'hidden', left: frame.left + pane.x * scale, top: frame.top + pane.y * scale, width: pane.w * scale, height: pane.h * scale }}>
    <View style={{ position: 'absolute', left: -pane.x * scale, top: -pane.y * scale, width: frame.width, height: frame.height }}>{children}</View>
  </View>;
}

/** The sun where the clock puts it, behind the mullions and the hills, its glow slowly breathing. */
function Sun({ frame, at, color, pulse }: { frame: Frame; at: { x: number; y: number }; color: string; pulse: SharedValue<number> }) {
  const glow = useAnimatedProps(() => ({ opacity: 0.75 + 0.25 * Math.sin(pulse.get() * 4 * Math.PI) }));
  const { width, height } = HEADER_SCENE_SIZE;
  return <View style={{ position: 'absolute', left: frame.left, top: frame.top }}><Svg width={frame.width} height={frame.height} viewBox={`0 0 ${width} ${height}`}>
    <ClipPath id="scenePanes">{HEADER_SCENE_PANES.map((pane) => <Rect key={`${pane.x}-${pane.y}`} x={pane.x} y={pane.y} width={pane.w} height={pane.h} />)}</ClipPath>
    <ClipPath id="sceneSky"><Path d={HEADER_SCENE_SKY} /></ClipPath>
    <RadialGradient id="sunGlow">
      <Stop offset="0.25" stopColor={color} stopOpacity={0.7} />
      <Stop offset="1" stopColor={color} stopOpacity={0} />
    </RadialGradient>
    <G clipPath="url(#scenePanes)">
      <G clipPath="url(#sceneSky)">
        <AnimatedCircle cx={at.x} cy={at.y} r={HEADER_SCENE_SUN_RADIUS * 4} fill="url(#sunGlow)" animatedProps={glow} />
        <Circle cx={at.x} cy={at.y} r={HEADER_SCENE_SUN_RADIUS} fill={color} />
      </G>
    </G>
  </Svg></View>;
}

/** A gull's "m" that crosses with the flock, beating its wings by squashing and flipping. */
function Bird({ dx, dy, size, index, scale, flight }: { dx: number; dy: number; size: number; index: number; scale: number; flight: SharedValue<number> }) {
  const fly = useAnimatedStyle(() => {
    const p = flight.get();
    if (p >= CROSSING) return { opacity: 0 };
    const across = p / CROSSING;
    const x = GLASS_LEFT - 90 + across * (GLASS_WIDTH + 180) + dx;
    const y = FLOCK_Y + dy + Math.sin(across * 2 * Math.PI + index) * 8;
    const beat = Math.sin((p * WINGBEATS + index * 0.3) * 2 * Math.PI);
    return { opacity: 1, transform: [{ translateX: x * scale }, { translateY: y * scale }, { scaleY: 0.3 + 0.7 * beat }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: -size * scale / 2, top: -size * scale / 4, width: size * scale, height: size * scale / 2 }, fly]}>
    <Svg width="100%" height="100%" viewBox="0 0 24 12">
      <Path d="M1.5 9 Q6.5 2 12 8.5 Q17.5 2 22.5 9" stroke="#3F3B46" strokeOpacity={0.75} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  </Animated.View>;
}

/** A shooting star: a bright head with a fading tail, lit for a moment once a loop. */
function Meteor({ x, y, at, scale, fall }: { x: number; y: number; at: number; scale: number; fall: SharedValue<number> }) {
  const length = 90 * scale;
  const angle = `${Math.atan2(-METEOR_FALL.y, -METEOR_FALL.x) * 180 / Math.PI}deg`;
  const streak = useAnimatedStyle(() => {
    const q = (fall.get() - at + 1) % 1;
    if (q >= STREAK) return { opacity: 0 };
    const t = q / STREAK;
    return { opacity: Math.sin(t * Math.PI), transform: [{ translateX: (x + METEOR_FALL.x * t) * scale }, { translateY: (y + METEOR_FALL.y * t) * scale }, { rotate: angle }] };
  });
  return <Animated.View style={[{ position: 'absolute', left: 0, top: -scale, width: length, height: 2 * scale, transformOrigin: 'left center' }, streak]}>
    <View style={[styles.tail, { width: length, height: 2 * scale, borderRadius: scale, opacity: 0.25 }]} />
    <View style={[styles.tail, { width: length * 0.45, height: 2 * scale, borderRadius: scale, opacity: 0.5 }]} />
    <View style={[styles.tail, { width: 3 * scale, height: 3 * scale, top: -scale / 2, borderRadius: 1.5 * scale }]} />
  </Animated.View>;
}

/** A cloud drifting right to left: it leaves the glass whole before coming back in on the other side. */
function Cloud({ x, y, w, laps, scale, drift, color }: { x: number; y: number; w: number; laps: number; scale: number; drift: SharedValue<number>; color: string }) {
  const size = w * scale;
  const span = GLASS_WIDTH + w;
  const float = useAnimatedStyle(() => {
    const along = (((x + w - drift.get() * laps * span) % span) + span) % span;
    return { transform: [{ translateX: (GLASS_LEFT - w + along) * scale }] };
  });
  const puff = (left: number, diameter: number) => ({ position: 'absolute' as const, left: size * left, top: size * (0.42 - diameter), width: size * diameter, height: size * diameter, borderRadius: size * diameter / 2, backgroundColor: color });
  return <Animated.View style={[{ position: 'absolute', left: 0, top: y * scale, width: size, height: size * 0.42 }, float]}>
    <View style={puff(0.12, 0.36)} />
    <View style={puff(0.36, 0.42)} />
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: size * 0.2, borderRadius: size * 0.1, backgroundColor: color }} />
  </Animated.View>;
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
  tail: { position: 'absolute', left: 0, top: 0, backgroundColor: '#FFFBEA' },
});
