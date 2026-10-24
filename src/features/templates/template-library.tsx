import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { BlurTargetView, BlurView } from 'expo-blur';
import { useSQLiteContext } from 'expo-sqlite';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, Button, Chip, ChipRow, HeaderIcon, IconButton, useFontStyle } from '@/components/ui/primitives';
import { DeskPage, PAPERS, PAPER_INK, PAPER_INK_MUTED, PAPER_WHITE, PaperAction, PaperCard, PaperDesk, PaperNote, useDesk, useHandwriting } from '@/components/desk/paper-desk';
import { stableTilt } from '@/constants/style-tokens';
import { SearchField } from '@/components/ui/search-field';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { NoteBlocksEditor, NoteListButtons, type NoteBlocksEditorControl } from '@/components/notes/note-blocks-editor';
import { NoteContentView } from '@/components/notes/note-content-view';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { contentTextStyle, languageDirection } from '@/localization/text-layout';
import { useDirection, useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import { spacing } from '@/constants/theme';
import { textDraft, type NoteDraftBlock, type NoteText } from '@/services/note-content';
import { createSingleFlight, createTemplateRepository, documentFromTemplateDraft, instantiateTemplate, templateDraft, templateSearchText, type NoteTemplate } from '@/services/note-templates';

export type TemplateLibraryHandle = { back: () => void };
type Edit = { id?: string; renameOnly?: boolean; title: string; description: string; blocks: NoteDraftBlock[] };
type Props = { ref?: Ref<TemplateLibraryHandle>; onClose: () => void; onSelect: (blocks: NoteDraftBlock[]) => void; initialDocument?: NoteText[]; initialTitle?: string };

/** Lives inside its caller's screen/modal, so the creation destination never changes. */
export function TemplateLibrary({ ref, onClose, onSelect, initialDocument, initialTitle = '' }: Props) {
  'use no memo';
  const locale = useLocale();
  const { rowStyle, isRTL } = useDirection();
  const database = useSQLiteContext();
  const repository = useMemo(() => createTemplateRepository(database), [database]);
  const { tokens: theme, styleTokens, styleColors, scheme } = useTheme();
  const desk = useDesk();
  const { handBold } = useHandwriting();
  const galleryTarget = useRef<View | null>(null);
  const [filterHeight, setFilterHeight] = useState(styleTokens.chip.height + styleTokens.chip.activeEdge + 16);
  const controls = useStickyControls();
  const inputFont = useFontStyle('paragraph');
  const { confirm, actionSheet, alert } = useAppDialog();
  const [items, setItems] = useState<NoteTemplate[] | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'builtin' | 'mine' | 'favorites'>(initialDocument ? 'mine' : 'builtin');
  const [selected, setSelected] = useState<NoteTemplate | null>(null);
  const [edit, setEdit] = useState<Edit | null>(() => initialDocument ? { title: initialTitle, description: '', blocks: templateDraft(initialDocument) } : null);
  const baseline = useRef(edit ? JSON.stringify(edit) : null);
  const editor = useRef<NoteBlocksEditorControl>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run] = useState(createSingleFlight);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const load = useCallback(async () => {
    try { const next = await repository.list(); if (mounted.current) { setItems(next); setSelected((current) => current ? next.find((item) => item.id === current.id) ?? null : null); setError(null); } }
    catch { if (mounted.current) setError(tr('templates.error')); }
  }, [repository]);
  useEffect(() => { void Promise.resolve().then(load); }, [load, locale]);
  const mutate = (work: () => Promise<unknown>) => void run(async () => {
    setBusy(true); setError(null);
    try { await work(); if (mounted.current) await load(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : tr('templates.error')); }
    finally { if (mounted.current) setBusy(false); }
  });
  const back = () => {
    if (busy) return;
    if (edit) {
      const leave = () => { setEdit(null); baseline.current = null; setError(null); };
      if (JSON.stringify(edit) !== baseline.current) confirm({ title: tr('templates.discardConfirm'), message: tr('templates.discardConfirm'), confirmText: tr('editcontent.discard'), cancelText: tr('chat.cancel'), type: 'destructive', onConfirm: leave });
      else leave();
    } else if (selected) { setSelected(null); setError(null); }
    else onClose();
  };
  useImperativeHandle(ref, () => ({ back }));
  const startEdit = (template?: NoteTemplate, renameOnly = false) => {
    const next: Edit = { id: template?.source === 'custom' ? template.id : undefined, title: template?.title ?? '', description: template?.description ?? '', blocks: template ? templateDraft(template.document) : textDraft(), renameOnly };
    baseline.current = JSON.stringify(next); setError(null); setEdit(next);
  };
  const save = () => {
    if (!edit) return;
    mutate(async () => {
      if (edit.id && edit.renameOnly) await repository.rename(edit.id, edit.title);
      else {
        const document = documentFromTemplateDraft(edit.blocks);
        if (edit.id) await repository.update(edit.id, edit.title, edit.description, document);
        else await repository.create(edit.title, edit.description, document);
      }
      setEdit(null); setSelected(null); setFilter('mine'); baseline.current = null;
    });
  };
  const actions = (template: NoteTemplate) => actionSheet({ title: template.title, options: [
    { label: tr('templates.preview'), icon: 'document-text-outline', onPress: () => setSelected(template) },
    { label: tr(template.favorite ? 'templates.unfavorite' : 'templates.favorite'), icon: 'star-outline', onPress: () => mutate(() => repository.favorite(template.id, !template.favorite)) },
    { label: tr('templates.duplicate'), icon: 'copy-outline', onPress: () => mutate(async () => { await repository.duplicate(template); setFilter('mine'); }) },
    ...(template.source === 'custom' ? [
      { label: tr('templates.edit'), icon: 'create-outline' as const, onPress: () => startEdit(template) },
      { label: tr('templates.rename'), icon: 'pencil-outline' as const, onPress: () => startEdit(template, true) },
      { label: tr('templates.delete'), icon: 'trash-outline' as const, destructive: true, onPress: () => confirm({ title: tr('templates.delete'), message: tr('templates.deleteConfirm'), confirmText: tr('templates.delete'), cancelText: tr('chat.cancel'), type: 'destructive', onConfirm: () => mutate(async () => { await repository.remove(template.id); setSelected(null); }) }) },
    ] : []),
  ] });
  const filtered = useMemo(() => (items ?? []).filter((item) => (filter === 'favorites' ? item.favorite : item.source === (filter === 'mine' ? 'custom' : 'builtin')) && templateSearchText(item, locale).includes(query.trim().toLocaleLowerCase(locale))), [items, filter, query, locale]);
  const preview = useMemo(() => selected ? instantiateTemplate(selected.document) : [], [selected]);
  return <KeyboardAvoidingView style={[styles.root, { backgroundColor: desk.desk }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <AppHeader
      title={edit ? tr(edit.id ? 'templates.edit' : 'templates.create') : selected ? tr('templates.preview') : tr('templates.title')}
      leading={<IconButton label={tr('templates.back')} disabled={busy} onPress={back}><HeaderIcon name={isRTL ? 'chevron-forward' : 'chevron-back'} size={24} /></IconButton>}
      trailing={edit ? <IconButton label={tr('editcontent.save')} disabled={busy || !edit.title.trim()} onPress={save} accent><HeaderIcon name="checkmark" size={24} /></IconButton> : !selected ? <IconButton label={tr('templates.create')} disabled={busy} onPress={() => startEdit()} accent><HeaderIcon name="add" size={24} /></IconButton> : undefined}
    />
    {error ? <View accessibilityRole="alert" style={styles.error}><AppText style={{ color: desk.danger }}>{error}</AppText><Button label={tr('id.tryAgain')} onPress={() => void load()} disabled={busy} /></View> : null}
    {busy ? <ActivityIndicator accessibilityLabel={tr('id.saving')} color={theme.accentStrong} /> : null}
    {edit ? <PaperDesk><DeskPage style={styles.editPage}>
      <ScrollView keyboardShouldPersistTaps="handled" style={styles.fields} contentContainerStyle={styles.fieldContent}>
        <View style={[styles.titleField, rowStyle]}><AppText style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tr('templates.titleLabel')}</AppText>
        <TextInput autoFocus={!initialDocument} accessibilityLabel={tr('templates.titleLabel')} maxLength={120} value={edit.title} onChangeText={(title) => setEdit((current) => current && { ...current, title })} editable={!busy} style={[styles.field, styles.titleInput, { borderRadius: styleTokens.radius.control }, controls.input, inputFont, contentTextStyle(edit.title, languageDirection(locale)), { color: theme.textPrimary, backgroundColor: styleColors.controlFill }]} /></View>
        {!edit.renameOnly ? <><View style={[styles.fieldHeading, rowStyle]}><AppText style={[styles.fieldLabel, { color: theme.textSecondary }]}>{tr('templates.descriptionLabel')}</AppText><IconButton label={tr('templates.dateHint', { date: '{{date}}' })} onPress={() => alert({ title: tr('templates.descriptionLabel'), message: tr('templates.attachmentNotice') + '\n\n' + tr('templates.dateHint', { date: '{{date}}' }) })}><Icon name="information-circle-outline" size={19} color={theme.textMuted} /></IconButton></View><TextInput accessibilityLabel={tr('templates.descriptionLabel')} maxLength={240} multiline value={edit.description} onChangeText={(description) => setEdit((current) => current && { ...current, description })} editable={!busy} textAlignVertical="top" style={[styles.field, styles.descriptionInput, { borderRadius: styleTokens.radius.control }, controls.input, inputFont, contentTextStyle(edit.description, languageDirection(locale)), { color: theme.textPrimary, backgroundColor: styleColors.controlFill }]} />{initialDocument ? <AppText style={[styles.hint, { color: theme.textSecondary }]}>{tr('templates.attachmentNotice')}</AppText> : null}</> : null}
      </ScrollView>
      {!edit.renameOnly ? <><NoteBlocksEditor ref={editor} blocks={edit.blocks} onChangeBlocks={(update) => setEdit((current) => current && { ...current, blocks: update(current.blocks) })} editable={!busy} placeholder={tr('editcontent.startWriting')} maxLength={10000} singleInputStyle={[styles.singleInput, inputFont, { color: theme.textPrimary }]} blockContainerStyle={styles.blockContainer} blockInputStyle={[styles.blockInput, inputFont, { color: theme.textPrimary }]} fillViewport contentContainerStyle={styles.editorContent} maxImageHeight={360} accessibilityLabel={tr('editcontent.noteContent')} /><View style={[styles.toolbar, { borderTopColor: theme.borderSubtle }]}><NoteListButtons editor={editor} disabled={busy} /></View></> : null}
    </DeskPage></PaperDesk> : selected ? <PaperDesk>
      <ScrollView contentContainerStyle={styles.preview}>
        <View style={[styles.previewHeading, rowStyle]}><AppText accessibilityRole="header" style={[handBold, styles.previewTitle, { color: desk.ink }]}>{selected.title}</AppText><Pressable accessibilityRole="button" accessibilityLabel={tr('id.cardActions')} disabled={busy} onPress={() => actions(selected)} style={styles.iconButton}><Icon name="ellipsis-horizontal" size={22} color={desk.inkMuted} /></Pressable></View>
        {selected.description ? <AppText style={[styles.description, { color: desk.inkMuted }]}>{selected.description}</AppText> : null}
        <PaperNote paper={PAPER_WHITE} tilt={-0.6} tape style={styles.document}><NoteContentView gap={6} blocks={preview.filter((block): block is Extract<NoteDraftBlock, { type: 'text' }> => block.type === 'text')} renderText={(text) => <AppText variant="paragraph" style={[styles.documentText, { color: PAPER_INK }]}>{text}</AppText>} /></PaperNote>
      </ScrollView>
      <View style={styles.bottom}><PaperAction primary label={tr('templates.use')} disabled={busy} onPress={() => void run(async () => { try { onSelect(instantiateTemplate(selected.document)); } catch (cause) { setError(cause instanceof Error ? cause.message : tr('templates.error')); } })} /></View>
    </PaperDesk> : <>
      <View style={styles.searchWrap}><SearchField accessibilityLabel={tr('templates.search')} placeholder={tr('templates.search')} value={query} onChangeText={setQuery} /></View>
      <View style={styles.flex}>
        <BlurTargetView ref={galleryTarget} style={styles.flex}>
      {/* The desk starts under the filter row, so the row itself looks as it always has. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { top: filterHeight, backgroundColor: theme.background }]}><PaperDesk>{null}</PaperDesk></View>
      <FlatList data={filtered} keyExtractor={(item) => item.id} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.gallery, { paddingTop: filterHeight + spacing.xs }]} ListEmptyComponent={<View style={styles.empty}>{!items && !error ? <ActivityIndicator accessibilityLabel={tr('templates.loading')} color={desk.ink} /> : <AppText style={[styles.description, { color: desk.inkMuted }]}>{tr(query ? 'templates.noResults' : filter === 'favorites' ? 'templates.emptyFavorites' : 'templates.empty')}</AppText>}</View>} renderItem={({ item, index }) => <PaperCard paper={item.source === 'custom' ? PAPERS[0] : PAPERS[[3, 2, 5, 4, 1][index % 5]]} tilt={stableTilt(`template:${item.id}`, 0.8)} style={[styles.card, rowStyle]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${tr('templates.preview')}: ${item.title}`} onPress={() => setSelected(item)} style={({ pressed }) => [styles.cardMain, rowStyle, pressed && styles.pressed]}><View style={[styles.templateIcon, { boxShadow: `0px 2px 4px ${desk.shadow}` }]}><Icon name={item.source === 'custom' ? 'document-text-outline' : templateIcons[item.category as keyof typeof templateIcons] ?? 'document-text-outline'} size={20} color={PAPER_INK} /></View><View style={styles.cardCopy}><AppText numberOfLines={2} style={[handBold, styles.cardTitle]}>{item.title}</AppText><AppText numberOfLines={1} style={[styles.description, { color: PAPER_INK_MUTED }]}>{item.description || tr('templates.mine')}</AppText></View></Pressable>
        <View style={[styles.cardActions, rowStyle]}><Pressable accessibilityRole="button" accessibilityLabel={`${tr(item.favorite ? 'templates.unfavorite' : 'templates.favorite')}: ${item.title}`} accessibilityState={{ selected: item.favorite, disabled: busy }} disabled={busy} onPress={() => mutate(() => repository.favorite(item.id, !item.favorite))} style={styles.iconButton}><Icon name={item.favorite ? 'star' : 'star-outline'} size={19} color={item.favorite ? STAR : PAPER_INK_MUTED} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${tr('id.cardActions')}: ${item.title}`} disabled={busy} onPress={() => actions(item)} style={styles.iconButton}><Icon name="ellipsis-horizontal" size={20} color={PAPER_INK_MUTED} /></Pressable></View>
      </PaperCard>} />
        </BlurTargetView>
        <View pointerEvents="box-none" style={styles.filterOverlay}>
          <BlurView pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" blurTarget={galleryTarget} blurMethod="dimezisBlurViewSdk31Plus" intensity={45} tint={scheme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} style={StyleSheet.absoluteFill} />
          {scheme === 'dark' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, opacity: 0.9 }]} /> : null}
          <View onLayout={({ nativeEvent }) => { const next = Math.ceil(nativeEvent.layout.height); setFilterHeight((current) => current === next ? current : next); }}>
            <ChipRow style={styles.chips}>{(['builtin','mine','favorites'] as const).map((value) => <Chip key={value} label={tr(`templates.${value}`)} accessibilityLabel={tr(`templates.${value}`)} selected={value === filter} onPress={() => setFilter(value)} />)}</ChipRow>
          </View>
        </View>
      </View>
    </>}
  </KeyboardAvoidingView>;
}
// A gold star that still reads on every paper.
const STAR = '#A87A00';
const templateIcons = { meeting: 'people-outline', journal: 'book-outline', brainstorm: 'bulb-outline', todo: 'checkbox-outline', project: 'flag-outline', shopping: 'cart-outline', study: 'school-outline', expense: 'wallet-outline' } as const satisfies Record<string, string>;
const styles = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 }, iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { marginHorizontal: spacing.md, marginBottom: spacing.xs },
  chips: { marginVertical: spacing.xs },
  filterOverlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  gallery: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: 16 }, card: { minHeight: 64, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 4 }, cardMain: { flex: 1, minHeight: 44, flexDirection: 'row', gap: 10, alignItems: 'center' }, templateIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: PAPER_WHITE }, cardCopy: { flex: 1, minWidth: 0, gap: 1 }, cardTitle: { color: PAPER_INK, fontSize: 19, lineHeight: 25 }, description: { fontSize: 13, lineHeight: 19 }, cardActions: { alignItems: 'center' }, empty: { padding: spacing.md },
  preview: { padding: spacing.md, gap: spacing.sm }, previewHeading: { flexDirection: 'row', alignItems: 'center' }, previewTitle: { flex: 1, fontSize: 26, lineHeight: 33 }, document: { padding: 14, marginTop: 8 }, documentText: { fontSize: 15, lineHeight: 23 }, bottom: { paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 14 }, editPage: { flex: 1, margin: 12 },
  fields: { flexGrow: 0, flexShrink: 1, maxHeight: 240 }, fieldContent: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: 4 }, titleField: { alignItems: 'center', gap: 10 }, titleInput: { flex: 1, minWidth: 0 }, fieldLabel: { fontSize: 13, lineHeight: 19 }, fieldHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, descriptionInput: { minHeight: 48, maxHeight: 88 }, field: { fontSize: 16, lineHeight: 24, minHeight: 44, paddingHorizontal: 10, paddingVertical: 8 }, hint: { fontSize: 12, lineHeight: 18 }, singleInput: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16, lineHeight: 25 }, blockContainer: { flex: 1, padding: spacing.md }, editorContent: { paddingBottom: 12 }, blockInput: { padding: 0, minHeight: 25, fontSize: 16, lineHeight: 25, textAlignVertical: 'top' }, toolbar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12 }, error: { padding: spacing.sm, gap: spacing.xs }, pressed: { opacity: 0.65 },
});
