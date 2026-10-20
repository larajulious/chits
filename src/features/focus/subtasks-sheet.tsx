import { useRef } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { Icon, IconButton } from '@/components/ui/primitives';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { CardSubtasks } from '@/components/boards/card-subtasks.native';
import { spacing } from '@/constants/theme';
import { FocusText } from './focus-ui';

export function SubtasksSheet({ visible, cardId, onClose }: { visible: boolean; cardId: string | null; onClose: () => void }) {
  'use no memo';
  useLocale();
  const { rowStyle } = useDirection();
  const { tokens } = useTheme();
  const sheet = useRef<FormSheetHandle>(null);
  const close = () => { Keyboard.dismiss(); onClose(); };
  return <FormSheet ref={sheet} visible={visible && Boolean(cardId)} onRequestClose={close}
    closeAccessibilityLabel={tr('chat.cancel')} maxHeightPercent={80} accessibilityViewIsModal
    onModalShow={() => sheet.current?.scrollTo({ y: 0, animated: false })}
    contentContainerStyle={styles.content}
    header={<View style={[styles.header, rowStyle, { borderBottomColor: tokens.borderSubtle }]}>
      <FocusText accessibilityRole="header" variant="title" style={styles.title}>{tr('cardsubtasks.subtasks')}</FocusText>
      <IconButton label={tr('chat.cancel')} onPress={close}><Icon name="close" size={22} color={tokens.textPrimary} /></IconButton>
    </View>}
  >
    {cardId ? <CardSubtasks key={cardId} cardId={cardId} showHeading={false} onInputFocus={(input) => sheet.current?.requestVisible(input)} /> : null}
  </FormSheet>;
}

const styles = StyleSheet.create({
  header: { minHeight: 56, alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.xs, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.lg },
});
