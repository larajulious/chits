import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { useTheme } from '@/components/theme-provider';
import { Chip } from '@/components/ui/primitives';
import { discardPastedImages, InsertImageButton, NoteBlocksEditor, NoteListButtons, PasteImageButton, useNoteImagePaste, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { createBoardRepository, createMessageRepository } from '@/db/repositories';
import { createRevisitRepository } from '@/db/revisit-repository';
import type { Message } from '@/db/types';
import { subscribeToNoteChanges } from '@/services/note-changes';
import { deleteAttachment } from '@/services/attachment-storage';
import { draftFromNote, draftImageCount, noteBlocksText, noteHasChecklist, textDraft, type NoteDraftBlock } from '@/services/note-content';
import { appendFocusThought } from '@/services/focus-content';
import type { NoteKey } from '@/services/revisit-engine';
import { FocusText as AppText, FocusAction, focusErrorMessage, focusStyles } from './focus-ui';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';

const signature = (blocks: NoteDraftBlock[]) => JSON.stringify(blocks.map((block) => block.type === 'text' ? { text: block.text, list: block.list } : { image: block.attachmentId ?? block.image.storagePath }));
export type FocusEditorHandle = { save: () => Promise<boolean>; capture: (text: string) => Promise<boolean>; dirty: () => boolean; busy: () => boolean };

/** The existing block editor and note repository; Focus owns only a working
 * draft, exactly as Edit Content does. No parallel content storage. */
export const FocusNoteEditor = memo(function FocusNoteEditor({ noteKey, ref }: { noteKey: NoteKey; ref?: Ref<FocusEditorHandle> }) {
  'use no memo';
  useLocale();
  const database = useSQLiteContext();
  const messages = useMemo(() => createMessageRepository(database), [database]);
  const boards = useMemo(() => createBoardRepository(database), [database]);
  const { tokens } = useTheme();
  const { confirm } = useAppDialog();
  const editor = useRef<NoteBlocksEditorControl>(null);
  const [blocks, setBlocks] = useState<NoteDraftBlock[]>(textDraft);
  const live = useRef(blocks);
  const baseline = useRef<string | null>(null);
  const source = useRef<Message | null>(null);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [items, setItems] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const dirty = () => baseline.current !== null && signature(live.current) !== baseline.current;
  const change = useCallback((update: (current: NoteDraftBlock[]) => NoteDraftBlock[]) => {
    const next = update(live.current); live.current = next; setBlocks(next);
  }, []);
  const paste = useNoteImagePaste({ active: loaded, blocks, setBlocks: change, editor, onError: setError });
  const install = useCallback((message: Message | null) => {
    loadGeneration.current++;
    const draft = message ? draftFromNote(message) : textDraft();
    source.current = message; live.current = draft; baseline.current = signature(draft);
    setBlocks(draft); setLoaded(true); setError(null);
  }, []);
  const load = useCallback(async (selectedId?: string) => {
    const generation = ++loadGeneration.current;
    const note = await createRevisitRepository(database).get(noteKey);
    if (!note) throw new Error(tr('focus.unavailable'));
    const next = noteKey.startsWith('card:')
      ? (await boards.listCardMessages(noteKey.slice(5))).filter((message) => !message.deletedAt && !message.archivedAt && !message.isHiddenContent)
      : [await messages.getActiveById(noteKey.slice(8))].filter((message): message is Message => Boolean(message && !message.isHiddenContent));
    if (!mounted.current || generation !== loadGeneration.current) return;
    setItems(next);
    if (baseline.current !== null && signature(live.current) !== baseline.current && !selectedId) {
      // Preserve the unsaved draft, even when another screen changes the note.
      const current = next.find((message) => message.id === source.current?.id);
      if (source.current && (!current || current.updatedAt !== source.current.updatedAt || JSON.stringify(current.content) !== JSON.stringify(source.current.content) || current.text !== source.current.text)) setError(tr('focus.conflict'));
      return;
    }
    install(next.find((message) => message.id === (selectedId ?? source.current?.id)) ?? next[0] ?? null);
  }, [boards, database, install, messages, noteKey]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; discardPastedImages(live.current); }; }, []);
  useFocusEffect(useCallback(() => { void load().catch(() => { if (mounted.current) setError(tr('focus.unavailable')); }); }, [load]));
  useEffect(() => subscribeToNoteChanges(() => { if (!locked.current) void load().catch(() => { if (mounted.current) setError(tr('focus.unavailable')); }); }), [load]);

  const persist = async (next: NoteDraftBlock[]) => {
    if (!loaded || locked.current || paste.pasting) return false;
    if (signature(next) === baseline.current) return true;
    if (noteBlocksText(next).length > 10000 || (!noteBlocksText(next) && !noteHasChecklist(next) && !draftImageCount(next) && !source.current?.attachments.some((attachment) => attachment.type !== 'photo'))) {
      setError(tr('focus.emptyContent')); return false;
    }
    locked.current = true; setBusy(true); setError(null);
    try {
      if (!await createRevisitRepository(database).get(noteKey)) throw new Error(tr('focus.unavailable'));
      let id = source.current?.id;
      if (id && source.current) {
        const result = await messages.updateContent(id, next, source.current);
        await Promise.all(result.removablePaths.map((path) => deleteAttachment(path).catch(() => undefined)));
      } else if (noteKey.startsWith('card:')) id = await boards.addNoteToCard(noteKey.slice(5), next);
      else throw new Error(tr('focus.unavailable'));
      // The write committed. Even if the follow-up read fails, no longer treat
      // these image files as disposable drafts during component cleanup.
      live.current = next.map((block) => block.type === 'image' ? { ...block, remove: undefined } : block);
      baseline.current = signature(live.current);
      if (mounted.current) setBlocks(live.current);
      const saved = await messages.getActiveById(id);
      if (!saved) throw new Error(tr('focus.unavailable'));
      if (mounted.current) { install(saved); setItems((previous) => previous.some((item) => item.id === saved.id) ? previous.map((item) => item.id === saved.id ? saved : item) : [...previous, saved]); }
      return true;
    } catch (cause) { if (mounted.current) setError(focusErrorMessage(cause)); return false; }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  useImperativeHandle(ref, () => ({
    save: () => persist(live.current),
    capture: (text) => persist(appendFocusThought(live.current, text)),
    dirty,
    busy: () => locked.current || paste.pasting,
  }));

  return <View style={focusStyles.flex}>
    {items.length > 1 ? <View style={[focusStyles.row, styles.documents]}>{items.map((item, index) => <Chip key={item.id} label={tr('focus.noteNumber', { number: index + 1 })} accessibilityLabel={tr('focus.noteNumber', { number: index + 1 })} selected={source.current?.id === item.id} onPress={() => { void persist(live.current).then((saved) => { if (saved) void load(item.id).catch(() => setError(tr('focus.error'))); }); }} />)}</View> : null}
    {error ? <View style={styles.error}><AppText accessibilityRole="alert" style={{ color: tokens.danger }}>{error}</AppText><FocusAction quiet disabled={busy} onPress={() => {
      const reload = () => { baseline.current = null; discardPastedImages(live.current); void load().catch(() => setError(tr('focus.error'))); };
      if (dirty()) confirm({ title: tr('editcontent.discardChanges'), message: tr('editcontent.yourEditsHavenTBeenSaved'), confirmText: tr('editcontent.discard'), cancelText: tr('editcontent.keepEditing'), type: 'destructive', onConfirm: reload });
      else reload();
    }}>{tr('focus.reload')}</FocusAction>
    {dirty() ? <FocusAction disabled={busy} onPress={() => {
      if (locked.current) return;
      locked.current = true; setBusy(true);
      const draft = live.current.map((block) => block.type === 'image' ? { ...block, attachmentId: null } : block);
      void messages.createNote({ blocks: draft }).then(() => {
        // The new Chat note now owns staged files. Cleanup must not delete them.
        live.current = live.current.map((block) => block.type === 'image' ? { ...block, remove: undefined } : block);
        baseline.current = signature(live.current); setBlocks(live.current); setError(null);
      }, () => setError(tr('focus.error'))).finally(() => { locked.current = false; setBusy(false); });
    }}>{tr('focus.recoverChat')}</FocusAction> : null}
    </View> : null}
    {!loaded ? <AppText style={styles.documents}>{tr('focus.loading')}</AppText> : <>
      <NoteBlocksEditor ref={editor} blocks={blocks} onChangeBlocks={change} editable={!busy && !paste.pasting} placeholder={tr('editcontent.startWriting')} maxLength={10000} maxImageHeight={320} accessibilityLabel={tr('editcontent.noteContent')} fillViewport contentContainerStyle={styles.editorContent}
        singleInputStyle={[styles.input, { color: tokens.textPrimary }]} blockContainerStyle={styles.rich} blockInputStyle={[styles.blockInput, { color: tokens.textPrimary }]} onReplaceImage={(key) => void paste.pick(key)} />
      <ScrollView horizontal keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator={false} style={[styles.toolbarScroll, { borderTopColor: tokens.borderSubtle }]} contentContainerStyle={styles.toolbar}>
        <InsertImageButton disabled={busy} busy={paste.pasting} onPress={() => void paste.pick()} />
        <NoteListButtons editor={editor} disabled={busy || paste.pasting} />
        <PasteImageButton visible={paste.canPaste} pasting={paste.pasting} disabled={busy} onPress={() => void paste.paste()} />
        <FocusAction quiet disabled={busy || paste.pasting} onPress={() => { void persist(live.current); }}>{tr('editcontent.save')}</FocusAction>
      </ScrollView>
    </>}
  </View>;
});
const styles = StyleSheet.create({
  documents: { paddingHorizontal: 16, paddingVertical: 8 },
  input: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 16, fontSize: 17, lineHeight: 27 },
  editorContent: { paddingBottom: 16 },
  rich: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  blockInput: { minHeight: 27, padding: 0, fontSize: 17, lineHeight: 27, textAlignVertical: 'top' },
  toolbarScroll: { flexGrow: 0, flexShrink: 0, borderTopWidth: StyleSheet.hairlineWidth },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  error: { padding: 16, gap: 8 },
});
