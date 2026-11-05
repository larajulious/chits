import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingsRow } from '@/components/settings/settings-rows';
import { useTheme } from '@/components/theme-provider';
import { AppText } from '@/components/ui/app-text';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';
import { PrimaryButton } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import { useWelcomeFonts } from '@/features/onboarding/welcome/welcome-fonts';
import { useLocale } from '@/localization/provider';
import { tr } from '@/localization/runtime';
import type { DailyTask } from './plan-core';

type Props = {
  task: DailyTask | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onClose: () => void;
  onRename: (title: string) => void;
  onRemind: () => void;
  onLink: () => void;
  onOpenLink: () => void;
  onUnlink: () => void;
  onMove: (delta: number) => void;
  onDelete: () => void;
};

/** Everything else a task can do, kept off the row so the list stays compact. */
export function PlanTaskSheet({ task, canMoveUp, canMoveDown, onClose, onRename, onRemind, onLink, onOpenLink, onUnlink, onMove, onDelete }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens, styleTokens } = useTheme();
  const fonts = useWelcomeFonts();
  const [editing, setEditing] = useState<string | null>(null);
  const close = () => { setEditing(null); onClose(); };
  const linked = Boolean(task?.messageId || task?.cardId);
  const save = () => { if (editing?.trim()) { onRename(editing); close(); } };
  return <Modal visible={task !== null} transparent animationType="slide" onRequestClose={close}>
    <KeyboardAvoidingView behavior="padding" style={styles.backdrop}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={close} />
      <SafeAreaView edges={['bottom', 'left', 'right']} accessibilityViewIsModal style={[styles.sheet, { backgroundColor: tokens.surface, borderTopLeftRadius: styleTokens.radius.sheet, borderTopRightRadius: styleTokens.radius.sheet }]}>
        {editing !== null ? <View style={styles.edit}>
          <TextInput autoFocus value={editing} onChangeText={setEditing} onSubmitEditing={save} returnKeyType="done" maxLength={200} accessibilityLabel={tr('plan.task.edit')} style={[styles.input, { color: tokens.textPrimary, backgroundColor: tokens.surfaceElevated, borderRadius: styleTokens.button.radius }]} />
          <PrimaryButton label={tr('plan.task.save')} disabled={!editing.trim()} onPress={save} />
        </View> : <>
          <AppText accessibilityRole="header" numberOfLines={2} family={fonts.display} style={[styles.title, { color: tokens.textPrimary }]}>{task?.title ?? ''}</AppText>
          <SettingsRow icon="create-outline" chevron={false} label={tr('plan.task.edit')} onPress={() => setEditing(task?.title ?? '')} />
          <SettingsRow icon="notifications-outline" chevron={false} label={tr(task?.reminderAt ? 'plan.task.changeRemind' : 'plan.task.remind')} onPress={onRemind} />
          {linked ? <SettingsRow icon="open-outline" chevron={false} label={tr('plan.task.openLink')} onPress={onOpenLink} /> : <SettingsRow icon="attach" chevron={false} label={tr('plan.task.link')} onPress={onLink} />}
          {linked ? <SettingsRow icon="close-outline" chevron={false} label={tr('plan.task.unlink')} onPress={onUnlink} /> : null}
          {canMoveUp ? <SettingsRow icon="arrow-up-outline" chevron={false} label={tr('plan.task.up')} onPress={() => onMove(-1)} /> : null}
          {canMoveDown ? <SettingsRow icon="arrow-down-outline" chevron={false} label={tr('plan.task.down')} onPress={() => onMove(1)} /> : null}
          <SettingsRow icon="trash-outline" chevron={false} label={tr('plan.task.delete')} onPress={onDelete} />
        </>}
      </SafeAreaView>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000055' },
  sheet: { paddingTop: spacing.md, paddingBottom: spacing.xs },
  title: { fontSize: 18, lineHeight: 24, paddingHorizontal: spacing.md, paddingBottom: spacing.xs },
  edit: { padding: spacing.md, gap: spacing.sm },
  input: { minHeight: 48, fontSize: 16, paddingHorizontal: spacing.sm },
});
