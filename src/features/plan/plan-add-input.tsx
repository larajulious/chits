import { useRef, useState, type RefObject } from 'react';
import { Pressable, StyleSheet, View, type TextInput as NativeTextInput } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';
import { Icon } from '@/components/ui/icon';
import { layout, spacing } from '@/constants/theme';
import type { WelcomeSurfaces } from '@/features/onboarding/welcome/welcome-surfaces';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';

/** Quick entry: submitting keeps the keyboard up, so a short list is one flow of typing. */
export function PlanAddInput({ surfaces, autoFocus, inputRef, onAdd }: { surfaces: WelcomeSurfaces; autoFocus?: boolean; /** For the page to put the cursor here. */ inputRef?: RefObject<NativeTextInput | null>; onAdd: (title: string) => void }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { rowStyle, isRTL } = useDirection();
  const { styleTokens } = useTheme();
  const [title, setTitle] = useState('');
  const ownInput = useRef<NativeTextInput>(null);
  const input = inputRef ?? ownInput;
  const submit = () => {
    if (!title.trim()) return;
    onAdd(title);
    setTitle('');
    input.current?.focus();
  };
  return <View style={[styles.row, rowStyle, { backgroundColor: surfaces.control, borderRadius: styleTokens.button.radius }]}>
    <TextInput
      ref={input}
      value={title}
      onChangeText={setTitle}
      onSubmitEditing={submit}
      submitBehavior="submit"
      autoFocus={autoFocus}
      returnKeyType="done"
      maxLength={200}
      accessibilityLabel={tr('plan.input')}
      placeholder={tr('plan.input')}
      placeholderTextColor={surfaces.inkMuted}
      style={[styles.input, { color: surfaces.ink, textAlign: isRTL ? 'right' : 'left' }]}
    />
    <Pressable accessibilityRole="button" accessibilityLabel={tr('plan.add')} accessibilityState={{ disabled: !title.trim() }} disabled={!title.trim()} onPress={submit} style={({ pressed }) => [styles.add, { backgroundColor: title.trim() ? surfaces.action : surfaces.track, borderRadius: styleTokens.button.radius }, pressed && styles.pressed]}>
      <Icon name="add" size={22} color={title.trim() ? surfaces.onAction : surfaces.inkMuted} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 52, alignItems: 'center', gap: spacing.xs, paddingStart: spacing.sm, paddingEnd: 4, paddingVertical: 4 },
  input: { flex: 1, minHeight: layout.minimumTouchTarget, fontSize: 15, paddingVertical: 0 },
  add: { width: layout.minimumTouchTarget, height: layout.minimumTouchTarget, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
});
