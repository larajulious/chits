import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDesk } from '@/components/desk/paper-desk';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { SearchField } from '@/components/ui/search-field';
import { tr } from '@/localization/runtime';
import type { RevisitNote } from '@/services/revisit-engine';
import type { useCanvasConnections } from './use-canvas-connections';

type Connections = ReturnType<typeof useCanvasConnections>;
export function CanvasConnectionTools({ connections: c, bottom, paper }: { connections: Connections; bottom: number; paper: string }) {
  const desk = useDesk();
  const status = c.source ? tr('canvasConnections.tapTarget') : c.focused ? tr('canvasConnections.focused') : c.selected ? tr('canvasConnections.selectedHint') : null;
  return <>
    <View pointerEvents="box-none" style={[styles.anchor, { bottom }]}>
      <View style={[styles.bar, { backgroundColor: paper, borderColor: desk.rule }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={tr('canvasConnections.visibility')} accessibilityValue={{ text: tr(`canvasConnections.${c.visibility}`) }} disabled={c.busy} onPress={c.controls} style={styles.button}>
          <Icon name={c.visibility === 'hidden' ? 'eye-off-outline' : 'git-network-outline'} size={20} color={desk.ink} />
        </Pressable>
        {status ? <AppText numberOfLines={2} style={[styles.status, { color: desk.ink }]}>{status}</AppText> : null}
        {c.source ? <Pressable accessibilityRole="button" accessibilityLabel={tr('revisit.searchNotesToLink')} disabled={c.busy} onPress={() => c.setPicker(true)} style={styles.button}><Icon name="search" size={20} color={desk.ink} /></Pressable> : null}
        {c.undo && !c.source ? <Pressable accessibilityRole="button" accessibilityLabel={tr('canvasConnections.undo')} disabled={c.busy} onPress={c.undo} style={styles.button}><Icon name="arrow-undo-outline" size={20} color={desk.ink} /></Pressable> : null}
        {c.source || c.focused || c.selected ? <Pressable accessibilityRole="button" accessibilityLabel={tr(c.source ? 'chat.cancel' : c.focused ? 'canvasConnections.exitFocus' : 'canvasConnections.clearSelection')} disabled={c.busy} onPress={() => { if (c.source) c.cancel(); else if (c.focused) c.exitFocus(); else c.clearSelection(); }} style={styles.button}><Icon name="close" size={20} color={desk.ink} /></Pressable> : null}
        {c.busy ? <ActivityIndicator accessibilityLabel={tr('canvasConnections.saving')} size="small" color={desk.ink} style={styles.button} /> : null}
      </View>
    </View>
    {c.picker && c.source ? <ConnectionPicker connections={c} /> : null}
  </>;
}

function ConnectionPicker({ connections: c }: { connections: Connections }) {
  const { tokens } = useTheme(); const [search, setSearch] = useState(''); const query = useDeferredValue(search);
  const [notes, setNotes] = useState<RevisitNote[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError(false); const all: RevisitNote[] = []; let after = '';
      try {
        for (;;) {
          const page = await c.linksRepository.metadataPage(after, 100);
          if (!active) return;
          all.push(...page); setNotes([...all]);
          if (page.length < 100) break;
          after = page[page.length - 1].key;
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    };
    void load(); return () => { active = false; };
  }, [attempt, c.linksRepository]);
  const existing = useMemo(() => new Set((c.links ?? []).flatMap((link) => link.note_a === c.source ? [link.note_b] : link.note_b === c.source ? [link.note_a] : [])), [c.links, c.source]);
  const results = useMemo(() => notes.filter((note) => note.key !== c.source && !existing.has(note.key) && `${note.title} ${note.text} ${note.boardName ?? ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [c.source, existing, notes, query]);
  return <Modal visible animationType="fade" presentationStyle="pageSheet" onRequestClose={c.cancel}>
    <SafeAreaView style={[styles.flex, { backgroundColor: tokens.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.pickerHeader, { borderBottomColor: tokens.borderSubtle }]}>
          <AppText weight="700" style={[styles.title, { color: tokens.textPrimary }]}>{tr('canvasConnections.connect')}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={tr('chat.cancel')} onPress={c.cancel} disabled={c.busy} style={styles.button}><Icon name="close" size={24} color={tokens.textPrimary} /></Pressable>
        </View>
        <View style={styles.search}><SearchField accessibilityLabel={tr('revisit.searchNotesToLink')} placeholder={tr('revisit.searchYourNotes')} value={search} onChangeText={setSearch} /></View>
        <FlatList data={results} keyExtractor={(note) => note.key} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}
          renderItem={({ item }) => <Pressable accessibilityRole="button" disabled={c.busy} onPress={() => { void c.connect(item.key); }} style={[styles.result, { borderBottomColor: tokens.borderSubtle }]}>
            <Icon name="link-outline" size={20} color={tokens.accentStrong} />
            <View style={styles.flex}><AppText numberOfLines={2} style={{ color: tokens.textPrimary }}>{item.title}</AppText><AppText numberOfLines={1} style={{ color: tokens.textSecondary, fontSize: 13 }}>{item.boardName ?? tr('index.unorganized')}</AppText></View>
          </Pressable>}
          ListEmptyComponent={!loading && !error ? <AppText style={styles.results}>{tr('revisit.noNotesFound')}</AppText> : null}
          ListFooterComponent={loading ? <ActivityIndicator style={styles.results} color={tokens.accentStrong} /> : error ? <Pressable accessibilityRole="button" onPress={() => setAttempt((n) => n + 1)} style={styles.result}><AppText>{tr('canvasConnections.retry')}</AppText></Pressable> : null} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  flex: { flex: 1 }, anchor: { position: 'absolute', left: 12, right: 12, alignItems: 'flex-end' },
  bar: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth },
  button: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  status: { flexShrink: 1, fontSize: 12, lineHeight: 17, paddingVertical: 6, maxWidth: 180 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  title: { flex: 1, fontSize: 20, paddingVertical: 16 }, search: { paddingHorizontal: 16, paddingBottom: 12 },
  results: { padding: 16 }, result: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
});
