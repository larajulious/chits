import { useRef } from 'react';
import { Keyboard, StyleSheet, TextInput, View } from 'react-native';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { Icon, IconButton } from '@/components/ui/primitives';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { useStickyControls } from '@/components/ui/surface';
import { FocusText, FocusAction } from './focus-ui';

type Props = {
  visible: boolean;
  title: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onUntimed?: () => void;
  busy?: boolean;
  error?: string | null;
};

export function DurationSheet({ visible, title, value, onChange, onClose, onSave, onUntimed, busy = false, error }: Props) {
  'use no memo';
  useLocale();
  const { rowStyle } = useDirection();
  const { tokens, styleTokens } = useTheme();
  const controls = useStickyControls();
  const sheet = useRef<FormSheetHandle>(null);
  const input = useRef<TextInput>(null);
  const close = () => { if (!busy) { Keyboard.dismiss(); onClose(); } };
  const valid = /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 720;
  return <FormSheet ref={sheet} visible={visible} onRequestClose={close} closeAccessibilityLabel={tr('settings.closeSettingsSheet')}
    maxHeightPercent={86} accessibilityViewIsModal contentContainerStyle={styles.content}
    onModalShow={() => { sheet.current?.scrollTo({ y: 0, animated: false }); requestAnimationFrame(() => input.current?.focus()); }}
    header={<View style={[styles.header, rowStyle]}><FocusText accessibilityRole="header" variant="display" weight="600" style={styles.title}>{title}</FocusText><IconButton label={tr('settings.closeSettingsSheet')} disabled={busy} onPress={close}><Icon name="close-outline" size={22} color={tokens.textSecondary} /></IconButton></View>}
  >
    <FocusText style={[styles.help, { color: tokens.textSecondary }]}>{tr('focus.durationRange')}</FocusText>
    <FocusText style={styles.label}>{tr('focus.duration')}</FocusText>
    <TextInput ref={input} onFocus={() => sheet.current?.requestVisible(input)} accessibilityLabel={tr('focus.duration')}
      keyboardType="number-pad" maxLength={3} value={value} onChangeText={onChange} editable={!busy} selectionColor={tokens.accent}
      style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.background, borderColor: tokens.borderSubtle, borderRadius: styleTokens.radius.control }, controls.input]} />
    {error ? <FocusText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</FocusText> : null}
    <FocusAction primary disabled={busy || !valid} onPress={onSave}>{tr('editcontent.save')}</FocusAction>
    {onUntimed ? <FocusAction quiet disabled={busy} onPress={onUntimed}>{tr('focus.untimed')}</FocusAction> : null}
  </FormSheet>;
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', paddingLeft: 20, paddingRight: 12, paddingTop: 8 },
  title: { flex: 1, fontSize: 18 },
  content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20, gap: 12 },
  label: { fontSize: 16 }, help: { fontSize: 13, lineHeight: 19, marginTop: 3 },
  input: { minHeight: 48, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 16 },
});
