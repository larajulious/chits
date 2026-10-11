import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref, type RefObject } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import { NoteImage } from '@/components/notes/note-image';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { pasteClipboardImage, useClipboardHasImage } from '@/services/clipboard-image';
import { draftHasImages, draftImageCount, insertImageAtCursor, MAX_NOTE_IMAGES, newBlockKey, removeImageBlock, updateTextBlock, type NoteCursor, type NoteDraftBlock } from '@/services/note-content';

export type NoteBlocksEditorHandle = { focus: () => void; blur: () => void };

/** Deletes images pasted in this session but never saved — call when a draft is discarded. */
export function discardPastedImages(blocks: NoteDraftBlock[]) {
  for (const block of blocks) if (block.type === 'image' && !block.attachmentId) void block.remove?.().catch(() => undefined);
}

/**
 * Paste-image state shared by the editor and its "Paste image" action. Pasting
 * splits the text where the cursor is, so the image lands exactly there.
 */
export function useNoteImagePaste({ active, blocks, setBlocks, editor, onError }: { active: boolean; blocks: NoteDraftBlock[]; setBlocks: (update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => void; editor: RefObject<NoteBlocksEditorControl | null>; onError: (message: string | null) => void }) {
  const clipboardHasImage = useClipboardHasImage(active);
  const [pasting, setPasting] = useState(false);
  const blocksRef = useRef(blocks);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  const paste = useCallback(async () => {
    if (pasting) return;
    if (draftImageCount(blocksRef.current) >= MAX_NOTE_IMAGES) { onError(`A note can hold up to ${MAX_NOTE_IMAGES} images.`); return; }
    setPasting(true);
    onError(null);
    try {
      const pasted = await pasteClipboardImage();
      // Pasting the same clipboard twice is almost always a double tap.
      if (blocksRef.current.some((block) => block.type === 'image' && block.fingerprint === pasted.fingerprint)) {
        await pasted.remove().catch(() => undefined);
        onError('That image is already in this note.');
        return;
      }
      const image: Extract<NoteDraftBlock, { type: 'image' }> = { key: newBlockKey(), type: 'image', attachmentId: null, image: pasted.image, fingerprint: pasted.fingerprint, remove: pasted.remove };
      const result = insertImageAtCursor(blocksRef.current, editor.current?.cursor() ?? null, image);
      blocksRef.current = result.blocks;
      setBlocks(() => result.blocks);
      editor.current?.focusAt(result.cursor);
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : 'That image couldn’t be pasted.');
    } finally {
      setPasting(false);
    }
  }, [editor, onError, pasting, setBlocks]);
  return { canPaste: clipboardHasImage, pasting, paste };
}

export type NoteBlocksEditorControl = NoteBlocksEditorHandle & { cursor: () => NoteCursor; focusAt: (cursor: NoteCursor) => void };

/** The context-aware "Paste image" chip: only shown while the clipboard holds an image. */
export function PasteImageButton({ visible, pasting, disabled, onPress, style }: { visible: boolean; pasting: boolean; disabled?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  if (!visible && !pasting) return null;
  const off = Boolean(disabled) || pasting;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel="Paste image from clipboard"
    accessibilityState={{ disabled: off, busy: pasting }}
    disabled={off}
    onPress={onPress}
    style={({ pressed }) => [styles.chip, controls.panel, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }, style, disabled && styles.disabled, pressed && styles.pressed]}
  >
    {pasting ? <ActivityIndicator accessibilityLabel="Pasting image" size="small" color={theme.accentStrong} /> : <Icon name="clipboard-outline" size={16} color={theme.accentStrong} />}
    <AppText style={[styles.chipLabel, { color: theme.accentStrong }]}>{pasting ? 'Pasting…' : 'Paste image'}</AppText>
  </Pressable>;
}

type Props = {
  ref?: Ref<NoteBlocksEditorControl>;
  blocks: NoteDraftBlock[];
  onChangeBlocks: (update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => void;
  editable: boolean;
  placeholder: string;
  maxLength: number;
  // A note with no images is one plain TextInput, exactly as before (style:
  // `singleInputStyle`). Once it has an image, its text and images stack in a
  // scrolling column (`blockContainerStyle`) of auto-growing inputs (`blockInputStyle`).
  singleInputStyle: StyleProp<TextStyle>;
  blockContainerStyle?: StyleProp<ViewStyle>;
  blockInputStyle: StyleProp<TextStyle>;
  maxImageHeight: number;
  accessibilityLabel: string;
  onRemovePastedImage?: () => void;
  // Any of the note's inputs gaining or losing focus (Chat's composer expands on these).
  onFocus?: () => void;
  onBlur?: () => void;
  // Extra behavior for the lone input of a note without images (Chat's auto-growing composer field).
  singleInputProps?: Pick<TextInputProps, 'onContentSizeChange' | 'scrollEnabled' | 'textAlignVertical'>;
};

/**
 * A lightweight block editor — not a rich-text editor: plain TextInputs with
 * the note's images between them. React Native's TextInput can't hold an image,
 * so an image splits the text it was pasted into, and removing it joins that
 * text back together. Everything else (keyboard, selection, typing) is the
 * platform's own TextInput behavior.
 */
export function NoteBlocksEditor({ ref, blocks, onChangeBlocks, editable, placeholder, maxLength, singleInputStyle, blockContainerStyle, blockInputStyle, maxImageHeight, accessibilityLabel, onRemovePastedImage, onFocus, onBlur, singleInputProps }: Props) {
  const { tokens: theme } = useTheme();
  const inputs = useRef(new Map<string, TextInput>());
  const selections = useRef(new Map<string, { start: number; end: number }>());
  const lastFocused = useRef<string | null>(null);
  const pendingFocus = useRef<NoteCursor>(null);
  const [width, setWidth] = useState(0);
  const withImages = draftHasImages(blocks);
  const textBlocks = blocks.filter((block) => block.type === 'text');
  const totalText = textBlocks.reduce((sum, block) => sum + block.text.length, 0);
  const lastTextKey = textBlocks[textBlocks.length - 1]?.key ?? null;

  const focusBlock = useCallback((key: string | null) => { if (key) inputs.current.get(key)?.focus(); }, []);
  useImperativeHandle(ref, () => ({
    focus: () => focusBlock(lastFocused.current && inputs.current.has(lastFocused.current) ? lastFocused.current : lastTextKey),
    blur: () => { for (const input of inputs.current.values()) input.blur(); },
    cursor: () => {
      const key = lastFocused.current;
      if (!key || !blocks.some((block) => block.key === key)) return null;
      const selection = selections.current.get(key);
      const block = blocks.find((item) => item.key === key);
      const end = block?.type === 'text' ? block.text.length : 0;
      return { key, start: selection?.start ?? end, end: selection?.end ?? end };
    },
    focusAt: (cursor) => { pendingFocus.current = cursor; },
  }), [blocks, focusBlock, lastTextKey]);

  // After a paste the inputs re-render (possibly switching layout); put the cursor just after the image.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const frame = requestAnimationFrame(() => {
      lastFocused.current = target.key;
      selections.current.set(target.key, { start: target.start, end: target.end });
      focusBlock(target.key);
    });
    return () => cancelAnimationFrame(frame);
  }, [blocks, focusBlock]);

  const register = useCallback((key: string, input: TextInput | null) => { if (input) inputs.current.set(key, input); else inputs.current.delete(key); }, []);
  const focused = useCallback((key: string) => { lastFocused.current = key; onFocus?.(); }, [onFocus]);
  const selected = useCallback((key: string, selection: { start: number; end: number }) => { selections.current.set(key, selection); }, []);
  const changed = useCallback((key: string, value: string) => onChangeBlocks((current) => updateTextBlock(current, key, value)), [onChangeBlocks]);
  const textInput = (block: Extract<NoteDraftBlock, { type: 'text' }>, single: boolean) => <BlockInput
    key={block.key}
    block={block}
    register={register}
    onFocusBlock={focused}
    onSelectBlock={selected}
    onChangeBlock={changed}
    onBlurBlock={onBlur}
    extra={single ? singleInputProps : undefined}
    accessibilityLabel={accessibilityLabel}
    placeholder={single || (block.key === blocks[0]?.key && !totalText) ? placeholder : undefined}
    single={single}
    maxLength={Math.max(block.text.length, maxLength - (totalText - block.text.length))}
    editable={editable}
    style={single ? singleInputStyle : blockInputStyle}
  />;

  if (!withImages) {
    const first = blocks[0];
    return first?.type === 'text' ? textInput(first, true) : null;
  }

  const remove = (block: Extract<NoteDraftBlock, { type: 'image' }>) => {
    // A pasted image that was never saved is deleted now; a saved one only goes when the note is saved.
    if (!block.attachmentId) { void block.remove?.().catch(() => undefined); onRemovePastedImage?.(); }
    onChangeBlocks((current) => removeImageBlock(current, block.key));
  };

  const imageCount = draftImageCount(blocks);
  const imageNumbers = new Map(blocks.filter((block) => block.type === 'image').map((block, index) => [block.key, index + 1]));
  return <ScrollView style={blockContainerStyle} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
    <View style={styles.blocks} onLayout={({ nativeEvent }) => { const next = Math.floor(nativeEvent.layout.width); setWidth((current) => current === next ? current : next); }}>
    {blocks.map((block) => {
      if (block.type === 'text') return textInput(block, false);
      const label = imageCount > 1 ? `Image ${imageNumbers.get(block.key)} of ${imageCount}` : 'Image';
      const available = width;
      const ratio = block.image.width && block.image.height ? block.image.width / block.image.height : 4 / 3;
      const height = Math.round(Math.min(maxImageHeight, block.image.height || Infinity, available / ratio));
      return <View key={block.key} style={styles.imageBlock}>
        {available ? <NoteImage
          image={block.image}
          width={Math.floor(height * ratio)}
          height={height}
          accessibilityLabel={label}
          overlay={<Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()}`} accessibilityHint={block.attachmentId ? 'Removed when you save the note' : undefined} hitSlop={8} disabled={!editable} onPress={() => remove(block)} style={({ pressed }) => [styles.remove, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, pressed && styles.pressed]}><Icon name="close" size={16} color={theme.textPrimary} /></Pressable>}
        /> : <View style={{ height: Math.min(maxImageHeight, 120) }} />}
      </View>;
    })}
    </View>
  </ScrollView>;
}

type BlockInputProps = {
  block: Extract<NoteDraftBlock, { type: 'text' }>;
  register: (key: string, input: TextInput | null) => void;
  onFocusBlock: (key: string) => void;
  onSelectBlock: (key: string, selection: { start: number; end: number }) => void;
  onChangeBlock: (key: string, value: string) => void;
  onBlurBlock?: () => void;
  extra?: Props['singleInputProps'];
  accessibilityLabel: string;
  placeholder: string | undefined;
  single: boolean;
  maxLength: number;
  editable: boolean;
  style: StyleProp<TextStyle>;
};

// One run of the note's words. Alone (no images) it scrolls itself like any
// note field; between images it grows with its text inside the editor's column.
function BlockInput({ block, register, onFocusBlock, onSelectBlock, onChangeBlock, onBlurBlock, extra, accessibilityLabel, placeholder, single, maxLength, editable, style }: BlockInputProps) {
  const { tokens: theme } = useTheme();
  const { key } = block;
  return <TextInput
    ref={(input) => register(key, input)}
    accessibilityLabel={accessibilityLabel}
    value={block.text}
    onChangeText={(value) => onChangeBlock(key, value)}
    onFocus={() => onFocusBlock(key)}
    onBlur={onBlurBlock}
    onSelectionChange={({ nativeEvent }) => onSelectBlock(key, nativeEvent.selection)}
    placeholder={placeholder}
    placeholderTextColor={theme.textMuted}
    selectionColor={theme.accent}
    cursorColor={theme.accent}
    multiline
    scrollEnabled={single}
    textAlignVertical="top"
    maxLength={maxLength}
    editable={editable}
    style={style}
    {...extra}
  />;
}

const styles = StyleSheet.create({
  blocks: { gap: spacing.xs, paddingBottom: spacing.xs },
  imageBlock: { alignItems: 'flex-start' },
  remove: { position: 'absolute', top: 6, right: 6, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, elevation: 2 },
  chip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  chipLabel: { fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.64 },
});
