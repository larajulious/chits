import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { layout, spacing } from '@/constants/theme';
import { useDirection } from '@/localization/provider';
import { useWelcomeFonts } from '../welcome/welcome-fonts';
import type { WelcomeSurfaces } from '../welcome/welcome-surfaces';

/** How a demo talks to Chits. The screen owns the character; demos only say what happened. */
export type TourMascot = {
  /** Chits leans in and holds still, until `rest` or `cheer`. */
  watch: () => void;
  rest: () => void;
  /** A happy reaction, with a line on a note. */
  cheer: (line: string) => void;
  /** A line alone, for the moments that stay quiet. */
  say: (line: string) => void;
};

export type DemoProps = {
  surfaces: WelcomeSurfaces;
  /** False once the person moves to another step: whatever is running stops. */
  active: boolean;
  mascot: TourMascot;
};

/** Puts a demo back to the start, so it can be played again. */
export function DemoReset({ label, surfaces, onPress }: { label: string; surfaces: WelcomeSurfaces; onPress: () => void }) {
  const { rowStyle } = useDirection();
  const fonts = useWelcomeFonts();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.reset, rowStyle, pressed && styles.pressed]}>
    <Icon name="refresh" size={15} color={surfaces.ink} />
    <AppText weight="700" family={fonts.textBold} numberOfLines={1} style={[styles.label, { color: surfaces.ink }]}>{label}</AppText>
  </Pressable>;
}

const styles = StyleSheet.create({
  reset: { minHeight: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center', gap: spacing.xxs, paddingHorizontal: spacing.xs },
  label: { fontSize: 14, lineHeight: 19 },
  pressed: { opacity: 0.6 },
});
