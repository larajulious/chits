import { tr } from '@/localization/runtime';
import { useLocale } from '@/localization/provider';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { AppDialog } from '@/components/dialogs/app-dialog';
import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { spacing } from '@/constants/theme';
import { resolveBoardIcon, type BoardIconName } from '@/constants/board-appearance';
import { BoardAppearanceFields } from '@/components/boards/board-appearance-fields';
import { AppTextInput as TextInput } from '@/components/ui/app-text-input';

type BoardAppearance = { name: string; icon: BoardIconName | null; accent: string | null };

type Props = {
  visible: boolean;
  board: BoardAppearance;
  onClose: () => void;
  onSave: (next: BoardAppearance) => Promise<void>;
  /** Permanently deletes the board. When given, the sheet offers "Delete board" behind a type-the-name confirmation. */
  onDelete?: () => Promise<void>;
  /** Runs after a successful delete, once the confirmation has closed: leave the board screen here. */
  onDeleted?: () => void;
};

const MAX_BOARD_NAME_LENGTH = 80;

// Same fields as Create Board (name, icon, accent), saved together — see PHASE:
// EDIT BOARD APPEARANCE. Reuses BoardAppearanceFields verbatim so the picker is
// never a second, drifted design.
export function EditBoardSheet({ visible, board, onClose, onSave, onDelete, onDeleted }: Props) {
  "use no memo"; // Global i18next copy must refresh when the locale subscription fires.

  useLocale();
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<FormSheetHandle>(null);
  const wasVisible = useRef(false);
  const [name, setName] = useState(board.name);
  const [icon, setIcon] = useState<BoardIconName | null>(board.icon);
  const [accent, setAccent] = useState<string | null>(board.accent);
  const [original, setOriginal] = useState(board);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleted = useRef(false);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setOriginal(board);
      setName(board.name);
      setIcon(board.icon);
      setAccent(board.accent);
      setTouched(false);
      setSaving(false);
      setError(null);
      setConfirmingDelete(false);
      setDeleting(false);
      deleted.current = false;
      // A freshly reopened sheet (or one opened for a different board) must
      // never inherit the previous scroll position — see PHASE: FIX BOTTOM
      // SHEET KEYBOARD BEHAVIOR. Not animated: this happens before the sheet is
      // visible, so there's nothing for the user to see move.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    wasVisible.current = visible;
  }, [board, visible]);

  const trimmedName = name.trim();
  const validation = touched && !trimmedName ? tr("editboardsheet.boardNameCanTBeEmpty") : null;
  const hasChanges = trimmedName !== original.name || icon !== original.icon || accent !== original.accent;
  const canSave = Boolean(trimmedName && hasChanges && !saving);

  const busy = saving || deleting;

  const close = () => {
    if (!busy) onClose();
  };

  const openDelete = () => {
    if (busy) return;
    Keyboard.dismiss();
    setError(null);
    setConfirmingDelete(true);
  };

  const confirmDelete = async () => {
    if (!onDelete || deleting) return;
    setDeleting(true);
    try {
      await onDelete();
      deleted.current = true;
      setConfirmingDelete(false);
    } catch {
      setDeleting(false);
      setConfirmingDelete(false);
      setError(tr("editboardsheet.couldnTDeleteBoardTryAgain"));
    }
  };

  // The dialog sits inside this sheet's modal, so leaving waits until it has
  // closed: nothing is torn down while a modal is still on screen.
  const finishDeleteDialog = () => {
    if (deleted.current) { deleted.current = false; onDeleted?.(); }
  };

  const save = async () => {
    setTouched(true);
    if (!trimmedName || !hasChanges || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: trimmedName, icon, accent });
      onClose();
    } catch {
      setError(tr("editboardsheet.couldnTSaveTheseChangesTryAgain"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormSheet
      ref={scrollRef}
      visible={visible}
      onRequestClose={close}
      closeAccessibilityLabel={tr("editboardsheet.cancelEditingBoard")}
      // No keyboard on open: the whole sheet, Delete board included, stays in view until the name is tapped.
      contentContainerStyle={styles.content}
    >
      <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
      <AppText accessibilityRole="header" style={[styles.title, { color: theme.textPrimary }]}>{tr("id.editBoard")}</AppText>
      <AppText style={[styles.supportingCopy, { color: theme.textSecondary }]}>{tr("editboardsheet.updateThisBoardSNameAndAppearance")}</AppText>

      <View accessible accessibilityLabel={tr("editboardsheet.previewValue", { value1: trimmedName || tr("editboardsheet.untitledBoard") })} style={[styles.preview, controls.panel, { backgroundColor: theme.background, borderColor: theme.borderSubtle }]}>
        <View style={[styles.previewMark, { backgroundColor: accent ?? theme.accentSoft }]}>
          <Icon name={resolveBoardIcon(icon)} size={19} color={accent ? '#FFFFFF' : theme.accentStrong} />
        </View>
        <AppText numberOfLines={1} style={[styles.previewName, { color: theme.textPrimary }]}>{trimmedName || tr("editboardsheet.untitledBoard")}</AppText>
      </View>

      <AppText nativeID="board-name-label" style={[styles.label, { color: theme.textSecondary }]}>{tr("index.boardName")}</AppText>
      <TextInput
        ref={inputRef}
        accessibilityLabel={tr("index.boardName")}
        accessibilityLabelledBy="board-name-label"
        value={name}
        onChangeText={(value) => {
          setName(value);
          setTouched(true);
          setError(null);
        }}
        onFocus={() => scrollRef.current?.requestVisible(inputRef)}
        onSubmitEditing={() => void save()}
        editable={!saving}
        maxLength={MAX_BOARD_NAME_LENGTH}
        returnKeyType="done"
        selectionColor={theme.accent}
        style={[
          styles.input, controls.input,
          {
            backgroundColor: theme.background,
            borderColor: validation ? theme.danger : theme.borderSubtle,
            color: theme.textPrimary,
          },
        ]}
      />
      {validation ? <AppText accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{validation}</AppText> : null}

      <BoardAppearanceFields icon={icon} accent={accent} onIconChange={setIcon} onAccentChange={setAccent} />

      {error ? <AppText accessibilityRole="alert" style={[styles.message, { color: theme.danger }]}>{error}</AppText> : null}

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}>
          <AppText style={[styles.cancelText, { color: theme.textSecondary }]}>{tr("chat.cancel")}</AppText>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={tr("columnmanagementsheet.saveChanges")}
          accessibilityState={{ disabled: !canSave }}
          disabled={!canSave}
          onPress={() => void save()}
          style={({ pressed }) => [
            styles.saveButton, controls.button,
            { backgroundColor: theme.accent },
            !canSave && styles.disabled,
            pressed && canSave && styles.pressed,
          ]}
        >
          {saving ? <ActivityIndicator accessibilityLabel={tr("editboardsheet.savingChanges")} size="small" color={theme.accentText} /> : <AppText style={[styles.saveText, { color: theme.accentText }]}>{tr("columnmanagementsheet.saveChanges")}</AppText>}
        </Pressable>
      </View>

      {onDelete ? (
        <View style={[styles.danger, { borderTopColor: theme.borderSubtle }]}>
          <AppText style={[styles.sectionLabel, { color: theme.textMuted }]}>{tr("columnmanagementsheet.dangerZone")}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tr("editboardsheet.deleteBoardDestructiveAction")}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={openDelete}
            style={({ pressed }) => [styles.deleteAction, busy && styles.disabled, pressed && !busy && styles.pressed]}
          >
            <Icon name="trash-outline" size={18} color={theme.danger} />
            <AppText style={[styles.deleteText, { color: theme.danger }]}>{tr("editboardsheet.deleteBoard")}</AppText>
          </Pressable>
        </View>
      ) : null}

      {onDelete ? (
        <AppDialog
          kind="confirm"
          visible={confirmingDelete}
          type="destructive"
          icon="trash-outline"
          title={tr("editboardsheet.deleteBoardTitle", { value1: original.name })}
          message={tr("editboardsheet.deleteBoardMessage")}
          requireText={{ value: original.name, label: tr("editboardsheet.typeBoardNameToConfirm") }}
          confirmText={tr("editboardsheet.deleteBoard")}
          cancelText={tr("chat.cancel")}
          loading={deleting}
          dismissOnBackdrop={!deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={() => { if (!deleting) setConfirmingDelete(false); }}
          onRequestClose={() => { if (!deleting) setConfirmingDelete(false); }}
          onDismissComplete={finishDeleteDialog}
        />
      ) : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg },
  handle: { alignSelf: 'center', width: 36, height: 4, marginBottom: spacing.xs, borderRadius: 2 },
  title: { fontSize: 20, lineHeight: 25, fontWeight: '800' },
  supportingCopy: { marginTop: spacing.xxs, fontSize: 14, lineHeight: 20 },
  preview: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, paddingHorizontal: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: 16 },
  previewMark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previewName: { flex: 1, fontSize: 17, fontWeight: '700' },
  label: { marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: 13, fontWeight: '600' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.sm, fontSize: 16 },
  message: { marginTop: spacing.xs, fontSize: 12, lineHeight: 17 },
  actions: { minHeight: 48, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  cancelButton: { minWidth: 80, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { fontSize: 14, fontWeight: '700' },
  saveButton: { minWidth: 140, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 12 },
  saveText: { fontSize: 14, fontWeight: '800' },
  danger: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.lg, paddingTop: spacing.sm },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: spacing.sm, marginBottom: spacing.xs },
  deleteAction: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  deleteText: { fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.64 },
});
