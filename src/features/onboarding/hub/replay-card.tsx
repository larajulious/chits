import { StyleSheet, View } from 'react-native';

import { PAPER_INK, PAPER_INK_MUTED, PAPER_YELLOW, PaperCard } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { useDirection } from '@/localization/provider';
import { ot } from '../strings';
import { useWelcomeFonts } from '../welcome/welcome-fonts';

/** The tour, as a taped sticky on the page: the one thing here that isn't a task. Papers stay light in dark mode. */
export function ReplayCard({ compact, onPress }: { compact: boolean; onPress: () => void }) {
  const { rowStyle } = useDirection();
  const fonts = useWelcomeFonts();
  return <PaperCard paper={PAPER_YELLOW} tilt={-0.6} tape accessibilityRole="button" accessibilityLabel={ot('hub.replay')} accessibilityHint={ot('hub.tour.description')} onPress={onPress} style={styles.card}>
    <View style={[styles.row, rowStyle]}>
      <View style={styles.play}><Icon name="play" size={16} color={PAPER_YELLOW} /></View>
      <View style={styles.copy}>
        <AppText weight="700" family={fonts.display} style={styles.title}>{ot('hub.replay')}</AppText>
        {!compact ? <AppText family={fonts.text} style={styles.description}>{ot('hub.tour.description')}</AppText> : null}
      </View>
      <Icon name="chevron-forward" size={19} color={PAPER_INK} />
    </View>
  </PaperCard>;
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: spacing.sm, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  row: { alignItems: 'center', gap: spacing.sm },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER_INK },
  copy: { flex: 1, minWidth: 0 },
  title: { color: PAPER_INK, fontSize: 15, lineHeight: 19 },
  description: { color: PAPER_INK_MUTED, fontSize: 13, lineHeight: 17 },
});
