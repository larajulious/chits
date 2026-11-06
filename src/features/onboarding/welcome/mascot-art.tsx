import { memo, type ReactNode } from 'react';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

// assets/images/chits-mascot-animated.svg, split into the parts that move. The
// shapes and colors are the same as that file; only the surprised mouth, the
// happy eyes and the stronger blush are additions, for the expressions.
//
// Each part is its own small canvas, drawn once. Motion is a transform on the
// view holding it, so nothing is redrawn while Chits moves.

export type ArtBox = { x: number; y: number; w: number; h: number };

export const ART = {
  ground: { x: 360, y: 1100, w: 580, h: 100 },
  farArm: { x: 980, y: 480, w: 240, h: 260 },
  back: { x: 390, y: 480, w: 830, h: 700 },
  arm: { x: 95, y: 685, w: 215, h: 260 },
  body: { x: 180, y: 130, w: 870, h: 930 },
  tape: { x: 450, y: 130, w: 360, h: 210 },
  blush: { x: 330, y: 540, w: 650, h: 240 },
  eyeLeft: { x: 396, y: 496, w: 140, h: 170 },
  eyeRight: { x: 748, y: 450, w: 140, h: 170 },
  mouth: { x: 540, y: 560, w: 200, h: 130 },
} as const satisfies Record<string, ArtBox>;

/** The left arm turns at the shoulder; the tape flutters from its lower edge. */
export const PIVOT = { shoulder: { x: 240, y: 745 }, tape: { x: 640, y: 300 } } as const;

const INK = '#1C1B1F';
const WARM_EDGE = '#E9D7A5';
const BODY_TRANSFORM = 'translate(640 610) rotate(-7)';

function Canvas({ box, unit, children }: { box: ArtBox; unit: number; children: ReactNode }) {
  return <Svg width={box.w * unit} height={box.h * unit} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>{children}</Svg>;
}
const Tilted = ({ children }: { children: ReactNode }) => <G transform={BODY_TRANSFORM}>{children}</G>;

type PartProps = { unit: number };

export const GroundShadowPart = memo(function GroundShadowPart({ unit }: PartProps) {
  return <Canvas box={ART.ground} unit={unit}><Ellipse cx="650" cy="1150" rx="260" ry="28" fill="#000" opacity={0.18} /></Canvas>;
});

/** The legs and far arm: behind the body, and they don't move. */
export const BackPart = memo(function BackPart({ unit, includeFarArm = true }: PartProps & { includeFarArm?: boolean }) {
  return <Canvas box={ART.back} unit={unit}>
    <G fill={INK} stroke={INK} strokeLinecap="round">
      <Line x1="530" y1="960" x2="495" y2="1080" stroke={WARM_EDGE} strokeWidth="92" />
      <Line x1="530" y1="960" x2="495" y2="1080" strokeWidth="44" />
      <Ellipse cx="490" cy="1095" rx="90" ry="64" fill={WARM_EDGE} stroke="none" />
      <Ellipse cx="490" cy="1095" rx="66" ry="40" />
      <Line x1="745" y1="950" x2="785" y2="1060" stroke={WARM_EDGE} strokeWidth="92" />
      <Line x1="745" y1="950" x2="785" y2="1060" strokeWidth="44" />
      <Ellipse cx="822" cy="1074" rx="96" ry="64" transform="rotate(-8 822 1074)" fill={WARM_EDGE} stroke="none" />
      <Ellipse cx="822" cy="1074" rx="72" ry="40" transform="rotate(-8 822 1074)" />
    </G>
    {includeFarArm ? <FarArmShape /> : null}
  </Canvas>;
});

const FarArmShape = () => <G fill="none" stroke={INK} strokeLinecap="round" strokeWidth="46">
      <Path d="M1040 690 Q1105 660 1128 585" stroke={WARM_EDGE} strokeWidth="94" />
      <Path d="M1040 690 Q1105 660 1128 585" />
      <Circle cx="1140" cy="560" r="66" fill={WARM_EDGE} stroke="none" />
      <Circle cx="1140" cy="560" r="42" fill={INK} stroke="none" />
    </G>;

export const FarArmPart = memo(function FarArmPart({ unit }: PartProps) {
  return <Canvas box={ART.farArm} unit={unit}><FarArmShape /></Canvas>;
});

const ArmShape = () => <G fill="none" stroke={INK} strokeLinecap="round" strokeWidth="46">
  <Path d="M250 740 Q175 780 160 860" stroke={WARM_EDGE} strokeWidth="94" />
  <Path d="M250 740 Q175 780 160 860" />
  <Circle cx="166" cy="875" r="64" fill={WARM_EDGE} stroke="none" />
  <Circle cx="166" cy="875" r="40" fill={INK} stroke="none" />
</G>;

/** The arm nearest the middle of the screen: the one Chits waves. */
export const ArmPart = memo(function ArmPart({ unit }: PartProps) {
  return <Canvas box={ART.arm} unit={unit}><ArmShape /></Canvas>;
});

/** The body's outline, flat, for the shadow Chits casts on the desk. */
export const CastShadowPart = memo(function CastShadowPart({ unit, color }: PartProps & { color: string }) {
  return <Canvas box={ART.body} unit={unit}>
    <Tilted><Path d="M-410 -280 Q-410 -345 -345 -345 L320 -345 Q380 -345 380 -285 L380 190 Q330 350 160 390 L-345 390 Q-405 390 -405 330 Z" fill={color} /></Tilted>
  </Canvas>;
});

export const BodyPart = memo(function BodyPart({ unit }: PartProps) {
  return <Canvas box={ART.body} unit={unit}>
    <Tilted>
      <Path d="M-410 -280 Q-410 -345 -345 -345 L320 -345 Q380 -345 380 -285 L380 190 Q330 350 160 390 L-345 390 Q-405 390 -405 330 Z" fill="#F5C048" />
      <Path d="M-380 -305 Q-380 -365 -320 -365 L320 -365 Q380 -365 380 -305 L380 165 Q330 330 170 365 L-320 365 Q-380 365 -380 305 Z" fill="#FBE482" />
      <Path d="M380 165 Q300 185 270 230 Q255 310 170 365 Q340 345 380 165 Z" fill="#F9C94C" />
      <Circle cx="-250" cy="55" r="48" fill="#F9AC85" />
      <Circle cx="268" cy="38" r="48" fill="#F9AC85" />
    </Tilted>
  </Canvas>;
});

export const TapePart = memo(function TapePart({ unit }: PartProps) {
  return <Canvas box={ART.tape} unit={unit}>
    <Tilted>
      <Rect x="-120" y="-395" width="270" height="105" rx="10" fill="#FCD96A" opacity={0.8} />
      <Rect x="-112" y="-440" width="270" height="130" rx="14" fill="#EDB23A" />
      <Rect x="-105" y="-448" width="262" height="124" rx="14" fill="#FBC94E" />
    </Tilted>
  </Canvas>;
});

export const BlushPart = memo(function BlushPart({ unit }: PartProps) {
  return <Canvas box={ART.blush} unit={unit}>
    <Tilted>
      <Circle cx="-250" cy="55" r="54" fill="#F58F6B" />
      <Circle cx="268" cy="38" r="54" fill="#F58F6B" />
    </Tilted>
  </Canvas>;
});

export const EyePart = memo(function EyePart({ side, unit }: PartProps & { side: 'left' | 'right' }) {
  const left = side === 'left';
  return <Canvas box={left ? ART.eyeLeft : ART.eyeRight} unit={unit}>
    <Tilted><Ellipse cx={left ? -170 : 185} cy={left ? -45 : -48} rx="38" ry="55" fill={INK} /></Tilted>
  </Canvas>;
});

export const HappyEyePart = memo(function HappyEyePart({ side, unit }: PartProps & { side: 'left' | 'right' }) {
  const left = side === 'left';
  return <Canvas box={left ? ART.eyeLeft : ART.eyeRight} unit={unit}>
    <Tilted><Path d={left ? 'M-218 -30 Q-170 -96 -122 -30' : 'M137 -33 Q185 -99 233 -33'} fill="none" stroke={INK} strokeWidth="26" strokeLinecap="round" /></Tilted>
  </Canvas>;
});

export const SmilePart = memo(function SmilePart({ unit }: PartProps) {
  return <Canvas box={ART.mouth} unit={unit}>
    <Tilted><Path d="M-65 -8 C-55 55 65 55 75 -14" fill="none" stroke={INK} strokeWidth="36" strokeLinecap="round" /></Tilted>
  </Canvas>;
});

/** A small, soft mouth for sleeping, about half the size of the surprised one. */
export const SleepingMouthPart = memo(function SleepingMouthPart({ unit }: PartProps) {
  return <Canvas box={ART.mouth} unit={unit}>
    <Tilted><Ellipse cx="5" cy="20" rx="15" ry="17" fill={INK} /></Tilted>
  </Canvas>;
});

export const SurprisedMouthPart = memo(function SurprisedMouthPart({ unit }: PartProps) {
  return <Canvas box={ART.mouth} unit={unit}>
    <Tilted><Ellipse cx="5" cy="18" rx="30" ry="36" fill={INK} /></Tilted>
  </Canvas>;
});
