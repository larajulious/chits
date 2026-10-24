import type { ReactNode } from 'react';
import { Image as RNImage, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { loadAsync, useFonts } from 'expo-font';
import { Kalam_400Regular } from '@expo-google-fonts/kalam/400Regular';
import { Kalam_700Bold } from '@expo-google-fonts/kalam/700Bold';
import Animated, { FadeIn, useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '@/components/theme-provider';
import { AppText, Icon } from '@/components/ui/primitives';
import type { IconName } from '@/components/ui/icon';
import { useDirection } from '@/localization/provider';

// The desk look Spin and Focus share: a dotted desk with paper notes on it.
// The papers are always light whatever the appearance (like Sticky notes), so
// their ink is fixed; only the desk itself, text written straight on it, and
// a theme page that holds editable content, follow dark mode and the theme.
// Motion is transforms and opacity only, so nothing re-lays out mid-animation.

export const PAPER_INK = '#2B2620';
export const PAPER_INK_MUTED = '#574E41';
export const PAPER_WHITE = '#FFFDF6';
export const PAPER_YELLOW = '#FBE47E';
/** The pastel papers, in the order a set of notes takes them. */
export const PAPERS = ['#FBE47E', '#F9C6CF', '#C7EAD3', '#C9DCF5', '#FFD9B5', '#DECFF5', '#F3EAD8', '#DDEFB6'];
/** Deeper cuts of the papers, for confetti and marks that must show on the desk. */
export const PAPER_CONFETTI = ['#F2C230', '#EE7F97', '#4DBE8C', '#5B9BEA', '#F29A55', '#A98BE8'];

const DESKS = {
  light: { desk: '#EADFCB', dot: '#785A32', dotOpacity: 0.16, ink: '#2B2620', inkMuted: '#5E5444', danger: '#9E2B25', rim: '#C9A27A', shadow: 'rgba(80,60,30,0.2)' },
  dark: { desk: '#221E18', dot: '#FFF0D2', dotOpacity: 0.08, ink: '#F1E9DA', inkMuted: '#C9BEAA', danger: '#F19A90', rim: '#8A6A48', shadow: 'rgba(0,0,0,0.45)' },
};
export function useDesk() {
  return DESKS[useTheme().scheme];
}

/** Kalam, the handwriting Spaces writes notes in; system faces stand in while it registers. */
export function useHandwriting(): { hand: TextStyle; handBold: TextStyle } {
  const [loaded] = useFonts({ Kalam_400Regular, Kalam_700Bold });
  return loaded ? HAND : HAND_FALLBACK;
}
/** Loads Kalam ahead of time (once; repeat calls share the load), so desk screens open already in handwriting. */
export function preloadHandwriting() {
  void loadAsync({ Kalam_400Regular, Kalam_700Bold }).catch(() => undefined);
}
const HAND = { hand: { fontFamily: 'Kalam_400Regular' }, handBold: { fontFamily: 'Kalam_700Bold' } };
const HAND_FALLBACK = { hand: {}, handBold: { fontWeight: '700' as const } };

/** The dotted desk: one small dot tile, repeated. */
export function PaperDesk({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const desk = useDesk();
  return <View style={[styles.flex, { backgroundColor: desk.desk }, style]}>
    <RNImage accessible={false} source={DESK_DOT} resizeMode="repeat" tintColor={desk.dot} style={[StyleSheet.absoluteFill, { opacity: desk.dotOpacity }]} />
    {children}
  </View>;
}
const DESK_DOT = require('@/assets/images/spin-desk-dot.png');

/** A strip of translucent tape across a paper's top edge. */
export function Tape({ width = 72, angle = 3 }: { width?: number; angle?: number }) {
  return <View pointerEvents="none" style={[styles.tape, { width, marginLeft: -width / 2, transform: [{ rotate: `${angle}deg` }] }]} />;
}

/** A red pushpin, drawn from above. */
export function PushPin({ size = 24, needle = false }: { size?: number; needle?: boolean }) {
  return <Svg pointerEvents="none" width={size} height={needle ? size * 1.35 : size} viewBox={needle ? '0 0 34 46' : '0 0 34 34'}>
    {needle ? <Path d="M17 44l-3-20h6z" fill="#8C8C8C" /> : null}
    <Circle cx={17} cy={needle ? 14 : 17} r={12} fill="#E2483D" />
    <Circle cx={13} cy={needle ? 10 : 13} r={4} fill="#F28B83" />
  </Svg>;
}

/** A paper note lying on the desk: tinted, a little askew, with an optional tape strip or pin. */
export function PaperNote({ paper, tilt = 0, tape = false, pin = false, style, children }: { paper: string; tilt?: number; tape?: boolean; pin?: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const desk = useDesk();
  return <View style={[styles.paper, { backgroundColor: paper, boxShadow: `0px 6px 12px ${desk.shadow}`, transform: [{ rotate: `${tilt}deg` }] }, style]}>
    {children}
    {tape ? <Tape /> : null}
    {pin ? <View pointerEvents="none" style={styles.pin}><PushPin size={22} /></View> : null}
  </View>;
}

const PRESS_SPRING = { damping: 15, stiffness: 340, mass: 0.6 };

/** A paper you can press: it springs down under the finger and back. */
export function PaperButton({ paper, tilt = 0, tape = false, disabled, style, containerStyle, children, onPressIn, onPressOut, ...props }: Omit<PressableProps, 'style' | 'children'> & { paper: string; tilt?: number; tape?: boolean; style?: StyleProp<ViewStyle>; containerStyle?: StyleProp<ViewStyle>; children: ReactNode }) {
  const desk = useDesk();
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt}deg` }, { scale: scale.get() }] }));
  return <Animated.View style={[pressed, disabled && styles.disabled, containerStyle]}>
    <Pressable
      {...props}
      disabled={disabled}
      onPressIn={(event) => { if (!reduced) scale.set(withSpring(0.94, PRESS_SPRING)); onPressIn?.(event); }}
      onPressOut={(event) => { scale.set(withSpring(1, PRESS_SPRING)); onPressOut?.(event); }}
      style={({ pressed: down }) => [styles.paper, styles.button, { backgroundColor: paper, boxShadow: `0px ${down ? 2 : 6}px ${down ? 4 : 12}px ${desk.shadow}` }, reduced && down && styles.reducedPress, style]}
    >
      {children}
    </Pressable>
    {tape ? <Tape width={80} angle={-2} /> : null}
  </Animated.View>;
}

/** The mascot, and what it says on a yellow sticky. */
export function DeskMessage({ message }: { message: string }) {
  const { hand } = useHandwriting();
  const reduced = useReducedMotion();
  const { rowStyle } = useDirection();
  return <View style={[styles.message, rowStyle]}>
    <Image accessible={false} source={require('@/assets/images/chits-mascot-animated.svg')} contentFit="contain" style={styles.mascot} />
    <PaperNote paper={PAPER_YELLOW} tilt={-1.5} tape style={styles.messageNote}>
      <Animated.View key={message} entering={reduced ? undefined : FadeIn.duration(260)}>
        <AppText accessibilityLiveRegion="polite" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75} style={[hand, styles.messageText]}>{message}</AppText>
      </Animated.View>
    </PaperNote>
  </View>;
}

/** A small paper tab for one choice: an icon and its value, handwritten. A selected tab is yellow and lifted. */
export function PaperTab({ paper, tilt, icon, label, selected, ...props }: Omit<PressableProps, 'style' | 'children'> & { paper?: string; tilt: number; icon: IconName; label: string; selected?: boolean }) {
  const { handBold } = useHandwriting();
  const { rowStyle } = useDirection();
  const chosen = selected === undefined ? undefined : { selected };
  return <PaperButton paper={selected ? PAPER_YELLOW : paper ?? PAPER_WHITE} tilt={selected ? tilt * 1.6 : tilt} style={[styles.tab, selected && styles.tabSelected]} accessibilityState={chosen} {...props}>
    <View style={[styles.tabRow, rowStyle]}>
      <Icon name={icon} size={16} color={PAPER_INK} />
      <AppText numberOfLines={1} style={[handBold, styles.tabText]}>{label}</AppText>
    </View>
  </PaperButton>;
}

/** A round paper button holding one icon: the controls under a finger mid-task. */
export function PaperRound({ paper = PAPER_WHITE, icon, size = 52, ...props }: Omit<PressableProps, 'style' | 'children'> & { paper?: string; icon: IconName; size?: number }) {
  return <PaperButton paper={paper} accessibilityRole="button" style={{ width: size, height: size, borderRadius: size / 2 }} {...props}>
    <Icon name={icon} size={Math.round(size * 0.44)} color={PAPER_INK} />
  </PaperButton>;
}

/**
 * A page on the desk for content the reader edits: the theme's own paper and
 * ink (so an editor written for the theme stays readable, dark mode included),
 * lying flat, with the desk's shadow.
 */
export function DeskPage({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  const desk = useDesk();
  const { tokens } = useTheme();
  return <View style={[styles.page, { backgroundColor: tokens.cardPaper, boxShadow: `0px 6px 14px ${desk.shadow}` }, style]}>{children}</View>;
}

/** A full-width paper action: the taped yellow one leads, white ones follow. */
export function PaperAction({ label, primary = false, containerStyle, ...props }: Omit<PressableProps, 'style' | 'children'> & { label: string; primary?: boolean; containerStyle?: StyleProp<ViewStyle> }) {
  const { handBold } = useHandwriting();
  return <PaperButton paper={primary ? PAPER_YELLOW : PAPER_WHITE} tilt={primary ? -0.8 : 0.6} tape={primary} accessibilityRole="button" containerStyle={containerStyle} style={primary ? styles.primary : styles.secondary} {...props}>
    <AppText numberOfLines={primary ? 1 : 2} adjustsFontSizeToFit={primary} minimumFontScale={0.7} style={[handBold, primary ? styles.primaryText : styles.secondaryText]}>{label}</AppText>
  </PaperButton>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  message: { alignItems: 'center', gap: 8, paddingHorizontal: 4 },
  mascot: { width: 38, height: 38 },
  messageNote: { flex: 1, minHeight: 66, justifyContent: 'center', paddingHorizontal: 14, paddingTop: 8, paddingBottom: 6 },
  messageText: { color: PAPER_INK, fontSize: 18, lineHeight: 24 },
  tab: { paddingHorizontal: 12, paddingVertical: 4 },
  tabSelected: { boxShadow: '0px 8px 14px rgba(80,60,30,0.28)' },
  page: { borderRadius: 4, overflow: 'hidden' },
  tabRow: { alignItems: 'center', gap: 6 },
  tabText: { color: PAPER_INK, fontSize: 18, lineHeight: 24, flexShrink: 1 },
  primary: { minHeight: 58, paddingHorizontal: 16, paddingVertical: 6 },
  primaryText: { color: PAPER_INK, fontSize: 24, lineHeight: 31, textAlign: 'center' },
  secondary: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 4 },
  secondaryText: { color: PAPER_INK, fontSize: 19, lineHeight: 25, textAlign: 'center' },
  paper: { borderRadius: 3 },
  button: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.55 },
  reducedPress: { opacity: 0.8 },
  tape: { position: 'absolute', top: -9, left: '50%', height: 18, backgroundColor: 'rgba(255,255,255,0.6)' },
  pin: { position: 'absolute', top: -11, left: '50%', marginLeft: -11 },
});
