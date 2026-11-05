import { formattingText } from './note-formatting-copy';
import { noteHeadingStyle, noteTextSpans } from './note-rich-text';
import { NoteFormattingSheet } from './note-formatting-sheet';
import { formatRange, marksAt, cleanMarks, replaceNoteText, setNoteHeading, splitNoteHeading, continueNoteParagraph, type NoteParagraphContinuation, noteTitle, withNoteTitle, type NoteMarks, type NoteFormat } from '@/services/note-rich-text';
import { contentTextStyle, firstStrongDirection, languageDirection, needsSystemFont } from '@/localization/text-layout';
import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode, type Ref, type RefObject } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ImagePlusGlyph from 'lucide-react-native/icons/image-plus';
import ListGlyph from 'lucide-react-native/icons/list';
import ListOrderedGlyph from 'lucide-react-native/icons/list-ordered';
import SquareCheckGlyph from 'lucide-react-native/icons/square-check-big';
import { NoteCheckbox } from './note-checkbox';
import { createNoteEditHistory } from '@/services/note-edit-history';
import { backspaceNoteBlock, editNoteListItem, toggleNoteList, toggleNoteChecklist } from '@/services/note-lists';

import { bindNativeImagePaste, subscribeNativeImagePaste, subscribeNativeBoundaryBackspace } from '@/services/native-image-paste';
import { nativeNoteFormattingAvailable, syncNativeNoteFormatting, detachNativeNoteFormatting } from '@/services/native-note-formatting';
import { pickAndStageMedia, type AttachmentDraft } from '@/services/attachment-import';
import { NoteImage } from '@/components/notes/note-image';
import { useDesk } from '@/components/desk/paper-desk';
import { useKeyboardInset } from '@/hooks/use-keyboard-inset';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText, useFontStyle } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { pasteClipboardImage, useClipboardHasImage } from '@/services/clipboard-image';
import { isEmptyNoteDraft, noteListMarkers, draftImageCount, insertImageAtCursor, MAX_NOTE_IMAGES, newBlockKey, removeImageBlock, type NoteList, type NoteCursor, type NoteDraftBlock } from '@/services/note-content';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';

type ToolbarGlyph = ComponentType<{ size: number; color: string; strokeWidth: number }>;
const ImagePlus = ImagePlusGlyph as ToolbarGlyph;
const List = ListGlyph as ToolbarGlyph;
const ListOrdered = ListOrderedGlyph as ToolbarGlyph;
const SquareCheck = SquareCheckGlyph as ToolbarGlyph;

export type NoteBlocksEditorHandle = { focus: () => void; blur: () => void; setKeyboardSuppressed: (suppressed: boolean) => void };

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

export type NoteBlocksEditorControl = NoteBlocksEditorHandle & { cursor: () => NoteCursor; focusAt: (cursor: NoteCursor, revealBlock?: boolean) => void; toggleList: (kind: NoteList['kind'], selection?: NoteCursor) => void; undo: () => void; redo: () => void; canUndo: () => boolean; canRedo: () => boolean; format: (patch: NoteMarks, selection?: NoteCursor) => void; setHeading: (heading: 0 | 1 | 2, selection?: NoteCursor) => void; subscribeRichFormat: (listener: (format: NoteFormat) => void) => () => void; subscribeFormat: (listener: (kind: NoteList['kind'] | null) => void) => () => void };

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
  showTitle?: boolean;
  placeholder: string;
  maxLength: number;
  // A plain note is one native TextInput (style:
  // `singleInputStyle`). Once it has an image, its text and images stack in a
  // scrolling column (`blockContainerStyle`) of auto-growing inputs (`blockInputStyle`).
  singleInputStyle: StyleProp<TextStyle>;
  blockContainerStyle?: StyleProp<ViewStyle>;
  // Fullscreen hosts can bound the lone scrolling input to their viewport.
  // Compact composers retain their intrinsic content height by default.
  fillViewport?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
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
export function NoteBlocksEditor({ ref, blocks, onChangeBlocks, editable, placeholder, maxLength, singleInputStyle, blockContainerStyle, blockInputStyle, maxImageHeight, accessibilityLabel, onRemovePastedImage, onReplaceImage, onFocus, onBlur, singleInputProps, fillViewport = false, contentContainerStyle, showTitle = true }: Props) {
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
  const [focusTarget, setFocusTarget] = useState<NoteCursor>(null);
  const [keyboardSuppressed, setKeyboardSuppressed] = useState(false);
  const keyboardSuppressedRef = useRef(false);
  const formattingCursor = useRef<NoteCursor>(null);
  const scroll = useRef<ScrollView>(null);
  const positions = useRef(new Map<string, number>());
  const [width, setWidth] = useState(0);
  const richLayout = blocks.length > 1 || blocks.some(block => block.type === 'image' || block.list || block.heading);
  const fillPlainViewport = fillViewport && !richLayout;
  const emptyDocument = isEmptyNoteDraft(blocks);
  const singleLayout = StyleSheet.flatten(singleInputStyle);
  // External text (such as an onboarding sample) can expand an unfocused
  // composer. Bound the viewport too, so its ScrollView cannot shrink the
  // mounted TextInput to zero while the composer changes layout.
  const singleContainer = !richLayout ? { flex: singleLayout?.flex, flexGrow: singleLayout?.flexGrow, flexShrink: 1 as const, minHeight: singleLayout?.minHeight ?? singleLayout?.height, maxHeight: singleLayout?.maxHeight } : undefined;
  const markers = noteListMarkers(blocks);
  const headingContinuation = useRef<NoteParagraphContinuation | null>(null);
  const pendingMarks = useRef<{ key: string; at: number; marks: NoteMarks } | null>(null);
  const richListeners = useRef(new Set<(format: NoteFormat) => void>());
  const formatListeners = useRef(new Set<(kind: NoteList['kind'] | null) => void>());
  const notifyFormat = useCallback((key: string | null) => {
    const block = liveBlocks.current.find((item) => item.key === key);
    const selection = key ? formattingCursor.current?.key === key ? formattingCursor.current : selections.current.get(key) : null;
    const marks = pendingMarks.current?.key === key ? pendingMarks.current.marks : block?.type === 'text' ? marksAt(block, selection?.start ?? 0, selection?.end ?? 0) : {};
    for (const listener of richListeners.current) listener({ marks, heading: block?.type === 'text' ? block.heading ?? 0 : 0, list: block?.type === 'text' ? block.list?.kind ?? null : null });
    for (const listener of formatListeners.current) listener(block?.type === 'text' ? block.list?.kind ?? null : null);
  }, []);
  useEffect(() => { notifyFormat(lastFocused.current); }, [blocks, notifyFormat]);
  const textBlocks = blocks.filter((block) => block.type === 'text');
  const totalText = textBlocks.reduce((sum, block) => sum + block.text.length, 0);
  const lastTextKey = textBlocks[textBlocks.length - 1]?.key ?? null;

  const focusBlock = useCallback((key: string | null) => { if (key) inputs.current.get(key)?.focus(); }, []);
  const scheduleFocus = useCallback((cursor: NoteCursor, revealBlock = true) => {
    if (keyboardSuppressedRef.current) formattingCursor.current = cursor;
    pendingFocus.current = cursor;
    setFocusTarget(cursor);
    pendingScroll.current = revealBlock ? cursor?.key ?? null : null;
    setFocusRequest((value) => value + 1);
  }, []);
  const currentCursor = useCallback((): NoteCursor => {
    if (formattingCursor.current) return formattingCursor.current;
    const block = liveBlocks.current.find((item) => item.type === 'text' && item.key === lastFocused.current)
      ?? liveBlocks.current.findLast((item) => item.type === 'text');
    if (block?.type !== 'text') return null;
    const selection = selections.current.get(block.key);
    return { key: block.key, start: Math.min(selection?.start ?? block.text.length, block.text.length), end: Math.min(selection?.end ?? block.text.length, block.text.length) };
  }, []);
  const suppressKeyboard = useCallback((suppressed: boolean) => {
    const cursor = suppressed ? currentCursor() : null;
    keyboardSuppressedRef.current = suppressed;
    formattingCursor.current = cursor;
    setKeyboardSuppressed(suppressed);
  }, [currentCursor]);
  const releaseRequestedSelection = useCallback(() => {
    formattingCursor.current = null;
    pendingFocus.current = null;
    pendingScroll.current = null;
    setFocusTarget(null);
  }, []);
  const commit = useCallback((next: NoteDraftBlock[], cursor?: NoteCursor, titleEdit = false) => {
    if (next === liveBlocks.current) { if (cursor) scheduleFocus(cursor); return; }
    const title = noteTitle(liveBlocks.current);
    if (!titleEdit && title && noteTitle(next) !== title) next = withNoteTitle(next, title);
    history.record({ blocks: liveBlocks.current, cursor: currentCursor() });
    liveBlocks.current = next;
    onChangeBlocks(() => next);
    if (cursor) scheduleFocus(cursor);
  }, [currentCursor, history, onChangeBlocks, scheduleFocus]);
  const travel = useCallback((direction: 'undo' | 'redo') => {
    if (!editable) return;
    pendingMarks.current = null;
    headingContinuation.current = null;
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
  const formatAction = useCallback((patch: NoteMarks, selection?: NoteCursor) => {
    if (!editable) return;
    const cursor = selection ?? currentCursor();
    const block = liveBlocks.current.find(item => item.key === cursor?.key);
    if (!cursor || block?.type !== 'text') return;
    if (cursor.start === cursor.end) {
      const base = pendingMarks.current?.key === block.key ? pendingMarks.current.marks : marksAt(block, cursor.start);
      pendingMarks.current = { key: block.key, at: cursor.start, marks: cleanMarks({ ...base, ...patch }) };
      notifyFormat(block.key);
    } else {
      commit(liveBlocks.current.map(item => item.key === block.key ? { ...formatRange(block, cursor.start, cursor.end, patch), key: block.key } : item));
      notifyFormat(block.key);
    }
    // Android can collapse its selection when a toolbar Pressable takes the
    // touch. Restore the range captured before that touch, after React commits.
    scheduleFocus(cursor, false);
  }, [commit, currentCursor, editable, notifyFormat, scheduleFocus]);
  useImperativeHandle(ref, () => ({
    focus: () => focusBlock(lastFocused.current && inputs.current.has(lastFocused.current) ? lastFocused.current : lastTextKey),
    blur: () => { for (const input of inputs.current.values()) input.blur(); },
    setKeyboardSuppressed: suppressKeyboard,
    cursor: () => {
      if (formattingCursor.current) return formattingCursor.current;
      const key = lastFocused.current;
      if (!key || !blocks.some((block) => block.key === key)) return null;
      const selection = selections.current.get(key);
      const block = blocks.find((item) => item.key === key);
      const end = block?.type === 'text' ? block.text.length : 0;
      return { key, start: selection?.start ?? end, end: selection?.end ?? end };
    },
    focusAt: scheduleFocus,
    toggleList: listAction,
    format: formatAction,
    setHeading: (heading, selection) => { if (editable) { const result = setNoteHeading(liveBlocks.current, selection ?? currentCursor(), heading); commit(result.blocks, result.cursor); } },
    subscribeRichFormat: (listener) => { richListeners.current.add(listener); notifyFormat(lastFocused.current); return () => { richListeners.current.delete(listener); }; },
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
  }), [blocks, commit, currentCursor, editable, focusBlock, formatAction, history, lastTextKey, listAction, notifyFormat, scheduleFocus, suppressKeyboard, travel]);

  // Restore explicit formatting/structural selections after native refs commit. Ordinary
  // typing never controls selection or schedules a later cursor overwrite.
  useLayoutEffect(() => {
    const target = pendingFocus.current;
    if (!target || !editable) return;
    const input = inputs.current.get(target.key);
    if (!input) return;
    pendingFocus.current = null;
    lastFocused.current = target.key;
    selections.current.set(target.key, { start: target.start, end: target.end });
    if (!keyboardSuppressed && !input.isFocused()) focusBlock(target.key);
    // BlockInput receives a transient selection prop. RN 0.86 Fabric applies
    // selection through TextInput commands, not a native view selection prop.
  }, [blocks, focusBlock, focusRequest, editable, keyboardSuppressed]);
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
  const selected = useCallback((key: string, selection: { start: number; end: number }) => {
    // Dismissing Android's keyboard can emit a collapsed selection *after*
    // acknowledging the requested range. Retain the formatting session's range
    // until the user touches/types in the body or closes the sheet.
    const held = formattingCursor.current;
    if (held && (key !== held.key || selection.start !== held.start || selection.end !== held.end)) return;
    // Structural splits can emit one final selection from the previous input.
    // Only the focused input can change the active typing marks.
    const requested = pendingFocus.current ?? focusTarget;
    if (requested && (key !== requested.key || selection.start !== requested.start || selection.end !== requested.end)) return;
    selections.current.set(key, selection);
    if (key !== lastFocused.current) return;
    setFocusTarget(target => target?.key === key && target.start === selection.start && target.end === selection.end ? null : target);
    if (pendingMarks.current && (pendingMarks.current.key !== key || selection.start !== pendingMarks.current.at || selection.end !== selection.start)) pendingMarks.current = null;
    notifyFormat(key);
  }, [focusTarget, notifyFormat]);
  const changed = useCallback((key: string, value: string) => {
    formattingCursor.current = null;
    setFocusTarget(null);
    const current = liveBlocks.current;
    const continued = continueNoteParagraph(current, key, value, headingContinuation.current, pendingMarks.current?.key === headingContinuation.current?.targetKey ? pendingMarks.current?.marks : undefined);
    if (continued) {
      headingContinuation.current = continued.continuation;
      if (pendingMarks.current) pendingMarks.current.at = continued.cursor.start;
      commit(continued.blocks, continued.cursor);
      return;
    }
    if (headingContinuation.current?.sourceKey !== key) headingContinuation.current = null;
    const block = current.find((item) => item.key === key);
    if (block?.type !== 'text' || block.text === value) return;
    const selection = selections.current.get(key);
    const typingMarks = pendingMarks.current?.key === key ? pendingMarks.current.marks : marksAt(block, selection?.start ?? block.text.length, selection?.end ?? block.text.length);
    const replacement = replaceNoteText(block, value, pendingMarks.current?.key === key ? pendingMarks.current.marks : undefined, selections.current.get(key));
    if (pendingMarks.current?.key === key) pendingMarks.current.at = Math.max(0, value.length - block.text.length + (selections.current.get(key)?.end ?? block.text.length));
    if (block?.type === 'text' && block.list) {
      const result = editNoteListItem(current, key, value, selections.current.has(key) ? { key, ...selections.current.get(key)! } : null, replacement);
      if (result.cursor) pendingMarks.current = { key: result.cursor.key, at: result.cursor.start, marks: typingMarks };
      commit(result.blocks, result.cursor);
    } else if (block.heading && value.includes('\n')) {
      const result = splitNoteHeading(current, replacement, selections.current.get(key));
      pendingMarks.current = result.cursor ? { key: result.cursor.key, at: result.cursor.start, marks: typingMarks } : null;
      const newline = value.indexOf('\n');
      if (result.cursor && value.indexOf('\n', newline + 1) < 0 && result.cursor.key !== key) headingContinuation.current = { sourceKey: key, targetKey: result.cursor.key, prefix: value.slice(0, newline + 1), nativeValue: value, caret: result.cursor.start };
      commit(result.blocks, result.cursor);
    } else {
      const next = current.map(item => item.key === key ? replacement : item);
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
    onTouchBlock={() => { headingContinuation.current = null; releaseRequestedSelection(); }}
    onKeyBlock={releaseRequestedSelection}
    requestedSelection={focusTarget?.key === block.key ? { start: focusTarget.start, end: focusTarget.end } : undefined}
    register={register}
    onFocusBlock={focused}
    onSelectBlock={selected}
    onChangeBlock={changed}
    onBoundaryBackspace={backspace}
    onBlurBlock={blurred}
    keyboardSuppressed={keyboardSuppressed}
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
    if (before?.type === 'text') scheduleFocus({ key: before.key, start: before.text.length, end: before.text.length });
    onChangeBlocks((current) => removeImageBlock(current, block.key));
  };

  const imageCount = draftImageCount(blocks);
  // Normalization keeps an empty slot before a leading image. It is an editor
  // boundary, not an authored paragraph: don't display an undeletable prompt.
  // Keep the trailing input so text can still be added below the image.
  const leadingImageSlot = blocks[0]?.type === 'text' && blocks[0].text === '' && !blocks[0].list && blocks[1]?.type === 'image';
  const imageNumbers = new Map(blocks.filter((block) => block.type === 'image').map((block, index) => [block.key, index + 1]));
  return <ScrollView ref={scroll} style={richLayout ? blockContainerStyle : singleContainer} scrollEnabled={richLayout || showTitle} contentContainerStyle={[styles.scrollContent, fillPlainViewport && styles.fillViewport, contentContainerStyle]} keyboardShouldPersistTaps="handled" keyboardDismissMode="none" onLayout={resetEmptyScroll} onContentSizeChange={resetEmptyScroll}>
    {showTitle ? <TextInput showSoftInputOnFocus={!keyboardSuppressed} accessibilityLabel={formattingText("titleLabel")} placeholder={formattingText("titlePlaceholder")} value={noteTitle(blocks)} onChangeText={title => commit(withNoteTitle(liveBlocks.current, title), undefined, true)} editable={editable} maxLength={200} placeholderTextColor={theme.textMuted} style={{ color: theme.textPrimary, fontSize: 20, fontWeight: '700', flexShrink: 0, minHeight: 48, paddingHorizontal: richLayout ? 0 : singleLayout?.paddingHorizontal ?? 0, paddingVertical: spacing.xs, marginBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderSubtle }} /> : null}
    <View style={[styles.blocks, !richLayout && styles.singleBlocks, fillPlainViewport && styles.fillViewport]} onLayout={({ nativeEvent }) => { const next = Math.floor(nativeEvent.layout.width); setWidth((current) => current === next ? current : next); }}>
    {blocks.map((block, blockIndex) => {
      if (blockIndex === 0 && leadingImageSlot) return null;
      // The final native input fills the unused editor space, so a tap anywhere
      // below the last image places the cursor after it, without storing blank lines.
      if (block.type === 'text') {
        const previous = blocks[blockIndex - 1];
        const consecutiveTasks = block.list?.kind === 'checklist' && previous?.type === 'text' && previous.list?.kind === 'checklist';
        return <View key={block.key} style={[block.list && styles.listRow, block.list && { flexDirection: firstStrongDirection(block.text, languageDirection(locale)) === 'rtl' ? 'row-reverse' : 'row' }, block.key === lastTextKey && styles.trailingText, fillPlainViewport && styles.fillViewport, { marginTop: richLayout && blockIndex ? (consecutiveTasks ? spacing.xxs : spacing.xs) : 0 }]} onLayout={({ nativeEvent }) => positions.current.set(block.key, nativeEvent.layout.y)}>
          {block.list?.kind === 'checklist'
            ? <NoteCheckbox checked={block.list.checked} label={block.text} disabled={!editable} onPress={() => commit(toggleNoteChecklist(liveBlocks.current, block.key))} />
            : block.list ? <AppText accessible={false} style={[blockInputStyle, styles.listMarker]}>{markers[blockIndex]}</AppText> : null}
          <View style={[styles.listBody, fillPlainViewport && styles.fillViewport]}>{textInput(block, !richLayout)}</View>
        </View>;
      }
      const label = imageCount > 1 ? tr('noteblockseditor.imagePosition', { position: imageNumbers.get(block.key), total: imageCount }) : tr("sharenote.image");
      const available = width;
      const ratio = block.image.width && block.image.height ? block.image.width / block.image.height : 4 / 3;
      const height = Math.round(Math.min(maxImageHeight, block.image.height || Infinity, available / ratio));
      return <View key={block.key} style={[styles.imageBlock, blockIndex > (leadingImageSlot ? 1 : 0) && { marginTop: spacing.xs }]}>
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
  keyboardSuppressed?: boolean;
  block: Extract<NoteDraftBlock, { type: 'text' }>;
  onTouchBlock?: () => void;
  onKeyBlock?: () => void;
  requestedSelection?: { start: number; end: number };
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
function BlockInput({ block, onTouchBlock, onKeyBlock, requestedSelection, register, onFocusBlock, onSelectBlock, onChangeBlock, onBoundaryBackspace, onBlurBlock, extra, accessibilityLabel, placeholder, single, maxLength, editable, style, keyboardSuppressed = false }: BlockInputProps) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  const locale = useLocale();
  const { tokens: theme } = useTheme();
  // Keep alignment in the style only. Supplying it both as a prop and in a
  // rich-input style makes RN clear native gravity when that style is removed,
  // even though the top-level prop is unchanged. Compact Chat can still center.
  const { textAlignVertical = 'top', ...inputProps } = extra ?? {};
  const font = useFontStyle('body');
  const baseFamily = needsSystemFont(block.text, locale) ? undefined : StyleSheet.flatten(style)?.fontFamily ?? font.fontFamily;
  const { key } = block;
  const inputRef = useRef<TextInput | null>(null);
  const registerInput = useCallback((input: TextInput | null) => {
    if (inputRef.current && inputRef.current !== input) detachNativeNoteFormatting(inputRef.current);
    inputRef.current = input;
    register(key, input);
  }, [key, register]);
  const syncFormatting = useCallback(() => {
    if (inputRef.current) syncNativeNoteFormatting(inputRef.current, block, baseFamily);
  }, [baseFamily, block]);
  useLayoutEffect(syncFormatting, [syncFormatting]);
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
    ref={registerInput}
    accessibilityLabel={accessibilityLabel}
    scriptText={block.text}
    selection={requestedSelection}
    showSoftInputOnFocus={!keyboardSuppressed}
    onTouchStart={onTouchBlock}
    // Android owns one ordinary controlled text buffer. Native spans style it
    // without replacing characters, selection or composing text. Other runtimes
    // keep the attributed fallback; a runtime never switches modes per mark.
    value={nativeNoteFormattingAvailable ? block.text : undefined}
    onChangeText={(value) => { cancelBoundaryBackspace(); onChangeBlock(key, value); }}
    onKeyPress={({ nativeEvent }) => {
      onKeyBlock?.();
      if (nativeEvent.key === 'Backspace' && selection.current.start === 0 && selection.current.end === 0) {
        cancelBoundaryBackspace();
        // IMEs can send a deletion before committing composed/pasted text.
        // Only remove formatting if that deletion is not followed by a text edit.
        boundaryBackspace.current = setTimeout(() => { boundaryBackspace.current = null; onBoundaryBackspace(key, block); }, 0);
      }
    }}
    onLayout={() => { bindMountedInput(); syncFormatting(); }}
    onFocus={() => { bindMountedInput(); syncFormatting(); onFocusBlock(key); }}
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
    style={[style, noteHeadingStyle(block.heading), contentTextStyle(block.text, languageDirection(locale)), { textAlignVertical }]}
    {...inputProps}
  >{nativeNoteFormattingAvailable ? undefined : <Text>{noteTextSpans(block, baseFamily)}</Text>}</TextInput>;
}

const styles = StyleSheet.create({
  listRow: { flexDirection: 'row' },
  listMarker: { width: 34, flexGrow: 0, minHeight: 0, textAlign: 'right', paddingRight: 8 },
  listBody: { flexGrow: 1, flexShrink: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center' },
  formattingAction: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  scrollContent: { flexGrow: 1 },
  fillViewport: { flex: 1, minHeight: 0 },
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

/**
 * Shared editor geometry. Fullscreen Chat/Add/Edit use a continuous page via
 * `fullscreenPage`; embedded Focus/template editors keep their inset `page`.
 * `input` is a plain note's text; `blocks` and `blockInput` lay out rich content.
 */
export const noteEditorStyles = StyleSheet.create({
  // Fullscreen hosts use the whole page; no inset paper panel around the input.
  fullscreenPage: { flex: 1 },
  page: { flex: 1, marginHorizontal: spacing.sm, marginTop: spacing.xs, marginBottom: spacing.xs },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md, fontSize: 17, lineHeight: 27 },
  blocks: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  blockInput: { minHeight: 27, padding: 0, fontSize: 17, lineHeight: 27, textAlignVertical: 'top' },
});

/** What the toolbar needs from useNoteImagePaste. */
export type NoteImagePaste = Pick<ReturnType<typeof useNoteImagePaste>, 'canPaste' | 'pasting' | 'picking' | 'paste' | 'pick'>;

/**
 * The one formatting bar under every full note editor: photo, lists,
 * undo/redo and, while the clipboard holds an image, Paste image, in a single
 * row that scrolls sideways rather than wrapping, on a hairline. Extra actions
 * go at its end (`children`). With `safeBottom` it clears the home indicator
 * or navigation bar while the keyboard is closed; with the keyboard open it
 * sits right on top of it (see KeyboardPane).
 */
export function NoteToolbar({ editor, images, disabled, safeBottom = false, children }: { editor: RefObject<NoteBlocksEditorControl | null>; images?: NoteImagePaste; disabled?: boolean; safeBottom?: boolean; children?: ReactNode }) {
  "use no memo";
  useLocale();
  const desk = useDesk();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const [formatting, setFormatting] = useState(false);
  const [keyboardHidden, setKeyboardHidden] = useState(() => !Keyboard.isVisible());
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setKeyboardHidden(false));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHidden(true));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  const formattingSelection = useRef<NoteCursor>(null);
  const formatDisabled = Boolean(disabled || images?.pasting);
  const formatRequested = formatting && !formatDisabled;
  const sheetOpen = formatRequested && keyboardHidden;
  useLayoutEffect(() => {
    const control = editor.current;
    control?.setKeyboardSuppressed(formatRequested);
    if (formatRequested) {
      // Retain the range before dismissing native focus. Formatting restores
      // selection without reopening the keyboard, including new list inputs.
      if (formattingSelection.current) control?.focusAt(formattingSelection.current, false);
      // Let the keyboard finish changing the viewport before moving controls
      // into it. A user can then tap a swatch without it moving mid-press.
      Keyboard.dismiss();
    }
    return () => control?.setKeyboardSuppressed(false);
  }, [editor, formatRequested]);
  const { tokens: theme } = useTheme();
  return <View style={[toolbarStyles.bar, { borderTopColor: desk.rule, paddingBottom: safeBottom && !keyboard ? insets.bottom : 0 }]}>
    <NoteFormattingSheet editor={editor} open={sheetOpen} onClose={() => setFormatting(false)} />
    <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} contentContainerStyle={toolbarStyles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={formattingText("open")} accessibilityState={{ expanded: sheetOpen, disabled: formatDisabled }} disabled={formatDisabled} onPressIn={() => { formattingSelection.current = editor.current?.cursor() ?? null; }} onPress={() => { setKeyboardHidden(!Keyboard.isVisible()); setFormatting(value => !value); }} style={[styles.formattingAction, sheetOpen && { backgroundColor: theme.accentSoft }]}><AppText style={{ fontSize: 21, fontWeight: '700', color: theme.textPrimary }}>Aa</AppText></Pressable>
      {images ? <InsertImageButton disabled={disabled} busy={images.pasting} onPress={() => void images.pick()} /> : null}
      <NoteListButtons editor={editor} disabled={disabled || images?.pasting} />
      {images ? <PasteImageButton visible={images.canPaste} pasting={images.pasting && !images.picking} disabled={disabled || images.picking} onPress={() => void images.paste()} /> : null}
      {children}
    </ScrollView>
  </View>;
}

const toolbarStyles = StyleSheet.create({
  bar: { flexGrow: 0, flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
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
