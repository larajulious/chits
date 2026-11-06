import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppHeader, HeaderIcon, IconButton, EmptyState, Icon } from '@/components/ui/primitives';
import { PaperCard, PAPER_WHITE, PAPER_INK, PAPER_INK_MUTED } from '@/components/desk/paper-desk';
import { SearchField } from '@/components/ui/search-field';
import { CanvasPage, useCanvasPresentation, canvasStyles } from '@/features/whiteboard/presentation';
import { AppText } from '@/components/ui/app-text';
import { newCanvas, canvasId, type CanvasDocument } from '@/features/whiteboard/document';
import { whiteboards } from '@/features/whiteboard/repository';
export default function PinToCanvas() {
  const { noteId, kind } = useLocalSearchParams<{ noteId: string; kind: 'card' | 'thought' }>();
  const db = useSQLiteContext(), repo = useMemo(() => whiteboards(db), [db]);
  const ui = useCanvasPresentation();
  const [docs, setDocs] = useState<CanvasDocument[]>([]), [query, setQuery] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { let alive = true; void repo.list().then(items => { if (alive) setDocs(items); }).catch(() => { if (alive) Alert.alert('Canvas', 'Could not load canvases.'); }); return () => { alive = false; }; }, [repo]);
  const pin = async (target: CanvasDocument) => { if (busy || !noteId || !['card', 'thought'].includes(kind)) return; setBusy(true); try { const latest = await repo.get(target.id) ?? target; const doc: CanvasDocument = { ...latest, updatedAt: Date.now(), objects: [...latest.objects, { id: canvasId(), type: 'note', noteId, noteKind: kind, x: (100-latest.viewport.x)/latest.viewport.zoom, y: (100-latest.viewport.y)/latest.viewport.zoom, width: 220, height: 160, color: '#292820' }] }; await repo.save(doc); router.replace({ pathname: '/canvas', params: { id: doc.id } }); } catch { Alert.alert('Canvas', 'Could not pin note.'); setBusy(false); } };
  const shown = docs.filter(d => !d.archived && d.title.toLowerCase().includes(query.toLowerCase()));
  return <CanvasPage header={<AppHeader title="Pin to Canvas" leading={<IconButton label="Back" onPress={() => router.back()}><HeaderIcon name="chevron-back" size={22} /></IconButton>} />}>
    <View style={{ paddingHorizontal: 16, gap: 12 }}>
      <AppText family={ui.fonts.text} style={{ color: ui.inkMuted, fontSize: 15, paddingTop: 16 }}>Choose a home for this note.</AppText>
      <SearchField accessibilityLabel="Search canvas titles" placeholder="Find a canvas" value={query} onChangeText={setQuery} style={{ marginTop: 0 }} />
      <PaperCard paper={PAPER_WHITE} disabled={busy} onPress={() => { void pin(newCanvas()); }} style={[canvasStyles.card, ui.rowStyle]}><Icon name="add-circle-outline" size={24} color={PAPER_INK} /><AppText family={ui.fonts.display} style={{ color: PAPER_INK, fontSize: 18 }}>New Canvas</AppText></PaperCard>
    </View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 12, flexGrow: 1 }}>
      {shown.map(d => <PaperCard key={d.id} paper={PAPER_WHITE} accessibilityLabel={`Pin note to ${d.title || 'Untitled Canvas'}`} disabled={busy} onPress={() => { void pin(d); }} style={[canvasStyles.card, ui.rowStyle]}>
        <Icon name="easel-outline" size={23} color={PAPER_INK} /><View style={{ flex: 1, gap: 6 }}><AppText family={ui.fonts.display} style={{ color: PAPER_INK, fontSize: 19 }}>{d.title || 'Untitled Canvas'}</AppText><AppText family={ui.fonts.text} style={{ color: PAPER_INK_MUTED, fontSize: 12 }}>{new Date(d.updatedAt).toLocaleDateString()}</AppText></View><Icon name={ui.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={PAPER_INK_MUTED} />
      </PaperCard>)}
      {!shown.length ? <EmptyState title={query ? 'No matching canvases' : 'Start with a fresh canvas'} description={query ? 'Try a different title or create a new canvas.' : 'Your note will be waiting there, ready to arrange.'} /> : null}
    </ScrollView>
  </CanvasPage>;
}
