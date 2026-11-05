import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useChatTransition } from '@/components/navigation/chat-transition';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/surface';
import { spacing } from '@/constants/theme';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

/** The quieter partner to the floating Chat button. Chat stays the accent, this one a plain control. */
export function NotesShortcut() {
  "use no memo"; // Global i18next copy follows the locale subscription.
  useLocale();
  const { tokens, styleTokens, styleColors } = useTheme();
  const { buttonHidden } = useChatTransition();
  // Chat lifts away on its own; this shouldn't linger beside it.
  const leaving = useAnimatedStyle(() => ({ opacity: buttonHidden.get() ? 0 : 1 }));
  const openNotes = () => {
    router.navigate({ pathname: '/', params: { view: 'cards' } });
    void Haptics.selectionAsync().catch(() => {});
  };
  return <Animated.View style={leaving}>
    <PressableSurface accessibilityRole="button" accessibilityLabel={tr('index.notes')} onPress={openNotes} fill={styleColors.controlFill} radius={styleTokens.button.radius} edge={styleTokens.button.edge || false} shadow="floating" style={styles.button}>
      <Icon name="albums-outline" size={18} color={tokens.textPrimary} />
      <AppText numberOfLines={1} weight="700" style={[styles.label, { color: tokens.textPrimary }]}>{tr('index.notes')}</AppText>
    </PressableSurface>
  </Animated.View>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md - 2 },
  label: { fontSize: 14, lineHeight: 20 },
});
