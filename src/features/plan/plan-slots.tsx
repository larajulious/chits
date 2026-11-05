import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import type { WelcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection } from '@/localization/provider';
import { planSlots } from './plan-core';

/**
 * The little things still to come, as empty places on the page. They fill up as
 * the list does. Purely a picture of the helper line above them, so a screen
 * reader skips them; a tap just puts the cursor in the box.
 */
export function PlanSlots({ total, surfaces, onPress }: { total: number; surfaces: WelcomeSurfaces; onPress: () => void }) {
  const { rowStyle } = useDirection();
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  return planSlots(total).map((place) => <Pressable
    key={place}
    accessible={false}
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    onPress={onPress}
    style={[styles.slot, rowStyle, { borderColor: surfaces.track, borderRadius: styleTokens.button.radius }]}
  >
    <AppText family={fonts.display} style={[styles.number, { color: surfaces.inkMuted }]}>{place}</AppText>
  </Pressable>);
}

const styles = StyleSheet.create({
  slot: { minHeight: 52, alignItems: 'center', borderWidth: 1.5, borderStyle: 'dashed', paddingHorizontal: spacing.md },
  number: { fontSize: 16, lineHeight: 21 },
});
