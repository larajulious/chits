import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { ot } from '../strings';

// A chat bubble becoming a card — drawn from the current theme's own bubble
// and card colors, so it matches whichever theme is on.
export function ChatToCardIllustration() {
  const { tokens: theme } = useTheme();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={ot('welcome.illustrationLabel')} style={styles.row}>
      <View style={[styles.bubble, { backgroundColor: theme.bubble }]}>
        <Text numberOfLines={2} style={[styles.bubbleText, { color: theme.bubbleText }]}>{ot('welcome.illustrationMessage')}</Text>
      </View>
      <Ionicons accessible={false} name="arrow-forward" size={20} color={theme.textMuted} />
      <View style={[styles.column, { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }]}>
        <Text numberOfLines={1} style={[styles.columnLabel, { color: theme.textSecondary }]}>{ot('welcome.illustrationColumn')}</Text>
        <View style={[styles.card, { backgroundColor: theme.cardPaper, borderColor: theme.borderSubtle }]}>
          <Text numberOfLines={3} style={[styles.cardText, { color: theme.textPrimary }]}>{ot('welcome.illustrationMessage')}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  bubble: { flexShrink: 1, maxWidth: 140, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 16, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 13, lineHeight: 18 },
  column: { flexShrink: 1, width: 132, padding: spacing.xs, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, gap: 6 },
  columnLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.4 },
  card: { padding: spacing.xs, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth },
  cardText: { fontSize: 12, lineHeight: 16 },
});
