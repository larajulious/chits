import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDesk } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/app-text';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';

const SHEET_OVERLAP = 12;

/** The top of the panel: the title and date on the desk, flowing into its sheet of paper. */
export const DrawerHero = memo(function DrawerHero({ title, today, paper }: { title: string; today: string; paper: string }) {
  const desk = useDesk();
  const fonts = useWelcomeFonts();
  return <View style={styles.hero}>
    <AppText accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} family={fonts.display} style={[styles.title, { color: desk.ink }]}>{title}</AppText>
    <AppText numberOfLines={2} family={fonts.text} style={[styles.today, { color: desk.inkMuted }]}>{today}</AppText>
    <View pointerEvents="none" style={[styles.paperEdge, { backgroundColor: paper, boxShadow: `0px -2px 6px ${desk.shadow}` }]} />
  </View>;
});

const styles = StyleSheet.create({
  hero: { overflow: 'hidden', paddingTop: 14, paddingBottom: 24, paddingHorizontal: 20, gap: 3 },
  title: { fontSize: 23, lineHeight: 28 },
  today: { fontSize: 13, lineHeight: 18 },
  paperEdge: { position: 'absolute', bottom: -SHEET_OVERLAP, left: -24, right: -24, height: 18, transform: [{ rotate: '-0.7deg' }] },
});
