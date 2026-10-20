import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Text as SvgText, TSpan } from 'react-native-svg';
import { useTheme } from '@/components/theme-provider';
import { mix } from '@/constants/style-tokens';
import { tr } from '@/localization/runtime';

export function SpinWheel({ size, rotation, categories, spinning, labels }: { size: number; rotation: Animated.Value; categories: string[]; spinning: boolean; labels?: string[] }) {
  const { tokens, scheme } = useTheme();
  const count = Math.max(1, categories.length);
  const pointerWidth = Math.max(5,Math.min(11,size*0.035));
  const pointerHeight = Math.max(10,Math.min(24,size*0.075));
  const point = (angle: number, radius = 143) => { const a = (angle - 90) * Math.PI / 180; return `${160 + radius * Math.cos(a)},${160 + radius * Math.sin(a)}`; };
  const fills = [tokens.accentSoft, tokens.surfaceElevated, tokens.cardPaper, tokens.accentSoft, tokens.surface, tokens.cardBase];
  return <View accessible accessibilityRole="image" accessibilityLabel={labels?.length ? `${tr(spinning ? 'spin.spinning' : 'spin.wheel')}. ${labels.join(', ')}` : tr(spinning ? 'spin.spinning' : 'spin.wheel')} style={{ width: size, height: size, alignSelf: 'center' }}>
    <Animated.View style={{ transform: [{ rotate: rotation.interpolate({ inputRange: [0,360], outputRange: ['0deg','360deg'] }) }] }}>
      <Svg width={size} height={size} viewBox="0 0 320 320">
        <Circle cx="160" cy="160" r="154" fill={tokens.surface} stroke={tokens.borderSubtle} strokeWidth="2" />
        {Array.from({ length: count }, (_, i) => {
          const half = 180 / count; const center = i * 360 / count;
          const [x,y] = point(center, 98).split(',').map(Number);
          const fill = mix(fills[i % fills.length], tokens.accent, scheme === 'dark' ? 0.18 + i * 0.025 : 0.04 + i * 0.025);
          return <ViewlessSegment key={i} path={count === 1 ? undefined : `M160,160 L${point(center-half)} A143,143 0 ${count === 1 ? 1 : 0},1 ${point(center+half)} Z`} fill={fill} stroke={tokens.surface} x={x} y={y} label={categories.length ? String(i+1) : '—'} fontSize={count > 16 ? 12 : count > 10 ? 16 : 23} ink={tokens.textPrimary} customLabel={labels?.[i]} count={count} angle={center} />;
        })}
        <Circle cx="160" cy="160" r="42" fill={tokens.surface} stroke={tokens.borderSubtle} strokeWidth="1" />
        <SvgText x="160" y="167" textAnchor="middle" fill={tokens.accentStrong} fontSize="17" fontWeight="700">Chits</SvgText>
      </Svg>
    </Animated.View>
    <View style={[styles.pointer, { borderTopColor: tokens.accentStrong, left: size/2-pointerWidth, borderLeftWidth: pointerWidth, borderRightWidth: pointerWidth, borderTopWidth: pointerHeight }]} />
  </View>;
}
function ViewlessSegment({ path, fill, stroke, x, y, label, ink, fontSize, customLabel, count, angle }: { path?: string; fill: string; stroke: string; x: number; y: number; label: string; ink: string; fontSize: number; customLabel?: string; count: number; angle: number }) {
  const textSize = count > 12 ? 9 : count > 6 ? 11 : 12;
  const lineHeight = textSize + 2;
  const lines = customLabel === undefined ? [] : fitWheelLabel(customLabel, textSize, count > 12 ? 1 : count > 6 ? 2 : 3);
  // Rotate text along each slice's radius, flipping the left half to keep it readable.
  const textAngle = count === 1 ? 0 : angle > 180 ? angle + 90 : angle - 90;
  return <>{path ? <Path d={path} fill={fill} stroke={stroke} strokeWidth="3" /> : <Circle cx="160" cy="160" r="143" fill={fill} />}
    {customLabel === undefined ? <SvgText x={x} y={y+7} textAnchor="middle" fill={ink} fontSize={fontSize} fontWeight="600">{label}</SvgText>
      : <G transform={`rotate(${textAngle} ${x} ${y})`}>
        <SvgText x={x} y={y-(lines.length-1)*lineHeight/2+textSize*0.35} textAnchor="middle" fill={ink} fontSize={textSize} fontWeight="600">
          {lines.map((line,index) => <TSpan key={index} x={x} dy={index === 0 ? 0 : lineHeight}>{line}</TSpan>)}
        </SvgText>
      </G>}</>;
}
// A bounded radial label stays between the hub and rim. Full text remains in
// the accessible wheel label, item list and result; stored labels are never cut.
function fitWheelLabel(value: string, fontSize: number, maxLines: number) {
  const glyphs = Array.from(value.replace(/\s+/g, ' ').trim());
  const lines: string[] = [];
  const width = (glyph: string) => (glyph.codePointAt(0)! > 0x2ff ? 1 : /[MWmw]/.test(glyph) ? 0.85 : 0.6) * fontSize;
  while (glyphs.length && lines.length < maxLines) {
    let used = 0; let end = 0;
    while (end < glyphs.length && used + width(glyphs[end]) <= 78) used += width(glyphs[end++]);
    if (end < glyphs.length && lines.length < maxLines-1) {
      const space = glyphs.slice(0,end).lastIndexOf(' ');
      if (space > 0) end = space+1;
    }
    let line = glyphs.splice(0,Math.max(1,end)).join('').trim();
    if (glyphs.length && lines.length === maxLines-1) {
      const shortened = Array.from(line);
      shortened.splice(Math.max(0,shortened.length-2),2);
      line = shortened.join('').trimEnd()+'…';
    }
    lines.push(line);
  }
  return lines;
}
const styles = StyleSheet.create({ pointer: { position: 'absolute', top: 2, width: 0, height: 0, borderLeftColor: 'transparent', borderRightColor: 'transparent' } });
