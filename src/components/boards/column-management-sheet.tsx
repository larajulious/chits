import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useTheme } from '@/components/theme-provider';
import { useStickyControls } from '@/components/ui/surface';
import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { FormSheet, type FormSheetHandle } from '@/components/ui/form-sheet';
import { spacing } from '@/constants/theme';

export type ManagedColumn = { id: string; name: string; position: number };
type Page = 'manage' | 'add' | 'delete';

type Props = {
  visible: boolean;
  columns: ManagedColumn[];
  currentIndex: number;
  // Lets a caller (e.g. the board's "Add column" placeholder) open straight to the
  // add form instead of the default column-management page.
  initialPage?: Page;
  // The placeholder's flow has nothing to "manage" afterward — closing beats
  // dropping the user on a manage page for a column they didn't ask to edit.
  closeOnAdd?: boolean;
  onClose: () => void;
  onRename: (name: string) => Promise<void>;
  onMove: (direction: -1 | 1) => Promise<void>;
  onAdd: (name: string) => Promise<void>;
  onGetDeleteCardCount: () => Promise<number>;
  onDelete: (destinationColumnId?: string) => Promise<void>;
};

const MAX_COLUMN_NAME_LENGTH = 60;

export function ColumnManagementSheet({
  visible,
  columns,
  currentIndex,
  initialPage,
  closeOnAdd = false,
  onClose,
  onRename,
  onMove,
  onAdd,
  onGetDeleteCardCount,
  onDelete,
}: Props) {
  const { tokens: theme } = useTheme();
  const controls = useStickyControls();
  const [page, setPage] = useState<Page>('manage');
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteCardCount, setDeleteCardCount] = useState<number | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);
  const wasVisible = useRef(false);
  const nameInputRef = useRef<TextInput>(null);
  const scrollRef = useRef<FormSheetHandle>(null);
  // Bumped (never read directly) whenever an in-session page switch should
  // focus the name field — see the effect below. A ref read has to happen in
  // an effect, not in a function reachable from render output like `back`
  // (below), so page-switch handlers just request a focus via this counter
  // instead of touching the ref themselves.
  const [focusRequest, setFocusRequest] = useState(0);
  const currentColumn = columns[currentIndex];
  const destinations = useMemo(() => columns.filter((column) => column.id !== currentColumn?.id), [columns, currentColumn?.id]);

  // The single trigger that focuses the name field — see the matching note in
  // form-sheet.tsx. Both the "manage" and "add" pages share one TextInput ref
  // (only one of them is ever mounted at a time), so this covers every place
  // that field can become the active one: the sheet opening (via FormSheet's
  // onModalShow below), and switching pages within an already-open sheet (via
  // the focusRequest effect below).
  const focusNameInput = () => requestAnimationFrame(() => nameInputRef.current?.focus());

  useEffect(() => {
    if (focusRequest > 0) focusNameInput();
  }, [focusRequest]);

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setPage(initialPage ?? 'manage');
      setName(initialPage === 'add' ? '' : currentColumn?.name ?? '');
      setTouched(false);
      setBusy(false);
      setError(null);
      setDeleteCardCount(null);
      setDestinationId(null);
      // See the matching note on the edit-board-sheet reset effect — a
      // reopened sheet must start scrolled to the top, not wherever it was
      // left last time.
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
    wasVisible.current = visible;
  }, [currentColumn?.id, currentColumn?.name, initialPage, visible]);

  const close = () => {
    if (!busy) onClose();
  };
  const openManage = () => {
    setName(currentColumn?.name ?? '');
    setTouched(false);
    setError(null);
    setPage('manage');
    setFocusRequest((request) => request + 1);
  };
  const openAdd = () => {
    setName('');
    setTouched(false);
    setError(null);
    setPage('add');
    setFocusRequest((request) => request + 1);
  };
  const openDelete = async () => {
    if (!currentColumn || columns.length <= 1) return;
    setPage('delete');
    setDeleteCardCount(null);
    setDestinationId(null);
    setError(null);
    try {
      setDeleteCardCount(await onGetDeleteCardCount());
    } catch {
      setError('Couldn’t check this column. Try again.');
    }
  };

  const trimmedName = name.trim();
  const nameError = touched && !trimmedName ? 'Column name can’t be empty.' : null;
  const nameChanged = Boolean(currentColumn && trimmedName && trimmedName !== currentColumn.name);

  const saveName = async () => {
    setTouched(true);
    if (!trimmedName || !nameChanged || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRename(trimmedName);
      setName(trimmedName);
      setTouched(false);
    } catch {
      setError('Couldn’t update column. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const addColumn = async () => {
    setTouched(true);
    if (!trimmedName || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onAdd(trimmedName);
      if (closeOnAdd) {
        onClose();
      } else {
        setPage('manage');
        setName(currentColumn?.name ?? '');
        setTouched(false);
      }
    } catch {
      setError('Couldn’t add column. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const moveColumn = async (direction: -1 | 1) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onMove(direction);
    } catch {
      setError('Couldn’t move column. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (busy || deleteCardCount === null || (deleteCardCount > 0 && !destinationId)) return;
    setBusy(true);
    setError(null);
    try {
      await onDelete(destinationId ?? undefined);
      onClose();
    } catch {
      setError('Couldn’t delete column. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const pageTitle = page === 'manage'
    ? 'Manage column'
    : page === 'add'
      ? 'New column'
      : `Delete “${currentColumn?.name ?? 'column'}”?`;
  // The add page has nowhere to go back to when it was opened without an existing
  // column to manage (an empty board's "Add column" placeholder).
  const canGoBack = page === 'delete' || (page === 'add' && columns.length > 0);
  const back = canGoBack ? openManage : null;
  const leftDisabled = currentIndex === 0 || busy;
  const rightDisabled = currentIndex === columns.length - 1 || busy;

  const header = (
    <>
      <View style={[styles.handle, { backgroundColor: theme.borderSubtle }]} />
      <View style={styles.header}>
        <View style={styles.headerSide}>
          {back ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" disabled={busy} onPress={back} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
              <Icon name="chevron-back" size={22} color={theme.textPrimary} />
            </Pressable>
          ) : null}
        </View>
        <AppText accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: theme.textPrimary }]}>{pageTitle}</AppText>
        <View style={[styles.headerSide, styles.headerSideRight]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" disabled={busy} onPress={close} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
            <Icon name="close-outline" size={22} color={theme.textSecondary} />
          </Pressable>
        </View>
      </View>
    </>
  );

  return (
    <FormSheet
      ref={scrollRef}
      visible={visible}
      onRequestClose={close}
      closeAccessibilityLabel="Close column settings"
      onModalShow={focusNameInput}
      maxHeightPercent={86}
      header={header}
      contentContainerStyle={styles.content}
    >
      {page === 'manage' && currentColumn ? (
                <>
                  <AppText nativeID="column-name-label" style={[styles.fieldLabel, { color: theme.textSecondary }]}>Column name</AppText>
                  <TextInput
                    ref={nameInputRef}
                    accessibilityLabelledBy="column-name-label"
                    accessibilityLabel="Column name"
                    value={name}
                    onChangeText={(value) => { setName(value); setTouched(true); setError(null); }}
                    onFocus={() => scrollRef.current?.requestVisible(nameInputRef)}
                    onSubmitEditing={() => void saveName()}
                    maxLength={MAX_COLUMN_NAME_LENGTH}
                    returnKeyType="done"
                    selectTextOnFocus
                    style={[styles.input, controls.input, { color: theme.textPrimary, backgroundColor: theme.background, borderColor: nameError ? theme.danger : theme.borderSubtle }]}
                  />
                  {nameError ? <AppText accessibilityRole="alert" style={[styles.validation, { color: theme.danger }]}>{nameError}</AppText> : null}
                  {nameChanged ? (
                    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={() => void saveName()} style={({ pressed }) => [styles.saveButton, controls.button, { backgroundColor: theme.accent }, pressed && styles.pressed]}>
                      <AppText style={[styles.saveText, { color: theme.accentText }]}>{busy ? 'Saving…' : 'Save changes'}</AppText>
                    </Pressable>
                  ) : null}

                  <View style={styles.sectionHeading}>
                    <AppText style={[styles.fieldLabel, { color: theme.textSecondary }]}>Position</AppText>
                    <AppText accessibilityLabel={`Current position ${currentIndex + 1} of ${columns.length}`} style={[styles.position, { color: theme.textMuted }]}>{currentIndex + 1} of {columns.length}</AppText>
                  </View>
                  <View style={styles.positionActions}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Move column left"
                      accessibilityState={{ disabled: leftDisabled }}
                      disabled={leftDisabled}
                      onPress={() => void moveColumn(-1)}
                      style={({ pressed }) => [styles.positionButton, controls.panel, { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }, leftDisabled && styles.disabled, pressed && !leftDisabled && styles.pressed]}
                    >
                      <Icon name="arrow-back-outline" size={18} color={theme.textPrimary} />
                      <AppText style={[styles.positionText, { color: theme.textPrimary }]}>Move left</AppText>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Move column right"
                      accessibilityState={{ disabled: rightDisabled }}
                      disabled={rightDisabled}
                      onPress={() => void moveColumn(1)}
                      style={({ pressed }) => [styles.positionButton, controls.panel, { backgroundColor: theme.surfaceElevated, borderColor: theme.borderSubtle }, rightDisabled && styles.disabled, pressed && !rightDisabled && styles.pressed]}
                    >
                      <AppText style={[styles.positionText, { color: theme.textPrimary }]}>Move right</AppText>
                      <Icon name="arrow-forward-outline" size={18} color={theme.textPrimary} />
                    </Pressable>
                  </View>

                  <Pressable accessibilityRole="button" accessibilityLabel="Add column" disabled={busy} onPress={openAdd} style={({ pressed }) => [styles.addAction, pressed && styles.pressed]}>
                    <Icon name="add-outline" size={19} color={theme.accent} />
                    <AppText style={[styles.addText, { color: theme.accent }]}>Add column</AppText>
                  </Pressable>

                  <View style={[styles.danger, { borderTopColor: theme.borderSubtle }]}>
                    <AppText style={[styles.sectionLabel, { color: theme.textMuted }]}>DANGER ZONE</AppText>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Delete column. Destructive action."
                      accessibilityState={{ disabled: columns.length <= 1 || busy }}
                      disabled={columns.length <= 1 || busy}
                      onPress={() => void openDelete()}
                      style={({ pressed }) => [styles.deleteAction, columns.length <= 1 && styles.disabled, pressed && columns.length > 1 && styles.pressed]}
                    >
                      <Icon name="trash-outline" size={18} color={theme.danger} />
                      <AppText style={[styles.deleteText, { color: theme.danger }]}>Delete column</AppText>
                    </Pressable>
                    {columns.length <= 1 ? <AppText style={[styles.rowDetail, { color: theme.textMuted }]}>A board needs at least one column.</AppText> : null}
                  </View>
                </>
              ) : null}

              {page === 'add' ? (
                <>
                  <AppText style={[styles.context, { color: theme.textSecondary }]}>New columns are added to the end.</AppText>
                  <AppText nativeID="new-column-name-label" style={[styles.fieldLabel, { color: theme.textSecondary }]}>Column name</AppText>
                  <TextInput
                    ref={nameInputRef}
                    accessibilityLabelledBy="new-column-name-label"
                    accessibilityLabel="New column name"
                    value={name}
                    onChangeText={(value) => { setName(value); setTouched(true); setError(null); }}
                    onFocus={() => scrollRef.current?.requestVisible(nameInputRef)}
                    onSubmitEditing={() => void addColumn()}
                    maxLength={MAX_COLUMN_NAME_LENGTH}
                    returnKeyType="done"
                    placeholder="e.g. To do"
                    placeholderTextColor={theme.textMuted}
                    style={[styles.input, controls.input, { color: theme.textPrimary, backgroundColor: theme.background, borderColor: nameError ? theme.danger : theme.borderSubtle }]}
                  />
                  {nameError ? <AppText accessibilityRole="alert" style={[styles.validation, { color: theme.danger }]}>{nameError}</AppText> : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !trimmedName || busy }}
                    disabled={!trimmedName || busy}
                    onPress={() => void addColumn()}
                    style={({ pressed }) => [styles.fullButton, controls.button, { backgroundColor: theme.accent }, (!trimmedName || busy) && styles.disabled, pressed && trimmedName && styles.pressed]}
                  >
                    <AppText style={[styles.saveText, { color: theme.accentText }]}>{busy ? 'Adding…' : 'Add column'}</AppText>
                  </Pressable>
                </>
              ) : null}

              {page === 'delete' && currentColumn ? (
                <>
                  {deleteCardCount === null && !error ? <ActivityIndicator accessibilityLabel="Checking column" color={theme.accent} style={styles.loader} /> : null}
                  {deleteCardCount === 0 ? (
                    <AppText style={[styles.deleteCopy, { color: theme.textSecondary }]}>This column is empty. Deleting it can’t be undone.</AppText>
                  ) : null}
                  {deleteCardCount !== null && deleteCardCount > 0 ? (
                    <>
                      <AppText style={[styles.deleteCopy, { color: theme.textSecondary }]}>This column contains {deleteCardCount} {deleteCardCount === 1 ? 'card' : 'cards'}. Choose where to move {deleteCardCount === 1 ? 'it' : 'them'} first.</AppText>
                      <AppText style={[styles.fieldLabel, { color: theme.textSecondary }]}>Move cards to</AppText>
                      <View style={[styles.destinationList, controls.panel, { borderColor: theme.borderSubtle }]}>
                        {destinations.map((column, index) => {
                          const selected = destinationId === column.id;
                          return (
                            <Pressable
                              key={column.id}
                              accessibilityRole="radio"
                              accessibilityLabel={column.name}
                              accessibilityState={{ selected, disabled: busy }}
                              disabled={busy}
                              onPress={() => setDestinationId(column.id)}
                              style={({ pressed }) => [styles.destinationRow, index < destinations.length - 1 && { borderBottomColor: theme.borderSubtle, borderBottomWidth: StyleSheet.hairlineWidth }, pressed && styles.pressed]}
                            >
                              <AppText style={[styles.destinationName, { color: theme.textPrimary }]}>{column.name}</AppText>
                              <Icon name={selected ? 'radio-button-on' : 'radio-button-off'} size={21} color={selected ? theme.accent : theme.textMuted} />
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  ) : null}
                  {deleteCardCount !== null ? (
                    <View style={styles.confirmActions}>
                      <Pressable accessibilityRole="button" disabled={busy} onPress={openManage} style={styles.cancelButton}>
                        <AppText style={[styles.cancelText, { color: theme.textSecondary }]}>Cancel</AppText>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={deleteCardCount > 0 ? 'Move cards and delete column' : 'Delete column'}
                        accessibilityState={{ disabled: busy || (deleteCardCount > 0 && !destinationId) }}
                        disabled={busy || (deleteCardCount > 0 && !destinationId)}
                        onPress={() => void confirmDelete()}
                        style={({ pressed }) => [styles.destructiveButton, { backgroundColor: theme.danger }, (busy || (deleteCardCount > 0 && !destinationId)) && styles.disabled, pressed && styles.pressed]}
                      >
                        <AppText style={styles.destructiveButtonText}>{busy ? 'Deleting…' : deleteCardCount > 0 ? 'Move & Delete' : 'Delete'}</AppText>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              ) : null}

      {error ? <AppText accessibilityRole="alert" style={[styles.error, { color: theme.danger }]}>{error}</AppText> : null}
    </FormSheet>
  );
}

const styles = StyleSheet.create({
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginTop: spacing.xs },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  headerSide: { width: 44, alignItems: 'flex-start' },
  headerSideRight: { alignItems: 'flex-end' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 19, fontWeight: '700', textAlign: 'center' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  context: { fontSize: 13, lineHeight: 18, marginBottom: spacing.md },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.7, marginTop: spacing.sm, marginBottom: spacing.xs },
  settingsRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowDetail: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  stateText: { fontSize: 14, fontWeight: '700' },
  fieldLabel: { fontSize: 13, fontWeight: '600', marginBottom: spacing.xs },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: spacing.sm, fontSize: 16 },
  validation: { fontSize: 12, lineHeight: 17, marginTop: spacing.xxs },
  saveButton: { alignSelf: 'flex-end', minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 10, marginTop: spacing.xs },
  saveText: { fontSize: 14, fontWeight: '700' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.lg },
  position: { fontSize: 12, fontVariant: ['tabular-nums'], marginBottom: spacing.xs },
  positionActions: { flexDirection: 'row', gap: spacing.xs },
  positionButton: { flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, paddingHorizontal: spacing.xs },
  positionText: { fontSize: 14, fontWeight: '600' },
  addAction: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs, marginTop: spacing.md },
  addText: { fontSize: 14, fontWeight: '700' },
  danger: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.sm },
  deleteAction: { alignSelf: 'flex-start', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  deleteText: { fontSize: 14, fontWeight: '700' },
  fullButton: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 11, marginTop: spacing.md },
  loader: { marginVertical: spacing.lg },
  deleteCopy: { fontSize: 15, lineHeight: 21, marginBottom: spacing.lg },
  destinationList: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderRadius: 12 },
  destinationRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.sm },
  destinationName: { flex: 1, fontSize: 15 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  cancelButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md },
  cancelText: { fontSize: 14, fontWeight: '600' },
  destructiveButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: 10 },
  destructiveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  error: { fontSize: 13, lineHeight: 18, marginTop: spacing.sm },
  disabled: { opacity: 0.36 },
  pressed: { opacity: 0.62 },
});
