import { StyleSheet } from 'react-native';

import { PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PaperAction, PaperNote, useHandwriting } from '@/components/desk/paper-desk';
import { AppText } from '@/components/ui/primitives';

/** Nothing can land right now, so there's no wheel to spin: a note saying why, and a way forward. */
export function SpinEmpty({ title, help, primary, secondary }: { title: string; help: string; primary: { label: string; onPress: () => void }; secondary?: { label: string; onPress: () => void } }) {
  const { handBold } = useHandwriting();
  return <PaperNote paper={PAPER_WHITE} tilt={-0.8} tape style={styles.note}>
    <AppText accessibilityRole="header" style={[handBold, styles.title]}>{title}</AppText>
    <AppText style={styles.help}>{help}</AppText>
    <PaperAction primary {...primary} containerStyle={styles.first} />
    {secondary ? <PaperAction {...secondary} /> : null}
  </PaperNote>;
}

const styles = StyleSheet.create({
  note: { width: '100%', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16, gap: 8 },
  title: { color: PAPER_INK, fontSize: 22, lineHeight: 28 },
  help: { color: PAPER_INK_MUTED, fontSize: 14, lineHeight: 20 },
  first: { marginTop: 6 },
});
