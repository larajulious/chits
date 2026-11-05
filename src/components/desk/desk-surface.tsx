import { memo } from 'react';
import Svg, { Circle, Pattern, Rect } from 'react-native-svg';

import { useTheme } from '@/components/theme-provider';

// The desk itself: its colors and its dot grain. Kept apart from the paper kit
// so the app's header, which the kit is built on, can be drawn from it too.

const DESKS = {
  light: { desk: '#EADFCB', dot: '#785A32', dotOpacity: 0.16, rule: 'rgba(43,38,32,0.14)', ink: '#2B2620', inkMuted: '#5E5444', danger: '#9E2B25', rim: '#C9A27A', shadow: 'rgba(80,60,30,0.2)' },
  dark: { desk: '#221E18', dot: '#FFF0D2', dotOpacity: 0.08, rule: 'rgba(241,233,218,0.14)', ink: '#F1E9DA', inkMuted: '#C9BEAA', danger: '#F19A90', rim: '#8A6A48', shadow: 'rgba(0,0,0,0.45)' },
};
export function useDesk() {
  return DESKS[useTheme().scheme];
}

export const DOT_SPACING = 20;

/** The desk's dot grain, as one pattern: an image set to repeat doesn't tile reliably. Drawn once. */
export const DeskDots = memo(function DeskDots({ width = '100%', height = '100%', faint = false }: { width?: number | `${number}%`; height?: number | `${number}%`; /** For a desk behind things to read. */ faint?: boolean }) {
  const desk = useDesk();
  return <Svg pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" width={width} height={height}>
    <Pattern id="deskDots" width={DOT_SPACING} height={DOT_SPACING} patternUnits="userSpaceOnUse">
      <Circle cx={DOT_SPACING / 2} cy={DOT_SPACING / 2} r={1.1} fill={desk.dot} fillOpacity={desk.dotOpacity * (faint ? 0.8 : 1.5)} />
    </Pattern>
    <Rect width="100%" height="100%" fill="url(#deskDots)" />
  </Svg>;
});
