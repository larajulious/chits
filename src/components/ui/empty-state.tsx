import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { OnboardingMascot } from '@/features/onboarding/components/onboarding-mascot';
import { AppText } from './app-text';
import { Button } from './controls';
import { Icon, type IconName } from './icon';

/**
 * Which mascot illustration an empty state shows. Only the standard art
 * exists today; the others draw it with a prop beside it until their own
 * poses are drawn — give a pose its art in MascotPose below.
 */
export type MascotPoseName = 'standard' | 'paperclip' | 'search' | 'no-notes' | 'empty-board';
const POSE_PROPS: Partial<Record<MascotPoseName, IconName>> = { paperclip: 'attach', search: 'search-outline', 'empty-board': 'folder-outline' };

function MascotPose({ pose, width }: { pose: MascotPoseName; width: number }) {
  const { tokens, styleColors } = useTheme();
  const prop = POSE_PROPS[pose];
  return <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ width, alignItems: 'center' }}>
    <View style={styles.mascotTilt}>
      <OnboardingMascot size={width} accessible={false} />
      {prop ? <View style={[styles.poseProp, { backgroundColor: styleColors.controlFill, borderColor: styleColors.outline }]}><Icon name={prop} size={26} color={tokens.textPrimary} /></View> : null}
    </View>
    {/* A soft contact shadow so the mascot stands on the page. */}
    <View style={[styles.mascotShadow, { width: width * 0.56 }]} />
  </View>;
}

/**
 * The one empty state. Classic: a title and a line of help, plus an optional
 * action. Sticky (mascotEmptyStates): the mascot in `pose` above them, in
 * the display face, with a large accent button.
 */
export function EmptyState({ title, description, action, pose = 'standard', style }: { title: string; description: string; action?: { label: string; onPress: () => void }; pose?: MascotPoseName; style?: StyleProp<ViewStyle> }) {
  const { tokens, styleTokens: t, styleColors } = useTheme();
  const e = t.emptyState;
  const mascot = t.mascotEmptyStates;
  return <View style={[styles.emptyState, action && styles.withAction, style]}>
    {mascot ? <MascotPose pose={pose} width={e.mascotWidth} /> : null}
    <AppText accessibilityRole={mascot ? 'header' : undefined} variant="display" weight="600" style={[styles.title, { fontSize: e.titleSize, color: tokens.textPrimary }, e.maxWidth ? { maxWidth: e.maxWidth } : null]}>{title}</AppText>
    <AppText variant="paragraph" style={[styles.description, { fontSize: e.bodySize, lineHeight: e.bodyLineHeight, color: mascot ? styleColors.textSecondary : tokens.textSecondary }, e.maxWidth ? { maxWidth: e.maxWidth } : null, action && styles.descriptionAboveAction]}>{description}</AppText>
    {action ? <Button label={action.label} onPress={action.onPress} size="large" /> : null}
  </View>;
}

const styles = StyleSheet.create({
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.xs },
  withAction: { minHeight: 220 },
  title: { textAlign: 'center' },
  description: { textAlign: 'center' },
  descriptionAboveAction: { marginBottom: spacing.sm },
  mascotTilt: { transform: [{ rotate: '-4deg' }] },
  poseProp: { position: 'absolute', right: -6, top: '38%', width: 44, height: 44, borderRadius: 44 / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '18deg' }] },
  mascotShadow: { height: 12, marginTop: -6, marginBottom: spacing.sm, borderRadius: 12 / 2, backgroundColor: 'rgba(0,0,0,0.10)' },
});
