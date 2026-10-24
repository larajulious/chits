import { countLabel, tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { BlurTargetView, BlurView } from 'expo-blur';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { AppText, Chip, ChipRow, EmptyState, Icon } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import type { CardListItem } from '@/db/types';
import { CardListRow } from './card-list-row.native';
import { findStickySection } from './cards-sticky-section';

export type CardSection = { key: string; title: string; pinned?: boolean; count: number; data: CardListItem[] };
type Cell = { kind: 'header'; section: CardSection } | { kind: 'note'; item: CardListItem; column: number };
type Props = {
  sections: CardSection[];
  chips: { key: string; label: string; count: number }[];
  filter: string;
  onFilter: (key: string) => void;
  onOpen: (item: CardListItem) => void;
  onMore: (item: CardListItem) => void;
  onToggleSubtask: (item: CardListItem, subtaskId: string) => void;
  onSectionChange: (section: CardSection | null) => void;
  bottomInset: number;
};

function SectionHeading({ section }: { section: CardSection }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  return <View accessibilityRole="header" accessibilityLabel={`${section.title}, ${countLabel('note', section.count)}`} style={styles.section}>
    <View style={styles.sectionTitle}>
      {section.pinned ? <Icon name="pin" size={14} color={tokens.textSecondary} /> : null}
      <AppText variant="display" weight="700" numberOfLines={1} style={[styles.month, { color: tokens.textPrimary }]}>{section.title}</AppText>
    </View>
    <AppText weight="500" style={[styles.count, { color: tokens.textMuted }]}>{section.count}</AppText>
  </View>;
}

/** Real cards remain recycled; only the active date label changes while scrolling. */
export function CardsCollection({ sections, chips, filter, onFilter, onOpen, onMore, onToggleSubtask, onSectionChange, bottomInset }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { width, fontScale } = useWindowDimensions();
  const { scheme, tokens, styleTokens } = useTheme();
  const columns = width < 350 || fontScale >= 1.3 ? 1 : 2;
  const balanced = styleTokens.card.tinted;
  const columnGap = 12;
  const rowGap = 12;
  const listInset = spacing.md - columnGap / 2;
  const target = useRef<View | null>(null);
  const list = useRef<FlashListRef<Cell>>(null);
  const [filterHeight, setFilterHeight] = useState(styleTokens.chip.height + styleTokens.chip.activeEdge + 16);
  const collection = useMemo(() => {
    const cells: Cell[] = [];
    const headers: number[] = [];
    for (const section of sections) {
      headers.push(cells.length);
      cells.push({ kind: 'header', section });
      for (const [index, item] of section.data.entries()) cells.push({ kind: 'note', item, column: index % columns });
    }
    return { cells, headers };
  }, [sections, columns]);

  // Inline headings scroll normally; their measured bottom edge determines
  // which section appears in the existing app header above the filters.
  const updateSection = useCallback((scrollOffset?: number) => {
    const current = list.current;
    if (!current) return;
    const active = findStickySection(collection.headers, scrollOffset ?? current.getAbsoluteLastScrollOffset(), filterHeight, current.getFirstItemOffset(), (index) => current.getLayout(index));
    const cell = active === undefined ? undefined : collection.cells[active];
    onSectionChange(cell?.kind === 'header' ? cell.section : null);
  }, [collection, filterHeight, onSectionChange]);

  useEffect(() => { updateSection(); }, [updateSection]);

  return <View style={styles.flex}>
    <BlurTargetView ref={target} style={styles.flex}>
      <FlashList key={`cards-${columns}`} ref={list} data={collection.cells} masonry numColumns={columns} optimizeItemArrangement={balanced}
        overrideItemLayout={(layout, cell) => { layout.span = cell.kind === 'header' ? columns : 1; }}
        keyExtractor={(cell) => cell.kind === 'header' ? `section-${cell.section.key}` : `${cell.item.kind}-${cell.item.id}`}
        getItemType={(cell) => cell.kind}
        onScroll={(event) => updateSection(event.nativeEvent.contentOffset.y)} scrollEventThrottle={32} onLoad={() => updateSection()} onContentSizeChange={() => updateSection()}
        renderItem={({ item: cell }) => cell.kind === 'header' ? (
          <View style={balanced && columns > 1 && { marginHorizontal: -listInset }}>
            <SectionHeading section={cell.section} />
          </View>
        ) : (
          <View style={balanced
            ? { paddingHorizontal: columns === 1 ? spacing.md : columnGap / 2, paddingBottom: rowGap }
            : { paddingLeft: columns === 1 || cell.column === 0 ? spacing.md : columnGap / 2, paddingRight: columns === 1 || cell.column === 1 ? spacing.md : columnGap / 2, paddingBottom: rowGap }}>
            <CardListRow item={cell.item} onPress={() => onOpen(cell.item)} onMore={() => onMore(cell.item)} onToggleSubtask={cell.item.kind === 'card' ? (subtaskId) => onToggleSubtask(cell.item, subtaskId) : undefined} />
          </View>
        )}
        contentContainerStyle={{ paddingTop: filterHeight, paddingHorizontal: balanced && columns > 1 ? listInset : 0, paddingBottom: bottomInset + spacing.md }}
        ListEmptyComponent={<EmptyState pose="search" title={tr("cardscollection.noCardsInThisFilter")} description={tr("cardscollection.chooseAnotherBoardOrAllCards")} />}
      />
    </BlurTargetView>
    <View pointerEvents="box-none" style={styles.overlay}>
      <BlurView pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        blurTarget={target} blurMethod="dimezisBlurViewSdk31Plus" intensity={45}
        tint={scheme === 'dark' ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'} style={StyleSheet.absoluteFill} />
      {/* Keep transparent chips readable even when bright photos scroll behind the blur. */}
      {scheme === 'dark' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tokens.background, opacity: 0.9 }]} /> : null}
      <View onLayout={({ nativeEvent }) => { const next = Math.ceil(nativeEvent.layout.height); setFilterHeight((previous) => previous === next ? previous : next); }}>
        <ChipRow style={styles.chips}>
          {chips.map((chip) => <Chip key={chip.key} label={chip.label} count={chip.count} selected={chip.key === filter} accessibilityLabel={tr("cardscollection.filterByValueValueValue", { value1: chip.label, value2: chip.count, value3: chip.count === 1 ? 'card' : 'cards' })} onPress={() => onFilter(chip.key)} />)}
        </ChipRow>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0 },
  chips: { marginVertical: 8 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 40, paddingHorizontal: spacing.md, paddingVertical: 6 },
  sectionTitle: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 6 },
  month: { flexShrink: 1, fontSize: 17, lineHeight: 22, letterSpacing: -0.2 },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
