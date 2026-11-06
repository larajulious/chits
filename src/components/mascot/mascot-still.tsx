import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { ART, ArmPart, BackPart, BodyPart, EyePart, SmilePart, TapePart } from '@/features/onboarding/welcome/mascot-art';
import { BANDANA_MARKUP } from './bandana-art';
import type { MascotVariant } from './mascot-variants';

export const BANDANA_BOX = { x: 180, y: 130, w: 1000, h: 490 };
export function BandanaPart({ unit }: { unit: number }) {
  return <SvgXml width={BANDANA_BOX.w * unit} height={BANDANA_BOX.h * unit} xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BANDANA_BOX.x} ${BANDANA_BOX.y} ${BANDANA_BOX.w} ${BANDANA_BOX.h}"><g transform="translate(640 610) rotate(-7)">${BANDANA_MARKUP}</g></svg>`} />;
}

/** Immediate, offline fallback, using the existing art parts without a redraw. */
export function MascotStill({ size, variant }: { size: number; variant: MascotVariant }) {
  const unit = size / 1250;
  const parts = [
    [ART.back, <BackPart unit={unit} key="back" />],
    [ART.arm, <ArmPart unit={unit} key="arm" />],
    [ART.body, <BodyPart unit={unit} key="body" />],
    ...(variant === 'chits-ong' ? [[BANDANA_BOX, <BandanaPart unit={unit} key="bandana" />]] as const : []),
    [ART.tape, <TapePart unit={unit} key="tape" />],
    [ART.eyeLeft, <EyePart unit={unit} side="left" key="left" />],
    [ART.eyeRight, <EyePart unit={unit} side="right" key="right" />],
    [ART.mouth, <SmilePart unit={unit} key="mouth" />],
  ] as const;
  return <View style={{ width: size, height: size }}>{parts.map(([box, part], index) => <View key={index} style={{ position: 'absolute', left: box.x * unit, top: box.y * unit }}>{part}</View>)}</View>;
}
