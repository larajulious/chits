import type { Ref } from 'react';
import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import type { FontWeight } from '@/constants/style-tokens';
import { useLocale } from '@/localization/provider';
import { needsSystemFont } from '@/localization/text-layout';
import { useFontStyle } from './app-text';

/**
 * A TextInput in the app's face, so what's typed matches what's shown once it's
 * saved. Complex scripts use system fallback even with an explicit Latin face.
 * Named after TextInput so a file can swap its import and keep the same ref type.
 */
export function AppTextInput({ style, ref, scriptText, ...props }: TextInputProps & { ref?: Ref<TextInput>; scriptText?: string }) {
  const locale = useLocale();
  const flattened = StyleSheet.flatten(style);
  const weight = flattened?.fontWeight;
  const font = useFontStyle('body', typeof weight === 'string' && /^[4-8]00$/.test(weight) ? weight as FontWeight : undefined);
  const scriptFont = needsSystemFont(scriptText ?? (props.value || props.defaultValue || props.placeholder || ''), locale)
    ? { fontFamily: undefined, includeFontPadding: true, ...(flattened?.fontSize ? { lineHeight: Math.max(flattened.lineHeight ?? 0, Math.ceil(flattened.fontSize * 1.5)) } : {}) }
    : null;
  return <TextInput ref={ref} {...props} style={[style, flattened?.fontFamily ? null : font, scriptFont]} />;
}
// eslint-disable-next-line @typescript-eslint/no-redeclare -- a value and its type, as TextInput itself is.
export type AppTextInput = TextInput;
