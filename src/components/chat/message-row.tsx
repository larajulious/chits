import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { spacing } from '@/constants/theme';
import type { Attachment, Message } from '@/db/types';
import { dateFormat } from '@/services/reminder-time';

export function AttachmentContent(_: { attachment: Attachment }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  return null;
}

function formatTime(timestamp: number) {
  return dateFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(timestamp);
}

function MessageRowComponent({ message, onLongPress, focused = false }: { message: Message; onLongPress: (message: Message) => void; focused?: boolean }) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={tr("messagerow.thoughtFromValueLongPressForActions", { value1: formatTime(message.createdAt) })} onLongPress={() => onLongPress(message)} delayLongPress={350} style={({ pressed }) => [styles.container, pressed && styles.pressed]}><View style={[styles.message, { backgroundColor: tokens.surfaceElevated }, focused && { borderWidth: 1, borderColor: tokens.accent }]}><Text style={[styles.text, { color: tokens.textPrimary }]}>{message.text}</Text><View style={styles.meta}><Text style={[styles.time, { color: tokens.textMuted }]}>{formatTime(message.createdAt)}{message.updatedAt !== message.createdAt ? tr("messagenotecards.edited") : ''}</Text>{message.pinned && <Text accessibilityLabel={tr("index.pinned")} style={[styles.pin, { color: tokens.textMuted }]}>⌖</Text>}</View></View></Pressable>;
}

export const MessageRow = memo(MessageRowComponent);

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pressed: { opacity: 0.58 },
  message: { alignSelf: 'flex-start', maxWidth: '94%', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 14 },
  text: { fontSize: 16, lineHeight: 23 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.xxs },
  time: { fontSize: 11 },
  pin: { fontSize: 13 },
});
