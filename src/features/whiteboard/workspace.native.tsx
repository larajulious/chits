import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { WebView } from 'react-native-webview';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { Icon } from '@/components/ui/icon';
import type { ComponentProps } from 'react';
import { AppText } from '@/components/ui/app-text';
import { PaperCard } from '@/components/desk/paper-desk';
import { useOpenCardNote } from '@/components/notes/use-open-card-note';
import { canvasId, type CanvasDocument } from './document';
import { whiteboards } from './repository';
import { whiteboardNotes, type WhiteboardNote } from './notes';
import { AppHeader, EmptyState, HeaderIcon, IconButton, Screen } from '@/components/ui/primitives';
import { SearchField } from '@/components/ui/search-field';
import { FilterRail } from '@/components/boards/filter-rail';
import { useTheme } from '@/components/theme-provider';
import { CanvasPage, CanvasTool, useCanvasPresentation, canvasStyles } from './presentation';
import { canvasFont } from './canvas-font.native';
import { workspaceHTML } from './workspace-html';
const source = { html: workspaceHTML };
const colors = ['#292820', '#b5413b', '#356bb0', '#41835e', '#8a50a0', '#e4b437'];
export default function Workspace() {
    const { id } = useLocalSearchParams<{
        id: string;
    }>();
    const db = useSQLiteContext(), repo = useMemo(() => whiteboards(db), [db]);
    const ui = useCanvasPresentation();
    const { styleTokens } = useTheme();
    const web = useRef<WebView>(null), current = useRef<CanvasDocument | null>(null);
    const [doc, setDoc] = useState<CanvasDocument | null>(null), [ready, setReady] = useState(false), [status, setStatus] = useState('Loading…');
    const [tool, setTool] = useState('move'), [color, setColor] = useState(colors[0]), [width, setWidth] = useState(3), [palette, setPalette] = useState(false), [picker, setPicker] = useState(false), [query, setQuery] = useState('');
    const [notes, setNotes] = useState<WhiteboardNote[]>([]);
    const [canEditSelection, setCanEditSelection] = useState(false);
    const [hasSelection, setHasSelection] = useState(false);
    const [selectedText, setSelectedText] = useState(false);
    const [fontSize, setFontSize] = useState(24);
    const [pinnedSelection, setPinnedSelection] = useState<string[]>([]);
    const [noteFilter, setNoteFilter] = useState<'all' | 'card' | 'thought'>('all');
    const openCard = useOpenCardNote();
    const { actionSheet } = useAppDialog();
    const queue = useRef(Promise.resolve()), pending = useRef<ReturnType<typeof setTimeout> | null>(null);
    const command = useCallback((message: object) => web.current?.injectJavaScript(`window.command(${JSON.stringify(message).replace(/</g, '\\u003c')});true;`), []);
    useEffect(() => {
      if (!ready) return;
      let alive = true;
      void canvasFont().then(font => { if (alive) command({ type: 'appearance', font }); }).catch(() => undefined);
      return () => { alive = false; };
    }, [ready, command]);
    const save = useCallback(() => {
        if (pending.current)
            clearTimeout(pending.current);
        const value = current.current;
        if (!value)
            return queue.current;
        const snapshot = JSON.parse(JSON.stringify(value)) as CanvasDocument;
        queue.current = queue.current.catch(() => undefined).then(async () => { setStatus('Saving…'); await repo.save(snapshot); setStatus('Saved offline'); }).catch(() => { setStatus('Save failed · tap to retry'); throw new Error('Canvas save failed'); });
        return queue.current;
    }, [repo]);
    useFocusEffect(useCallback(() => {
        let alive = true;
        setTool('move');
        command({ type: 'tool', tool: 'move', dismissGuide: false });
        void queue.current.catch(() => undefined).then(() => Promise.all([repo.get(id), whiteboardNotes(db)])).then(([value, items]) => { if (!alive)
            return; if (!value) {
            setStatus('Canvas could not be found');
            return;
        } current.current = value; setDoc(value); setNotes(items); if (ready)
            command({ type: 'load', doc: value, notes: Object.fromEntries(items.map(n => [`${n.kind}:${n.id}`, n])) }); }).catch(() => setStatus('Could not load canvas. Go back and retry.'));
        const listener = AppState.addEventListener('change', state => { if (state !== 'active')
            void save().catch(() => undefined); });
        return () => { alive = false; listener.remove(); void save().catch(() => undefined); };
    }, [repo, id, db, ready, command, save]));
    const exit = async () => { try {
        await save();
        router.back();
    }
    catch {
        Alert.alert('Canvas could not be saved', 'Your canvas remains open. Tap the save status to retry.');
    } };
    const options = (selection = { canEdit: canEditSelection, hasSelection }) => actionSheet({ title: 'Canvas', options: [
        ...(selection.canEdit ? [{ label: 'Open / Edit selected', icon: 'create-outline' as const, onPress: () => command({ type: 'edit' }) }] : []),
        ...(selection.hasSelection ? [
          { label: 'Bring selected forward', icon: 'layers-outline' as const, onPress: () => command({ type: 'front' }) },
          { label: 'Remove selected', icon: 'trash-outline' as const, onPress: () => command({ type: 'delete' }) },
        ] : []),
        { label: 'Fit content', onPress: () => command({ type: 'fit' }) },
        { label: 'Duplicate', onPress: () => { void (async () => { if (!current.current)
                return; const copy = { ...current.current, id: canvasId(), title: `${current.current.title || 'Canvas'} copy`, createdAt: Date.now(), updatedAt: Date.now() }; await repo.save(copy); router.push({ pathname: '/canvas', params: { id: copy.id } }); })().catch(() => setStatus('Could not duplicate canvas')); } },
        { label: doc?.archived ? 'Restore' : 'Archive', onPress: () => { if (current.current) {
                current.current = { ...current.current, archived: !current.current.archived };
                void exit();
            } } },
        { label: 'Delete canvas', destructive: true, onPress: () => Alert.alert('Delete canvas?', 'Original pinned notes will be kept.', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => { current.current = null; if (pending.current)
                        clearTimeout(pending.current); void queue.current.catch(() => undefined).then(() => repo.remove(id)).then(() => router.back()).catch(() => setStatus('Could not delete canvas')); } }]) },
    ] });
    const filteredNotes = notes.filter(n => (noteFilter === 'all' || n.kind === noteFilter) && n.title.toLowerCase().includes(query.toLowerCase()));
    const exportImage = () => actionSheet({ title: 'Export as image', message: 'Choose the space around your canvas.', options: [16, 32, 64].map(padding => ({ label: `${padding} px padding`, icon: 'image-outline', onPress: () => command({ type: 'export', padding }) })) });
    return <Screen edges={['top', 'bottom', 'left', 'right']} style={{ backgroundColor: ui.desk.desk }}>
      <AppHeader title="Canvas" leading={<IconButton label="Back" onPress={() => { void exit(); }}><HeaderIcon name="chevron-back" size={22} /></IconButton>} trailing={<View style={ui.rowStyle}><IconButton label="Export as image" onPress={exportImage}><HeaderIcon name="share-outline" size={21} /></IconButton><IconButton label="Canvas options" onPress={() => options()}><HeaderIcon name="ellipsis-horizontal" size={22} /></IconButton></View>} actionWidth={96} />
      <View style={[ui.rowStyle, canvasStyles.row, { paddingHorizontal: 16, backgroundColor: ui.paper }]}>
        <TextInput accessibilityLabel="Canvas title" placeholder="Untitled Canvas" placeholderTextColor={ui.inkMuted} selectionColor={ui.action} value={doc?.title ?? ''} style={[canvasStyles.titleInput, { fontFamily: ui.fonts.display, color: ui.ink }]} onChangeText={title => {
          if (!current.current) return;
          current.current = { ...current.current, title, updatedAt: Date.now() }; setDoc(current.current);
          if (pending.current) clearTimeout(pending.current);
          pending.current = setTimeout(() => { void save().catch(() => undefined); }, 350);
        }} />
        <CanvasTool label="Undo" icon="arrow-undo-outline" iconOnly onPress={() => command({ type: 'undo' })} />
        <CanvasTool label="Redo" icon="arrow-redo-outline" iconOnly onPress={() => command({ type: 'redo' })} />
      </View>
      <View style={{ flex: 1, backgroundColor: 'white' }}>
    <WebView ref={web} source={source} originWhitelist={['*']} javaScriptEnabled scrollEnabled={false} bounces={false} allowFileAccess={false} onShouldStartLoadWithRequest={request => request.url === 'about:blank'} onContentProcessDidTerminate={() => { setHasSelection(false); setCanEditSelection(false); setSelectedText(false); setTool('move'); setReady(false); web.current?.reload(); }} onMessage={event => {
            void (async () => {
                const m = JSON.parse(event.nativeEvent.data);
                if (m.type === 'selection') { setCanEditSelection(m.canEdit === true); setHasSelection(m.hasSelection === true); setSelectedText(m.textStyle != null); if (m.textStyle) { setFontSize(m.textStyle.fontSize); setColor(m.textStyle.color); } }
                if (m.type === 'options') options({ canEdit: m.canEdit === true, hasSelection: m.hasSelection === true });
                if (m.type === 'ready')
                    setReady(true);
                if (m.type === 'change' && current.current && m.doc.id === id) {
                    current.current = { ...m.doc, title: current.current.title, archived: current.current.archived };
                    if (pending.current)
                        clearTimeout(pending.current);
                    pending.current = setTimeout(() => { void save().catch(() => undefined); }, 300);
                }
                if (m.type === 'open') {
                    await save();
                    if (m.kind === 'card')
                        await openCard(m.id);
                    else if (notes.find(n => n.id === m.id && n.kind === 'thought')?.hidden)
                        router.push({ pathname: '/chat', params: { messageId: m.id } });
                    else
                        router.push({ pathname: '/card/edit-content', params: { messageId: m.id, autoFocus: '0' } });
                }
                if (m.type === 'error')
                    setStatus(m.message);
                if (m.type === 'export') {
                    if (!await Sharing.isAvailableAsync())
                        throw new Error('Sharing is unavailable on this device.');
                    const file = `${FS.cacheDirectory}chits-canvas-${Date.now()}.png`;
                    try {
                        await FS.writeAsStringAsync(file, m.data, { encoding: FS.EncodingType.Base64 });
                        await Sharing.shareAsync(file, { mimeType: 'image/png', UTI: 'public.png' });
                    }
                    finally {
                        await FS.deleteAsync(file, { idempotent: true });
                    }
                }
            })().catch(error => Alert.alert('Canvas', error instanceof Error ? error.message : 'Could not complete this action.'));
        }} style={{ flex: 1, backgroundColor: 'white' }}/>

        <View style={[canvasStyles.dock, { backgroundColor: ui.paper, borderColor: ui.track, boxShadow: `0px 4px 18px ${ui.desk.shadow}` }]}>
          {tool === 'text' || selectedText ? <View style={[ui.rowStyle, { alignItems: 'center', justifyContent: 'center', gap: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: ui.track }]}>
            <AppText family={ui.fonts.textBold} style={{ color: ui.ink, fontSize: 12 }}>Text size</AppText>
            <CanvasTool label="Decrease text size" icon="remove-outline" iconOnly onPress={() => { const next = Math.max(12, fontSize - 2); setFontSize(next); command({ type: 'style', fontSize: next }); }} />
            <AppText accessibilityLiveRegion="polite" family={ui.fonts.textBold} style={{ color: ui.ink, fontSize: 14, minWidth: 46, textAlign: 'center' }}>{fontSize} px</AppText>
            <CanvasTool label="Increase text size" icon="add-outline" iconOnly onPress={() => { const next = Math.min(96, fontSize + 2); setFontSize(next); command({ type: 'style', fontSize: next }); }} />
          </View> : null}
          {palette ? <View style={{ padding: 6, gap: 8, borderBottomWidth: 1, borderBottomColor: ui.track }}>
            <View style={[ui.rowStyle, { flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center' }]}>
              {colors.map(c => <Pressable key={c} accessibilityRole="radio" accessibilityLabel={`Color ${c}`} accessibilityState={{ selected: color === c }} onPress={() => { setColor(c); command({ type: 'style', color: c, width }); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 30, height: 30, borderRadius: 15, borderWidth: color === c ? 3 : 1, borderColor: color === c ? ui.ink : ui.track, padding: 3 }}><View style={{ flex: 1, borderRadius: 12, backgroundColor: c }} /></View></Pressable>)}
            </View>
            <View style={[ui.rowStyle, { alignItems: 'center', justifyContent: 'center' }]}>
              {[1, 3, 7].map(w => <CanvasTool key={w} label={`${w} px`} selected={width === w} onPress={() => { setWidth(w); command({ type: 'style', color, width: w }); }} />)}
            </View>
          </View> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center', gap: 4 }}>
            {['select', 'move', 'pen', 'highlighter', 'eraser', 'text', 'pin', 'palette'].map(t => {
              const label = t === 'pin' ? 'Pin Note' : t === 'palette' ? 'Color / Size' : t[0].toUpperCase() + t.slice(1);
              return <View key={t} style={{ flexShrink: 0 }}><CanvasTool label={label} icon={toolIcons[label]} selected={t === 'palette' ? palette : tool === t} onPress={() => {
                if (t === 'pin') { setPinnedSelection([]); setPicker(true); }
                else if (t === 'palette') setPalette(value => !value);
                else { setTool(t); command({ type: 'tool', tool: t }); }
              }} /></View>;
            })}
          </ScrollView>
        </View>
        {status !== 'Saved offline' && status !== 'Saving…' ? <Pressable accessibilityRole="button" accessibilityLabel={`${status}. Retry save`} onPress={() => { void save().catch(() => undefined); }} style={{ position: 'absolute', top: 8, right: 12, minHeight: 44, paddingHorizontal: 12, borderRadius: 22, backgroundColor: ui.paper, flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="cloud-offline-outline" size={14} color={ui.inkMuted} /><AppText accessibilityLiveRegion="polite" family={ui.fonts.text} style={{ color: ui.inkMuted, fontSize: 11 }}>{status}</AppText></Pressable> : null}
      </View>
      <Modal visible={picker} animationType="slide" onRequestClose={() => setPicker(false)}>
        <CanvasPage header={<AppHeader title="Pin a note" leading={<IconButton label="Close note picker" onPress={() => setPicker(false)}><HeaderIcon name="close" size={22} /></IconButton>} trailing={<IconButton label="Done" onPress={() => setPicker(false)}><HeaderIcon name="checkmark" size={22} /></IconButton>} />}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
            <SearchField accessibilityLabel="Search notes" placeholder="Find a note to pin" value={query} onChangeText={setQuery} style={{ marginTop: 0 }} />
          </View>
          <View style={{ backgroundColor: ui.control }}><FilterRail value={noteFilter} onChange={setNoteFilter} options={[
            { key: 'all', label: 'All notes', count: notes.length, accessibilityLabel: `All notes, ${notes.length}` },
            { key: 'card', label: 'Organized', count: notes.filter(n => n.kind === 'card').length, accessibilityLabel: 'Organized notes' },
            { key: 'thought', label: 'Thoughts', count: notes.filter(n => n.kind === 'thought').length, accessibilityLabel: 'Thoughts' },
          ]} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 10, flexGrow: 1 }}>
            {filteredNotes.map(n => {
              const key = `${n.kind}:${n.id}`, pinned = pinnedSelection.includes(key);
              return <PaperCard key={key} paper={pinned ? ui.cardDone : ui.card} accessibilityRole="checkbox" accessibilityLabel={`${n.title}, ${pinned ? 'Pinned to canvas' : 'Pin to canvas'}`} accessibilityState={{ checked: pinned, disabled: pinned }} disabled={pinned} onPress={() => { setPinnedSelection(items => [...items, key]); command({ type: 'pin', kind: n.kind, id: n.id }); }} style={[ui.rowStyle, { minHeight: 76, paddingHorizontal: 12, paddingVertical: 12, alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: ui.track, borderRadius: styleTokens.button.radius }]}>
                <View style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.control }}><Icon name={n.kind === 'card' ? 'documents-outline' : 'chatbubble-outline'} size={20} color={ui.ink} /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <AppText family={ui.fonts.textBold} numberOfLines={3} style={{ color: ui.ink, fontSize: 16, lineHeight: 22 }}>{n.title.slice(0, 160)}</AppText>
                  <AppText family={ui.fonts.text} style={{ color: ui.inkMuted, fontSize: 12, lineHeight: 17 }}>{pinned ? 'Pinned to canvas' : n.kind === 'card' ? 'Organized' : 'Thought'}</AppText>
                </View>
                <Icon name={pinned ? 'checkmark-circle' : 'add-circle-outline'} size={24} color={pinned ? ui.ink : ui.inkMuted} />
              </PaperCard>;
            })}
            {!filteredNotes.length ? <EmptyState title={query ? 'No matching notes' : 'No notes here yet'} description={query ? 'Try another search or filter.' : 'Your notes will appear here, ready to pin.'} style={{ minHeight: 220 }} /> : null}
          </ScrollView>
        </CanvasPage>
      </Modal>
    </Screen>;
}

const toolIcons: Record<string, ComponentProps<typeof Icon>['name']> = { Back: 'chevron-back', More: 'ellipsis-horizontal', Undo: 'arrow-undo-outline', Redo: 'arrow-redo-outline', 'Export PNG': 'share-outline', Fit: 'scan-outline', 'Open / Edit': 'create-outline', 'Bring forward': 'layers-outline', 'Remove selected': 'trash-outline', Select: 'locate-outline', Move: 'hand-left-outline', Pen: 'pencil-outline', Highlighter: 'brush-outline', Eraser: 'backspace-outline', Text: 'text-outline', 'Pin Note': 'pin-outline', 'Color / Size': 'color-palette-outline' };
