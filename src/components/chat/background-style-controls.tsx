import { useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { useTheme } from '@/components/theme-provider';
import { backgroundDim } from '@/services/chat-background';

// A dependency-free continuous slider, with native adjustable accessibility actions.
export function BackgroundStyleControls({ dim, blur, onDimChange, onDimCommit, onBlurChange, disabled = false }: { dim: number; blur: boolean; onDimChange: (value: number) => void; onDimCommit?: (value: number) => void; onBlurChange: (value: boolean) => void; disabled?: boolean }) {
  const { tokens } = useTheme();
  const track = useRef<View>(null);
  const geometry = useRef({ x: 0, width: 1 });
  const [trackWidth, setTrackWidth] = useState(1);
  const latestValue = useRef(dim);
  const percent = Math.round(dim * 100);
  const move = (pageX: number) => { latestValue.current = backgroundDim(((pageX - geometry.current.x) / geometry.current.width) * 0.85); onDimChange(latestValue.current); };
  return <View style={styles.controls}>
    <View style={styles.labelRow}><Text style={[styles.label, { color: tokens.textPrimary }]}>Dim Background</Text><Text style={[styles.value, { color: tokens.textSecondary }]}>{percent}%</Text></View>
    <View ref={track} accessibilityRole="adjustable" accessible accessibilityLabel="Dim Background" accessibilityState={{ disabled }} accessibilityValue={{ min: 0, max: 85, now: percent, text: `${percent}%` }} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(event) => { if (!disabled) { const next = backgroundDim(dim + (event.nativeEvent.actionName === 'increment' ? 0.05 : -0.05)); onDimChange(next); onDimCommit?.(next); } }}
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} onStartShouldSetResponder={() => !disabled} onMoveShouldSetResponder={() => !disabled} onResponderTerminationRequest={() => false}
      onResponderGrant={(event) => { const pageX = event.nativeEvent.pageX; track.current?.measureInWindow((x, _y, width) => { geometry.current = { x, width }; move(pageX); }); }} onResponderMove={(event) => move(event.nativeEvent.pageX)} onResponderRelease={() => onDimCommit?.(latestValue.current)} style={styles.slider}>
      <View style={[styles.track, { backgroundColor: tokens.borderSubtle }]}><View style={[styles.fill, { width: `${(dim / 0.85) * 100}%`, backgroundColor: tokens.accent }]} /></View>
      <View style={[styles.thumb, { left: Math.max(0, Math.min(trackWidth - 24, (dim / 0.85) * (trackWidth - 24))), backgroundColor: tokens.surface, borderColor: tokens.accent }]} />
    </View>
    <View style={styles.labelRow}>
      <Text style={[styles.label, { color: tokens.textPrimary }]}>Blur Background</Text><Switch accessibilityLabel="Blur Background" disabled={disabled} value={blur} onValueChange={onBlurChange} trackColor={{ true: tokens.accent }} />
    </View>
  </View>;
}
const styles = StyleSheet.create({ controls: { gap: 4 }, labelRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, label: { fontSize: 15, fontWeight: '500' }, value: { fontSize: 13, fontVariant: ['tabular-nums'] }, slider: { height: 44, justifyContent: 'center' }, track: { height: 4, borderRadius: 2, overflow: 'hidden' }, fill: { height: '100%' }, thumb: { position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 2, top: 10, elevation: 2 } });
