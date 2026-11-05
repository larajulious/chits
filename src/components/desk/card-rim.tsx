import { memo } from 'react';
import Svg, { Circle } from 'react-native-svg';

import { mix } from '@/constants/style-tokens';

/** A round rim of layered card, stitched by hand: what Spin's wheel and Focus' timer sit in. Drawn once. */
export const CardRim = memo(function CardRim({ size, rim, fill }: { size: number; rim: string; /** What shows inside the rim. */ fill?: string }) {
  const edge = mix(rim, '#2B2620', 0.3);
  const lip = mix(rim, '#FFFFFF', 0.28);
  return <Svg width={size} height={size} viewBox="0 0 320 320">
    <Circle cx={160} cy={160} r={159} fill={rim} stroke={edge} strokeWidth={2} />
    <Circle cx={160} cy={160} r={156.5} fill="none" stroke={lip} strokeWidth={1.5} strokeOpacity={0.7} />
    <Circle cx={160} cy={160} r={152} fill="none" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={1.6} strokeDasharray="5 5" strokeLinecap="round" />
    <Circle cx={160} cy={160} r={147.5} fill={fill ?? edge} />
  </Svg>;
});
