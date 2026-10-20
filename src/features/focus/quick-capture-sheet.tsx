import { useRef } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { useDirection, useLocale } from '@/localization/provider';
import { contentTextStyle, languageDirection } from '@/localization/text-layout';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { Icon, IconButton } from '@/components/ui/primitives';
import { useStickyControls } from '@/components/ui/surface';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { spacing } from '@/constants/theme';
import { FocusAction, FocusText } from './focus-ui';

type Props = {
  visible: boolean;
  value: string;
  busy: boolean;
  error: string | null;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: (toChat: boolean) => void;
};

export function QuickCaptureSheet({ visible, value, busy, error, onChange, onClose, onSave }: Props) {
  'use no memo';
  const locale = useLocale();
  const { rowStyle } = useDirection();
  const { tokens, styleTokens } = useTheme();
  const controls = useStickyControls();
  const sheet = useRef<FormSheetHandle>(null);
  const input = useRef<TextInput>(null);
  const close = () => { if (!busy) { Keyboard.dismiss(); onClose(); } };

  return <FormSheet
    ref={sheet}
    visible={visible}
    onRequestClose={close}
    closeAccessibilityLabel={tr('chat.cancel')}
    maxHeightPercent={86}
    accessibilityViewIsModal
    contentContainerStyle={styles.content}
    onModalShow={() => { sheet.current?.scrollTo({ y: 0, animated: false }); requestAnimationFrame(() => input.current?.focus()); }}
    header={<View style={[styles.header, rowStyle, { borderBottomColor: tokens.borderSubtle }]}>
      <FocusText accessibilityRole="header" variant="title" style={styles.title}>{tr('focus.capture')}</FocusText>
      <IconButton label={tr('chat.cancel')} disabled={busy} onPress={close}><Icon name="close" size={22} color={tokens.textPrimary} /></IconButton>
    </View>}
  >
    <TextInput
      ref={input}
      multiline
      scrollEnabled
      value={value}
      onChangeText={onChange}
      onFocus={() => sheet.current?.requestVisible(input)}
      editable={!busy}
      maxLength={10000}
      accessibilityLabel={tr('focus.thought')}
      placeholder={tr('focus.thought')}
      placeholderTextColor={tokens.textMuted}
      selectionColor={tokens.accent}
      style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.surfaceElevated, borderColor: tokens.borderSubtle, borderRadius: styleTokens.radius.control }, controls.input, contentTextStyle(value, languageDirection(locale))]}
    />
    {error ? <FocusText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</FocusText> : null}
    <View style={styles.actions}>
      <FocusAction primary disabled={busy || !value.trim()} onPress={() => onSave(false)}>{tr('focus.addCurrent')}</FocusAction>
      <FocusAction disabled={busy || !value.trim()} onPress={() => onSave(true)}>{tr('focus.saveChat')}</FocusAction>
    </View>
  </FormSheet>;
}

const styles = StyleSheet.create({
  header: { minHeight: 60, alignItems: 'center', paddingLeft: spacing.lg, paddingRight: spacing.sm, paddingVertical: spacing.xs, gap: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.md },
  input: { minHeight: 112, maxHeight: 176, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, borderWidth: StyleSheet.hairlineWidth, fontSize: 16, lineHeight: 24, textAlignVertical: 'top' },
  actions: { gap: spacing.sm },
});
