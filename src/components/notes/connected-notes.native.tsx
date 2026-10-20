import { tr } from '@/localization/runtime';
import { useDirection, useLocale } from '@/localization/provider';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { AppText } from '@/components/ui/app-text';
import { useTheme } from '@/components/theme-provider';
import { Icon } from '@/components/ui/icon';
import { spacing } from '@/constants/theme';
import { CHITS_REVISIT_ENABLED } from '@/constants/revisit';
import { createRevisitRepository } from '@/db/revisit-repository';
import type { NoteKey, RevisitNote } from '@/services/revisit-engine';

// Deliberately one quiet row on established editor/detail surfaces. The review
// detail holds the complete, manageable list and dismissible suggestions.
export function ConnectedNotes({ noteKey, compact = false, panel = false, inline = false, style }: { noteKey: NoteKey; compact?: boolean; panel?: boolean; inline?: boolean; style?: StyleProp<ViewStyle> }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const database = useSQLiteContext();
  const repository = useMemo(() => createRevisitRepository(database), [database]);
  const { tokens } = useTheme();
  const { rowStyle, isRTL } = useDirection();
  const [count, setCount] = useState(0);
  const [resolvedKey, setResolvedKey] = useState(noteKey);
  const [notes, setNotes] = useState<RevisitNote[]>([]);
  useFocusEffect(useCallback(() => {
    if (!CHITS_REVISIT_ENABLED) return;
    let active = true;
    void (async () => {
      let key = noteKey;
      if (key.startsWith('thought:')) {
        const row = await database.getFirstAsync<{ card_id: string }>('SELECT card_id FROM card_messages WHERE message_id = ? ORDER BY card_id LIMIT 1', key.slice('thought:'.length));
        if (row) key = `card:${row.card_id}`;
      }
      if (active) setResolvedKey(key);
      await repository.opened(key);
      const links = await repository.relationships(key);
      const targets: RevisitNote[] = [];
      if (!compact) for (const link of links.slice(0, 3)) {
        const target = await repository.get(link.note_a === key ? link.note_b : link.note_a);
        if (target) targets.push(target);
      }
      if (active) { setCount(links.length); setNotes(targets); }
    })().catch(() => undefined);
    return () => { active = false; };
  }, [compact, database, noteKey, repository]));
  if (!CHITS_REVISIT_ENABLED) return null;
  return <View style={[styles.container, panel && [styles.panel, { backgroundColor: tokens.surface, borderColor: tokens.borderSubtle }], inline && styles.inline, style]}><Pressable accessibilityRole="button" accessibilityLabel={tr("connectednotes.connectedNotesValueViewOrLinkNotes", { value1: count })}
    onPress={() => router.push({ pathname: '/revisit', params: { note: resolvedKey } })}
    style={[styles.header, rowStyle, panel && styles.panelRow, inline && styles.inlineHeader]}>
      {panel ? <Icon name="link-outline" size={18} color={tokens.accentStrong} /> : null}
      <AppText numberOfLines={inline ? 1 : undefined} style={[styles.heading, inline && styles.inlineHeading, { color: tokens.accentStrong }]}>{tr("connectednotes.connectedNotes")}{count ? ` · ${count}` : ''}</AppText>
      {panel ? <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={18} color={tokens.textSecondary} /> : null}
    </Pressable>
    {notes.map((note) => <Pressable key={note.key} accessibilityRole="button" accessibilityLabel={tr("connectednotes.openConnectedNoteValue", { value1: note.title })}
      onPress={() => router.push({ pathname: '/revisit', params: { note: note.key } })}
      style={[styles.noteRow, rowStyle, panel && [styles.panelRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: tokens.borderSubtle }]]}>
      <AppText numberOfLines={panel ? 2 : undefined} style={[styles.noteTitle, { color: tokens.textPrimary }]}>{note.title}</AppText>
      {panel ? <Icon name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={tokens.textSecondary} /> : null}
    </Pressable>)}
    {panel && !count ? <AppText style={[styles.empty, { color: tokens.textSecondary }]}>{tr('revisit.noConnectedNotesYet')}</AppText> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md },
  inline: { flex: 1, minWidth: 0, paddingHorizontal: 0 },
  inlineHeader: { minHeight: 44 },
  inlineHeading: { fontSize: 13, lineHeight: 19 },
  panel: { paddingHorizontal: 0, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, overflow: 'hidden' },
  header: { minHeight: 48, alignItems: 'center', gap: spacing.sm },
  heading: { flex: 1 },
  panelRow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  noteRow: { minHeight: 48, alignItems: 'center', gap: spacing.sm },
  noteTitle: { flex: 1, fontSize: 14, lineHeight: 21 },
  empty: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, fontSize: 14, lineHeight: 21 },
});
