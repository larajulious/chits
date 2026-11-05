import { formattingText } from './note-formatting-copy';
import { useLocale } from '@/localization/provider';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, View, type TextStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { AppText, useFontStyle } from '@/components/ui/app-text';
import { noteFontStyle } from '@/services/note-text-style';
import { useTheme } from '@/components/theme-provider';
import { NOTE_HIGHLIGHTS, NOTE_TEXT_COLORS, type NoteFormat } from '@/services/note-rich-text';
import type { NoteCursor } from '@/services/note-content';
import type { NoteBlocksEditorControl } from './note-blocks-editor';

/** An inset bottom sheet participates in the host's keyboard-aware layout.
 * It never places a modal/backdrop over the note or steals native selection. */
export function NoteFormattingSheet({ editor, open, onClose }: { editor: RefObject<NoteBlocksEditorControl | null>; open: boolean; onClose: () => void }) {
  "use no memo";
  useLocale();
  const { tokens, scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const pressedSelection = useRef<NoteCursor>(null);
  const captureSelection = () => { pressedSelection.current = editor.current?.cursor() ?? null; };
  const [format, setFormat] = useState<NoteFormat>({ marks: {}, heading: 0, list: null });
  const [height] = useState(() => new Animated.Value(0));
  useEffect(() => editor.current?.subscribeRichFormat(setFormat), [editor, open]);
  useEffect(() => {
    const animation = Animated.timing(height, { toValue: open ? 188 : 0, duration: reduceMotion ? 0 : 180, useNativeDriver: false });
    animation.start(); return () => animation.stop();
  }, [height, open, reduceMotion]);
  useEffect(() => {
    if (!open) return;
    const handler = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => handler.remove();
  }, [onClose, open]);

  return <Animated.View pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} style={[styles.sheet, { height, backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }]}>
    <View style={styles.header}><AppText style={{ color: tokens.textSecondary, fontSize: 13, fontWeight: '700' }}>{formattingText("heading")}</AppText><Pressable accessibilityRole="button" accessibilityLabel={formattingText("close")} onPress={onClose} style={styles.close}><AppText style={{ color: tokens.accentStrong, fontWeight: '700' }}>{formattingText("done")}</AppText></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="always" showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
      <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {([0, 1, 2] as const).map(heading => <FormattingAction key={heading} label={formattingText(heading === 1 ? 'heading1' : heading === 2 ? 'heading2' : 'normal')} text={heading ? `H${heading}` : formattingText('text')} selected={format.heading === heading} onPressIn={captureSelection} onPress={() => editor.current?.setHeading(heading, pressedSelection.current)} />)}
        <View style={[styles.divider, { backgroundColor: tokens.borderSubtle }]} />
        {(['bold', 'italic', 'underline'] as const).map(mark => <FormattingAction key={mark} label={formattingText(mark)} text={mark === 'bold' ? 'B' : mark === 'italic' ? 'I' : 'U'} selected={Boolean(format.marks[mark])} onPressIn={captureSelection} onPress={() => editor.current?.format({ [mark]: !format.marks[mark] }, pressedSelection.current)} textStyle={mark === 'bold' ? { fontWeight: '800' } : mark === 'italic' ? { fontStyle: 'italic' } : { textDecorationLine: 'underline' }} />)}
        <View style={[styles.divider, { backgroundColor: tokens.borderSubtle }]} />
        {(['bullet', 'numbered', 'checklist'] as const).map(kind => <FormattingAction key={kind} label={formattingText(kind)} text={kind === 'bullet' ? '• List' : kind === 'numbered' ? '1. List' : '☑ Tasks'} selected={format.list === kind} onPressIn={captureSelection} onPress={() => editor.current?.toggleList(kind, pressedSelection.current)} />)}
      </ScrollView>
      <View style={styles.colorRow}><AppText style={[styles.label, { color: tokens.textSecondary }]}>{formattingText("text")}</AppText><ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches}>
        {Object.entries(NOTE_TEXT_COLORS).map(([name, color]) => {
          const active = (format.marks.color ?? 'default') === name;
          return <Pressable key={name} accessibilityRole="button" accessibilityLabel={formattingText("textColor", { color: formattingText(`colors.${name}`) })} accessibilityState={{ selected: active }} onPressIn={captureSelection} onPress={() => editor.current?.format({ color: name as keyof typeof NOTE_TEXT_COLORS }, pressedSelection.current)} style={[styles.swatchTarget, active && { backgroundColor: tokens.accentSoft }]}><View style={[styles.swatch, { backgroundColor: color ?? tokens.textPrimary, borderColor: active ? tokens.accentStrong : tokens.borderSubtle, borderWidth: active ? 2 : 1 }]}>{active ? <AppText style={{ fontSize: 14, color: name === 'white' || (name === 'default' && scheme === 'dark') ? '#24231F' : '#FFFFFF' }}>✓</AppText> : null}</View></Pressable>;
        })}
      </ScrollView></View>
      <View style={styles.colorRow}><AppText style={[styles.label, { color: tokens.textSecondary }]}>{formattingText("highlight")}</AppText><ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swatches}>
        {Object.entries(NOTE_HIGHLIGHTS).map(([name, color]) => {
          const active = (format.marks.highlight ?? 'none') === name;
          return <Pressable key={name} accessibilityRole="button" accessibilityLabel={formattingText("highlightColor", { color: formattingText(`colors.${name}`) })} accessibilityState={{ selected: active }} onPressIn={captureSelection} onPress={() => editor.current?.format({ highlight: name as keyof typeof NOTE_HIGHLIGHTS }, pressedSelection.current)} style={[styles.swatchTarget, active && { backgroundColor: tokens.accentSoft }]}><View style={[styles.swatch, { backgroundColor: color ?? tokens.surface, borderColor: active ? tokens.accentStrong : tokens.borderSubtle, borderWidth: active ? 2 : 1 }]}><AppText style={{ fontSize: 14, color: color ? '#24231F' : scheme === 'dark' ? '#F7F5EB' : '#24231F' }}>{name === 'none' ? '∅' : active ? '✓' : ''}</AppText></View></Pressable>;
        })}
      </ScrollView></View>
    </ScrollView>
  </Animated.View>;
}
function FormattingAction({ label, text, selected, onPress, onPressIn, textStyle }: { label: string; text: string; selected: boolean; onPress: () => void; onPressIn: () => void; textStyle?: TextStyle }) {
  const { tokens } = useTheme();
  const font = useFontStyle('body', '600');
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPressIn={onPressIn} onPress={onPress} style={({ pressed }) => [styles.action, { backgroundColor: selected ? tokens.accentSoft : tokens.surfaceElevated, borderColor: selected ? tokens.accentBorder : 'transparent' }, pressed && { opacity: 0.65 }]}><AppText style={[{ color: selected ? tokens.accentStrong : tokens.textPrimary, fontSize: 16, fontWeight: '600' }, textStyle, noteFontStyle({ bold: textStyle?.fontWeight === '800', italic: textStyle?.fontStyle === 'italic' }, font.fontFamily)]}>{text}</AppText></Pressable>;
}
const styles = StyleSheet.create({
  sheet: { overflow: 'hidden', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: StyleSheet.hairlineWidth },
  header: { height: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16 },
  close: { minHeight: 44, minWidth: 64, alignItems: 'center', justifyContent: 'center' },
  content: { gap: 4, paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  divider: { width: 1, height: 24, marginHorizontal: 2 },
  colorRow: { flexDirection: 'row', alignItems: 'center' },
  label: { width: 64, fontSize: 12, fontWeight: '600' },
  swatches: { flexDirection: 'row' },
  swatchTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  swatch: { width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
