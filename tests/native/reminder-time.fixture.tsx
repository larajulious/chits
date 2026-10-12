// Copy temporarily into src/app/reminder-time-qa.tsx for disposable Android QA.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/ui/app-text';
import { ReminderSheet } from '@/components/reminders/reminder-sheet';
import { AndroidReminderTimePicker } from '@/components/reminders/android-reminder-time-picker';
import { useTheme } from '@/components/theme-provider';

export default function ReminderTimeQA() {
  const { tokens, setAppearance } = useTheme();
  const [open, setOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(true);
  const [value, setValue] = useState(new Date(2026, 9, 15, 9, 30));
  return <View style={{ flex: 1, padding: 40, backgroundColor: tokens.background }}>
    <AppText accessibilityLabel="Selected time QA">{value.getHours()}:{value.getMinutes()}</AppText>
    <Pressable accessibilityRole="button" accessibilityLabel="Open time QA" onPress={() => setOpen(true)}><AppText>Open time</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Dark mode QA" onPress={() => void setAppearance('dark')}><AppText>Dark mode</AppText></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Open reminder QA" onPress={() => setReminderOpen(true)}><AppText>Open reminder</AppText></Pressable>
    {reminderOpen ? <ReminderSheet visible existing={value.getTime()} accent="#6E63D9" accentOn="#FFFFFF" onClose={() => setReminderOpen(false)} onSave={async (date) => { setValue(date); return { ok: true }; }} onRemove={async () => {}} /> : null}
    {open ? <AndroidReminderTimePicker value={value} accent="#6E63D9" accentOn="#FFFFFF" onDismiss={() => setOpen(false)} onConfirm={(hours, minutes) => { setValue(new Date(2026, 9, 15, hours, minutes)); setOpen(false); }} /> : null}
  </View>;
}
