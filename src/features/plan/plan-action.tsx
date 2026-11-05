import { StyleSheet } from 'react-native';

import { PaperButton } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import type { WelcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';

/** The next step, as on Welcome: solid ink in light mode, Chits yellow in dark. */
export function PlanAction({ label, surfaces, disabled, quiet = false, onPress }: { label: string; surfaces: WelcomeSurfaces; disabled?: boolean; /** Available, but not what the page is asking for right now. */ quiet?: boolean; onPress: () => void }) {
  const { styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  return <PaperButton paper={quiet ? surfaces.control : surfaces.action} accessibilityRole="button" accessibilityState={{ disabled: Boolean(disabled) }} disabled={disabled} onPress={onPress} style={[styles.action, { borderRadius: styleTokens.button.radius }]}>
    <AppText weight="700" family={fonts.display} style={[styles.label, { color: quiet ? surfaces.ink : surfaces.onAction }]}>{label}</AppText>
  </PaperButton>;
}

const styles = StyleSheet.create({
  action: { minHeight: 52, paddingHorizontal: spacing.md },
  label: { fontSize: 16, lineHeight: 21 },
});
