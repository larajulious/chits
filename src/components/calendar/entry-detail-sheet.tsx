import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NoteContentView } from '@/components/notes/note-content-view';
import { NotePaper, PAPER_LINE } from '@/components/notes/note-paper';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { radii, spacing } from '@/constants/theme';
import { createSpaceRepository } from '@/db/repositories';
import type { SpaceNoteDetail } from '@/db/types';
import type { CalendarItem } from '@/features/calendar/calendar-data';
import { formatScheduleTime, parseDayKey, reminderPresetLabel } from '@/features/calendar/calendar-schedule';
import { formatReminder, dateFormat } from '@/services/reminder-time';

import { ENTRY_COLORS, ENTRY_TYPE_LABEL, entryTimeLabel } from './calendar-entry';

export type EntryAction = 'open' | 'source' | 'schedule' | 'reminder' | 'reminder-off' | 'reminder-done' | 'unschedule' | 'delete';

type Props = {
  item: CalendarItem | null;
  visible: boolean;
  now: number;
  onClose: () => void;
  /** Runs once the sheet has gone, so a follow-up sheet or dialog can present cleanly. */
  onAction: (action: EntryAction, item: CalendarItem) => void;
};

/**
 * Tapping a calendar entry: the whole note in a bottom sheet — when, its
 * reminder, where it lives, its words and images — with every action at
 * hand, so the calendar stays where it was.
 */
export function EntryDetailSheet({ item, visible, now, onClose, onAction }: Props) {
  const database = useSQLiteContext();
  const { tokens: theme } = useTheme();
  const [detail, setDetail] = useState<{ key: string; value: SpaceNoteDetail | null } | null>(null);
  const [pending, setPending] = useState<EntryAction | null>(null);

  useEffect(() => {
    if (!item || !visible) return;
    let active = true;
    createSpaceRepository(database).readNote(item.kind === 'card' ? 'card' : 'thought', item.id)
      .then((value) => { if (active) setDetail({ key: item.key, value }); }, () => { if (active) setDetail({ key: item.key, value: null }); });
    return () => { active = false; };
  }, [database, item, visible]);

  // iOS can't present a second modal while this one is still sliding away, so
  // the action waits for onDismiss there; Android has no such limit.
  const act = (action: EntryAction) => {
    if (!item) return;
    if (Platform.OS === 'ios') { setPending(action); onClose(); } else { onClose(); onAction(action, item); }
  };
  const dismissed = () => {
    if (pending && item) onAction(pending, item);
    setPending(null);
  };

  const loaded = item && detail?.key === item.key ? detail : null;
  // The note's own day and time, even when opened from its reminder on another day.
  const day = item ? parseDayKey(item.plan?.dateKey ?? item.dateKey) : null;
  const overdue = item?.reminderAt != null && item.reminderAt < now;
  const thoughts = loaded?.value?.thoughts ?? [];

  return (
    <Modal visible={visible && item !== null} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose} onDismiss={dismissed}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close details" style={StyleSheet.absoluteFill} onPress={onClose} />
        {item ? (
          <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
            <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
            <View style={styles.top}>
              <View style={[styles.typePill, { backgroundColor: theme.surfaceElevated }]}>
                <View style={[styles.typeDot, { backgroundColor: ENTRY_COLORS[item.type] }]} />
                <AppText style={[styles.typeText, { color: theme.textSecondary }]}>{ENTRY_TYPE_LABEL[item.type]}</AppText>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={onClose} hitSlop={4} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
                <Icon name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content}>
              {/* No title of its own: the note itself leads, rather than repeating its first line. */}
              {item.hasTitle ? <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{item.title}</AppText> : null}

              <View style={styles.facts}>
                <Fact icon="calendar-outline" text={`${day ? dateFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: day.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' }).format(day) : item.dateKey} · ${item.plan ? formatScheduleTime(item.plan) : entryTimeLabel(item)}`} />
                <Fact
                  icon={item.reminderAt === null ? 'notifications-off-outline' : 'notifications-outline'}
                  color={overdue ? theme.danger : undefined}
                  text={item.reminderAt === null ? 'No reminder' : `${overdue ? 'Overdue · ' : ''}${formatReminder(new Date(item.reminderAt), new Date(now))}${item.scheduled && item.reminderOffset !== null ? ` (${reminderPresetLabel(item, item.reminderOffset)})` : ''}`}
                />
                <Fact icon={item.spaceId ? 'grid-outline' : item.kind === 'card' || item.cardId ? 'albums-outline' : 'chatbubble-outline'} text={item.spaceId ? item.source : loaded?.value?.context ?? item.source} />
                {item.attachmentCount > 0 ? <Fact icon="attach-outline" text={`${item.attachmentCount} ${item.attachmentCount === 1 ? 'attachment' : 'attachments'}`} /> : null}
              </View>

              {/* The same ruled paper Card Details shows the note on, in its board's tint. */}
              <NotePaper accent={item.boardAccent} minHeight={item.hasTitle ? 120 : 150} style={styles.note}>
                {!loaded ? <ActivityIndicator accessibilityLabel="Loading note" color={theme.textMuted} /> : item.searchText === '' && item.title === 'Hidden note'
                  ? <AppText style={[styles.muted, { color: theme.textSecondary }]}>This note is hidden in Chat.</AppText>
                  : thoughts.length
                    ? thoughts.map((thought) => thought.content
                      ? <NoteContentView key={thought.messageId} blocks={thought.content} maxImageHeight={220} gap={spacing.xs} renderText={(text, key) => <AppText key={key} selectable style={[styles.body, !item.hasTitle && styles.bodyLead, { color: theme.textPrimary }]}>{text}</AppText>} />
                      : <AppText key={thought.messageId} selectable style={[styles.body, !item.hasTitle && styles.bodyLead, { color: theme.textPrimary }]}>{thought.text}</AppText>)
                    : <AppText style={[styles.muted, { color: theme.textSecondary }]}>{loaded.value ? 'No written content.' : 'Couldn’t load this note.'}</AppText>}
              </NotePaper>
            </ScrollView>

            <View style={[styles.actions, { borderTopColor: theme.borderSubtle }]}>
              <View style={styles.primaryRow}>
                <Tile icon="calendar-outline" label={item.scheduled ? 'Reschedule' : 'Add to calendar'} onPress={() => act('schedule')} />
                {item.scheduled
                  ? <Tile icon={item.reminderAt === null ? 'notifications-outline' : 'notifications-off-outline'} label={item.reminderAt === null ? 'Remind me' : 'Reminder off'} onPress={() => act(item.reminderAt === null ? 'schedule' : 'reminder-off')} />
                  : <Tile icon="notifications-outline" label="Change reminder" onPress={() => act('reminder')} />}
                <Tile icon={item.cardId ? 'albums-outline' : 'create-outline'} label={item.cardId ? 'Card details' : 'Edit note'} onPress={() => act('open')} />
              </View>
              <View>
                {item.spaceId || item.kind === 'message' ? <Row icon={item.spaceId ? 'grid-outline' : 'chatbubble-outline'} label={item.spaceId ? 'Open on Space' : 'Show in Chat'} onPress={() => act('source')} /> : null}
                {!item.scheduled && item.reminderAt !== null ? <Row icon="checkmark-circle-outline" label="Mark reminder done" onPress={() => act('reminder-done')} /> : null}
                {item.scheduled ? <Row icon="remove-circle-outline" label="Remove from calendar" onPress={() => act('unschedule')} /> : null}
                <Row icon={item.kind === 'card' ? 'archive-outline' : 'trash-outline'} label={item.kind === 'card' ? 'Archive card' : 'Delete note'} destructive onPress={() => act('delete')} />
              </View>
            </View>
          </SafeAreaView>
        ) : null}
      </View>
    </Modal>
  );
}

function Fact({ icon, text, color }: { icon: IconName; text: string; color?: string }) {
  const { tokens: theme } = useTheme();
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={17} color={color ?? theme.textSecondary} />
      <AppText style={[styles.factText, { color: color ?? theme.textPrimary }]}>{text}</AppText>
    </View>
  );
}

function Tile({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tile, { backgroundColor: theme.surfaceElevated }, pressed && styles.pressed]}>
      <Icon name={icon} size={20} color={theme.accentStrong} />
      <AppText numberOfLines={2} style={[styles.tileText, { color: theme.textPrimary }]}>{label}</AppText>
    </Pressable>
  );
}

function Row({ icon, label, destructive = false, onPress }: { icon: IconName; label: string; destructive?: boolean; onPress: () => void }) {
  const { tokens: theme } = useTheme();
  const color = destructive ? theme.danger : theme.textPrimary;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.surfaceElevated }]}>
      <Icon name={icon} size={19} color={destructive ? theme.danger : theme.textSecondary} />
      <AppText style={[styles.rowText, { color }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  sheet: { maxHeight: '90%', flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 },
  handle: { alignSelf: 'center', width: 36, height: 4, marginTop: spacing.xs, borderRadius: 2 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: spacing.lg, paddingRight: spacing.xs, paddingTop: spacing.xxs },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radii.pill },
  typeDot: { width: 8, height: 8, borderRadius: 4 },
  typeText: { fontSize: 12, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.64 },
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.md },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '800' },
  facts: { gap: spacing.xs },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  factText: { flex: 1, fontSize: 14, lineHeight: 20 },
  note: { gap: spacing.sm },
  // Card Details' text on paper: sits on the ruled lines.
  body: { fontSize: 16, lineHeight: PAPER_LINE },
  // The note when it has no title: it's what the sheet is about, so it reads first (still on the lines).
  bodyLead: { fontSize: 17, fontWeight: '700' },
  muted: { fontSize: 14 },
  actions: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs },
  primaryRow: { flexDirection: 'row', gap: spacing.xs },
  tile: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: spacing.xxs, borderRadius: radii.control },
  tileText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  row: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs, borderRadius: radii.control },
  rowText: { fontSize: 15, fontWeight: '600' },
});
