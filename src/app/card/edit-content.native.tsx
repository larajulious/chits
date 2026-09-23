import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { useAppDialog } from '@/components/dialogs/app-dialog-provider';
import { useTheme } from '@/components/theme-provider';
import { AppHeader, IconButton, Screen } from '@/components/ui/primitives';
import { spacing } from '@/constants/theme';
import { createMessageRepository } from '@/db/repositories';

// The dedicated full-screen "Edit Content" editor — see PHASE: FULL-SCREEN
// CONTENT EDITOR. Card Details previously edited a message's text inline
// (a short embedded TextInput competing for scroll with the rest of the
// screen); long notes need real room, so this is now its own screen with a
// single responsibility — edit the note's text, nothing else. Reached via
// router.push from Card Details and returns via router.back(), so Card
// Details' own useFocusEffect reload picks up the saved change automatically
// without this screen needing to reach back into its caller's state.
export default function EditContentScreen() {
  const database = useSQLiteContext();
  const { messageId } = useLocalSearchParams<{ messageId: string }>();
  const messageRepository = useMemo(() => createMessageRepository(database), [database]);
  const { tokens: theme } = useTheme();
  const { confirm } = useAppDialog();
  const navigation = useNavigation();
  const inputRef = useRef<TextInput>(null);
  // null while loading; '' is a legitimate loaded-empty-body state (an
  // attachment message with no caption yet), so it can't double as "not
  // loaded yet" the way it would for a plain string default.
  const [initialText, setInitialText] = useState<string | null>(null);
  const [hasAttachments, setHasAttachments] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set right before the navigating-away call that follows a successful save,
  // so the beforeRemove guard below (which reads `hasChanges`, necessarily a
  // render behind at that exact instant) doesn't mistake the save's own
  // navigation for an unsaved-changes exit and re-show the discard dialog.
  const justSavedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void messageRepository.getActiveById(messageId).then((message) => {
      if (!active) return;
      const text = message?.text ?? '';
      setInitialText(text);
      setDraft(text);
      setHasAttachments(Boolean(message?.attachments.length));
      requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => { active = false; };
  }, [messageId, messageRepository]);

  const hasChanges = initialText !== null && draft !== initialText;
  const canSave = hasChanges && (draft.trim().length > 0 || hasAttachments) && !saving;

  // The one guard for every exit path — header Cancel, iOS swipe-back, and
  // Android hardware back all resolve to the same underlying navigation
  // removal, so intercepting it here (rather than duplicating a check in each
  // trigger) is the only way none of them can silently drop unsaved edits.
  useEffect(() => {
    const subscription = navigation.addListener('beforeRemove', (event) => {
      if (justSavedRef.current || !hasChanges) return;
      event.preventDefault();
      confirm({
        type: 'destructive',
        title: 'Discard changes?',
        message: 'Your edits haven’t been saved.',
        confirmText: 'Discard',
        cancelText: 'Keep Editing',
        onConfirm: () => navigation.dispatch(event.data.action),
      });
    });
    return subscription;
  }, [confirm, hasChanges, navigation]);

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await messageRepository.updateText(messageId, draft.trim());
      justSavedRef.current = true;
      router.back();
    } catch {
      setError('Chits could not save your changes. Try again.');
      setSaving(false);
    }
  }, [canSave, draft, messageId, messageRepository]);

  return (
    <Screen edges={['top', 'left', 'right']}>
      <AppHeader
        title="Edit Note"
        leading={<IconButton label="Cancel" onPress={() => router.back()}><Ionicons accessible={false} name="close" size={24} color={theme.textPrimary} /></IconButton>}
        trailing={<IconButton label="Save" disabled={!canSave} onPress={() => void save()}><Ionicons accessible={false} name={saving ? 'ellipsis-horizontal' : 'checkmark'} size={24} color={canSave ? theme.accent : theme.textMuted} /></IconButton>}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {error ? <View accessibilityRole="alert" style={[styles.errorBanner, { borderColor: theme.danger }]}><Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text></View> : null}
        {/* The screen itself is the editing surface — no boxed field, no
            border, no inner ScrollView. A single flex:1 TextInput handles its
            own scrolling for content of any length, so it never has to
            compete with a parent scroll view for the same gesture. */}
        <TextInput
          ref={inputRef}
          accessibilityLabel="Note content"
          multiline
          value={draft}
          onChangeText={setDraft}
          placeholder="Start writing…"
          placeholderTextColor={theme.textMuted}
          textAlignVertical="top"
          scrollEnabled
          style={[styles.input, { color: theme.textPrimary }]}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  input: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, fontSize: 17, lineHeight: 27 },
  errorBanner: { marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10 },
  errorText: { fontSize: 13, lineHeight: 18 },
});
