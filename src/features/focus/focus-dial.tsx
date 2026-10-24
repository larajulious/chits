import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { FocusText as AppText } from './focus-ui';

const TICKS = Array.from({ length: 60 }, (_, i) => i);

/**
 * A paper kitchen timer, the cousin of Spin's wheel: a cardboard rim, a paper
 * face with minute ticks, and the duration handwritten in the middle. Still,
 * on purpose — nothing on it moves while someone is settling in to focus.
 */
export const FocusDial = memo(function FocusDial({ size, label, caption }: { size: number; label: string; caption?: string }) {
  const desk = useDesk();
  const { hand, handBold } = useHandwriting();
  const knob = Math.round(size * 0.16);
  return <View accessible accessibilityLabel={caption ? `${label}. ${caption}` : label} style={{ width: size, height: size + knob * 0.4, alignSelf: 'center', paddingTop: knob * 0.4 }}>
    <View style={[styles.knob, { width: knob, height: knob * 0.7, marginLeft: -knob / 2, backgroundColor: desk.rim }]} />
    <View style={{ width: size, height: size }}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, backgroundColor: desk.rim, boxShadow: `0px 12px 22px ${desk.shadow}` }]} />
      <View style={[styles.face, { top: size * 0.05, left: size * 0.05, right: size * 0.05, bottom: size * 0.05, borderRadius: size / 2, backgroundColor: PAPER_WHITE }]} />
      <View style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size} viewBox="0 0 200 200">
          {TICKS.map((i) => {
            const major = i % 5 === 0;
            const a = (i * 6 - 90) * Math.PI / 180;
            const [outer, inner] = [86, major ? 76 : 81];
            return <Line key={i} x1={100 + outer * Math.cos(a)} y1={100 + outer * Math.sin(a)} x2={100 + inner * Math.cos(a)} y2={100 + inner * Math.sin(a)} stroke={PAPER_INK} strokeOpacity={major ? 0.45 : 0.2} strokeWidth={major ? 2.2 : 1.2} strokeLinecap="round" />;
          })}
        </Svg>
      </View>
      <View style={styles.center}>
        <AppText numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} style={[handBold, styles.label, { fontSize: size * 0.19, lineHeight: size * 0.25, maxWidth: size * 0.66 }]}>{label}</AppText>
        {caption ? <AppText numberOfLines={1} adjustsFontSizeToFit style={[hand, styles.caption, { maxWidth: size * 0.6 }]}>{caption}</AppText> : null}
      </View>
    </View>
  </View>;
});

const styles = StyleSheet.create({
  knob: { position: 'absolute', top: 0, left: '50%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  face: { position: 'absolute' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  label: { color: PAPER_INK, textAlign: 'center' },
  caption: { color: PAPER_INK_MUTED, fontSize: 16, lineHeight: 22, textAlign: 'center' },
});
