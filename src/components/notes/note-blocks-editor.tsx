import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentType, type Ref, type RefObject } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import ImagePlusGlyph from 'lucide-react-native/icons/image-plus';
import ListGlyph from 'lucide-react-native/icons/list';
import ListOrderedGlyph from 'lucide-react-native/icons/list-ordered';
import { editNoteListItem, toggleNoteList } from '@/services/note-lists';

import { bindNativeImagePaste, subscribeNativeImagePaste } from '@/services/native-image-paste';
import { pickAndStageMedia, type AttachmentDraft } from '@/services/attachment-import';
import { NoteImage } from '@/components/notes/note-image';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { pasteClipboardImage, useClipboardHasImage } from '@/services/clipboard-image';
import { draftHasRichContent, noteListMarkers, draftImageCount, insertImageAtCursor, MAX_NOTE_IMAGES, newBlockKey, removeImageBlock, updateTextBlock, type NoteList, type NoteCursor, type NoteDraftBlock } from '@/services/note-content';

type ToolbarGlyph = ComponentType<{ size: number; color: string; strokeWidth: number }>;
const ImagePlus = ImagePlusGlyph as ToolbarGlyph;
const List = ListGlyph as ToolbarGlyph;
const ListOrdered = ListOrderedGlyph as ToolbarGlyph;

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
  const [picking, setPicking] = useState(false);
  const busy = useRef(false);
  const available = useRef(active);
  useEffect(() => { available.current = active; }, [active]);
  const blocksRef = useRef(blocks);
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);
  useEffect(() => () => { available.current = false; }, []);
  const insertAttachment = useCallback((staged: AttachmentDraft, cursor = editor.current?.cursor() ?? null) => {
    if (!available.current || draftImageCount(blocksRef.current) >= MAX_NOTE_IMAGES || (cursor && !blocksRef.current.some((block) => block.key === cursor.key))) {
      void staged.remove().catch(() => undefined);
      onError(`This content can hold up to ${MAX_NOTE_IMAGES} images. Try inserting again.`);
      return;
    }
    const image: Extract<NoteDraftBlock, { type: 'image' }> = { key: newBlockKey(), type: 'image', attachmentId: null, image: staged.attachment, remove: staged.remove };
    const result = insertImageAtCursor(blocksRef.current, cursor, image);
    blocksRef.current = result.blocks;
    setBlocks(() => result.blocks);
    editor.current?.focusAt(result.cursor);
  }, [editor, onError, setBlocks]);
  const paste = useCallback(async (nativeCursor?: NonNullable<NoteCursor> & { kind?: 'paste' | 'pick' }) => {
    if (busy.current || !available.current) return;
    if (draftImageCount(blocksRef.current) >= MAX_NOTE_IMAGES) { onError(`This content can hold up to ${MAX_NOTE_IMAGES} images.`); return; }
    // Capture selection before asynchronous clipboard reads or image processing.
    const cursor = nativeCursor ?? editor.current?.cursor() ?? null;
    busy.current = true;
    setPasting(true);
    onError(null);
    try {
      const pasted = await pasteClipboardImage();
      if (!available.current) { await pasted.remove().catch(() => undefined); return; }
      insertAttachment({ attachment: { ...pasted.image, type: 'photo', duration: null }, remove: pasted.remove }, cursor);
    } catch (cause) {
      if (available.current) onError(cause instanceof Error ? cause.message : 'That image couldn’t be pasted.');
    } finally {
      busy.current = false;
      setPasting(false);
    }
  }, [editor, insertAttachment, onError]);
  const pick = useCallback(async (replaceKey?: string, savedCursor?: NoteCursor) => {
    if (busy.current || !available.current) return;
    if (!replaceKey && draftImageCount(blocksRef.current) >= MAX_NOTE_IMAGES) {
      onError(`This content can hold up to ${MAX_NOTE_IMAGES} images.`);
      return;
    }
    const cursor = savedCursor === undefined ? editor.current?.cursor() ?? null : savedCursor;
    busy.current = true;
    setPasting(true);
    setPicking(true);
    onError(null);
    try {
      const staged = await pickAndStageMedia('photo');
      if (!staged) { editor.current?.focusAt(cursor); return; }
      const previous = replaceKey ? blocksRef.current.find((block) => block.key === replaceKey && block.type === 'image') : null;
      if (!available.current || (replaceKey && !previous)) { await staged.remove(); return; }
      if (previous?.type === 'image') {
        const next = blocksRef.current.map((block): NoteDraftBlock => block.key === replaceKey
          ? { key: block.key, type: 'image', attachmentId: null, image: staged.attachment, remove: staged.remove }
          : block);
        blocksRef.current = next;
        setBlocks(() => next);
        // Saved files are removed by the repository only after a successful save.
        if (!previous.attachmentId && !next.some((block) => block.type === 'image' && block.image.storagePath === previous.image.storagePath)) void previous.remove?.().catch(() => undefined);
        editor.current?.focusAt(cursor);
      } else insertAttachment(staged, cursor);
    } catch (cause) {
      if (available.current) { onError(cause instanceof Error ? cause.message : 'That image couldn’t be inserted.'); editor.current?.focusAt(cursor); }
    } finally {
      busy.current = false;
      setPasting(false);
      setPicking(false);
    }
  }, [editor, insertAttachment, onError, setBlocks]);
  useEffect(() => subscribeNativeImagePaste((cursor) => {
    if (available.current && blocksRef.current.some((block) => block.key === cursor.key)) {
      if (cursor.kind === 'pick') void pick(undefined, cursor);
      else void paste(cursor);
    }
  }), [paste, pick]);
  return { canPaste: clipboardHasImage, pasting, picking, paste, pick, insertAttachment };
}

export function InsertImageButton({ disabled, busy, onPress }: { disabled?: boolean; busy: boolean; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel="Insert image" accessibilityHint="Insert a photo at the current cursor position" accessibilityState={{ disabled: Boolean(disabled) || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.insert, pressed && styles.pressed, (disabled || busy) && styles.disabled]}>
    {busy ? <ActivityIndicator size="small" color={theme.textSecondary} /> : <ImagePlus size={22} color={theme.textSecondary} strokeWidth={1.8} />}
  </Pressable>;
}

export type NoteBlocksEditorControl = NoteBlocksEditorHandle & { cursor: () => NoteCursor; focusAt: (cursor: NoteCursor) => void; toggleList: (kind: NoteList['kind']) => void; subscribeFormat: (listener: (kind: NoteList['kind'] | null) => void) => () => void };

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
  onReplaceImage?: (key: string) => void;
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
export function NoteBlocksEditor({ ref, blocks, onChangeBlocks, editable, placeholder, maxLength, singleInputStyle, blockContainerStyle, blockInputStyle, maxImageHeight, accessibilityLabel, onRemovePastedImage, onReplaceImage, onFocus, onBlur, singleInputProps }: Props) {
  const { tokens: theme } = useTheme();
  const inputs = useRef(new Map<string, TextInput>());
  const liveBlocks = useRef(blocks);
  useLayoutEffect(() => { liveBlocks.current = blocks; }, [blocks]);
  const selections = useRef(new Map<string, { start: number; end: number }>());
  const lastFocused = useRef<string | null>(null);
  const pendingFocus = useRef<NoteCursor>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const positions = useRef(new Map<string, number>());
  const [width, setWidth] = useState(0);
  const withImages = draftHasRichContent(blocks);
  const markers = noteListMarkers(blocks);
  const formatListeners = useRef(new Set<(kind: NoteList['kind'] | null) => void>());
  const notifyFormat = useCallback((key: string | null) => {
    const block = blocks.find((item) => item.key === key);
    for (const listener of formatListeners.current) listener(block?.type === 'text' ? block.list?.kind ?? null : null);
  }, [blocks]);
  useEffect(() => { notifyFormat(lastFocused.current); }, [notifyFormat]);
  const textBlocks = blocks.filter((block) => block.type === 'text');
  const totalText = textBlocks.reduce((sum, block) => sum + block.text.length, 0);
  const lastTextKey = textBlocks[textBlocks.length - 1]?.key ?? null;

  const focusBlock = useCallback((key: string | null) => { if (key) inputs.current.get(key)?.focus(); }, []);
  const scheduleFocus = useCallback((cursor: NoteCursor) => { pendingFocus.current = cursor; setFocusRequest((value) => value + 1); }, []);
  const listAction = useCallback((kind: NoteList['kind']) => {
    const key = lastFocused.current ?? lastTextKey;
    const selection = key ? selections.current.get(key) : null;
    const block = blocks.find((item) => item.key === key);
    const end = block?.type === 'text' ? block.text.length : 0;
    const result = toggleNoteList(liveBlocks.current, key ? { key, start: selection?.start ?? end, end: selection?.end ?? end } : null, kind);
    liveBlocks.current = result.blocks;
    onChangeBlocks(() => result.blocks);
    scheduleFocus(result.cursor);
  }, [blocks, lastTextKey, onChangeBlocks, scheduleFocus]);
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
    focusAt: scheduleFocus,
    toggleList: listAction,
    subscribeFormat: (listener) => {
      formatListeners.current.add(listener);
      const block = blocks.find((item) => item.key === lastFocused.current);
      listener(block?.type === 'text' ? block.list?.kind ?? null : null);
      return () => { formatListeners.current.delete(listener); };
    },
  }), [blocks, focusBlock, lastTextKey, listAction, scheduleFocus]);

  // After a paste the inputs re-render (possibly switching layout); put the cursor just after the image.
  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    const frame = requestAnimationFrame(() => {
      pendingFocus.current = null;
      lastFocused.current = target.key;
      selections.current.set(target.key, { start: target.start, end: target.end });
      focusBlock(target.key);
      inputs.current.get(target.key)?.setNativeProps({ selection: { start: target.start, end: target.end } });
      const y = positions.current.get(target.key);
      if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [blocks, focusBlock, focusRequest, editable]);

  const register = useCallback((key: string, input: TextInput | null) => { if (input) inputs.current.set(key, input); else inputs.current.delete(key); }, []);
  const focused = useCallback((key: string) => { lastFocused.current = key; notifyFormat(key); onFocus?.(); }, [onFocus, notifyFormat]);
  const selected = useCallback((key: string, selection: { start: number; end: number }) => { selections.current.set(key, selection); notifyFormat(key); }, [notifyFormat]);
  const changed = useCallback((key: string, value: string) => {
    const current = liveBlocks.current;
    const block = current.find((item) => item.key === key);
    if (block?.type === 'text' && block.list) {
      const result = editNoteListItem(current, key, value, selections.current.has(key) ? { key, ...selections.current.get(key)! } : null);
      liveBlocks.current = result.blocks;
      onChangeBlocks(() => result.blocks);
      if (result.cursor) scheduleFocus(result.cursor);
    } else {
      const next = updateTextBlock(current, key, value);
      liveBlocks.current = next;
      onChangeBlocks(() => next);
    }
  }, [onChangeBlocks, scheduleFocus]);
  const backspace = useCallback((key: string) => {
    const block = liveBlocks.current.find((item) => item.key === key);
    if (block?.type === 'text' && block.list && !block.text) {
    const result = toggleNoteList(liveBlocks.current, { key, start: 0, end: 0 }, block.list.kind);
      liveBlocks.current = result.blocks;
      onChangeBlocks(() => result.blocks);
      scheduleFocus(result.cursor);
    }
  }, [onChangeBlocks, scheduleFocus]);
  const textInput = (block: Extract<NoteDraftBlock, { type: 'text' }>, single: boolean) => <BlockInput
    key={block.key}
    block={block}
    register={register}
    onFocusBlock={focused}
    onSelectBlock={selected}
    onChangeBlock={changed}
    onEmptyBackspace={backspace}
    onBlurBlock={onBlur}
    extra={single ? singleInputProps : undefined}
    accessibilityLabel={accessibilityLabel}
    placeholder={single || (block.key === blocks[0]?.key && !totalText) ? placeholder : undefined}
    single={single}
    maxLength={Math.max(block.text.length, maxLength - (totalText - block.text.length))}
    editable={editable}
    style={single ? singleInputStyle : [blockInputStyle, !block.text && styles.emptyInput, block.key === lastTextKey && styles.trailingInput]}
  />;

  if (!withImages) {
    const first = blocks[0];
    return first?.type === 'text' ? textInput(first, true) : null;
  }

  const remove = (block: Extract<NoteDraftBlock, { type: 'image' }>) => {
    // A pasted image that was never saved is deleted now; a saved one only goes when the note is saved.
    if (!block.attachmentId && !blocks.some((other) => other.key !== block.key && other.type === 'image' && other.image.storagePath === block.image.storagePath)) { void block.remove?.().catch(() => undefined); onRemovePastedImage?.(); }
    const index = blocks.findIndex((item) => item.key === block.key);
    const before = blocks[index - 1];
    if (before?.type === 'text') pendingFocus.current = { key: before.key, start: before.text.length, end: before.text.length };
    onChangeBlocks((current) => removeImageBlock(current, block.key));
  };

  const imageCount = draftImageCount(blocks);
  const imageNumbers = new Map(blocks.filter((block) => block.type === 'image').map((block, index) => [block.key, index + 1]));
  return <ScrollView ref={scroll} style={blockContainerStyle} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="none">
    <View style={styles.blocks} onLayout={({ nativeEvent }) => { const next = Math.floor(nativeEvent.layout.width); setWidth((current) => current === next ? current : next); }}>
    {blocks.map((block, blockIndex) => {
      // The final native input fills the unused editor space, so a tap anywhere
      // below the last image places the cursor after it, without storing blank lines.
      if (block.type === 'text') return <View key={block.key} style={[block.list && styles.listRow, block.key === lastTextKey && styles.trailingText]} onLayout={({ nativeEvent }) => positions.current.set(block.key, nativeEvent.layout.y)}>{block.list ? <AppText accessible={false} style={[blockInputStyle, styles.listMarker]}>{markers[blockIndex]}</AppText> : null}<View style={styles.listBody}>{textInput(block, false)}</View></View>;
      const label = imageCount > 1 ? `Image ${imageNumbers.get(block.key)} of ${imageCount}` : 'Image';
      const available = width;
      const ratio = block.image.width && block.image.height ? block.image.width / block.image.height : 4 / 3;
      const height = Math.round(Math.min(maxImageHeight, block.image.height || Infinity, available / ratio));
      return <View key={block.key} style={styles.imageBlock}>
        {available ? <NoteImage
          key={block.image.storagePath}
          image={block.image}
          width={Math.floor(height * ratio)}
          height={height}
          accessibilityLabel={label}
          overlay={<>
            {onReplaceImage ? <Pressable accessibilityRole="button" accessibilityLabel={`Replace ${label.toLowerCase()}`} hitSlop={4} disabled={!editable} onPress={() => onReplaceImage(block.key)} style={({ pressed }) => [styles.remove, styles.replace, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, pressed && styles.pressed]}><Icon name="image-outline" size={16} color={theme.textPrimary} /></Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()}`} accessibilityHint={block.attachmentId ? 'Removed when you save the note' : undefined} hitSlop={4} disabled={!editable} onPress={() => remove(block)} style={({ pressed }) => [styles.remove, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, pressed && styles.pressed]}><Icon name="close" size={16} color={theme.textPrimary} /></Pressable>
          </>}
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
  onEmptyBackspace: (key: string) => void;
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
function BlockInput({ block, register, onFocusBlock, onSelectBlock, onChangeBlock, onEmptyBackspace, onBlurBlock, extra, accessibilityLabel, placeholder, single, maxLength, editable, style }: BlockInputProps) {
  const { tokens: theme } = useTheme();
  const { key } = block;
  const inputRef = useRef<TextInput | null>(null);
  const emptyBackspace = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelEmptyBackspace = () => {
    if (emptyBackspace.current !== null) clearTimeout(emptyBackspace.current);
    emptyBackspace.current = null;
  };
  useEffect(() => () => {
    if (emptyBackspace.current !== null) clearTimeout(emptyBackspace.current);
  }, []);
  useEffect(() => {
    const input = inputRef.current;
    if (input && editable) return bindNativeImagePaste(input, key);
  }, [editable, key]);
  return <TextInput
    ref={(input) => { inputRef.current = input; register(key, input); }}
    accessibilityLabel={accessibilityLabel}
    value={block.text}
    onChangeText={(value) => { if (value) cancelEmptyBackspace(); onChangeBlock(key, value); }}
    onKeyPress={({ nativeEvent }) => {
      if (nativeEvent.key === 'Backspace' && block.list && !block.text) {
        cancelEmptyBackspace();
        // IMEs can send a deletion before committing composed/pasted text.
        // Only remove formatting if that deletion is not followed by a text edit.
        emptyBackspace.current = setTimeout(() => { emptyBackspace.current = null; onEmptyBackspace(key); }, 50);
      }
    }}
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
  listRow: { flexDirection: 'row' },
  listMarker: { width: 34, flexGrow: 0, minHeight: 0, textAlign: 'right', paddingRight: 8 },
  listBody: { flexGrow: 1, flexShrink: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center' },
  formattingAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  scrollContent: { flexGrow: 1 },
  blocks: { flexGrow: 1, gap: spacing.xs, paddingBottom: spacing.xs },
  trailingText: { flexGrow: 1 },
  trailingInput: { flexGrow: 1, minHeight: 48 },
  emptyInput: { minHeight: 44 },
  imageBlock: { alignItems: 'flex-start' },
  insert: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  replace: { right: 44 },
  remove: { position: 'absolute', top: 6, right: 6, width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, elevation: 2 },
  chip: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth },
  chipLabel: { fontSize: 14, fontWeight: '600' },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.64 },
});

/** List controls share the native selection retained by the block editor. */
export function NoteListButtons({ editor, disabled }: { editor: RefObject<NoteBlocksEditorControl | null>; disabled?: boolean }) {
  const { tokens: theme } = useTheme();
  const [active, setActive] = useState<NoteList['kind'] | null>(null);
  useEffect(() => editor.current?.subscribeFormat(setActive), [editor]);
  return <View style={styles.toolbar}>
    {(['bullet', 'numbered'] as const).map((kind) => {
      const Glyph = kind === 'bullet' ? List : ListOrdered;
      return <Pressable key={kind} accessibilityRole="button" accessibilityLabel={kind === 'bullet' ? 'Bullet list' : 'Numbered list'} accessibilityState={{ selected: active === kind, disabled: Boolean(disabled) }} disabled={disabled} onPress={() => editor.current?.toggleList(kind)} style={({ pressed }) => [styles.formattingAction, active === kind && { backgroundColor: theme.accentSoft }, disabled && styles.disabled, pressed && styles.pressed]}>
        <Glyph size={22} color={active === kind ? theme.accentStrong : theme.textSecondary} strokeWidth={1.8} />
      </Pressable>;
    })}
  </View>;
}
