import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { useStickyControls } from '@/components/ui/surface';
import { radii, spacing } from '@/constants/theme';
import { reminderInPast, type ScheduleDraft } from '@/features/calendar/calendar-actions';

import { ScheduleFields } from './schedule-fields';
import { dateFormat } from '@/services/reminder-time';

function Sheet({ visible, onClose, closeLabel, children }: { visible: boolean; onClose: () => void; closeLabel: string; children: React.ReactNode }) {
  const { tokens: theme } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView edges={['bottom', 'left', 'right']} style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.borderSubtle }]}>
          <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
          {children}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

/** Jump to any month: a year stepper over the twelve months. */
export function MonthPickerSheet({ visible, year: initialYear, month, onPick, onClose }: { visible: boolean; year: number; month: number; onPick: (year: number, month: number) => void; onClose: () => void }) {
  const { tokens: theme } = useTheme();
  const [year, setYear] = useState(initialYear);
  const names = dateFormat(undefined, { month: 'short' });
  const now = new Date();
  return (
    <Sheet visible={visible} onClose={onClose} closeLabel="Close month picker">
      <View style={styles.content}>
        <View style={styles.yearRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Previous year, ${year - 1}`} onPress={() => setYear(year - 1)} style={styles.iconButton}><Icon name="chevron-back" size={22} color={theme.textSecondary} /></Pressable>
          <AppText accessibilityRole="header" style={[styles.year, { color: theme.textPrimary }]}>{year}</AppText>
          <Pressable accessibilityRole="button" accessibilityLabel={`Next year, ${year + 1}`} onPress={() => setYear(year + 1)} style={styles.iconButton}><Icon name="chevron-forward" size={22} color={theme.textSecondary} /></Pressable>
        </View>
        <View style={styles.months}>
          {Array.from({ length: 12 }, (_, index) => {
            const selected = year === initialYear && index === month;
            const current = year === now.getFullYear() && index === now.getMonth();
            const label = dateFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, index, 1));
            return (
              <Pressable key={index} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={() => onPick(year, index)} style={({ pressed }) => [styles.month, { borderColor: current ? theme.accentStrong : theme.borderSubtle }, selected && { backgroundColor: theme.accentStrong, borderColor: theme.accentStrong }, pressed && styles.pressed]}>
                <AppText style={[styles.monthText, { color: selected ? theme.background : theme.textPrimary }]}>{names.format(new Date(year, index, 1))}</AppText>
              </Pressable>
            );
          })}
        </View>
      </View>
    </Sheet>
  );
}

/**
 * Reschedule an entry: date, time and reminder for a note already on the
 * calendar (or one that so far only had a reminder). Saving moves it and
 * reschedules its notification; "Remove from calendar" keeps the note.
 */
export function ScheduleSheet({ visible, title, initial, scheduled, onSave, onRemove, onClose }: { visible: boolean; title: string; initial: ScheduleDraft; scheduled: boolean; onSave: (draft: ScheduleDraft) => Promise<void>; onRemove: () => Promise<void>; onClose: () => void }) {
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  // The parent remounts this sheet (new key) each time it opens.
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null);
  const invalid = reminderInPast(draft);
  const close = () => { if (!busy) onClose(); };
  const run = async (kind: 'save' | 'remove') => {
    if (busy) return;
    setBusy(kind);
    try { if (kind === 'save') await onSave(draft); else await onRemove(); onClose(); } finally { setBusy(null); }
  };
  return (
    <Sheet visible={visible} onClose={close} closeLabel="Close schedule">
      <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.headerIcon, { backgroundColor: theme.surfaceElevated }]}><Icon name="calendar-outline" size={18} color={theme.accentStrong} /></View>
          <View style={styles.flex}>
            <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{scheduled ? 'Reschedule' : 'Add to calendar'}</AppText>
            <AppText numberOfLines={1} style={[styles.subtitle, { color: theme.textSecondary }]}>{title}</AppText>
          </View>
        </View>
        <ScheduleFields value={draft} onChange={setDraft} />
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: theme.borderSubtle }]}>
        {scheduled ? (
          <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void run('remove')} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            {busy === 'remove' ? <ActivityIndicator size="small" color={theme.danger} /> : <AppText style={[styles.textLabel, { color: theme.danger }]}>Remove from calendar</AppText>}
          </Pressable>
        ) : <View />}
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy !== null} onPress={close} style={({ pressed }) => [styles.textButton, pressed && styles.pressed]}>
            <AppText style={[styles.textLabel, { color: theme.textSecondary }]}>Cancel</AppText>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: invalid || busy !== null }} disabled={invalid || busy !== null} onPress={() => void run('save')} style={({ pressed }) => [styles.primary, controls.button, { backgroundColor: theme.accentStrong }, invalid && styles.disabled, pressed && styles.pressed]}>
            {busy === 'save' ? <ActivityIndicator size="small" color={theme.background} /> : <AppText style={[styles.primaryLabel, { color: theme.background }]}>Save</AppText>}
          </Pressable>
        </View>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(24,24,23,0.34)' },
  sheet: { maxHeight: '92%', flexShrink: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: StyleSheet.hairlineWidth, borderBottomWidth: 0 },
  handle: { alignSelf: 'center', width: 36, height: 4, marginTop: spacing.xs, borderRadius: 2 },
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
  headerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 19 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800' },
  subtitle: { marginTop: 1, fontSize: 13, lineHeight: 18 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: spacing.md, paddingTop: spacing.xs, paddingBottom: spacing.md },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: 'auto' },
  textButton: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm },
  textLabel: { fontSize: 15, fontWeight: '600' },
  primary: { minHeight: 46, minWidth: 96, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.control },
  primaryLabel: { fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.38 },
  pressed: { opacity: 0.64 },
  yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.md },
  year: { fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'], minWidth: 72, textAlign: 'center' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  months: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.xs },
  month: { width: '31.5%', minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: radii.control, borderWidth: 1 },
  monthText: { fontSize: 15, fontWeight: '600' },
});
