import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';
import { AppText } from '@/components/ui/app-text';
import { PaperCard, PAPER_YELLOW } from '@/components/desk/paper-desk';
import { type CanvasDocument } from './document';
import { SearchField } from '@/components/ui/search-field';
import { EmptyState, Icon } from '@/components/ui/primitives';
import { FilterRail } from '@/components/boards/filter-rail';
import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import { getFormattingLocale } from '@/localization/runtime';
import { useCanvasPresentation } from './presentation';
import { whiteboards } from './repository';
function Preview({ doc, width = 120 }: { doc: CanvasDocument; width?: number }) {
  const points = doc.objects.flatMap(o => o.points ?? [{ x: o.x, y: o.y }, { x: o.x + o.width, y: o.y + o.height }]);
  const bounds = points.reduce<{ x: number; y: number; right: number; bottom: number }>((b, p) => ({ x: Math.min(b.x, p.x), y: Math.min(b.y, p.y), right: Math.max(b.right, p.x), bottom: Math.max(b.bottom, p.y) }), { x: 0, y: 0, right: 200, bottom: 120 });
  const { x, y } = bounds, w = bounds.right - x, h = bounds.bottom - y;
  return <Svg width={width} height={54} viewBox={`${x - 10} ${y - 10} ${w + 20} ${h + 20}`}><Rect x={x - 10} y={y - 10} width={w + 20} height={h + 20} fill="white" />{doc.objects.map(o => o.points ? <Path key={o.id} d={o.points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ')} stroke={o.color} strokeWidth={o.width} strokeLinecap="round" opacity={o.type === 'highlighter' ? .3 : 1} fill="none" /> : o.type === 'note' ? <Rect key={o.id} x={o.x} y={o.y} width={o.width} height={o.height} fill={PAPER_YELLOW} /> : <SvgText key={o.id} x={o.x} y={o.y + (o.fontSize ?? 20)} fontSize={o.fontSize ?? 20} fill={o.color}>{o.text?.slice(0, 80)}</SvgText>)}</Svg>;
}
export function CanvasLibrary() {
  const db = useSQLiteContext(), repo = useMemo(() => whiteboards(db), [db]);
  const [docs, setDocs] = useState<CanvasDocument[]>([]), [query, setQuery] = useState(''), [archive, setArchive] = useState(false);
  useFocusEffect(useCallback(() => { let alive = true; void repo.list().then(items => { if (alive) setDocs(items); }).catch(() => { if (alive) Alert.alert('Canvas', 'Could not load saved canvases.'); }); return () => { alive = false; }; }, [repo]));
  const ui = useCanvasPresentation();
  const { styleTokens } = useTheme();
  const activeCount = docs.filter(doc => !doc.archived).length;
  const archivedCount = docs.length - activeCount;
  const formatDate = (timestamp: number) => new Intl.DateTimeFormat(getFormattingLocale(), { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp));
  const shown = docs.filter(d => d.archived === archive && d.title.toLowerCase().includes(query.toLowerCase()));
  return <View style={styles.flex}>
    <View style={styles.intro}>
      <AppText family={ui.fonts.text} style={[styles.description, { color: ui.inkMuted }]}>Your drawings, notes, and ideas in one place.</AppText>
      <SearchField accessibilityLabel="Search canvas titles" placeholder="Search canvases" value={query} onChangeText={setQuery} style={{ marginTop: spacing.xs }} />
    </View>
    <View style={{ backgroundColor: ui.control }}><FilterRail value={archive ? 'archived' : 'active'} onChange={value => setArchive(value === 'archived')} options={[
      { key: 'active', label: 'Active', count: activeCount, accessibilityLabel: `Active canvases, ${activeCount}` },
      { key: 'archived', label: 'Archived', count: archivedCount, accessibilityLabel: `Archived canvases, ${archivedCount}` },
    ]} /></View>
    <FlatList
      data={shown}
      keyExtractor={doc => doc.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListEmptyComponent={<EmptyState title={query ? 'No matching canvases' : archive ? 'No archived canvases' : 'Your first canvas starts here'} description={query ? 'Try another canvas title.' : archive ? 'Canvases you archive will appear here.' : 'Choose New Canvas from Create New to start drawing.'} style={styles.empty} />}
      renderItem={({ item: doc }) => <PaperCard paper={ui.card} accessibilityRole="button" accessibilityLabel={`Open canvas ${doc.title || 'Untitled Canvas'}`} onPress={() => router.push({ pathname: '/canvas', params: { id: doc.id } })} style={[styles.row, ui.rowStyle, { borderRadius: styleTokens.button.radius, borderColor: ui.track }]}>
        <View style={[styles.preview, { borderColor: ui.track }]}><Preview doc={doc} width={80} /></View>
        <View style={styles.copy}>
          <AppText family={ui.fonts.textBold} numberOfLines={2} style={[styles.title, { color: ui.ink }]}>{doc.title || 'Untitled Canvas'}</AppText>
          <View style={[styles.metadata, ui.rowStyle]}><Icon name="time-outline" size={12} color={ui.inkMuted} /><AppText family={ui.fonts.text} numberOfLines={1} style={[styles.date, { color: ui.inkMuted }]}>{formatDate(doc.updatedAt)}</AppText></View>
        </View>
        <Icon name={ui.isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={ui.inkMuted} />
      </PaperCard>}
    />
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  intro: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs },
  description: { fontSize: 15, lineHeight: 21 },
  list: { flexGrow: 1, padding: spacing.md, gap: 10, paddingBottom: spacing.lg },
  row: { minHeight: 76, alignItems: 'center', gap: 10, paddingHorizontal: spacing.sm, paddingVertical: 10, borderWidth: 1.5 },
  preview: { width: 80, height: 54, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, overflow: 'hidden', backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 16, lineHeight: 22 },
  metadata: { alignItems: 'center', gap: 5 },
  date: { fontSize: 12, lineHeight: 17, flexShrink: 1 },
  empty: { minHeight: 220, paddingVertical: spacing.lg },
});
