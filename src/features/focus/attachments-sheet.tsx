import { useRef } from 'react';
import { Keyboard, StyleSheet, View } from 'react-native';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { Icon, IconButton } from '@/components/ui/primitives';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { AttachmentContent } from '@/components/chat/message-row';
import type { AttachmentLike } from '@/db/types';
import { spacing } from '@/constants/theme';
import { FocusText } from './focus-ui';

export function AttachmentsSheet({ visible, attachments, onClose }: { visible: boolean; attachments: AttachmentLike[]; onClose: () => void }) {
  'use no memo';
  useLocale();
  const { rowStyle } = useDirection();
  const { tokens } = useTheme();
  const sheet = useRef<FormSheetHandle>(null);
  const close = () => { Keyboard.dismiss(); onClose(); };
  return <FormSheet ref={sheet} visible={visible} onRequestClose={close}
    closeAccessibilityLabel={tr('chat.cancel')} maxHeightPercent={80} accessibilityViewIsModal
    onModalShow={() => sheet.current?.scrollTo({ y: 0, animated: false })}
    contentContainerStyle={styles.content}
    header={<View style={[styles.header, rowStyle, { borderBottomColor: tokens.borderSubtle }]}>
      <FocusText accessibilityRole="header" variant="title" style={styles.title}>{tr('attachments.attachments')}</FocusText>
      <IconButton label={tr('chat.cancel')} onPress={close}><Icon name="close" size={22} color={tokens.textPrimary} /></IconButton>
    </View>}
  >
    {attachments.map((attachment) => <AttachmentContent key={attachment.id} attachment={attachment} variant="detail" />)}
  </FormSheet>;
}

const styles = StyleSheet.create({
  header: { minHeight: 56, alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.xs, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.xs },
});
