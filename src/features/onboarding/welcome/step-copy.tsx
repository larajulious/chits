import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useDirection } from '@/localization/provider';
import { useWelcomeFonts } from './welcome-fonts';
import type { WelcomeSurfaces } from './welcome-surfaces';

/** The type every step shares, so they read as one flow. `compact` leaves the room to a demo. */
export function StepHeading({ surfaces, compact = false, children }: { surfaces: WelcomeSurfaces; compact?: boolean; children: string }) {
  const { direction } = useDirection();
  const fonts = useWelcomeFonts();
  return <AppText accessibilityRole="header" variant="title" family={fonts.display} style={[styles.heading, compact && styles.compactHeading, { color: surfaces.ink, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{children}</AppText>;
}

export function StepBody({ surfaces, compact = false, children }: { surfaces: WelcomeSurfaces; compact?: boolean; children: string }) {
  const { direction } = useDirection();
  const fonts = useWelcomeFonts();
  return <AppText variant="paragraph" family={fonts.text} style={[styles.body, compact && styles.compactBody, { color: surfaces.inkMuted, textAlign: direction === 'rtl' ? 'right' : 'left' }]}>{children}</AppText>;
}

const styles = StyleSheet.create({
  heading: { fontSize: 33, lineHeight: 40 },
  body: { fontSize: 17, lineHeight: 25 },
  compactHeading: { fontSize: 26, lineHeight: 32 },
  compactBody: { fontSize: 15, lineHeight: 21 },
});
