import { contentTextStyle, firstStrongDirection, languageDirection } from '@/localization/text-layout';
import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentType, type Ref, type RefObject } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';

import ImagePlusGlyph from 'lucide-react-native/icons/image-plus';
import ListGlyph from 'lucide-react-native/icons/list';
import ListOrderedGlyph from 'lucide-react-native/icons/list-ordered';
import SquareCheckGlyph from 'lucide-react-native/icons/square-check-big';
import { NoteCheckbox } from './note-checkbox';
import { createNoteEditHistory } from '@/services/note-edit-history';
import { backspaceNoteBlock, editNoteListItem, toggleNoteList, toggleNoteChecklist } from '@/services/note-lists';

import { bindNativeImagePaste, subscribeNativeImagePaste, subscribeNativeBoundaryBackspace } from '@/services/native-image-paste';
import { pickAndStageMedia, type AttachmentDraft } from '@/services/attachment-import';
import { NoteImage } from '@/components/notes/note-image';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { pasteClipboardImage, useClipboardHasImage } from '@/services/clipboard-image';
import { draftHasRichContent, isEmptyNoteDraft, noteListMarkers, draftImageCount, insertImageAtCursor, MAX_NOTE_IMAGES, newBlockKey, removeImageBlock, updateTextBlock, type NoteList, type NoteCursor, type NoteDraftBlock } from '@/services/note-content';

type ToolbarGlyph = ComponentType<{ size: number; color: string; strokeWidth: number }>;
const ImagePlus = ImagePlusGlyph as ToolbarGlyph;
const List = ListGlyph as ToolbarGlyph;
const ListOrdered = ListOrderedGlyph as ToolbarGlyph;
const SquareCheck = SquareCheckGlyph as ToolbarGlyph;

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
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
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
      onError(tr("messages.thisContentCanHoldUpToImagesTry", { value1: MAX_NOTE_IMAGES }));
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
    if (draftImageCount(blocksRef.current) >= MAX_NOTE_IMAGES) { onError(tr("messages.thisContentCanHoldUpToImages", { value1: MAX_NOTE_IMAGES })); return; }
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
      if (available.current) onError(cause instanceof Error ? cause.message : tr("noteblockseditor.thatImageCouldnTBePasted"));
    } finally {
      busy.current = false;
      setPasting(false);
    }
  }, [editor, insertAttachment, onError]);
  const pick = useCallback(async (replaceKey?: string, savedCursor?: NoteCursor) => {
    if (busy.current || !available.current) return;
    if (!replaceKey && draftImageCount(blocksRef.current) >= MAX_NOTE_IMAGES) {
      onError(tr("messages.thisContentCanHoldUpToImages", { value1: MAX_NOTE_IMAGES }));
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
      if (available.current) { onError(cause instanceof Error ? cause.message : tr("noteblockseditor.thatImageCouldnTBeInserted")); editor.current?.focusAt(cursor); }
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
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={tr("noteblockseditor.insertImage")} accessibilityHint={tr("noteblockseditor.insertAPhotoAtTheCurrentCursorPosition")} accessibilityState={{ disabled: Boolean(disabled) || busy, busy }} disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.insert, pressed && styles.pressed, (disabled || busy) && styles.disabled]}>
    {busy ? <ActivityIndicator size="small" color={theme.textSecondary} /> : <ImagePlus size={22} color={theme.textSecondary} strokeWidth={1.8} />}
  </Pressable>;
}

export type NoteBlocksEditorControl = NoteBlocksEditorHandle & { cursor: () => NoteCursor; focusAt: (cursor: NoteCursor) => void; toggleList: (kind: NoteList['kind'], selection?: NoteCursor) => void; undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean; subscribeFormat: (listener: (kind: NoteList['kind'] | null) => void) => () => void };

/** The context-aware "Paste image" chip: only shown while the clipboard holds an image. */
export function PasteImageButton({ visible, pasting, disabled, onPress, style }: { visible: boolean; pasting: boolean; disabled?: boolean; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  if (!visible && !pasting) return null;
  const off = Boolean(disabled) || pasting;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={tr("noteblockseditor.pasteImageFromClipboard")}
    accessibilityState={{ disabled: off, busy: pasting }}
    disabled={off}
    onPress={onPress}
    style={({ pressed }) => [styles.chip, controls.panel, { backgroundColor: theme.accentSoft, borderColor: theme.accentBorder }, style, disabled && styles.disabled, pressed && styles.pressed]}
  >
    {pasting ? <ActivityIndicator accessibilityLabel={tr("noteblockseditor.pastingImage")} size="small" color={theme.accentStrong} /> : <Icon name="clipboard-outline" size={16} color={theme.accentStrong} />}
    <AppText style={[styles.chipLabel, { color: theme.accentStrong }]}>{pasting ? tr("noteblockseditor.pasting") : tr("noteblockseditor.pasteImage")}</AppText>
  </Pressable>;
}

type Props = {
  ref?: Ref<NoteBlocksEditorControl>;
  blocks: NoteDraftBlock[];
  onChangeBlocks: (update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => void;
  editable: boolean;
  placeholder: string;
  maxLength: number;
  // A plain note is one native TextInput (style:
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
 * A native block editor: TextInputs with
 * the note's images between them. React Native's TextInput can't hold an image,
 * so an image splits the text it was pasted into, and removing it joins that
 * text back together. The shared structural engine handles list/paragraph
 * boundaries; native inputs retain character editing and composition.
 */
export function NoteBlocksEditor({ ref, blocks, onChangeBlocks, editable, placeholder, maxLength, singleInputStyle, blockContainerStyle, blockInputStyle, maxImageHeight, accessibilityLabel, onRemovePastedImage, onReplaceImage, onFocus, onBlur, singleInputProps }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const locale = useLocale();
  const { tokens: theme } = useTheme();
  const inputs = useRef(new Map<string, TextInput>());
  const liveBlocks = useRef(blocks);
  const [history] = useState(() => createNoteEditHistory());
  useLayoutEffect(() => {
    // External loads and image operations start a new history: removed staged
    // files must never be resurrected by undo. Internal edits set liveBlocks first.
    if (liveBlocks.current !== blocks) history.reset();
    liveBlocks.current = blocks;
  }, [blocks, history]);
  const selections = useRef(new Map<string, { start: number; end: number }>());
  const lastFocused = useRef<string | null>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (blurTimer.current !== null) clearTimeout(blurTimer.current); }, []);
  const pendingFocus = useRef<NoteCursor>(null);
  const pendingScroll = useRef<string | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const positions = useRef(new Map<string, number>());
  const [width, setWidth] = useState(0);
  const richLayout = draftHasRichContent(blocks);
  const emptyDocument = isEmptyNoteDraft(blocks);
  const singleLayout = StyleSheet.flatten(singleInputStyle);
  const singleContainer = !richLayout ? { flex: singleLayout?.flex, flexGrow: singleLayout?.flexGrow, flexShrink: 1 as const, maxHeight: singleLayout?.maxHeight } : undefined;
  const markers = noteListMarkers(blocks);
  const formatListeners = useRef(new Set<(kind: NoteList['kind'] | null) => void>());
  const notifyFormat = useCallback((key: string | null) => {
    const block = liveBlocks.current.find((item) => item.key === key);
    for (const listener of formatListeners.current) listener(block?.type === 'text' ? block.list?.kind ?? null : null);
  }, []);
  useEffect(() => { notifyFormat(lastFocused.current); }, [blocks, notifyFormat]);
  const textBlocks = blocks.filter((block) => block.type === 'text');
  const totalText = textBlocks.reduce((sum, block) => sum + block.text.length, 0);
  const lastTextKey = textBlocks[textBlocks.length - 1]?.key ?? null;

  const focusBlock = useCallback((key: string | null) => { if (key) inputs.current.get(key)?.focus(); }, []);
  const scheduleFocus = useCallback((cursor: NoteCursor) => { pendingFocus.current = cursor; pendingScroll.current = cursor?.key ?? null; setFocusRequest((value) => value + 1); }, []);
  const currentCursor = useCallback((): NoteCursor => {
    const block = liveBlocks.current.find((item) => item.type === 'text' && item.key === lastFocused.current)
      ?? liveBlocks.current.findLast((item) => item.type === 'text');
    if (block?.type !== 'text') return null;
    const selection = selections.current.get(block.key);
    return { key: block.key, start: Math.min(selection?.start ?? block.text.length, block.text.length), end: Math.min(selection?.end ?? block.text.length, block.text.length) };
  }, []);
  const commit = useCallback((next: NoteDraftBlock[], cursor?: NoteCursor) => {
    if (next === liveBlocks.current) { if (cursor) scheduleFocus(cursor); return; }
    history.record({ blocks: liveBlocks.current, cursor: currentCursor() });
    liveBlocks.current = next;
    onChangeBlocks(() => next);
    if (cursor) scheduleFocus(cursor);
  }, [currentCursor, history, onChangeBlocks, scheduleFocus]);
  const travel = useCallback((direction: 'undo' | 'redo') => {
    if (!editable) return;
    const entry = history.travel(direction, { blocks: liveBlocks.current, cursor: currentCursor() });
    if (!entry) return;
    liveBlocks.current = entry.blocks;
    onChangeBlocks(() => entry.blocks);
    scheduleFocus(entry.cursor);
  }, [currentCursor, editable, history, onChangeBlocks, scheduleFocus]);
  const listAction = useCallback((kind: NoteList['kind'], selection?: NoteCursor) => {
    if (!editable) return;
    const result = toggleNoteList(liveBlocks.current, selection ?? currentCursor(), kind);
    commit(result.blocks, result.cursor);
  }, [commit, currentCursor, editable]);
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
    undo: () => travel('undo'),
    redo: () => travel('redo'),
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    subscribeFormat: (listener) => {
      formatListeners.current.add(listener);
      const block = blocks.find((item) => item.key === lastFocused.current);
      listener(block?.type === 'text' ? block.list?.kind ?? null : null);
      return () => { formatListeners.current.delete(listener); };
    },
  }), [blocks, focusBlock, history, lastTextKey, listAction, scheduleFocus, travel]);

  // Restore only structural selections, after native refs have committed. Ordinary
  // typing never controls selection or schedules a later cursor overwrite.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target || !editable) return;
    const input = inputs.current.get(target.key);
    if (!input) return;
    pendingFocus.current = null;
    lastFocused.current = target.key;
    selections.current.set(target.key, { start: target.start, end: target.end });
    focusBlock(target.key);
    input.setNativeProps({ selection: { start: target.start, end: target.end } });
  }, [blocks, focusBlock, focusRequest, editable]);
  const resetEmptyScroll = useCallback(() => {
    if (!isEmptyNoteDraft(liveBlocks.current)) return;
    // An old row coordinate must never scroll a newly cleared document. Native
    // content-size/layout callbacks also run after the viewport changes size.
    pendingScroll.current = null;
    positions.current.clear();
    scroll.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, []);
  useLayoutEffect(() => { if (emptyDocument) resetEmptyScroll(); }, [emptyDocument, resetEmptyScroll]);
  useEffect(() => {
    const key = pendingScroll.current;
    if (!key) return;
    // Wait for row layout only to scroll. Never defer cursor restoration here.
    const frame = requestAnimationFrame(() => {
      if (pendingScroll.current !== key) return;
      pendingScroll.current = null;
      const y = positions.current.get(key);
      if (y !== undefined) scroll.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [blocks, focusRequest]);

  const register = useCallback((key: string, input: TextInput | null) => { if (input) inputs.current.set(key, input); else inputs.current.delete(key); }, []);
  const focused = useCallback((key: string) => {
    if (blurTimer.current !== null) clearTimeout(blurTimer.current);
    blurTimer.current = null;
    lastFocused.current = key; notifyFormat(key); onFocus?.();
  }, [onFocus, notifyFormat]);
  const blurred = useCallback(() => {
    if (blurTimer.current !== null) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => {
      blurTimer.current = null;
      if (![...inputs.current.values()].some((input) => input.isFocused())) onBlur?.();
    }, 0);
  }, [onBlur]);
  const selected = useCallback((key: string, selection: { start: number; end: number }) => { selections.current.set(key, selection); }, []);
  const changed = useCallback((key: string, value: string) => {
    const current = liveBlocks.current;
    const block = current.find((item) => item.key === key);
    if (block?.type !== 'text' || block.text === value) return;
    if (block?.type === 'text' && block.list) {
      const result = editNoteListItem(current, key, value, selections.current.has(key) ? { key, ...selections.current.get(key)! } : null);
      commit(result.blocks, result.cursor);
    } else {
      const next = updateTextBlock(current, key, value);
      commit(next);
    }
  }, [commit]);
  const backspace = useCallback((key: string, expected: NoteDraftBlock, nativeSelection?: { start: number; end: number }) => {
    if (!editable || liveBlocks.current.find((item) => item.key === key) !== expected) return;
    const selection = nativeSelection ?? selections.current.get(key);
    if (!selection) return;
    const result = backspaceNoteBlock(liveBlocks.current, { key, ...selection });
    commit(result.blocks, result.cursor);
  }, [commit, editable]);
  const textInput = (block: Extract<NoteDraftBlock, { type: 'text' }>, single: boolean) => <BlockInput
    key={block.key}
    block={block}
    register={register}
    onFocusBlock={focused}
    onSelectBlock={selected}
    onChangeBlock={changed}
    onBoundaryBackspace={backspace}
    onBlurBlock={blurred}
    extra={single ? singleInputProps : undefined}
    accessibilityLabel={accessibilityLabel}
    placeholder={single || (block.key === blocks[0]?.key && !totalText) ? placeholder : undefined}
    single={single}
    maxLength={Math.max(block.text.length, maxLength - (totalText - block.text.length))}
    editable={editable}
    style={single ? singleInputStyle : [blockInputStyle, !block.text && styles.emptyInput, block.key === lastTextKey && styles.trailingInput, block.list?.kind === 'checklist' && styles.checklistInput, block.list?.kind === 'checklist' && block.list.checked && { color: theme.textMuted, textDecorationLine: 'line-through' }]}
  />;

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
  return <ScrollView ref={scroll} style={richLayout ? blockContainerStyle : singleContainer} scrollEnabled={richLayout} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" onLayout={resetEmptyScroll} onContentSizeChange={resetEmptyScroll}>
    <View style={[styles.blocks, !richLayout && styles.singleBlocks]} onLayout={({ nativeEvent }) => { const next = Math.floor(nativeEvent.layout.width); setWidth((current) => current === next ? current : next); }}>
    {blocks.map((block, blockIndex) => {
      // The final native input fills the unused editor space, so a tap anywhere
      // below the last image places the cursor after it, without storing blank lines.
      if (block.type === 'text') {
        const previous = blocks[blockIndex - 1];
        const consecutiveTasks = block.list?.kind === 'checklist' && previous?.type === 'text' && previous.list?.kind === 'checklist';
        return <View key={block.key} style={[block.list && styles.listRow, block.list && { flexDirection: firstStrongDirection(block.text, languageDirection(locale)) === 'rtl' ? 'row-reverse' : 'row' }, block.key === lastTextKey && styles.trailingText, { marginTop: richLayout && blockIndex ? (consecutiveTasks ? spacing.xxs : spacing.xs) : 0 }]} onLayout={({ nativeEvent }) => positions.current.set(block.key, nativeEvent.layout.y)}>
          {block.list?.kind === 'checklist'
            ? <NoteCheckbox checked={block.list.checked} label={block.text} disabled={!editable} onPress={() => commit(toggleNoteChecklist(liveBlocks.current, block.key))} />
            : block.list ? <AppText accessible={false} style={[blockInputStyle, styles.listMarker]}>{markers[blockIndex]}</AppText> : null}
          <View style={styles.listBody}>{textInput(block, !richLayout)}</View>
        </View>;
      }
      const label = imageCount > 1 ? tr('noteblockseditor.imagePosition', { position: imageNumbers.get(block.key), total: imageCount }) : tr("sharenote.image");
      const available = width;
      const ratio = block.image.width && block.image.height ? block.image.width / block.image.height : 4 / 3;
      const height = Math.round(Math.min(maxImageHeight, block.image.height || Infinity, available / ratio));
      return <View key={block.key} style={[styles.imageBlock, blockIndex > 0 && { marginTop: spacing.xs }]}>
        {available ? <NoteImage
          key={block.image.storagePath}
          image={block.image}
          width={Math.floor(height * ratio)}
          height={height}
          accessibilityLabel={label}
          overlay={<>
            {onReplaceImage ? <Pressable accessibilityRole="button" accessibilityLabel={tr("noteblockseditor.replaceValue", { value1: label.toLowerCase() })} hitSlop={4} disabled={!editable} onPress={() => onReplaceImage(block.key)} style={({ pressed }) => [styles.remove, styles.replace, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, pressed && styles.pressed]}><Icon name="image-outline" size={16} color={theme.textPrimary} /></Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={tr("noteblockseditor.removeValue", { value1: label.toLowerCase() })} accessibilityHint={block.attachmentId ? tr("noteblockseditor.removedWhenYouSaveTheNote") : undefined} hitSlop={4} disabled={!editable} onPress={() => remove(block)} style={({ pressed }) => [styles.remove, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }, pressed && styles.pressed]}><Icon name="close" size={16} color={theme.textPrimary} /></Pressable>
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
  onBoundaryBackspace: (key: string, expected: NoteDraftBlock, selection?: { start: number; end: number }) => void;
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
function BlockInput({ block, register, onFocusBlock, onSelectBlock, onChangeBlock, onBoundaryBackspace, onBlurBlock, extra, accessibilityLabel, placeholder, single, maxLength, editable, style }: BlockInputProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const locale = useLocale();
  const { tokens: theme } = useTheme();
  // Keep alignment in the style only. Supplying it both as a prop and in a
  // rich-input style makes RN clear native gravity when that style is removed,
  // even though the top-level prop is unchanged. Compact Chat can still center.
  const { textAlignVertical = 'top', ...inputProps } = extra ?? {};
  const { key } = block;
  const inputRef = useRef<TextInput | null>(null);
  const nativeBinding = useRef<(() => void) | null>(null);
  const bindMountedInput = useCallback(() => {
    nativeBinding.current?.();
    nativeBinding.current = null;
    const input = inputRef.current;
    if (input && editable) nativeBinding.current = bindNativeImagePaste(input, key);
  }, [editable, key]);
  const selection = useRef({ start: 0, end: 0 });
  const boundaryBackspace = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelBoundaryBackspace = () => {
    if (boundaryBackspace.current !== null) clearTimeout(boundaryBackspace.current);
    boundaryBackspace.current = null;
  };
  useEffect(() => () => {
    if (boundaryBackspace.current !== null) clearTimeout(boundaryBackspace.current);
  }, []);
  useEffect(() => {
    bindMountedInput();
    return () => { nativeBinding.current?.(); nativeBinding.current = null; };
  }, [bindMountedInput]);
  useEffect(() => subscribeNativeBoundaryBackspace((event) => {
    if (event.key !== key || !editable || !inputRef.current?.isFocused()) return;
    cancelBoundaryBackspace();
    onBoundaryBackspace(key, block, event);
  }), [block, editable, key, onBoundaryBackspace]);
  return <TextInput
    ref={(input) => { inputRef.current = input; register(key, input); }}
    accessibilityLabel={accessibilityLabel}
    value={block.text}
    onChangeText={(value) => { cancelBoundaryBackspace(); onChangeBlock(key, value); }}
    onKeyPress={({ nativeEvent }) => {
      if (nativeEvent.key === 'Backspace' && selection.current.start === 0 && selection.current.end === 0) {
        cancelBoundaryBackspace();
        // IMEs can send a deletion before committing composed/pasted text.
        // Only remove formatting if that deletion is not followed by a text edit.
        boundaryBackspace.current = setTimeout(() => { boundaryBackspace.current = null; onBoundaryBackspace(key, block); }, 0);
      }
    }}
    onLayout={bindMountedInput}
    onFocus={() => { bindMountedInput(); onFocusBlock(key); }}
    onBlur={onBlurBlock}
    onSelectionChange={({ nativeEvent }) => { selection.current = nativeEvent.selection; onSelectBlock(key, nativeEvent.selection); }}
    placeholder={placeholder}
    placeholderTextColor={theme.textMuted}
    selectionColor={theme.accent}
    cursorColor={theme.accent}
    multiline
    scrollEnabled={single}
    maxLength={maxLength}
    editable={editable}
    style={[style, contentTextStyle(block.text, languageDirection(locale)), { textAlignVertical }]}
    {...inputProps}
  />;
}

const styles = StyleSheet.create({
  listRow: { flexDirection: 'row' },
  listMarker: { width: 34, flexGrow: 0, minHeight: 0, textAlign: 'right', paddingRight: 8 },
  listBody: { flexGrow: 1, flexShrink: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center' },
  formattingAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  scrollContent: { flexGrow: 1 },
  blocks: { flexGrow: 1, paddingBottom: spacing.xs },
  singleBlocks: { paddingBottom: 0 },
  trailingText: { flexGrow: 1 },
  trailingInput: { flexGrow: 1, minHeight: 48 },
  emptyInput: { minHeight: 44 },
  checklistInput: { minHeight: 28 },
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
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const [active, setActive] = useState<NoteList['kind'] | null>(null);
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const pressedSelection = useRef<{ kind: NoteList['kind']; cursor: NoteCursor } | null>(null);
  useEffect(() => editor.current?.subscribeFormat((kind) => {
    setActive(kind);
    setHistoryState({ undo: editor.current?.canUndo() ?? false, redo: editor.current?.canRedo() ?? false });
  }), [editor]);
  return <View style={styles.toolbar}>
    {(['bullet', 'numbered', 'checklist'] as const).map((kind) => {
      const Glyph = kind === 'bullet' ? List : kind === 'numbered' ? ListOrdered : SquareCheck;
      return <Pressable key={kind} accessibilityRole="button" accessibilityLabel={kind === 'bullet' ? tr("noteblockseditor.bulletList") : kind === 'numbered' ? tr("noteblockseditor.numberedList") : tr("noteblockseditor.checkboxList")} accessibilityState={{ selected: active === kind, disabled: Boolean(disabled) }} disabled={disabled}
        onPressIn={() => { pressedSelection.current = { kind, cursor: editor.current?.cursor() ?? null }; }}
        onPress={() => {
          const saved = pressedSelection.current;
          pressedSelection.current = null;
          editor.current?.toggleList(kind, saved?.kind === kind ? saved.cursor : undefined);
        }} style={({ pressed }) => [styles.formattingAction, active === kind && { backgroundColor: theme.accentSoft }, disabled && styles.disabled, pressed && styles.pressed]}>
        <Glyph size={22} color={active === kind ? theme.accentStrong : theme.textSecondary} strokeWidth={1.8} />
      </Pressable>;
    })}
    {(['undo', 'redo'] as const).map((action) => <Pressable key={action} accessibilityRole="button" accessibilityLabel={action === 'undo' ? tr("noteblockseditor.undoNoteChange") : tr("noteblockseditor.redoNoteChange")} disabled={disabled || !historyState[action]} accessibilityState={{ disabled: Boolean(disabled) || !historyState[action] }} onPress={() => editor.current?.[action]()} style={[styles.formattingAction, (disabled || !historyState[action]) && styles.disabled]}><Icon name={action === 'undo' ? 'arrow-undo-outline' : 'arrow-redo-outline'} size={20} color={theme.textSecondary} /></Pressable>)}
  </View>;
}
