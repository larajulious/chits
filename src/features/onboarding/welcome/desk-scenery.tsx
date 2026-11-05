import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';

import { DeskDots, PAPERS, useDesk } from '@/components/desk/paper-desk';
import { mix } from '@/constants/style-tokens';

const NOTE = { width: 74, height: 70 };
const BLUE_PAPER = PAPERS[3];

type Props = { width: number; height: number; top?: number; dark: boolean; /** False leaves just the dot grain. */ objects?: boolean };

/**
 * What else is on Chits' desk: a faint dot grain, one taped note and a paper
 * clip, all in the corner Chits leaves empty and kept quiet so Chits stays the
 * focus. Drawn once and never animated; the paper simply slides over it.
 */
export const DeskScenery = memo(function DeskScenery({ width, height, top = 0, dark, objects = true }: Props) {
  const desk = useDesk();
  const scale = Math.min(1.4, Math.max(0.9, width / 390));
  // Quieter than a real note. On the dark desk blue turns cold grey, so the note
  // takes the desk's own warmth there instead.
  const paper = dark ? mix(desk.desk, desk.ink, 0.2) : mix(BLUE_PAPER, desk.desk, 0.28);
  const line = mix(paper, desk.ink, 0.22);
  const clip = mix(desk.desk, desk.rim, dark ? 0.75 : 0.85);
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <DeskDots width={width} height={height} />
    <View style={StyleSheet.absoluteFill}><Svg width={width} height={height}>
      {/* Clear of the Back button, which sits in the very corner on later steps. */}
      {objects ? <G transform={`translate(${72 * scale} ${top + 18}) rotate(-7) scale(${scale})`}>
        <Rect x={-3} y={4} width={NOTE.width} height={NOTE.height} rx={2} fill={desk.shadow} />
        <Rect width={NOTE.width} height={NOTE.height} rx={2} fill={paper} />
        <Line x1={12} y1={26} x2={58} y2={26} stroke={line} strokeWidth={2.5} strokeLinecap="round" />
        <Line x1={12} y1={38} x2={46} y2={38} stroke={line} strokeWidth={2.5} strokeLinecap="round" />
        <Rect x={22} y={-7} width={30} height={13} fill="#FFFFFF" fillOpacity={dark ? 0.28 : 0.55} transform="rotate(4 37 0)" />
      </G> : null}
      {objects ? <G transform={`translate(${24 * scale} ${top + 122}) rotate(24) scale(${scale})`}>
        <Path d="M5 8 V31 a6.5 6.5 0 0 0 13 0 V6 a4.5 4.5 0 0 0 -9 0 V27 a2.2 2.2 0 0 0 4.4 0 V10" fill="none" stroke={clip} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      </G> : null}
    </Svg></View>
  </View>;
});
